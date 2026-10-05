"""
RGB-D Image Builder Helper
Easily merges an RGB image with:
  1. A NumPy depth array (.npy file)
  2. A grayscale depth image (.png file)
  3. Automatic depth estimation (if you only have a normal 2D photo)

Usage:
  python convert_depth_to_rgbd.py --rgb input.jpg --depth depth.npy
  python convert_depth_to_rgbd.py --rgb input.jpg --depth depth_map.png
  python convert_depth_to_rgbd.py --rgb input.jpg --auto-depth
"""

import os
import argparse
import numpy as np
from PIL import Image
import cv2


def create_rgbd_from_inputs(rgb_path, depth_path=None, auto_depth=False, output_path=None):
    if not os.path.exists(rgb_path):
        print(f"❌ Error: RGB image not found at '{rgb_path}'")
        return None

    # 1. Load RGB Image
    img_rgb = Image.open(rgb_path).convert('RGB')
    rgb_arr = np.array(img_rgb)
    h, w = rgb_arr.shape[:2]
    print(f"✓ Loaded RGB image: {w}x{h} px from '{rgb_path}'")

    depth_arr = None

    # Case A: User supplied a NumPy depth array (.npy file)
    if depth_path and depth_path.endswith('.npy') and os.path.exists(depth_path):
        raw_depth = np.load(depth_path)
        print(f"✓ Loaded NumPy depth array: shape {raw_depth.shape}, dtype {raw_depth.dtype}")
        
        # Resize if dimensions differ
        if raw_depth.shape[:2] != (h, w):
            raw_depth = cv2.resize(raw_depth.astype(np.float32), (w, h), interpolation=cv2.INTER_NEAREST)

        # Normalize to 0-255 uint8 for RGBA Alpha channel
        min_d = np.nanmin(raw_depth[raw_depth > 0.1]) if np.any(raw_depth > 0.1) else 0.5
        max_d = np.nanmax(raw_depth[raw_depth < 10.0]) if np.any(raw_depth < 10.0) else 3.0
        norm_depth = np.clip((raw_depth - min_d) / (max_d - min_d + 1e-6) * 255.0, 0, 255).astype(np.uint8)
        depth_arr = norm_depth

    # Case B: User supplied a grayscale depth image (.png file)
    elif depth_path and os.path.exists(depth_path):
        img_depth = Image.open(depth_path)
        raw_depth = np.array(img_depth)
        print(f"✓ Loaded depth image: {raw_depth.shape}, dtype {raw_depth.dtype} from '{depth_path}'")
        
        if raw_depth.dtype == np.uint16:
            # 16-bit sensor depth in millimeters (e.g. 1000 = 1.0m)
            depth_m = raw_depth.astype(np.float32) / 1000.0
            norm_depth = np.clip((depth_m - 0.3) / (3.0 - 0.3) * 255.0, 0, 255).astype(np.uint8)
            depth_arr = norm_depth
        else:
            if len(raw_depth.shape) == 3:
                raw_depth = raw_depth[:, :, 0]
            depth_arr = raw_depth.astype(np.uint8)

        if depth_arr.shape[:2] != (h, w):
            depth_arr = cv2.resize(depth_arr, (w, h), interpolation=cv2.INTER_NEAREST)

    # Case C: Auto-Depth (User only has a normal 2D photo!)
    elif auto_depth or depth_path is None:
        print("💡 No depth file supplied. Generating depth map using edge + saliency analysis...")
        gray = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2GRAY)
        
        # 1. Perspective ground plane depth (far at top, closer at bottom)
        y_grid, x_grid = np.indices((h, w), dtype=np.float32)
        perspective_depth = 200.0 - (y_grid / h) * 100.0  # 100 (bottom/close) to 200 (top/far)

        # 2. Edge-based saliency to find object boundaries (not just center)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 30, 100)
        # Dilate edges to form connected object regions
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        edge_dilated = cv2.dilate(edges, kernel, iterations=3)
        # Fill holes: flood fill from corners (background), then invert
        edge_filled = edge_dilated.copy()
        flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
        for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
            cv2.floodFill(edge_filled, flood_mask, corner, 255)
        object_mask_edge = cv2.bitwise_not(edge_filled)
        # Clean up with morphological close
        object_mask_edge = cv2.morphologyEx(object_mask_edge, cv2.MORPH_CLOSE, kernel, iterations=2)

        # 3. Color saliency: pixels that differ significantly from border mean
        border_pixels = np.concatenate([
            rgb_arr[0, :, :], rgb_arr[-1, :, :],  # top and bottom rows
            rgb_arr[:, 0, :], rgb_arr[:, -1, :]   # left and right columns
        ], axis=0)
        border_mean = border_pixels.mean(axis=0)
        color_diff = np.sqrt(np.sum((rgb_arr.astype(np.float32) - border_mean) ** 2, axis=2))
        color_saliency = np.clip(color_diff / (np.max(color_diff) + 1e-5) * 255, 0, 255)

        # 4. Gaussian center-weighted prior (soft, not a hard rectangle)
        center_y, center_x = h / 2.0, w / 2.0
        sigma_y, sigma_x = h * 0.35, w * 0.35
        gauss_y = np.exp(-((y_grid - center_y) ** 2) / (2 * sigma_y ** 2))
        gauss_x = np.exp(-((x_grid - center_x) ** 2) / (2 * sigma_x ** 2))
        center_prior = gauss_y * gauss_x  # 0..1

        # 5. Combine all cues into a foreground probability map
        edge_score = object_mask_edge.astype(np.float32) / 255.0
        saliency_score = color_saliency / 255.0
        fg_probability = np.clip(
            0.4 * edge_score + 0.35 * saliency_score + 0.25 * center_prior,
            0, 1
        )
        # Smooth the combined map
        fg_probability = cv2.GaussianBlur(fg_probability, (31, 31), 0)

        # 6. Map foreground probability to depth (foreground=closer=lower values)
        fg_depth = 70.0   # foreground objects at ~0.7m
        bg_depth_val = perspective_depth
        # Blend: where fg_probability is high, depth is closer
        depth_float = bg_depth_val * (1 - fg_probability) + fg_depth * fg_probability

        # 7. Add slight noise for realism
        noise = np.random.normal(0, 2.0, (h, w))
        depth_arr = np.clip(depth_float + noise, 15, 245).astype(np.uint8)

    # 4. Merge into 4-channel RGBA (Channel 4 is Depth)
    rgbd_arr = np.dstack([rgb_arr, depth_arr])
    img_rgbd = Image.fromarray(rgbd_arr, mode='RGBA')

    # Default output path in backend/uploads/
    if not output_path:
        base_name = os.path.splitext(os.path.basename(rgb_path))[0]
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, 'uploads', f"{base_name}_rgbd.png")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img_rgbd.save(output_path, 'PNG')
    print(f"\n🎉 Successfully created 4-Channel RGB-D Image!")
    print(f"👉 Saved to: {output_path}")
    print(f"👉 Filename: {os.path.basename(output_path)}")
    print(f"You can now upload this file in the Web UI or select it for 6D Pose Estimation!")
    return output_path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Convert RGB + Depth Array to 4-Channel RGB-D Image")
    parser.add_argument('--rgb', required=True, help="Path to color RGB image (.jpg, .png)")
    parser.add_argument('--depth', default=None, help="Path to depth file (.npy array or .png image)")
    parser.add_argument('--auto-depth', action='store_true', help="Auto-synthesize depth if you don't have a sensor")
    parser.add_argument('--output', default=None, help="Custom output path for the RGB-D image")

    args = parser.parse_args()
    create_rgbd_from_inputs(args.rgb, depth_path=args.depth, auto_depth=args.auto_depth, output_path=args.output)
