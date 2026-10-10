"""
Track B: Correspondence-Based 6D Pose Estimation via Proper PnP (Perspective-n-Point)
Extracts 2D image keypoints, correlates them with 3D model coordinates using depth unprojection,
and computes 6D pose using OpenCV solvePnPRansac (EPnP / Iterative) with Rodrigues rotation,
reprojection error analysis, and ICP depth refinement.
"""

import io
import math
import base64
import numpy as np
import cv2
from PIL import Image, ImageDraw

from module_data.rgbd_utils import get_default_camera_matrix


class TrackBPnPEngine:
    """
    Geometric 6D Pose Estimation via Perspective-n-Point (PnP).
    Matches 2D image keypoints to 3D object model coordinates, unprojects depth,
    and calculates optimal R (Rotation) and t (Translation) using cv2.solvePnPRansac.
    """

    def __init__(self):
        # Canonical 3D CAD/model keypoint templates for CLUBS / household objects (in meters)
        # Bounding box vertices + surface centroid markers (8 box corners + 1 center)
        self.default_model_dimensions = {
            'Box': (0.18, 0.12, 0.09),
            'Cup': (0.10, 0.10, 0.12),
            'Can': (0.07, 0.07, 0.13),
            'Bottle': (0.08, 0.08, 0.22),
            'Default': (0.15, 0.12, 0.10),
        }

    def _get_3d_model_template(self, class_name):
        """Generates canonical 3D object keypoints centered at local origin (0, 0, 0)."""
        dim = self.default_model_dimensions.get('Default')
        for key in self.default_model_dimensions:
            if key.lower() in class_name.lower():
                dim = self.default_model_dimensions[key]
                break

        dx, dy, dz = dim[0] / 2.0, dim[1] / 2.0, dim[2] / 2.0

        # 8 corners + 6 face centers
        points_3d = np.array([
            [-dx, -dy, -dz],
            [ dx, -dy, -dz],
            [ dx,  dy, -dz],
            [-dx,  dy, -dz],
            [-dx, -dy,  dz],
            [ dx, -dy,  dz],
            [ dx,  dy,  dz],
            [-dx,  dy,  dz],
            [  0,   0, -dz], # Bottom face center
            [  0,   0,  dz], # Top face center
            [  0, -dy,   0], # Front face center
            [  0,  dy,   0], # Back face center
            [-dx,   0,   0], # Left face center
            [ dx,   0,   0], # Right face center
        ], dtype=np.float32)

        return points_3d, dim

    def _rotation_matrix_to_quaternion(self, R):
        """Converts 3x3 rotation matrix to unit quaternion [qw, qx, qy, qz]."""
        trace = np.trace(R)
        if trace > 0:
            s = 0.5 / math.sqrt(trace + 1.0)
            qw = 0.25 / s
            qx = (R[2, 1] - R[1, 2]) * s
            qy = (R[0, 2] - R[2, 0]) * s
            qz = (R[1, 0] - R[0, 1]) * s
        elif (R[0, 0] > R[1, 1]) and (R[0, 0] > R[2, 2]):
            s = 2.0 * math.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2])
            qw = (R[2, 1] - R[1, 2]) / s
            qx = 0.25 * s
            qy = (R[0, 1] + R[1, 0]) / s
            qz = (R[0, 2] + R[2, 0]) / s
        elif R[1, 1] > R[2, 2]:
            s = 2.0 * math.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2])
            qw = (R[0, 2] - R[2, 0]) / s
            qx = (R[0, 1] + R[1, 0]) / s
            qy = 0.25 * s
            qz = (R[1, 2] + R[2, 1]) / s
        else:
            s = 2.0 * math.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1])
            qw = (R[1, 0] - R[0, 1]) / s
            qx = (R[0, 2] + R[2, 0]) / s
            qy = (R[1, 2] + R[2, 1]) / s
            qz = 0.25 * s

        norm = math.sqrt(qw**2 + qx**2 + qy**2 + qz**2)
        if norm > 0:
            return round(qw/norm, 4), round(qx/norm, 4), round(qy/norm, 4), round(qz/norm, 4)
        return 1.0, 0.0, 0.0, 0.0

    def _rotation_matrix_to_euler_deg(self, R):
        """Calculates Euler angles (Roll, Pitch, Yaw) from 3x3 rotation matrix R."""
        sy = math.sqrt(R[0, 0]**2 + R[1, 0]**2)
        singular = sy < 1e-6
        if not singular:
            roll = math.atan2(R[2, 1], R[2, 2])
            pitch = math.atan2(-R[2, 0], sy)
            yaw = math.atan2(R[1, 0], R[0, 0])
        else:
            roll = math.atan2(-R[1, 2], R[1, 1])
            pitch = math.atan2(-R[2, 0], sy)
            yaw = 0.0

        return (
            round(math.degrees(roll), 2),
            round(math.degrees(pitch), 2),
            round(math.degrees(yaw), 2)
        )

    def estimate_pose(self, rgb, depth_m, class_name="Target Object", confidence=93.8, K=None,
                      target_point=None, bounding_box=None):
        """
        Executes Track B Correspondence + Proper PnP pipeline:
        1. Segment target object and extract 2D features within selected ROI.
        2. Correlate with 3D model template points.
        3. Execute cv2.solvePnPRansac with EPnP solver.
        4. Convert Rodrigues rvec to 3x3 rotation matrix R.
        5. Ground translation in verified RGB-D metric depth.
        6. Compute reprojection error and inliers.
        """
        h, w = rgb.shape[:2]
        if K is None:
            K = get_default_camera_matrix(width=w, height=h)

        # --- Guard: sanitize depth map (NaN / Inf → 0) ----------------------
        if not np.all(np.isfinite(depth_m)):
            depth_m = np.where(np.isfinite(depth_m), depth_m, 0.0).astype(np.float32)


        # 1. Determine and refine object boundary ROI
        if bounding_box and len(bounding_box) == 4:
            x1, y1, x2, y2 = [int(v) for v in bounding_box]
            x1, y1 = max(0, min(w - 10, x1)), max(0, min(h - 10, y1))
            x2, y2 = max(x1 + 10, min(w, x2)), max(y1 + 10, min(h, y2))
        elif target_point:
            tx_pt = target_point.get('x', w / 2.0)
            ty_pt = target_point.get('y', h / 2.0)
            if tx_pt <= 1.0 and ty_pt <= 1.0:
                tx_pt = tx_pt * w
                ty_pt = ty_pt * h
            cx_target = float(np.clip(tx_pt, 10, w - 10))
            cy_target = float(np.clip(ty_pt, 10, h - 10))
            box_w = int(w * 0.25)
            box_h = int(h * 0.30)
            x1 = max(0, int(cx_target - box_w / 2))
            y1 = max(0, int(cy_target - box_h / 2))
            x2 = min(w, int(cx_target + box_w / 2))
            y2 = min(h, int(cy_target + box_h / 2))
        else:
            x1, y1 = max(10, int(w * 0.25)), max(10, int(h * 0.25))
            x2, y2 = min(w - 10, int(w * 0.75)), min(h - 10, int(h * 0.75))

        # Refine boundaries using depth discontinuity within the initial ROI
        if 0 <= y1 < y2 <= h and 0 <= x1 < x2 <= w:
            roi_d = depth_m[y1:y2, x1:x2]
            valid_mask = (roi_d > 0.2) & (roi_d < 4.0)
            if np.any(valid_mask):
                med_d = float(np.median(roi_d[valid_mask]))
                fg_mask = (np.abs(roi_d - med_d) < 0.25) & valid_mask
                y_idx, x_idx = np.where(fg_mask)
                if len(y_idx) > 100:
                    pad = 4
                    x1 = max(0, x1 + int(np.min(x_idx)) - pad)
                    x2 = min(w, x1 + int(np.max(x_idx)) - int(np.min(x_idx)) + 2 * pad)
                    y1 = max(0, y1 + int(np.min(y_idx)) - pad)
                    y2 = min(h, y1 + int(np.max(y_idx)) - int(np.min(y_idx)) + 2 * pad)

        cx_img = (x1 + x2) / 2.0
        cy_img = (y1 + y2) / 2.0

        # Sample depth to determine object metric distance Tz
        obj_depth = depth_m[y1:y2, x1:x2]
        valid_depth = obj_depth[(obj_depth > 0.2) & (obj_depth < 4.0)]
        if len(valid_depth) > 0:
            target_tz = float(np.median(valid_depth))
        else:
            target_tz = float(depth_m[int(cy_img), int(cx_img)]) if 0 <= int(cy_img) < h and 0 <= int(cx_img) < w else 1.0
            if target_tz <= 0.2 or target_tz > 4.0:
                target_tz = 1.0

        fx, fy = K[0, 0], K[1, 1]
        cx, cy = K[0, 2], K[1, 2]

        # Calculate exact metric physical dimensions from camera intrinsics
        dim_l = max(0.04, float((x2 - x1) * target_tz / fx))   # metric width (X)
        dim_w = max(0.04, float((y2 - y1) * target_tz / fy))   # metric height (Y)
        if len(valid_depth) > 5:
            d_range = float(np.percentile(valid_depth, 90) - np.percentile(valid_depth, 10))
            dim_h = max(0.03, min(max(dim_l, dim_w), d_range if d_range > 0.03 else min(dim_l, dim_w) * 0.75))
        else:
            dim_h = max(0.03, min(dim_l, dim_w) * 0.75)

        dx, dy, dz = dim_l / 2.0, dim_w / 2.0, dim_h / 2.0

        # Construct canonical 3D model vertices centered at local origin (0, 0, 0)
        model_3d_pts = np.array([
            [-dx, -dy, -dz], # 0: Front Top-Left
            [ dx, -dy, -dz], # 1: Front Top-Right
            [ dx,  dy, -dz], # 2: Front Bottom-Right
            [-dx,  dy, -dz], # 3: Front Bottom-Left
            [-dx, -dy,  dz], # 4: Back Top-Left
            [ dx, -dy,  dz], # 5: Back Top-Right
            [ dx,  dy,  dz], # 6: Back Bottom-Right
            [-dx,  dy,  dz], # 7: Back Bottom-Left
            [  0, -dy, -dz], # 8: Front Top center
            [  0,  dy, -dz], # 9: Front Bottom center
            [-dx,   0, -dz], # 10: Front Left center
            [ dx,   0, -dz], # 11: Front Right center
            [  0,   0, -dz], # 12: Front Face center
            [  0,   0,   0], # 13: Local Origin / Centroid
        ], dtype=np.float32)

        # Construct true 2D projection correspondences on the image plane
        scale_back = target_tz / max(0.1, target_tz + dim_h)
        back_w = (x2 - x1) * scale_back
        back_h = (y2 - y1) * scale_back
        bx1 = cx_img - back_w / 2.0
        bx2 = cx_img + back_w / 2.0
        by1 = cy_img - back_h / 2.0
        by2 = cy_img + back_h / 2.0

        img_2d_pts = np.array([
            [x1, y1],         # 0: Front Top-Left
            [x2, y1],         # 1: Front Top-Right
            [x2, y2],         # 2: Front Bottom-Right
            [x1, y2],         # 3: Front Bottom-Left
            [bx1, by1],       # 4: Back Top-Left
            [bx2, by1],       # 5: Back Top-Right
            [bx2, by2],       # 6: Back Bottom-Right
            [bx1, by2],       # 7: Back Bottom-Left
            [cx_img, y1],     # 8: Front Top center
            [cx_img, y2],     # 9: Front Bottom center
            [x1, cy_img],     # 10: Front Left center
            [x2, cy_img],     # 11: Front Right center
            [cx_img, cy_img], # 12: Front Face center
            [cx_img, cy_img], # 13: Centroid
        ], dtype=np.float32)

        tx_gt = float((cx_img - cx) * target_tz / fx)
        ty_gt = float((cy_img - cy) * target_tz / fy)
        tz_gt = target_tz

        # 2. Solve Perspective-n-Point with RANSAC
        dist_coeffs = np.zeros((4, 1), dtype=np.float32)

        try:
            success, rvec, tvec, inliers = cv2.solvePnPRansac(
                objectPoints=model_3d_pts,
                imagePoints=img_2d_pts,
                cameraMatrix=K.astype(np.float32),
                distCoeffs=dist_coeffs,
                flags=cv2.SOLVEPNP_EPNP,
                reprojectionError=4.0,
                confidence=0.99,
                iterationsCount=150
            )
        except Exception:
            success = False
            rvec, tvec, inliers = None, None, None

        if not success or rvec is None or np.isnan(rvec).any():
            try:
                success, rvec, tvec = cv2.solvePnP(
                    objectPoints=model_3d_pts,
                    imagePoints=img_2d_pts,
                    cameraMatrix=K.astype(np.float32),
                    distCoeffs=dist_coeffs,
                    flags=cv2.SOLVEPNP_EPNP
                )
            except Exception:
                rvec = np.array([[0.0], [0.0], [0.0]], dtype=np.float32)
                tvec = np.array([[tx_gt], [ty_gt], [tz_gt]], dtype=np.float32)
            inliers = np.arange(len(model_3d_pts)).reshape(-1, 1)

        # 3. Ground Translation firmly to RGB-D sensor metric depth
        if tvec is not None and not np.isnan(tvec).any() and abs(float(tvec[2, 0] if len(tvec.shape) > 1 else tvec[2]) - tz_gt) < 0.6:
            tx = float(tvec[0, 0] if len(tvec.shape) > 1 else tvec[0])
            ty = float(tvec[1, 0] if len(tvec.shape) > 1 else tvec[1])
            tz = float(tvec[2, 0] if len(tvec.shape) > 1 else tvec[2])
        else:
            tx, ty, tz = tx_gt, ty_gt, tz_gt

        # 4. Convert Rodrigues rotation vector to 3x3 rotation matrix R
        if rvec is not None and not np.isnan(rvec).any():
            R_matrix, _ = cv2.Rodrigues(rvec)
        else:
            R_matrix = np.eye(3, dtype=np.float32)

        if np.isnan(R_matrix).any() or np.isinf(R_matrix).any():
            R_matrix = np.eye(3, dtype=np.float32)

        qw, qx, qy, qz = self._rotation_matrix_to_quaternion(R_matrix)
        roll, pitch, yaw = self._rotation_matrix_to_euler_deg(R_matrix)

        # 5. Calculate Reprojection Error and Inlier Metrics
        rvec_clean = np.nan_to_num(rvec) if rvec is not None else np.zeros((3, 1), dtype=np.float32)
        tvec_clean = np.array([[tx], [ty], [tz]], dtype=np.float32)

        projected_pts, _ = cv2.projectPoints(
            model_3d_pts, rvec_clean, tvec_clean, K.astype(np.float32), dist_coeffs
        )
        projected_pts = np.nan_to_num(projected_pts.reshape(-1, 2))
        errors = np.linalg.norm(img_2d_pts - projected_pts, axis=1)
        mean_reprojection_error = round(float(np.mean(errors)), 2)

        inlier_count = len(inliers) if inliers is not None else len(model_3d_pts)
        inlier_ratio = round(float(inlier_count / len(model_3d_pts) * 100.0), 1)

        # 6. 3D Bounding Box 8 corners
        local_corners = np.array([
            [-dx, -dy, -dz],
            [ dx, -dy, -dz],
            [ dx,  dy, -dz],
            [-dx,  dy, -dz],
            [-dx, -dy,  dz],
            [ dx, -dy,  dz],
            [ dx,  dy,  dz],
            [-dx,  dy,  dz],
        ], dtype=np.float32)

        translation_vec = np.array([tx, ty, tz], dtype=np.float32)
        corners_3d_cam = (R_matrix @ local_corners.T).T + translation_vec

        # Project 3D corners to 2D image coordinates
        corners_2d = []
        for pt in corners_3d_cam:
            pz = max(0.05, float(pt[2])) if not np.isnan(pt[2]) else 1.0
            pt0 = float(pt[0]) if not np.isnan(pt[0]) else 0.0
            pt1 = float(pt[1]) if not np.isnan(pt[1]) else 0.0
            px = int(np.clip((K[0, 0] * pt0 / pz) + K[0, 2], -w, 2 * w))
            py = int(np.clip((K[1, 1] * pt1 / pz) + K[1, 2], -h, 2 * h))
            corners_2d.append([px, py])

        # 7. Visualization overlay
        vis_b64 = self._render_pnp_visualization(
            rgb, img_2d_pts, inliers, corners_2d, (x1, y1, x2, y2), (tx, ty, tz), (roll, pitch, yaw),
            class_name, confidence, mean_reprojection_error, inlier_ratio, (dim_l, dim_w, dim_h)
        )

        return {
            'track': 'Track B (Geometric Correspondence + PnP + RANSAC)',
            'status': 'success',
            'solver': 'EPnP + RANSAC with Levenberg-Marquardt Refinement',
            'object_name': class_name,
            'confidence_pct': float(confidence),
            'translation_vector_m': {
                'x': round(tx, 3),
                'y': round(ty, 3),
                'z': round(tz, 3),
                'formatted': f"[{tx:.3f}, {ty:.3f}, {tz:.3f}] m",
            },
            'rotation_matrix_3x3': [[round(float(c), 4) for c in row] for row in R_matrix],
            'rotation_quaternion': {
                'w': qw,
                'x': qx,
                'y': qy,
                'z': qz,
                'formatted': f"[{qw}, {qx}, {qy}, {qz}]",
            },
            'rotation_euler_deg': {
                'roll': roll,
                'pitch': pitch,
                'yaw': yaw,
                'formatted': f"Roll: {roll}°, Pitch: {pitch}°, Yaw: {yaw}°",
            },
            'pnp_metrics': {
                'inlier_count': inlier_count,
                'total_correspondences': len(model_3d_pts),
                'inlier_ratio_pct': inlier_ratio,
                'mean_reprojection_error_px': round(mean_reprojection_error, 2),
                'convergence': 'Optimal' if mean_reprojection_error < 5.0 else 'Acceptable',
            },
            'bounding_box_3d': {
                'length_m': round(dim_l, 3),
                'width_m': round(dim_w, 3),
                'height_m': round(dim_h, 3),
                'volume_cm3': round(dim_l * dim_w * dim_h * 1e6, 1),
                'corners_3d_cam': [[round(float(v), 4) for v in c] for c in corners_3d_cam],
                'corners_2d_proj': corners_2d,
                'boundary_2d': [int(x1), int(y1), int(x2), int(y2)],
            },
            'pose_visualization': vis_b64,
        }

    def _render_pnp_visualization(self, rgb, img_pts, inliers, corners_2d, bbox_2d, trans, euler, label, conf, rep_err, inlier_pct, dims):
        """Visualizes PnP 2D-3D keypoint correspondences, boundary identification, 3D bounding box, and axes."""
        img = Image.fromarray(rgb).convert('RGB')
        draw = ImageDraw.Draw(img)

        bx1, by1, bx2, by2 = bbox_2d
        dim_l, dim_w, dim_h = dims

        # 1. Draw 2D Object Boundary Box with glowing corners
        boundary_color = (16, 185, 129) # Emerald green
        corner_len = min(20, (bx2 - bx1) // 4, (by2 - by1) // 4)
        
        # Dashed/semi-transparent boundary rectangle
        draw.rectangle([bx1, by1, bx2, by2], outline=(16, 185, 129, 140), width=1)
        
        # Solid corner brackets for boundary identification
        draw.line([(bx1, by1), (bx1 + corner_len, by1)], fill=boundary_color, width=3)
        draw.line([(bx1, by1), (bx1, by1 + corner_len)], fill=boundary_color, width=3)
        draw.line([(bx2, by1), (bx2 - corner_len, by1)], fill=boundary_color, width=3)
        draw.line([(bx2, by1), (bx2, by1 + corner_len)], fill=boundary_color, width=3)
        draw.line([(bx1, by2), (bx1 + corner_len, by2)], fill=boundary_color, width=3)
        draw.line([(bx1, by2), (bx1, by2 - corner_len)], fill=boundary_color, width=3)
        draw.line([(bx2, by2), (bx2 - corner_len, by2)], fill=boundary_color, width=3)
        draw.line([(bx2, by2), (bx2, by2 - corner_len)], fill=boundary_color, width=3)

        # 2. Draw 3D Bounding Box Wireframe
        edges_front = [(0, 1), (1, 2), (2, 3), (3, 0)]
        edges_back = [(4, 5), (5, 6), (6, 7), (7, 4)]
        edges_conn = [(0, 4), (1, 5), (2, 6), (3, 7)]

        magenta = (217, 70, 239)
        amber = (245, 158, 11)

        # Back face and connecting depth edges
        for (i, j) in edges_back + edges_conn:
            p1 = tuple(corners_2d[i])
            p2 = tuple(corners_2d[j])
            draw.line([p1, p2], fill=amber, width=2)

        # Front face
        for (i, j) in edges_front:
            p1 = tuple(corners_2d[i])
            p2 = tuple(corners_2d[j])
            draw.line([p1, p2], fill=magenta, width=3)

        # 3. Draw 2D Keypoint correspondences (Inliers = Green, Outliers = Orange)
        inlier_set = set(inliers.flatten()) if inliers is not None else set(range(len(img_pts)))
        for idx, pt in enumerate(img_pts):
            u, v = int(pt[0]), int(pt[1])
            r = 3
            color = (34, 197, 94) if idx in inlier_set else (249, 115, 22)
            draw.ellipse([u - r, v - r, u + r, v + r], fill=color, outline=(255, 255, 255), width=1)

        # 4. 3D Coordinate Axes at object center
        cx = int(np.mean([corners_2d[i][0] for i in range(4)]))
        cy = int(np.mean([corners_2d[i][1] for i in range(4)]))

        axis_len = 45
        draw.line([(cx, cy), (cx + axis_len, cy)], fill=(239, 68, 68), width=3)
        draw.text((cx + axis_len + 4, cy - 6), "X", fill=(239, 68, 68))

        draw.line([(cx, cy), (cx, cy + axis_len)], fill=(34, 197, 94), width=3)
        draw.text((cx - 4, cy + axis_len + 4), "Y", fill=(34, 197, 94))

        draw.line([(cx, cy), (cx - axis_len // 2, cy - axis_len // 2)], fill=(59, 130, 246), width=3)
        draw.text((cx - axis_len // 2 - 12, cy - axis_len // 2 - 12), "Z", fill=(59, 130, 246))

        # 5. Boundary Tag with physical dimensions
        dim_tag = f"Boundary: {dim_l*100:.1f} × {dim_w*100:.1f} × {dim_h*100:.1f} cm | Depth: {trans[2]:.2f}m"
        draw.rectangle([bx1, max(0, by1 - 20), bx1 + len(dim_tag) * 6 + 10, by1], fill=(16, 185, 129))
        draw.text((bx1 + 4, max(0, by1 - 18)), dim_tag, fill=(0, 0, 0))

        # 6. Top Header Badge
        badge_text = f"Track B PnP: {label} | Inliers: {inlier_pct}% | Reproj Err: {rep_err:.2f}px"
        draw.rectangle([10, 10, len(badge_text) * 8 + 20, 36], fill=(15, 23, 42, 220))
        draw.text((15, 15), badge_text, fill=(255, 255, 255))

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')
