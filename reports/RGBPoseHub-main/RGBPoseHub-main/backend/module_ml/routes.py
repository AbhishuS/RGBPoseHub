"""
Module ML — API Routes
Inference, training, model status, and visualization endpoints.
"""
import os
import uuid as _uuid
from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from module_ml.model_trainer import ModelTrainer
from module_ml.inference import InferenceEngine
from module_ml.visualizer import Visualizer
from module_ml.forensic_analyzer import ForensicAnalyzer
from module_ml.pose_estimator import PoseEstimator
from module_auth.middleware import log_activity

# ── HEIC/HEIF support: register opener so PIL handles .heic everywhere ──────
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

ml_bp = Blueprint('ml', __name__)

# Allowed upload extensions (lowercase)
_ALLOWED_IMAGE_EXTS = {'jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'webp', 'heic', 'heif', 'pdf'}


def _sanitize_for_json(val):
    """Recursively converts NumPy scalars/arrays and non-serializable objects to native Python."""
    if isinstance(val, dict):
        return {str(k): _sanitize_for_json(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple, set)):
        return [_sanitize_for_json(x) for x in val]
    elif hasattr(val, 'item'):
        return val.item()
    elif hasattr(val, 'tolist'):
        return val.tolist()
    return val


def _save_upload(file_storage, upload_dir, prefix=''):
    """
    Save a werkzeug FileStorage object to *upload_dir*.
    Preserves user file format (JPG, PNG, PDF, HEIC, etc.) without converting.

    Returns:
        (saved_path, ext)  — absolute path and lowercase extension
    """
    os.makedirs(upload_dir, exist_ok=True)
    raw_name = file_storage.filename or 'upload'
    ext = raw_name.rsplit('.', 1)[-1].lower() if '.' in raw_name else ''

    if ext in ('jpg', 'jpeg'):
        ext = 'jpg'
    elif ext in ('png', 'pdf', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'webp'):
        pass
    else:
        # Only check fallback if extension was completely missing or unknown
        header = b''
        try:
            header = file_storage.stream.read(16)
            file_storage.stream.seek(0)
        except Exception:
            pass
        if header.startswith(b'%PDF'):
            ext = 'pdf'
        elif header.startswith(b'\x89PNG'):
            ext = 'png'
        elif header.startswith(b'\xff\xd8\xff'):
            ext = 'jpg'
        else:
            ext = 'png'

    filename = f'{prefix}{_uuid.uuid4().hex}.{ext}'
    path = os.path.join(upload_dir, filename)
    file_storage.save(path)
    return path, ext


def _get_image_preview_b64(image_path):
    """
    Returns (base64_str, mime_type, display_format) preserving original format
    (JPG as JPEG, PNG as PNG, etc.). Converts HEIC/PDF to browser-renderable formats.
    """
    import base64
    import io
    ext = os.path.splitext(image_path)[-1].lower().lstrip('.')
    if ext in ('jpg', 'jpeg'):
        save_fmt = 'JPEG'
        mime = 'image/jpeg'
        fmt_name = 'JPEG'
    elif ext == 'png':
        save_fmt = 'PNG'
        mime = 'image/png'
        fmt_name = 'PNG'
    elif ext in ('heic', 'heif'):
        save_fmt = 'JPEG'
        mime = 'image/jpeg'
        fmt_name = 'HEIC'
    elif ext == 'pdf':
        save_fmt = 'PNG'
        mime = 'image/png'
        fmt_name = 'PDF'
    elif ext in ('webp', 'bmp', 'tiff', 'tif'):
        save_fmt = 'PNG'
        mime = 'image/png'
        fmt_name = ext.upper()
    else:
        save_fmt = 'PNG'
        mime = 'image/png'
        fmt_name = ext.upper() if ext else 'PNG'

    try:
        from module_data.rgbd_utils import _pil_open_any
        _orig_pil = _pil_open_any(image_path)
        if _orig_pil.mode in ('RGBA', 'LA') and save_fmt == 'JPEG':
            _orig_pil = _orig_pil.convert('RGB')
        elif _orig_pil.mode not in ('RGB', 'RGBA') and save_fmt == 'JPEG':
            _orig_pil = _orig_pil.convert('RGB')

        _orig_buf = io.BytesIO()
        if save_fmt == 'JPEG':
            _orig_pil.convert('RGB').save(_orig_buf, format='JPEG', quality=95)
        else:
            _orig_pil.save(_orig_buf, format='PNG')
        b64 = base64.b64encode(_orig_buf.getvalue()).decode('utf-8')
        return b64, mime, fmt_name
    except Exception:
        try:
            with open(image_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
            return b64, mime, fmt_name
        except Exception:
            return '', mime, fmt_name


def _get_trainer():
    return ModelTrainer(
        model_dir=current_app.config['MODEL_FOLDER'],
    )

def _get_engine():
    return InferenceEngine(
        model_dir=current_app.config['MODEL_FOLDER'],
        dataset_dir=current_app.config['DATASET_FOLDER'],
    )

def _get_visualizer():
    return Visualizer(
        output_dir=os.path.join(current_app.config['MODEL_FOLDER'], 'visualizations')
    )


@ml_bp.route('/status', methods=['GET'])
@jwt_required()
def model_status():
    """Get current model status and info."""
    trainer = _get_trainer()
    info = trainer.get_model_info()
    history = trainer.get_training_history()

    return jsonify({
        'model': info,
        'has_training_history': history is not None,
        'training_summary': {
            'epochs': history.get('epochs_completed', 0) if history else 0,
            'final_accuracy': history['accuracy'][-1] if history and history.get('accuracy') else None,
            'final_val_accuracy': history['val_accuracy'][-1] if history and history.get('val_accuracy') else None,
        } if history else None,
    }), 200


@ml_bp.route('/build', methods=['POST'])
@jwt_required()
def build_model():
    """Build the ML model architecture."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    num_classes = data.get('num_classes', 85)

    trainer = _get_trainer()
    result = trainer.build_model(num_classes=num_classes)

    log_activity(user_id, 'model_build', 'ml',
                 f'Built model with {num_classes} classes',
                 metadata=result)

    return jsonify({'result': result}), 200


@ml_bp.route('/train', methods=['POST'])
@jwt_required()
def train_model():
    """Train the model on preprocessed dataset."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    epochs = data.get('epochs', 20)
    batch_size = data.get('batch_size', 16)

    # Load preprocessed data
    from module_data.preprocessor import Preprocessor
    images_dir = os.path.join(current_app.config['DATASET_FOLDER'], 'images')
    output_dir = os.path.join(current_app.config['DATASET_FOLDER'], 'preprocessed')
    preprocessor = Preprocessor(images_dir, output_dir)

    X_train, X_val, y_train, y_val, class_names = preprocessor.prepare_training_data()

    if X_train is None:
        return jsonify({
            'error': 'No training data available. Please preprocess the dataset first.'
        }), 400

    # Build and train
    num_classes = len(set(y_train.tolist() + y_val.tolist()))
    trainer = _get_trainer()
    trainer.class_names = class_names
    trainer.build_model(num_classes=num_classes)

    log_activity(user_id, 'training_start', 'ml',
                 f'Started training: {epochs} epochs, batch_size={batch_size}')

    result = trainer.train(X_train, X_val, y_train, y_val,
                          epochs=epochs, batch_size=batch_size)

    log_activity(user_id, 'training_complete', 'ml',
                 f'Training complete: accuracy={result.get("final_accuracy", "N/A")}',
                 metadata=result)

    return jsonify({'result': result}), 200


@ml_bp.route('/predict', methods=['POST'])
@jwt_required()
def predict():
    """Run inference on an uploaded image."""
    user_id = get_jwt_identity()

    if 'image' not in request.files:
        # Check if filename was passed (for already-uploaded images)
        data = request.get_json() or {}
        filename = data.get('filename')
        if filename:
            image_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        else:
            return jsonify({'error': 'No image provided'}), 400
    else:
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        upload_dir = current_app.config['UPLOAD_FOLDER']
        image_path, _ = _save_upload(file, upload_dir)
        filename = os.path.basename(image_path)

    if not os.path.exists(image_path):
        return jsonify({'error': 'Image file not found'}), 404

    # Run inference
    engine = _get_engine()
    engine.load_model()
    top_k = request.args.get('top_k', 5, type=int)
    results = engine.predict(image_path, top_k=top_k)

    # Generate annotated image
    visualizer = _get_visualizer()
    annotated = None
    chart_data = None
    if results.get('predictions'):
        annotated = visualizer.annotate_image(image_path, results['predictions'])
        chart_data = visualizer.generate_confidence_chart_data(results['predictions'])

    # Read original image as base64 preserving format
    original_b64, image_mime, image_format = _get_image_preview_b64(image_path)

    log_activity(user_id, 'image_analysis', 'ml',
                 f'Analyzed image: {filename}',
                 metadata={
                     'filename': filename,
                     'method': results.get('method'),
                     'top_prediction': results['predictions'][0]['class_name'] if results.get('predictions') else None,
                     'top_confidence': results['predictions'][0].get('confidence_pct') if results.get('predictions') else None,
                 })

    return jsonify({
        'results': results,
        'original_image': original_b64,
        'image_mime': image_mime,
        'image_format': image_format,
        'annotated_image': annotated,
        'chart_data': chart_data,
        'filename': filename,
    }), 200


@ml_bp.route('/predict-dataset/<filename>', methods=['POST'])
@jwt_required()
def predict_dataset_image(filename):
    """Run inference on a dataset image."""
    user_id = get_jwt_identity()
    images_dir = os.path.join(current_app.config['DATASET_FOLDER'], 'images')
    image_path = os.path.join(images_dir, filename)

    if not os.path.exists(image_path):
        return jsonify({'error': 'Dataset image not found'}), 404

    engine = _get_engine()
    engine.load_model()
    results = engine.predict(image_path, top_k=5)

    visualizer = _get_visualizer()
    annotated = None
    chart_data = None
    if results.get('predictions'):
        annotated = visualizer.annotate_image(image_path, results['predictions'])
        chart_data = visualizer.generate_confidence_chart_data(results['predictions'])

    original_b64, image_mime, image_format = _get_image_preview_b64(image_path)

    log_activity(user_id, 'dataset_analysis', 'ml',
                 f'Analyzed dataset image: {filename}',
                 metadata={'filename': filename, 'method': results.get('method')})

    return jsonify({
        'results': results,
        'original_image': original_b64,
        'image_mime': image_mime,
        'image_format': image_format,
        'annotated_image': annotated,
        'chart_data': chart_data,
    }), 200


@ml_bp.route('/training-history', methods=['GET'])
@jwt_required()
def training_history():
    """Get training metrics history for visualization."""
    trainer = _get_trainer()
    history = trainer.get_training_history()

    if not history:
        return jsonify({'error': 'No training history available'}), 404

    visualizer = _get_visualizer()
    chart_data = visualizer.generate_training_chart_data(history)

    return jsonify({
        'history': history,
        'chart_data': chart_data,
    }), 200


@ml_bp.route('/forensic-analyze', methods=['POST'])
@jwt_required()
def forensic_analyze():
    """
    Stage 1: Run Sherloq-inspired forensic inspection and RGB-D depth verification.
    """
    user_id = get_jwt_identity()
    upload_dir = current_app.config['UPLOAD_FOLDER']
    os.makedirs(upload_dir, exist_ok=True)

    image_path = None
    depth_path = None
    filename = None

    # Handle image upload or filename parameter
    if 'image' in request.files:
        file = request.files['image']
        if file.filename != '':
            image_path, _ = _save_upload(file, upload_dir)
            filename = os.path.basename(image_path)

    if not image_path and request.is_json:
        data = request.get_json() or {}
        filename = data.get('filename')
        if filename:
            # Check upload folder or dataset folder
            upload_candidate = os.path.join(upload_dir, filename)
            sample_candidate = os.path.join(upload_dir, 'samples', filename)
            dataset_candidate = os.path.join(current_app.config['DATASET_FOLDER'], 'images', filename)
            if os.path.exists(upload_candidate):
                image_path = upload_candidate
            elif os.path.exists(sample_candidate):
                image_path = sample_candidate
            elif os.path.exists(dataset_candidate):
                image_path = dataset_candidate

    if 'depth_image' in request.files:
        depth_file = request.files['depth_image']
        if depth_file.filename != '':
            depth_path, _ = _save_upload(depth_file, upload_dir, prefix='depth_')

    # Handle auto-depth generation if requested and no depth file provided
    if not depth_path and request.form.get('auto_depth') == 'true' and image_path:
        try:
            from convert_depth_to_rgbd import create_rgbd_from_inputs
            import uuid as uuid_mod
            auto_rgbd_filename = f'auto_rgbd_{uuid_mod.uuid4().hex}.png'
            auto_rgbd_path = os.path.join(upload_dir, auto_rgbd_filename)
            result_path = create_rgbd_from_inputs(
                image_path, depth_path=None, auto_depth=True, output_path=auto_rgbd_path
            )
            if result_path and os.path.exists(result_path):
                # Use the auto-generated RGBD image instead
                image_path = result_path
                filename = auto_rgbd_filename
        except Exception as e:
            current_app.logger.warning(f'Auto-depth generation failed: {e}')

    if not image_path or not os.path.exists(image_path):
        return jsonify({'error': 'Valid image required for forensic analysis'}), 400

    # Run Sherloq Forensic Inspection & RGB-D Verification
    analyzer = ForensicAnalyzer(upload_folder=upload_dir)
    try:
        forensic_results = analyzer.analyze(image_path, depth_image_path=depth_path)
    except Exception as e:
        current_app.logger.error(f'Forensic analysis exception: {e}', exc_info=True)
        return jsonify({'error': f'Forensic analysis failed: {e}'}), 500

    if forensic_results.get('error'):
        return jsonify({'error': forensic_results['error']}), 500

    # Detect candidate objects for 6D pose targeting
    candidate_objects = []
    try:
        estimator = PoseEstimator(
            model_dir=current_app.config['MODEL_FOLDER'],
            dataset_dir=current_app.config['DATASET_FOLDER'],
        )
        candidate_objects = estimator.detect_candidate_objects(image_path, depth_path=depth_path)
    except Exception as e:
        current_app.logger.warning(f'Candidate object detection error: {e}')

    # Encode original image as base64 for browser preview (preserving format: JPG as JPEG, PNG as PNG, etc.)
    original_b64, image_mime, image_format = _get_image_preview_b64(image_path)

    log_activity(user_id, 'forensic_analysis', 'ml',
                 f'Ran Sherloq Forensics & RGB-D Inspection: {filename}',
                 metadata={
                     'filename': filename,
                     'is_rgbd': forensic_results.get('rgbd_gatekeeper', {}).get('is_rgbd'),
                     'status': forensic_results.get('rgbd_gatekeeper', {}).get('status'),
                 })

    return jsonify(_sanitize_for_json({
        'forensics': forensic_results,
        'candidate_objects': candidate_objects,
        'original_image': original_b64,
        'image_mime': image_mime,
        'image_format': image_format,
        'filename': filename or os.path.basename(image_path),
    })), 200


@ml_bp.route('/detect-objects', methods=['POST'])
@jwt_required()
def detect_objects_endpoint():
    """Returns detected candidate objects and allows resolving click coordinate to specific object."""
    data = request.get_json() or {}
    filename = data.get('filename')
    depth_filename = data.get('depth_filename')
    click_x_norm = data.get('click_x')
    click_y_norm = data.get('click_y')

    if not filename:
        return jsonify({'error': 'Filename required'}), 400

    upload_dir = current_app.config['UPLOAD_FOLDER']
    image_path = os.path.join(upload_dir, filename)
    if not os.path.exists(image_path):
        image_path = os.path.join(upload_dir, 'samples', filename)
    if not os.path.exists(image_path):
        image_path = os.path.join(current_app.config['DATASET_FOLDER'], 'images', filename)

    if not os.path.exists(image_path):
        return jsonify({'error': 'Image file not found'}), 404

    depth_path = None
    if depth_filename:
        cand1 = os.path.join(upload_dir, depth_filename)
        cand2 = os.path.join(upload_dir, 'samples', depth_filename)
        if os.path.exists(cand1):
            depth_path = cand1
        elif os.path.exists(cand2):
            depth_path = cand2

    estimator = PoseEstimator(
        model_dir=current_app.config['MODEL_FOLDER'],
        dataset_dir=current_app.config['DATASET_FOLDER'],
    )
    objects = estimator.detect_candidate_objects(image_path, depth_path=depth_path)

    resolved_target = None
    if click_x_norm is not None and click_y_norm is not None:
        from module_data.rgbd_utils import load_rgbd
        from module_ml.object_detector import ObjectDetector
        rgb, depth_m, _ = load_rgbd(image_path, depth_path=depth_path)
        resolved_target = ObjectDetector.resolve_target_from_click(
            rgb, depth_m, float(click_x_norm), float(click_y_norm), objects=objects
        )

    return jsonify(_sanitize_for_json({
        'objects': objects,
        'resolved_target': resolved_target,
    })), 200


@ml_bp.route('/estimate-pose', methods=['POST'])
@jwt_required()
def estimate_pose():
    """
    Stage 2: Run 6D Object Pose Estimation for targeted object (Track A EfficientPose, Track B PnP, or both).
    """
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    filename = data.get('filename')
    depth_filename = data.get('depth_filename')
    depth_stats = data.get('depth_stats')
    prediction_info = data.get('prediction_info')
    track = data.get('track', 'both')  # 'track_a', 'track_b', or 'both'
    camera_params = data.get('camera_params')
    target_point = data.get('target_point')
    bounding_box = data.get('bounding_box')
    selected_object_name = data.get('selected_object_name') or data.get('object_name')

    if not filename:
        return jsonify({'error': 'Filename required for 6D pose estimation'}), 400

    upload_dir = current_app.config['UPLOAD_FOLDER']
    image_path = os.path.join(upload_dir, filename)
    if not os.path.exists(image_path):
        image_path = os.path.join(upload_dir, 'samples', filename)
    if not os.path.exists(image_path):
        image_path = os.path.join(current_app.config['DATASET_FOLDER'], 'images', filename)

    if not os.path.exists(image_path):
        return jsonify({'error': 'Image file not found'}), 404

    # Resolve separate depth file if provided
    depth_path = None
    if depth_filename:
        cand1 = os.path.join(upload_dir, depth_filename)
        cand2 = os.path.join(upload_dir, 'samples', depth_filename)
        if os.path.exists(cand1):
            depth_path = cand1
        elif os.path.exists(cand2):
            depth_path = cand2

    # Run inference to get object class prediction if not provided
    if not prediction_info:
        engine = _get_engine()
        engine.load_model()
        pred_res = engine.predict(image_path, top_k=1)
        if pred_res.get('predictions'):
            prediction_info = pred_res['predictions'][0]

    estimator = PoseEstimator(
        model_dir=current_app.config['MODEL_FOLDER'],
        dataset_dir=current_app.config['DATASET_FOLDER'],
    )
    pose_result = estimator.estimate_pose(
        image_path,
        depth_path=depth_path,
        depth_stats=depth_stats,
        prediction_info=prediction_info,
        track=track,
        camera_params=camera_params,
        target_point=target_point,
        bounding_box=bounding_box,
        selected_object_name=selected_object_name
    )

    log_activity(user_id, 'pose_estimation', 'ml',
                 f'Ran 6D Pose Estimation ({track}) on RGB-D image: {filename} for object: {pose_result.get("object_name")}',
                 metadata={
                     'filename': filename,
                     'track': track,
                     'object_name': pose_result.get('object_name'),
                     'confidence': pose_result.get('confidence_pct'),
                 })

    return jsonify(_sanitize_for_json({
        'pose_result': pose_result,
        'filename': filename,
    })), 200


@ml_bp.route('/point-cloud-3d', methods=['POST'])
@jwt_required()
def get_point_cloud_3d():
    """
    Generates interactive 3D point cloud coordinates (XYZ + RGB) for WebGL rendering.
    """
    data = request.get_json() or {}
    filename = data.get('filename')
    depth_filename = data.get('depth_filename')
    max_points = data.get('max_points', 30000)
    camera_params = data.get('camera_params')

    if not filename:
        return jsonify({'error': 'Filename required for 3D point cloud generation'}), 400

    upload_dir = current_app.config['UPLOAD_FOLDER']
    image_path = os.path.join(upload_dir, filename)
    if not os.path.exists(image_path):
        image_path = os.path.join(upload_dir, 'samples', filename)
    if not os.path.exists(image_path):
        image_path = os.path.join(current_app.config['DATASET_FOLDER'], 'images', filename)

    if not os.path.exists(image_path):
        return jsonify({'error': 'Image file not found'}), 404

    depth_path = None
    if depth_filename:
        cand1 = os.path.join(upload_dir, depth_filename)
        cand2 = os.path.join(upload_dir, 'samples', depth_filename)
        if os.path.exists(cand1):
            depth_path = cand1
        elif os.path.exists(cand2):
            depth_path = cand2

    estimator = PoseEstimator(
        model_dir=current_app.config['MODEL_FOLDER'],
        dataset_dir=current_app.config['DATASET_FOLDER'],
    )
    cloud_payload = estimator.generate_point_cloud(
        image_path,
        depth_path=depth_path,
        max_points=max_points,
        camera_params=camera_params
    )

    return jsonify({
        'point_cloud': cloud_payload,
        'filename': filename,
    }), 200


@ml_bp.route('/sample-rgbd-images', methods=['GET'])
@jwt_required()
def get_sample_rgbd_images():
    """Returns list of pre-generated sample RGB-D images for testing."""
    samples_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'samples')
    os.makedirs(samples_dir, exist_ok=True)

    # Ensure samples exist
    if not os.path.exists(os.path.join(samples_dir, 'sample_rgbd_warehouse.png')):
        from create_sample_rgbd_images import create_sample_rgbd_images
        create_sample_rgbd_images(samples_dir)

    samples = []
    for fname in sorted(os.listdir(samples_dir)):
        if fname.endswith('.png') and not fname.endswith('_depth.png'):
            samples.append({
                'filename': fname,
                'name': fname.replace('sample_rgbd_', '').replace('.png', '').replace('_', ' ').title(),
                'type': '4-Channel RGB-D',
            })

    return jsonify({'samples': samples}), 200


