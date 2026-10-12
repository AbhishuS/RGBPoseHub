import os
from datetime import timedelta

class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'rgb-pose-hub-secret-key-2024-dev')
    _default_db = os.path.abspath(os.path.join(os.path.dirname(__file__), 'instance', 'rgbposehub.db')).replace('\\', '/')
    _db_url = os.environ.get('DATABASE_URL') or f'sqlite:///{_default_db}'
    # Render (Heroku-style) issues postgres:// but SQLAlchemy 1.4+ needs postgresql://
    if _db_url.startswith('postgres://'):
        _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
    SQLALCHEMY_DATABASE_URI = _db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-rgb-pose-hub-2024')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)  # 7 days persistent user session
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)  # 30 days
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'uploads')
    DATASET_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dataset')
    MODEL_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32MB max upload
    CLUBS_DATASET_URL = 'https://api.github.com/repos/clubs/clubs.github.io/contents/img/objects'
    CLUBS_RAW_BASE_URL = 'https://raw.githubusercontent.com/clubs/clubs.github.io/master/img/objects'

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
