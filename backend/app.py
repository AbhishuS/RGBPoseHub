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
            if not user or not user.is_active:
                return True
            jti = jwt_payload.get('jti')
            if jti:
                session = Session.query.filter_by(token_jti=jti).first()
                if session and not session.is_active:
                    return True
            active_sessions = Session.query.filter_by(user_id=user_id, is_active=True).count()
            if active_sessions == 0:
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

    # Create database tables and seed default accounts
    with app.app_context():
        from module_auth.models import User, Session, ActivityLog, TwoFactorSecret
        db.create_all()
        import bcrypt

        # Remove legacy demo accounts if present
        legacy_users = User.query.filter(User.email.in_(['admin@rgbposehub.org', 'lead_researcher@rgbposehub.org'])).all()
        for u in legacy_users:
            db.session.delete(u)

        # Ensure admin account indianthakran@gmail.com exists with password Thakran@2005
        pwd_hash = bcrypt.hashpw(b'Thakran@2005', bcrypt.gensalt()).decode('utf-8')
        admin_user = User.query.filter_by(email='indianthakran@gmail.com').first()
        if not admin_user:
            admin_user = User(
                id='d8cad421-8466-44ca-9f1b-0559a3cf428c',
                email='indianthakran@gmail.com',
                username='indianthakran',
                password_hash=pwd_hash,
                full_name='Hradayastha Thakran',
                role='admin',
                is_active=True,
                is_2fa_enabled=True  # Admin requires TOTP like all users
            )
            db.session.add(admin_user)
        else:
            # Always reset password and role on startup
            admin_user.password_hash = pwd_hash
            admin_user.role = 'admin'
            admin_user.is_active = True
            admin_user.is_2fa_enabled = True  # Ensure TOTP is always required

        # Seed a TOTP secret for admin if none exists (is_verified=False → triggers QR setup screen on first login)
        two_factor = TwoFactorSecret.query.filter_by(user_id=admin_user.id).first()
        if not two_factor:
            from module_auth.two_factor import TwoFactorAuth as _TFA
            admin_secret = _TFA.generate_secret()
            two_factor = TwoFactorSecret(
                id=str(__import__('uuid').uuid4()),
                user_id=admin_user.id,
                secret=admin_secret,
                is_verified=False  # Will show QR on first login for setup
            )
            db.session.add(two_factor)
        # If already verified, leave it alone — admin has already scanned the QR

        db.session.commit()

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5001)
