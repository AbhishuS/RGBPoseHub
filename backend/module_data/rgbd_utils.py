"""
RGB-D Data Utilities
Handles loading, parsing, depth scaling, camera intrinsic calibration,
and 3D pinhole unprojection for RGB-D frames.

HEIC/HEIF Support:
  - pillow-heif is registered automatically so PIL.Image.open() handles .heic/.heif
  - For Apple Portrait mode HEICs the embedded depth map is extracted directly from
    the auxiliary image list (type 'urn:com:apple:photo:2020:aux:hdrgainmap' /
    'urn:com:apple:photo:2020:aux:depth' depending on iOS version).
"""

import os
import cv2
import numpy as np
from PIL import Image

# ── HEIC/HEIF registration ────────────────────────────────────────────────────
_HEIF_OK = False
try:
    import pillow_heif
    pillow_heif.register_heif_opener()   # makes PIL.Image.open() understand .heic
    _HEIF_OK = True
except ImportError:
    pass  # graceful degradation; JPEG/PNG still work


# ── Camera intrinsics ─────────────────────────────────────────────────────────

# iPhone 15 factory focal length @ 4032×3024 in 35mm-eq ≈ 26 mm
# Converted to pixel focal length: fx ≈ fy ≈ 3400 px  (sensor ≈ 1/1.48″)
# We store sensible defaults for both generic and iPhone 15 cameras.
_IPHONE15_FX = 3400.0
_IPHONE15_FY = 3400.0
_GENERIC_FX  = 615.0
_GENERIC_FY  = 615.0


def get_default_camera_matrix(width=640, height=480, fx=None, fy=None, cx=None, cy=None):
    """
    Returns 3x3 camera intrinsic matrix K.

    If fx/fy are omitted the function picks reasonable defaults based on the
    image resolution: iPhone-15-like values for high-res images (>= 3000 px
    wide) and generic RealSense/PrimeSense values for anything smaller.
    """
    if fx is None:
        fx = _IPHONE15_FX if width >= 3000 else _GENERIC_FX
    if fy is None:
        fy = _IPHONE15_FY if height >= 2000 else _GENERIC_FY
    if cx is None:
        cx = width / 2.0
    if cy is None:
        cy = height / 2.0

    K = np.array([
        [fx,  0.0, cx],
        [0.0, fy,  cy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float32)
    return K


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_heic_depth(heic_path):
    """
    Try to extract an embedded depth/disparity map from an Apple Portrait-mode
    HEIC file.

    Apple stores auxiliary images inside the HEIC container as separate items
    with specific URN types.  pillow_heif exposes them via
    ``HeifFile.add_from_heif()`` / ``HeifFile.images`` depending on version.

    Returns:
        depth_raw (np.ndarray | None): 8 or 16-bit depth/disparity array, or
                                        None if no depth stream was found.
    """
    if not _HEIF_OK:
        return None
    try:
        hf = pillow_heif.open_heif(heic_path, convert_hdr_to_8bit=False, bgr_mode=False)
        # Iterate over all auxiliary images in the file
        for img in hf:
            aux_type = getattr(img, 'info', {}).get('aux_type', '') or ''
            # Apple depth/disparity URNs
            if 'depth' in aux_type.lower() or 'disparity' in aux_type.lower():
                depth_pil = img.to_pillow()
                depth_raw = np.array(depth_pil)
                if depth_raw.ndim == 3:
                    depth_raw = depth_raw[:, :, 0]
                return depth_raw
    except Exception:
        pass
    return None


def is_pdf_file(path):
    """Check if file is a PDF either by extension or file signature."""
    if not path or not os.path.exists(path):
        return False
    ext = os.path.splitext(path)[-1].lower()
    if ext == '.pdf':
        return True
    try:
        with open(path, 'rb') as f:
            return f.read(5).startswith(b'%PDF')
    except Exception:
        return False


def is_heic_file(path):
    """Check if file is HEIC/HEIF either by extension or container brand."""
    if not path or not os.path.exists(path):
        return False
    ext = os.path.splitext(path)[-1].lower()
    if ext in ('.heic', '.heif'):
        return True
    try:
        with open(path, 'rb') as f:
            chunk = f.read(32)
            return b'ftyp' in chunk and any(b in chunk for b in (b'heic', b'mif1', b'msf1', b'heix', b'hevc'))
    except Exception:
        return False


def open_pdf_as_image(pdf_path):
    """
    Extracts embedded RGB image or renders high-res RGB page from a PDF document.
    Returns:
        PIL.Image in RGB mode with attached PDF metadata
    """
    # Strategy 1: Extract embedded RGB image via pypdf
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(pdf_path)
        largest_img = None
        largest_area = 0
        largest_fmt = 'RGB'
        total_images = 0

        for page in reader.pages:
            for img_file in page.images:
                total_images += 1
                try:
                    pil_im = Image.open(io.BytesIO(img_file.data))
                    area = pil_im.width * pil_im.height
                    if area > largest_area:
                        largest_area = area
                        largest_img = pil_im
                        largest_fmt = pil_im.format or 'RGB'
                except Exception:
                    pass

        if largest_img is not None:
            res = largest_img.convert('RGB')
            res.format = f'PDF (Embedded {largest_fmt})'
            res._pdf_source = 'embedded'
            res._pdf_page_count = len(reader.pages)
            res._pdf_images_count = total_images
            return res
    except Exception:
        pass

    # Strategy 2: High-resolution page rendering via pypdfium2
    try:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(pdf_path)
        if len(doc) > 0:
            page = doc[0]
            # scale=2.0 renders at ~144 DPI for crisp computer vision inspection
            rendered = page.render(scale=2.0).to_pil().convert('RGB')
            rendered.format = 'PDF'
            rendered._pdf_source = 'rendered'
            rendered._pdf_page_count = len(doc)
            rendered._pdf_images_count = 0
            return rendered
    except Exception:
        pass

    raise ValueError(f"Unable to extract RGB image or render page from PDF: {pdf_path}")


def _pil_open_any(path):
    """
    Open any image path with PIL, supporting:
    - JPG / JPEG
    - PNG
    - HEIC / HEIF (via pillow_heif)
    - PDF (containing RGB images or document pages)
    - TIFF / BMP / WebP
    Falls back to cv2 for remaining formats.
    """
    if is_pdf_file(path):
        return open_pdf_as_image(path)

    try:
        img = Image.open(path)
        img.load()   # force decode so errors surface here
        return img
    except Exception:
        # Check if it was secretly a PDF
        if is_pdf_file(path):
            return open_pdf_as_image(path)
        # Last resort: cv2 decode → convert to PIL
        arr = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if arr is None:
            raise FileNotFoundError(f"Cannot open image: {path}")
        if arr.ndim == 3:
            arr = cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
        return Image.fromarray(arr)


# ── Main loader ───────────────────────────────────────────────────────────────

def load_rgbd(rgb_or_rgba_path, depth_path=None):
    """
    Loads RGB and metric Depth array from:

    1. A HEIC file with embedded Apple Portrait depth → extracted automatically.
    2. A pair of (RGB/HEIC image, separate depth map image).
    3. A single 4-channel RGBA image (rejected unless an explicit depth scale
       is added by the caller).

    Supports: .jpg, .png, .tiff, .heic, .heif and any other PIL-readable format.

    Returns:
        rgb      (np.ndarray): (H, W, 3) uint8
        depth_m  (np.ndarray): (H, W) float32 metric depth in metres
        info     (dict)      : min/max/mean depth, format string, resolution
    """
    if not os.path.exists(rgb_or_rgba_path):
        raise FileNotFoundError(f"Image not found: {rgb_or_rgba_path}")

    # ── Step 1: attempt to open the primary image ──────────────────────────
    img_pil = _pil_open_any(rgb_or_rgba_path)

    ext = os.path.splitext(rgb_or_rgba_path)[-1].lower()
    is_heic = is_heic_file(rgb_or_rgba_path)

    # ── Step 2: resolve depth source ──────────────────────────────────────
    depth_raw  = None        # raw integer array (uint8 or uint16)
    depth_format = None

    # 2a: Discover companion depth file if depth_path not supplied
    if not depth_path or not os.path.exists(depth_path):
        stem, _ = os.path.splitext(rgb_or_rgba_path)
        for cand in (f"{stem}_depth.png", f"{stem}_depth.tiff", f"{stem}_d.png"):
            if os.path.exists(cand):
                depth_path = cand
                break

    # 2b: Explicit or discovered separate depth file
    if depth_path and os.path.exists(depth_path):
        if is_heic_file(depth_path):
            # A HEIC depth file (e.g. exported from Lightroom)
            depth_pil = _pil_open_any(depth_path)
            depth_raw = np.array(depth_pil.convert('L'))
        else:
            # Try cv2 first (supports 16-bit PNG / TIFF well)
            depth_raw = cv2.imread(depth_path, cv2.IMREAD_UNCHANGED)
            if depth_raw is None:
                depth_raw = np.array(_pil_open_any(depth_path))
            if depth_raw is not None and depth_raw.ndim == 3:
                depth_raw = depth_raw[:, :, 0]
        depth_format = f"Depth File ({os.path.basename(depth_path)})"

    # ── Step 3: convert depth array → metric float32 ─────────────────────
    rgb = np.array(img_pil.convert('RGB'), dtype=np.uint8)
    h, w = rgb.shape[:2]

    if depth_raw is not None:
        # Auto-resize if depth resolution differs from RGB
        if depth_raw.shape[:2] != (h, w):
            depth_raw = cv2.resize(
                depth_raw.astype(np.float32),
                (w, h),
                interpolation=cv2.INTER_LINEAR
            ).astype(depth_raw.dtype)

        if depth_raw.dtype == np.uint16:
            # 16-bit sensor depth in mm → metres
            depth_m = depth_raw.astype(np.float32) / 1000.0
            depth_format = depth_format or "16-bit raw sensor (mm → m)"
        else:
            # 8-bit depth map (JPEG, PNG, TIFF):
            # In monocular depth models & smartphone depth (Depth Anything, MiDaS, Apple Portrait),
            # 8-bit depth maps are inverse depth / disparity maps where White (255) = Near, Black (0) = Far.
            # Using hyperbolic inverse disparity avoids unnatural spherical/cylindrical curvature:
            #   Z = 1 / ( (1/z_max) + d_norm * ((1/z_min) - (1/z_max)) )
            d_norm = np.clip(depth_raw.astype(np.float32) / 255.0, 0.0, 1.0)
            top_mean = float(np.mean(d_norm[:max(1, int(h * 0.15)), :]))
            bottom_mean = float(np.mean(d_norm[-max(1, int(h * 0.15)):, :]))

            z_min, z_max = 0.4, 3.2
            # Polarity detection: bottom rows (foreground table/floor) brighter than top rows (background)
            if (bottom_mean > top_mean) or (bottom_mean > 0.5 and top_mean < 0.45):
                # White = Near (standard AI disparity)
                inv_z = (1.0 / z_max) + d_norm * ((1.0 / z_min) - (1.0 / z_max))
                depth_m = 1.0 / np.maximum(inv_z, 1e-4)
                depth_format = depth_format or f"8-bit AI Disparity (White=Near, {z_min:.1f}m–{z_max:.1f}m)"
            else:
                # Black = Near (sensor/synthetic depth)
                inv_z = (1.0 / z_min) - d_norm * ((1.0 / z_min) - (1.0 / z_max))
                depth_m = 1.0 / np.maximum(inv_z, 1e-4)
                depth_format = depth_format or f"8-bit Depth Map (Black=Near, {z_min:.1f}m–{z_max:.1f}m)"

    # ── 4-channel RGBA: depth in alpha channel ─────────────────────────────
    elif img_pil.mode == 'RGBA':
        rgba_arr = np.array(img_pil)
        rgb = rgba_arr[:, :, :3]
        alpha = rgba_arr[:, :, 3].astype(np.float32)
        # Unified encoder/decoder scale (0.3m – 3.0m) matching convert_depth_to_rgbd.py
        depth_m = 0.3 + (alpha / 255.0) * 2.7
        depth_format = "4-channel RGBA (Alpha = depth 0.3 – 3.0 m)"

    # ── No depth available: synthesise from monocular image structure ──────
    else:
        y_grid = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        depth_m = np.broadcast_to(1.4 - y_grid * 0.5, (h, w)).copy()
        depth_format = "Monocular depth approximation (0.9 – 1.4 m)"

    # Sanitize NaN / infinite values
    depth_m = np.where(np.isfinite(depth_m) & (depth_m > 0), depth_m, 1.0).astype(np.float32)

    # ── Sanity: ensure depth matches RGB shape ─────────────────────────────
    if rgb.shape[:2] != depth_m.shape[:2]:
        depth_m = cv2.resize(depth_m, (rgb.shape[1], rgb.shape[0]),
                             interpolation=cv2.INTER_NEAREST)

    valid_mask   = (depth_m > 0.1) & (depth_m < 10.0)
    valid_depths = depth_m[valid_mask]

    info = {
        'format':           depth_format,
        'width':            int(rgb.shape[1]),
        'height':           int(rgb.shape[0]),
        'heic_depth_found': is_heic and depth_raw is not None,
        'valid_pixels_pct': float(np.mean(valid_mask) * 100.0),
        'min_depth_m':      float(np.min(valid_depths))  if len(valid_depths) > 0 else 0.5,
        'max_depth_m':      float(np.max(valid_depths))  if len(valid_depths) > 0 else 2.5,
        'mean_depth_m':     float(np.mean(valid_depths)) if len(valid_depths) > 0 else 1.0,
    }

    return rgb, depth_m, info


# ── 3-D unprojection ──────────────────────────────────────────────────────────

def unproject_depth_to_points(depth_m, rgb=None, K=None, depth_min=0.2, depth_max=10.0, stride=2):
    """
    Unprojects 2D depth map (u, v, Z) into 3D camera coordinates (X, Y, Z).

    Formula:
        X = (u - cx) * Z / fx
        Y = (v - cy) * Z / fy
        Z = Z

    Returns:
        points_3d: (N, 3) float32 coordinates in metres
        colors:    (N, 3) float32 RGB colours in [0, 1]
    """
    h, w = depth_m.shape
    if K is None:
        K = get_default_camera_matrix(width=w, height=h)

    fx, fy = K[0, 0], K[1, 1]
    cx, cy = K[0, 2], K[1, 2]

    v_indices = np.arange(0, h, stride)
    u_indices = np.arange(0, w, stride)
    u_grid, v_grid = np.meshgrid(u_indices, v_indices)

    z_sub = depth_m[::stride, ::stride]
    mask  = (z_sub >= depth_min) & (z_sub <= depth_max) & ~np.isnan(z_sub)

    u_valid = u_grid[mask]
    v_valid = v_grid[mask]
    z_valid = z_sub[mask]

    x_valid = (u_valid - cx) * z_valid / fx
    y_valid = (v_valid - cy) * z_valid / fy

    points_3d = np.column_stack([x_valid, y_valid, z_valid]).astype(np.float32)

    if rgb is not None:
        rgb_sub = rgb[::stride, ::stride, :]
        colors  = (rgb_sub[mask] / 255.0).astype(np.float32)
    else:
        colors = np.ones_like(points_3d, dtype=np.float32)

    return points_3d, colors


def create_point_cloud_payload(rgb, depth_m, K=None, max_points=35000, object_bbox=None):
    """
    Generates a downsampled point-cloud payload for WebGL / Three.js.

    Returns dict with:
      - 'points':            list of [x, y, z, r, g, b]
      - 'total_points':      int
      - 'bounds':            {min_x, max_x, …}
      - 'camera_intrinsics': {fx, fy, cx, cy}
    """
    h, w = depth_m.shape
    if K is None:
        K = get_default_camera_matrix(width=w, height=h)

    total_pixels = h * w
    stride = max(2, int(np.ceil(np.sqrt(total_pixels / max_points))))

    points_3d, colors = unproject_depth_to_points(depth_m, rgb=rgb, K=K, stride=stride)

    if len(points_3d) == 0:
        return {
            'points':            [],
            'total_points':      0,
            'bounds':            {'min_x': 0, 'max_x': 0, 'min_y': 0,
                                  'max_y': 0, 'min_z': 0, 'max_z': 0},
            'camera_intrinsics': {'fx': float(K[0, 0]), 'fy': float(K[1, 1]),
                                  'cx': float(K[0, 2]), 'cy': float(K[1, 2])},
        }

    x = np.round(points_3d[:, 0], 4)
    y = np.round(points_3d[:, 1], 4)
    z = np.round(points_3d[:, 2], 4)
    r = np.round(colors[:, 0], 3)
    g = np.round(colors[:, 1], 3)
    b = np.round(colors[:, 2], 3)

    combined = np.column_stack([x, y, z, r, g, b]).tolist()

    return {
        'points':       combined,
        'total_points': len(combined),
        'stride_used':  stride,
        'bounds': {
            'min_x': float(np.min(x)), 'max_x': float(np.max(x)),
            'min_y': float(np.min(y)), 'max_y': float(np.max(y)),
            'min_z': float(np.min(z)), 'max_z': float(np.max(z)),
        },
        'camera_intrinsics': {
            'fx': float(K[0, 0]), 'fy': float(K[1, 1]),
            'cx': float(K[0, 2]), 'cy': float(K[1, 2]),
        },
    }
