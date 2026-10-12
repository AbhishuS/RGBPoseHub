"""
Module Auth — Persistent User Accounts Store
Safeguards user accounts and 2FA states across server restarts and redeployments,
even when running on ephemeral storage.
"""
import os
import json
import logging
from datetime import datetime, timezone
import bcrypt

logger = logging.getLogger('rgbposehub.persistence')

# Store path relative to backend directory
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'instance')
BACKUP_FILE = os.path.join(BACKUP_DIR, 'users_backup.json')


def _ensure_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def load_backup_users():
    """Load backup users from JSON file."""
    _ensure_dir()
    if not os.path.exists(BACKUP_FILE):
        return {}
    try:
        with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not read users backup file: {e}")
        return {}


def save_backup_users(data):
    """Save backup users to JSON file atomically."""
    _ensure_dir()
    temp_file = f"{BACKUP_FILE}.tmp"
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        if os.path.exists(BACKUP_FILE):
            os.replace(temp_file, BACKUP_FILE)
        else:
            os.rename(temp_file, BACKUP_FILE)
    except Exception as e:
        logger.error(f"Could not write users backup file: {e}")
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass


def backup_user(user, two_factor_secret=None):
    """Add or update a single user in the backup store."""
    try:
        data = load_backup_users()
        user_data = {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'password_hash': user.password_hash,
            'full_name': user.full_name,
            'role': user.role,
            'is_active': user.is_active,
            'is_2fa_enabled': user.is_2fa_enabled,
            'total_analyses': user.total_analyses or 0,
            'total_uploads': user.total_uploads or 0,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'last_login_at': user.last_login_at.isoformat() if user.last_login_at else None,
        }
        if two_factor_secret:
            user_data['two_factor'] = {
                'id': two_factor_secret.id,
                'secret': two_factor_secret.secret,
                'is_verified': two_factor_secret.is_verified,
                'verified_at': two_factor_secret.verified_at.isoformat() if two_factor_secret.verified_at else None,
            }
        elif user.email in data and 'two_factor' in data[user.email]:
            user_data['two_factor'] = data[user.email]['two_factor']

        data[user.email] = user_data
        save_backup_users(data)
    except Exception as e:
        logger.error(f"Failed to backup user {user.email}: {e}")


def remove_user_from_backup(user_id_or_email):
    """Remove a user from the backup store."""
    try:
        data = load_backup_users()
        target_email = None
        for email, u in data.items():
            if email == user_id_or_email or u.get('id') == user_id_or_email:
                target_email = email
                break
        if target_email and target_email in data:
            del data[target_email]
            save_backup_users(data)
    except Exception as e:
        logger.error(f"Failed to remove user from backup: {e}")


def sync_users_on_startup(db, User, TwoFactorSecret):
    """
    Called in app.py during startup.
    Ensures admin account exists with requested password,
    restores any previously created user accounts from backup,
    and preserves admin's 2FA verification state.
    """
    backup_data = load_backup_users()
    admin_email = 'indianthakran@gmail.com'
    admin_pwd_hash = bcrypt.hashpw(b'Thakran@2005', bcrypt.gensalt()).decode('utf-8')
    admin_secret = os.environ.get('ADMIN_TOTP_SECRET', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PX')

    # 1. Ensure admin user
    admin_user = User.query.filter_by(email=admin_email).first()
    admin_backup = backup_data.get(admin_email, {})

    if not admin_user:
        admin_id = admin_backup.get('id', 'd8cad421-8466-44ca-9f1b-0559a3cf428c')
        admin_user = User(
            id=admin_id,
            email=admin_email,
            username='indianthakran',
            password_hash=admin_pwd_hash,
            full_name='Hradayastha Thakran',
            role='admin',
            is_active=True,
            is_2fa_enabled=True,
            total_analyses=admin_backup.get('total_analyses', 0),
            total_uploads=admin_backup.get('total_uploads', 0),
        )
        db.session.add(admin_user)
        db.session.flush()
    else:
        # Keep password and role updated
        admin_user.password_hash = admin_pwd_hash
        admin_user.role = 'admin'
        admin_user.is_active = True
        admin_user.is_2fa_enabled = True

    # Check 2FA secret for admin
    two_factor = TwoFactorSecret.query.filter_by(user_id=admin_user.id).first()
    # Check if admin previously verified 2FA
    was_verified = False
    if admin_backup.get('two_factor', {}).get('is_verified'):
        was_verified = True

    if not two_factor:
        two_factor = TwoFactorSecret(
            id=str(__import__('uuid').uuid4()),
            user_id=admin_user.id,
            secret=admin_secret,
            is_verified=was_verified  # True if previously set up, False on first time
        )
        db.session.add(two_factor)
    else:
        if was_verified:
            two_factor.is_verified = True

    db.session.flush()
    backup_user(admin_user, two_factor)

    # 2. Restore any other users from backup store
    for email, u_data in backup_data.items():
        if email == admin_email:
            continue
        existing = User.query.filter_by(email=email).first()
        if not existing:
            created_dt = None
            if u_data.get('created_at'):
                try:
                    created_dt = datetime.fromisoformat(u_data['created_at'])
                except Exception:
                    pass
            new_u = User(
                id=u_data.get('id', str(__import__('uuid').uuid4())),
                email=email,
                username=u_data.get('username', email.split('@')[0]),
                password_hash=u_data.get('password_hash'),
                full_name=u_data.get('full_name'),
                role=u_data.get('role', 'researcher'),
                is_active=u_data.get('is_active', True),
                is_2fa_enabled=u_data.get('is_2fa_enabled', False),
                total_analyses=u_data.get('total_analyses', 0),
                total_uploads=u_data.get('total_uploads', 0),
            )
            if created_dt:
                new_u.created_at = created_dt
            db.session.add(new_u)
            db.session.flush()

            tf_data = u_data.get('two_factor')
            if tf_data:
                tf_obj = TwoFactorSecret(
                    id=tf_data.get('id', str(__import__('uuid').uuid4())),
                    user_id=new_u.id,
                    secret=tf_data.get('secret'),
                    is_verified=tf_data.get('is_verified', False),
                )
                db.session.add(tf_obj)

    db.session.commit()
    logger.info("Startup user synchronization complete.")
