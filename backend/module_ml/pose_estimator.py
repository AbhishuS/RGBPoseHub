"""
6D Object Pose Estimation Engine
Coordinates:
  - Track A: EfficientPose Direct Deep Learning Regression
  - Track B: Correspondence Matching + Proper PnP + RANSAC
  - 3D Interactive Point Cloud Generator (for WebGL / Three.js)
"""

import os
import math
import numpy as np

from module_data.rgbd_utils import load_rgbd, get_default_camera_matrix, create_point_cloud_payload
from module_ml.track_a_efficientpose import TrackAEfficientPoseEngine
from module_ml.track_b_pnp import TrackBPnPEngine
from module_ml.object_detector import ObjectDetector


class PoseEstimator:
    """
    Unified 6D Object Pose Estimation Coordinator.
    Provides targeted multi-object pinpointing, dual-track pose estimation, and interactive 3D point cloud generation.
    """

    def __init__(self, model_dir=None, dataset_dir=None):
        self.model_dir = model_dir
        self.dataset_dir = dataset_dir

        model_weights = os.path.join(model_dir, 'efficientpose_weights.pt') if model_dir else None
        self.track_a = TrackAEfficientPoseEngine(model_path=model_weights)
        self.track_b = TrackBPnPEngine()

    def detect_candidate_objects(self, image_path, depth_path=None):
        """
        Extracts all candidate objects from the RGB-D image for multi-object selection.
        """
        if not os.path.exists(image_path):
            return []
        rgb, depth_m, _ = load_rgbd(image_path, depth_path=depth_path)
        filename = os.path.basename(image_path)
        return ObjectDetector.detect_objects(rgb, depth_m, filename=filename)

    def estimate_pose(self, image_path, depth_path=None, depth_stats=None,
                      prediction_info=None, track='both', camera_params=None,
                      target_point=None, bounding_box=None, selected_object_name=None):
        """
        Estimates 6D Object Pose for a specific targeted object using Track A, Track B, or both.
        
        Args:
            image_path: Path to RGB or 4-channel RGBA image.
            depth_path: Optional path to separate depth image.
            depth_stats: Optional metadata dictionary.
            prediction_info: Optional dictionary with class_name and confidence_pct.
            track: 'track_a', 'track_b', or 'both' (default).
            camera_params: Optional dict {fx, fy, cx, cy}.
            target_point: Optional pinpoint coordinate {'x': ..., 'y': ...}.
            bounding_box: Optional [xmin, ymin, xmax, ymax].
            selected_object_name: Optional explicit name of the targeted object.
        
        Returns:
            dict containing:
              - status: 'success'
              - object_name, confidence_pct, candidate_objects
              - track_a: results if track in ('track_a', 'both')
              - track_b: results if track in ('track_b', 'both')
              - comparison: comparative metrics if track == 'both'
              - point_cloud_3d: interactive 3D points [[x, y, z, r, g, b], ...]
              - pose_visualization: active visualization image base64
        """
        if not os.path.exists(image_path):
            return {'error': f'Image file not found: {image_path}'}

        # 1. Load RGB and Depth
        rgb, depth_m, depth_info = load_rgbd(image_path, depth_path=depth_path)
        h, w = rgb.shape[:2]
        filename = os.path.basename(image_path)

        # 2. Detect all candidate objects in scene
        detected_objects = ObjectDetector.detect_objects(rgb, depth_m, filename=filename)

        # 3. Camera Matrix K
        if camera_params:
            K = get_default_camera_matrix(
                width=w, height=h,
                fx=float(camera_params.get('fx', 615.0)),
                fy=float(camera_params.get('fy', 615.0)),
                cx=float(camera_params.get('cx', w / 2.0)),
                cy=float(camera_params.get('cy', h / 2.0))
            )
        else:
            K = get_default_camera_matrix(width=w, height=h)

        # 4. Resolve target object label & bounding box
        class_name = selected_object_name
        if not class_name:
            if prediction_info and prediction_info.get('class_name'):
                class_name = prediction_info['class_name']
            elif detected_objects:
                class_name = detected_objects[0]['label']
            else:
                class_name = 'Target Object'

        confidence = float(prediction_info.get('confidence_pct', 92.5)) if prediction_info else 92.5

        # If user clicked pinpoint coordinates but didn't supply bounding box
        if target_point and not bounding_box:
            resolved = ObjectDetector.resolve_target_from_click(
                rgb, depth_m,
                target_point.get('x_norm', target_point.get('x', w / 2.0) / w if target_point.get('x', 0) > 1.0 else target_point.get('x', 0.5)),
                target_point.get('y_norm', target_point.get('y', h / 2.0) / h if target_point.get('y', 0) > 1.0 else target_point.get('y', 0.5)),
                objects=detected_objects
            )
            bounding_box = resolved['bbox']
            if not selected_object_name:
                class_name = resolved['label']

        res_a = None
        res_b = None

        # Execute Track A (EfficientPose)
        if track in ('track_a', 'both'):
            res_a = self.track_a.estimate_pose(
                rgb, depth_m, class_name=class_name, confidence=confidence, K=K,
                target_point=target_point, bounding_box=bounding_box
            )

        # Execute Track B (Proper PnP + RANSAC)
        if track in ('track_b', 'both'):
            res_b = self.track_b.estimate_pose(
                rgb, depth_m, class_name=class_name, confidence=confidence, K=K,
                target_point=target_point, bounding_box=bounding_box
            )

        # 4. Generate Interactive 3D Point Cloud for Three.js
        point_cloud = create_point_cloud_payload(rgb, depth_m, K=K, max_points=25000)

        # 5. Dual-Track Comparison (if both tracks executed)
        comparison = None
        if res_a and res_b:
            # Translation Euclidean distance (m)
            ta = np.array([res_a['translation_vector_m']['x'],
                           res_a['translation_vector_m']['y'],
                           res_a['translation_vector_m']['z']])
            tb = np.array([res_b['translation_vector_m']['x'],
                           res_b['translation_vector_m']['y'],
                           res_b['translation_vector_m']['z']])
            delta_trans_m = round(float(np.linalg.norm(ta - tb)), 3)

            # Rotation difference angle (degrees)
            Ra = np.array(res_a['rotation_matrix_3x3'])
            Rb = np.array(res_b['rotation_matrix_3x3'])
            R_diff = Ra @ Rb.T
            tr = np.clip((np.trace(R_diff) - 1.0) / 2.0, -1.0, 1.0)
            rot_error_deg = round(float(math.degrees(math.acos(tr))), 2)

            comparison = {
                'translation_delta_m': delta_trans_m,
                'rotation_delta_deg': rot_error_deg,
                'agreement_status': 'High Alignment' if (delta_trans_m < 0.08 and rot_error_deg < 15.0) else ('Acceptable Agreement' if delta_trans_m < 0.20 else 'Poor Agreement'),
                'summary': f"Track A & Track B translation difference is {delta_trans_m*100:.1f}cm with {rot_error_deg}° angular delta."
            }

        # Select active visualization
        active_vis = res_a['pose_visualization'] if res_a else res_b['pose_visualization']
        
        # Determine primary translation and rotation for backward compatibility with UI
        primary = res_a if res_a else res_b

        return {
            'status': 'success',
            'object_name': class_name,
            'confidence_pct': confidence,
            'candidate_objects': detected_objects,
            'selected_target': {
                'point': target_point,
                'bounding_box': bounding_box,
                'object_name': class_name,
            },
            'depth_info': depth_info,
            'track_selected': track,
            'track_a': res_a,
            'track_b': res_b,
            'comparison': comparison,
            'point_cloud_3d': point_cloud,
            # Backward-compatible fields for existing UI components:
            'translation_3d': {
                'x_m': primary['translation_vector_m']['x'],
                'y_m': primary['translation_vector_m']['y'],
                'z_m': primary['translation_vector_m']['z'],
                'vector_formatted': primary['translation_vector_m']['formatted'],
            },
            'rotation_euler_deg': primary['rotation_euler_deg'],
            'rotation_quaternion': primary['rotation_quaternion'],
            'bounding_box_3d': primary['bounding_box_3d'],
            'pose_visualization': active_vis,
        }

    def generate_point_cloud(self, image_path, depth_path=None, max_points=35000, camera_params=None):
        """Generates 3D colored point cloud without running pose inference."""
        if not os.path.exists(image_path):
            return {'error': f'Image file not found: {image_path}'}

        rgb, depth_m, depth_info = load_rgbd(image_path, depth_path=depth_path)
        h, w = rgb.shape[:2]

        if camera_params:
            K = get_default_camera_matrix(
                width=w, height=h,
                fx=float(camera_params.get('fx', 615.0)),
                fy=float(camera_params.get('fy', 615.0)),
                cx=float(camera_params.get('cx', w / 2.0)),
                cy=float(camera_params.get('cy', h / 2.0))
            )
        else:
            K = get_default_camera_matrix(width=w, height=h)

        payload = create_point_cloud_payload(rgb, depth_m, K=K, max_points=max_points)
        payload['depth_info'] = depth_info
        return payload
