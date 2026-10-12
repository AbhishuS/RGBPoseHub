"""
RGB-Pose Hub — Flask Application Factory
Main entry point for the backend server.
"""
import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from extensions import db, jwt


def create_app(config_name=None):
    """Create and configure the Flask application."""
    app = Flask(__name__, instance_relative_config=True)

    # Load configuration
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    
    from config import config as config_map
    app.config.from_object(config_map.get(config_name, config_map['default']))

    # Ensure required directories exist
    for folder in [app.config.get('UPLOAD_FOLDER', 'uploads'),
                   app.config.get('DATASET_FOLDER', 'dataset'),
                   app.config.get('MODEL_FOLDER', 'models')]:
        os.makedirs(folder, exist_ok=True)
    
    os.makedirs(app.instance_path, exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        try:
            from module_auth.models import User, Session
            user_id = jwt_payload.get('sub')
            if not user_id:
                return True
            user = User.query.get(user_id)
            # If user is not in DB (e.g. ephemeral SQLite wiped on Render redeploy),
            # do NOT revoke the token — let the user continue their session.
            # We only block if the user explicitly exists but is deactivated.
            if user is not None and not user.is_active:
                return True
            jti = jwt_payload.get('jti')
            if jti:
                session = Session.query.filter_by(token_jti=jti).first()
                if session and not session.is_active:
                    return True
            # Only block if all sessions are explicitly deactivated (admin revoked)
            if user is not None:
                user_sessions = Session.query.filter_by(user_id=user_id).all()
                if user_sessions and all(not s.is_active for s in user_sessions):
                    return True
            return False
        except Exception:
            return False

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return {'error': 'Session has been revoked or account deactivated. Please log in again.'}, 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {'error': 'Token has expired. Please log in again.'}, 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return {'error': 'Invalid authorization token.'}, 401

    @jwt.unauthorized_loader
    def unauthorized_callback(error_string):
        return {'error': 'Authentication required.'}, 401

    CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5001", "http://127.0.0.1:5001", "*"])

    # Register blueprints
    from module_auth.routes import auth_bp
    from module_data.routes import data_bp
    from module_ml.routes import ml_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(data_bp, url_prefix='/api/data')
    app.register_blueprint(ml_bp, url_prefix='/api/ml')

    # Health check endpoint
    @app.route('/api/health')
    def health_check():
        return {'status': 'ok', 'service': 'RGB-Pose Hub API', 'version': '2.0.0'}

    # Cap PyTorch threads for 512MB RAM environment
    try:
        import torch
        torch.set_num_threads(2)
    except Exception:
        pass

    # Create database tables and seed/restore accounts
    with app.app_context():
        from module_auth.models import User, Session, ActivityLog, TwoFactorSecret
        from module_auth.persistence import sync_users_on_startup
        db.create_all()

        # Remove legacy demo accounts if present
        legacy_users = User.query.filter(User.email.in_(['admin@rgbposehub.org', 'lead_researcher@rgbposehub.org'])).all()
        for u in legacy_users:
            db.session.delete(u)
        db.session.commit()

        # Ensure admin indianthakran@gmail.com with Thakran@2005 & restore persistent accounts
        sync_users_on_startup(db, User, TwoFactorSecret)

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5001)
