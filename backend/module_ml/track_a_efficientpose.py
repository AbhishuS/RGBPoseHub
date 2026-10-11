"""
Track A: EfficientPose Engine
Deep learning direct regression for 6D Object Pose Estimation (Translation + Rotation)
using an EfficientNet-inspired architecture with dedicated 2D box, translation,
and rotation subnetworks.
"""

import os
import io
import math
import base64
import json
import numpy as np
import torch
import torch.nn as nn
from PIL import Image, ImageDraw
import cv2

from module_data.rgbd_utils import load_rgbd, get_default_camera_matrix


class EfficientPoseNetwork(nn.Module):
    """
    EfficientPose Neural Architecture.
    Backbone: Efficient feature extractor with BiFPN-style multi-scale fusion.
    Heads:
      1. Class Subnetwork (object classification)
      2. Translation Subnetwork (direct regression of Tx, Ty, Tz and dimensions)
      3. Rotation Subnetwork (direct regression of roll, pitch, yaw in degrees)
    """
    def __init__(self, in_channels=4, num_classes=85):
        super().__init__()
        
        # Conv backbone
        self.conv1 = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(32),
            nn.SiLU(),
        )
        self.conv2 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(64),
            nn.SiLU(),
        )
        self.conv3 = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(128),
            nn.SiLU(),
        )
        self.conv4 = nn.Sequential(
            nn.Conv2d(128, 256, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(256),
            nn.SiLU(),
        )
        
        # Adaptive pooling
        self.global_pool = nn.AdaptiveAvgPool2d((1, 1))

        # Shared feature projection
        self.fc_shared = nn.Sequential(
            nn.Linear(256, 256),
            nn.SiLU(),
            nn.Dropout(0.2),
        )

        # 1. Classification Subnet
        self.head_class = nn.Sequential(
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Linear(128, num_classes),
        )

        # Direct full-frame regression: [Tx, Ty, Tz, length, width, height].
        self.head_translation = nn.Sequential(
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Linear(128, 6),
        )

        # Direct full-frame Euler angle regression: [roll, pitch, yaw].
        self.head_rotation = nn.Sequential(
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Linear(128, 3),
        )

    def forward(self, x):
        feat = self.conv1(x)
        feat = self.conv2(feat)
        feat = self.conv3(feat)
        feat = self.conv4(feat)
        pooled = self.global_pool(feat).flatten(1)
        shared = self.fc_shared(pooled)

        class_logits = self.head_class(shared)
        trans_raw = self.head_translation(shared)
        # Keep angles in a finite, interpretable range while leaving the model
        # responsible for predicting them from the complete image.
        euler_deg = torch.tanh(self.head_rotation(shared)) * 180.0
        return class_logits, trans_raw, euler_deg


class TrackAEfficientPoseEngine:
    """
    Runtime execution engine for Track A (EfficientPose).
    Executes deep learning inference to regress 6D pose directly from RGB-D data.
    """
    def __init__(self, model_path=None, device='cpu'):
        self.device = torch.device(device)
        self.network = EfficientPoseNetwork(in_channels=4, num_classes=85).to(self.device)
        self.network.eval()
        self.is_trained = False
        self.class_names = {}

        if not model_path:
            search_dirs = [
                os.path.join(os.path.dirname(__file__), '..', '..', 'models'),
                os.path.join(os.path.dirname(__file__), '..', 'models'),
                os.path.abspath('models'),
            ]
            for d in search_dirs:
                cand = os.path.join(d, 'efficientpose_weights.pt')
                if os.path.exists(cand):
                    model_path = cand
                    break

        if model_path and os.path.exists(model_path):
            try:
                checkpoint = torch.load(model_path, map_location=self.device)
                state_dict = checkpoint.get('state_dict', checkpoint) if isinstance(checkpoint, dict) else checkpoint
                self.network.load_state_dict(state_dict)
                self.is_trained = True
            except Exception as e:
                print(f"[TrackA] Could not load weights from {model_path}: {e}")
        if model_path:
            names_path = os.path.join(os.path.dirname(model_path), 'class_names.json')
            try:
                with open(names_path, 'r', encoding='utf-8') as names_file:
                    self.class_names = json.load(names_file)
            except (OSError, json.JSONDecodeError):
                self.class_names = {}

    def _quaternion_to_rotation_matrix(self, q):
        """Convert quaternion [qw, qx, qy, qz] to 3x3 rotation matrix R."""
        w, x, y, z = q
        R = np.array([
            [1.0 - 2.0*(y**2 + z**2), 2.0*(x*y - z*w),       2.0*(x*z + y*w)],
            [2.0*(x*y + z*w),       1.0 - 2.0*(x**2 + z**2), 2.0*(y*z - x*w)],
            [2.0*(x*z - y*w),       2.0*(y*z + x*w),       1.0 - 2.0*(x**2 + y**2)],
        ], dtype=np.float32)
        return R

    def _quaternion_to_euler_deg(self, q):
        """Convert quaternion [qw, qx, qy, qz] to Euler angles (Roll, Pitch, Yaw) in degrees."""
        w, x, y, z = q
        # Roll (x-axis rotation)
        sinr_cosp = 2.0 * (w * x + y * z)
        cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
        roll = math.atan2(sinr_cosp, cosr_cosp)

        # Pitch (y-axis rotation)
        sinp = 2.0 * (w * y - z * x)
        if abs(sinp) >= 1:
            pitch = math.copysign(math.pi / 2, sinp)
        else:
            pitch = math.asin(sinp)

        # Yaw (z-axis rotation)
        siny_cosp = 2.0 * (w * z + x * y)
        cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
        yaw = math.atan2(siny_cosp, cosy_cosp)

        return (
            round(math.degrees(roll), 2),
            round(math.degrees(pitch), 2),
            round(math.degrees(yaw), 2)
        )

    @staticmethod
    def _euler_deg_to_quaternion(roll, pitch, yaw):
        """Convert directly regressed Euler angles to [w, x, y, z]."""
        r, p, y = np.radians([roll, pitch, yaw]) / 2.0
        cr, sr = math.cos(r), math.sin(r)
        cp, sp = math.cos(p), math.sin(p)
        cy, sy = math.cos(y), math.sin(y)
        return tuple(float(v) for v in (
            cr * cp * cy + sr * sp * sy,
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
        ))

    def estimate_pose(self, rgb, depth_m, class_name="Target Object", confidence=91.4, K=None,
                      target_point=None, bounding_box=None):
        """
        Executes Track A EfficientPose inference on RGB-D input.

        Args:
            rgb: (H, W, 3) uint8 image
            depth_m: (H, W) float32 metric depth map
            class_name: Optional predicted label
            confidence: Optional classification confidence
            K: (3, 3) Camera intrinsic matrix
            target_point: Accepted for API compatibility; ignored by Track A.
            bounding_box: Accepted for API compatibility; ignored by Track A.

        Returns:
            dict containing Track A 6D pose estimation metrics.
        """
        if not self.is_trained:
            return {
                'track': 'Track A (direct full-frame pose regression)',
                'status': 'unavailable',
                'error': 'A trained pose checkpoint is required. The classifier checkpoint is not a pose model.',
            }

        h, w = rgb.shape[:2]
        if K is None:
            K = get_default_camera_matrix(width=w, height=h)

        # --- Guard: sanitize depth map (NaN / Inf → 0) ----------------------
        if not np.all(np.isfinite(depth_m)):
            depth_m = np.where(np.isfinite(depth_m), depth_m, 0.0).astype(np.float32)

        # Normalize depth to 0-1 range for neural input
        depth_norm = np.clip((depth_m - 0.2) / 3.0, 0.0, 1.0)
        
        # Stack into 4-channel tensor: [R, G, B, Depth]
        rgb_norm = rgb.astype(np.float32) / 255.0
        rgbd_stack = np.dstack([rgb_norm, depth_norm]) # (H, W, 4)
        
        # Prepare tensor (1, 4, 224, 224)
        img_resized = cv2.resize(rgbd_stack, (224, 224))
        img_tensor = torch.from_numpy(img_resized).permute(2, 0, 1).unsqueeze(0).float().to(self.device)

        with torch.no_grad():
            class_logits, trans_raw, euler_raw = self.network(img_tensor)

        # Track A never consumes a selected target point or object boundary.
        # Both pose translation and angles come directly from the full-frame model.
        tx, ty, tz, l_m, w_m, h_m = trans_raw.cpu().numpy()[0].astype(float)
        roll, pitch, yaw = euler_raw.cpu().numpy()[0].astype(float)
        class_probabilities = torch.softmax(class_logits, dim=1)[0]
        predicted_class_index = int(torch.argmax(class_probabilities).item())
        predicted_class = self.class_names.get(str(predicted_class_index), class_name)
        classification_confidence = float(class_probabilities[predicted_class_index].item() * 100.0)
        if not np.isfinite([tx, ty, tz, l_m, w_m, h_m, roll, pitch, yaw]).all():
            return {'track': 'Track A (direct full-frame pose regression)', 'status': 'unavailable',
                    'error': 'The pose model returned non-finite values.'}
        if tz <= 0 or min(l_m, w_m, h_m) <= 0:
            return {'track': 'Track A (direct full-frame pose regression)', 'status': 'unavailable',
                    'error': 'The pose model returned invalid metric translation or dimensions.'}

        roll, pitch, yaw = (round(float(v), 2) for v in (roll, pitch, yaw))
        qw, qx, qy, qz = self._euler_deg_to_quaternion(roll, pitch, yaw)
        R_matrix = self._quaternion_to_rotation_matrix((qw, qx, qy, qz))
        l_m, w_m, h_m = (round(float(v), 3) for v in (l_m, w_m, h_m))
        K = K if K is not None else get_default_camera_matrix(width=w, height=h)

        # 8 corners in 3D object local coordinate frame
        dx, dy, dz = l_m / 2.0, w_m / 2.0, h_m / 2.0
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

        # Transform to camera coordinate frame: P_cam = R * P_local + t
        translation_vec = np.array([tx, ty, tz], dtype=np.float32)
        corners_3d_cam = (R_matrix @ local_corners.T).T + translation_vec

        # Project 3D corners to 2D image coordinates: p = K * P_cam / Z
        corners_2d = []
        for pt in corners_3d_cam:
            pz = max(0.05, pt[2])
            px = int((K[0, 0] * pt[0] / pz) + K[0, 2])
            py = int((K[1, 1] * pt[1] / pz) + K[1, 2])
            corners_2d.append([px, py])

        # Render 3D pose visualization
        vis_b64 = self._render_pose_visualization(
            rgb, corners_2d, (tx, ty, tz), (roll, pitch, yaw), predicted_class,
            classification_confidence, K
        )

        return {
            'track': 'Track A (EfficientPose Direct Neural Regression)',
            'status': 'success',
            'object_name': predicted_class,
            'classification_confidence_pct': round(classification_confidence, 2),
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
            'bounding_box_2d': None,
            'bounding_box_3d': {
                'length_m': l_m,
                'width_m': w_m,
                'height_m': h_m,
                'volume_cm3': round(l_m * w_m * h_m * 1e6, 1),
                'corners_3d_cam': [[round(float(v), 4) for v in c] for c in corners_3d_cam],
                'corners_2d_proj': corners_2d,
            },
            'pose_visualization': vis_b64,
        }

    def _render_pose_visualization(self, rgb, corners_2d, trans, euler, label, conf, K):
        """
        Renders Track A pose overlay: 3D wireframe + XYZ axes directly on the image.
        No 2D bounding box rectangle is drawn in Track A — the result is shown directly.
        """
        img = Image.fromarray(rgb).convert('RGB')
        draw = ImageDraw.Draw(img)

        # 3D Bounding box 12 wireframe edges
        # Front face: 0-1-2-3, Back face: 4-5-6-7, Connecting: 0-4, 1-5, 2-6, 3-7
        edges_front = [(0, 1), (1, 2), (2, 3), (3, 0)]
        edges_back  = [(4, 5), (5, 6), (6, 7), (7, 4)]
        edges_conn  = [(0, 4), (1, 5), (2, 6), (3, 7)]

        cyan    = (6, 182, 212)
        emerald = (16, 185, 129)

        # Draw Back Face & Connecting Depth Lines
        for (i, j) in edges_back + edges_conn:
            p1 = tuple(corners_2d[i])
            p2 = tuple(corners_2d[j])
            draw.line([p1, p2], fill=cyan, width=2)

        # Draw Front Face
        for (i, j) in edges_front:
            p1 = tuple(corners_2d[i])
            p2 = tuple(corners_2d[j])
            draw.line([p1, p2], fill=emerald, width=3)

        # Centroid of front face
        cx = int(np.mean([corners_2d[i][0] for i in range(4)]))
        cy = int(np.mean([corners_2d[i][1] for i in range(4)]))

        # 3D Coordinate Axes (X=Red, Y=Green, Z=Blue)
        axis_len = 50
        draw.line([(cx, cy), (cx + axis_len, cy)], fill=(239, 68, 68), width=3)
        draw.text((cx + axis_len + 4, cy - 6), "X", fill=(239, 68, 68))

        draw.line([(cx, cy), (cx, cy + axis_len)], fill=(34, 197, 94), width=3)
        draw.text((cx - 4, cy + axis_len + 4), "Y", fill=(34, 197, 94))

        draw.line([(cx, cy), (cx - axis_len // 2, cy - axis_len // 2)], fill=(59, 130, 246), width=3)
        draw.text((cx - axis_len // 2 - 12, cy - axis_len // 2 - 12), "Z", fill=(59, 130, 246))

        # Header badge (no bounding box — Track A shows direct overlay)
        badge_text = (
            f"Track A: {label} (class {conf:.1f}%) | "
            f"T=[{trans[0]:.2f}, {trans[1]:.2f}, {trans[2]:.2f}]m"
        )
        draw.rectangle([10, 10, len(badge_text) * 8 + 20, 36], fill=(15, 23, 42, 220))
        draw.text((15, 15), badge_text, fill=(255, 255, 255))

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')

