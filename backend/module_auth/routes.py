"""
Module Auth — API Routes
Handles user registration, login, 2FA, sessions, and activity history.
"""
import json
import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
import bcrypt
from extensions import db
from module_auth.models import User, Session, ActivityLog, TwoFactorSecret, _format_iso
from module_auth.two_factor import TwoFactorAuth
from module_auth.middleware import log_activity
from module_auth.persistence import backup_user, remove_user_from_backup

auth_bp = Blueprint('auth', __name__)


# ─── Registration ────────────────────────────────────────────

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user account."""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    
    email = data.get('email', '').strip().lower()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip()
    
    # Validation
    if not email or not username or not password:
        return jsonify({'error': 'Email, username, and password are required'}), 400
    
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 409
    
    # Hash password
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Create user with explicit UUID
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        email=email,
        username=username,
        password_hash=password_hash,
        full_name=full_name or username,
    )
    db.session.add(user)
    
    # Generate 2FA secret
    secret = TwoFactorAuth.generate_secret()
    two_factor = TwoFactorSecret(id=str(uuid.uuid4()), user_id=user_id, secret=secret)
    db.session.add(two_factor)
    
    db.session.commit()
    backup_user(user, two_factor)
    
    # Generate QR code for 2FA setup
    provisioning_uri = TwoFactorAuth.get_provisioning_uri(secret, email)
    qr_base64 = TwoFactorAuth.generate_qr_code_base64(provisioning_uri)
    
    # Log registration
    log_activity(user.id, 'register', 'auth', f'User {username} registered successfully')
    
    return jsonify({
        'message': 'Registration successful. Please set up 2FA.',
        'user': user.to_dict(),
        'two_factor': {
            'secret': secret,
            'qr_code': qr_base64,
            'provisioning_uri': provisioning_uri,
        }
    }), 201


# ─── 2FA Setup Verification ─────────────────────────────────

@auth_bp.route('/verify-2fa-setup', methods=['POST'])
def verify_2fa_setup():
    """Verify 2FA setup by confirming the first OTP code."""
    data = request.get_json()
    user_id = data.get('user_id')
    otp_code = data.get('otp_code', '').strip()
    
    if not user_id or not otp_code:
        return jsonify({'error': 'User ID and OTP code are required'}), 400
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    two_factor = TwoFactorSecret.query.filter_by(user_id=user_id).first()
    if not two_factor:
        return jsonify({'error': '2FA secret not found'}), 404
    
    if TwoFactorAuth.verify_otp(two_factor.secret, otp_code):
        two_factor.is_verified = True
        two_factor.verified_at = datetime.now(timezone.utc)
        user.is_2fa_enabled = True
        reactivated = not user.is_active
        if reactivated:
            user.is_active = True
        db.session.commit()
        backup_user(user, two_factor)

        if reactivated:
            log_activity(user.id, 'account_reactivated', 'auth', 'User reactivated their account during sign in')
        
        log_activity(user.id, '2fa_setup_complete', 'auth', '2FA successfully configured')
        
        return _complete_login(user)
    else:
        log_activity(user.id, '2fa_setup_failed', 'auth', 'Invalid OTP during 2FA setup', status='failure')
        return jsonify({'error': 'Invalid OTP code. Please try again.'}), 400


# ─── Login ───────────────────────────────────────────────────

@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login with email/username and password.
    If 2FA is enabled, returns a pending status requiring OTP verification.
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    
    login_id = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not login_id or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    
    # Find user by email or username
    user = User.query.filter(
        (User.email == login_id) | (User.username == login_id)
    ).first()
    
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return jsonify({'error': 'Invalid credentials'}), 401

    if not user.is_active:
        latest_status = ActivityLog.query.filter(
            ActivityLog.user_id == user.id,
            ActivityLog.action.in_([
                'account_deactivated',
                'account_deactivated_by_admin',
                'account_reactivated_by_admin',
            ]),
        ).order_by(ActivityLog.created_at.desc()).first()
        if latest_status and latest_status.action == 'account_deactivated_by_admin':
            return jsonify({'error': 'Your account is deactivated by an admin. You can sign in after an admin reactivates it.'}), 403

    reactivation_required = not user.is_active
    
    # Check if 2FA is enabled
    if user.is_2fa_enabled:
        log_activity(
            user.id,
            'login_password_verified',
            'auth',
            'Password verified, awaiting 2FA and account reactivation' if reactivation_required else 'Password verified, awaiting 2FA',
        )
        two_factor = TwoFactorSecret.query.filter_by(user_id=user.id).first()

        # If TOTP secret exists but was never verified → return QR for first-time setup
        if two_factor and not two_factor.is_verified:
            provisioning_uri = TwoFactorAuth.get_provisioning_uri(two_factor.secret, user.email)
            qr_base64 = TwoFactorAuth.generate_qr_code_base64(provisioning_uri)
            return jsonify({
                'message': '2FA setup required — scan the QR code with your authenticator app',
                'requires_2fa': True,
                'needs_2fa_setup': True,  # Frontend uses this to show QR setup screen
                'reactivation_required': reactivation_required,
                'user_id': user.id,
                'two_factor': {
                    'secret': two_factor.secret,
                    'qr_code': qr_base64,
                    'provisioning_uri': provisioning_uri,
                },
            }), 200

        # TOTP already verified — just ask for the 6-digit code
        return jsonify({
            'message': '2FA verification required',
            'requires_2fa': True,
            'user_id': user.id,
            'reactivation_required': reactivation_required,
        }), 200
    else:
        # No 2FA — issue tokens directly
        if reactivation_required:
            user.is_active = True
            db.session.commit()
            backup_user(user)
            log_activity(user.id, 'account_reactivated', 'auth', 'User reactivated their account by signing in')
        return _complete_login(user)


@auth_bp.route('/verify-2fa-login', methods=['POST'])
def verify_2fa_login():
    """Verify 2FA code during login and issue JWT tokens."""
    data = request.get_json()
    user_id = data.get('user_id')
    otp_code = data.get('otp_code', '').strip()
    
    if not user_id or not otp_code:
        return jsonify({'error': 'User ID and OTP code are required'}), 400
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    two_factor = TwoFactorSecret.query.filter_by(user_id=user_id).first()
    if not two_factor:
        return jsonify({'error': '2FA not configured'}), 400
    
    if TwoFactorAuth.verify_otp(two_factor.secret, otp_code):
        if not user.is_active:
            user.is_active = True
            db.session.commit()
            backup_user(user)
            log_activity(user.id, 'account_reactivated', 'auth', 'User reactivated their account by signing in')
        return _complete_login(user)
    else:
        log_activity(user.id, '2fa_login_failed', 'auth', 'Invalid OTP during login', status='failure')
        return jsonify({'error': 'Invalid OTP code'}), 401


def _complete_login(user):
    """Complete the login process by issuing JWT tokens and logging the session."""
    jti = str(uuid.uuid4())
    
    access_token = create_access_token(
        identity=user.id,
        additional_claims={'jti': jti, 'role': user.role, 'username': user.username}
    )
    refresh_token = create_refresh_token(identity=user.id)
    
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    # Create session record
    session = Session(
        user_id=user.id,
        token_jti=jti,
        ip_address=client_ip,
        user_agent=request.headers.get('User-Agent', '')[:500],
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.session.add(session)
    
    # Update last login
    now_utc = datetime.now(timezone.utc)
    user.last_login_at = now_utc
    db.session.commit()
    
    log_activity(user.id, 'login_success', 'auth', f'Login from {client_ip}')
    
    return jsonify({
        'message': 'Login successful',
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': user.to_dict(),
    }), 200


# ─── Token Refresh ───────────────────────────────────────────

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh an access token."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user or not user.is_active:
        return jsonify({'error': 'User not found or account deactivated'}), 401
    
    jti = str(uuid.uuid4())
    access_token = create_access_token(
        identity=user_id,
        additional_claims={'jti': jti, 'role': user.role, 'username': user.username}
    )

    # Ensure this refreshed token is recorded as an active session
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    session = Session(
        user_id=user.id,
        token_jti=jti,
        ip_address=client_ip,
        user_agent=request.headers.get('User-Agent', '')[:500],
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.session.add(session)
    db.session.commit()
    
    return jsonify({'access_token': access_token, 'user': user.to_dict()}), 200


# ─── Logout ──────────────────────────────────────────────────

@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout — revoke current session."""
    user_id = get_jwt_identity()
    jwt_data = get_jwt()
    jti = jwt_data.get('jti', '')
    
    session = Session.query.filter_by(token_jti=jti, is_active=True).first()
    if session:
        session.is_active = False
        session.revoked_at = datetime.now(timezone.utc)
        db.session.commit()
    
    log_activity(user_id, 'logout', 'auth', 'User logged out')
    
    return jsonify({'message': 'Logged out successfully'}), 200


# ─── Profile ─────────────────────────────────────────────────

@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """Get current user profile."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({'user': user.to_dict()}), 200


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Update user profile."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    data = request.get_json()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if 'full_name' in data:
        user.full_name = data['full_name']
    
    db.session.commit()
    log_activity(user_id, 'profile_update', 'auth', 'Profile updated')
    
    return jsonify({'user': user.to_dict()}), 200


@auth_bp.route('/profile/deactivate', methods=['POST'])
@jwt_required()
def deactivate_own_account():
    """Deactivate the signed-in user's account and revoke every session."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404
    if user.role == 'admin' or user.email == 'indianthakran@gmail.com':
        return jsonify({'error': 'Admin accounts cannot be deactivated from Profile'}), 403

    user.is_active = False
    now = datetime.now(timezone.utc)
    sessions = Session.query.filter_by(user_id=user_id, is_active=True).all()
    for session in sessions:
        session.is_active = False
        session.revoked_at = now

    db.session.commit()
    backup_user(user)
    log_activity(user_id, 'account_deactivated', 'auth', 'User deactivated their account')
    return jsonify({'message': 'Account deactivated. Sign in with your password and authenticator code to reactivate it.'}), 200


# ─── Activity History ─────────────────────────────────────────

@auth_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    """Get complete activity history for the current user."""
    user_id = get_jwt_identity()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    category = request.args.get('category', None)
    
    query = ActivityLog.query.filter_by(user_id=user_id)
    
    if category:
        query = query.filter_by(category=category)
    
    query = query.order_by(ActivityLog.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'history': [log.to_dict() for log in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page,
    }), 200


# ─── Sessions Management ─────────────────────────────────────

def _clean_expired_sessions(user_id=None):
    """Expire any sessions whose expires_at is past current time."""
    try:
        now = datetime.now(timezone.utc)
        q = Session.query.filter(Session.is_active == True, Session.expires_at != None, Session.expires_at < now)
        if user_id:
            q = q.filter(Session.user_id == user_id)
        expired = q.all()
        if expired:
            for s in expired:
                s.is_active = False
                s.revoked_at = s.expires_at
            db.session.commit()
    except Exception:
        pass


@auth_bp.route('/sessions', methods=['GET'])
@jwt_required()
def get_sessions():
    """Get all active sessions for the current user."""
    user_id = get_jwt_identity()
    _clean_expired_sessions(user_id)
    
    sessions = Session.query.filter_by(
        user_id=user_id, is_active=True
    ).order_by(Session.created_at.desc()).all()
    
    return jsonify({
        'sessions': [s.to_dict() for s in sessions],
        'total': len(sessions),
    }), 200


@auth_bp.route('/sessions/<session_id>/revoke', methods=['POST'])
@jwt_required()
def revoke_session(session_id):
    """Revoke a specific session (by the owner or by admin)."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    is_admin = user and user.role == 'admin'

    if is_admin:
        session = Session.query.filter_by(id=session_id).first()
    else:
        session = Session.query.filter_by(id=session_id, user_id=user_id).first()

    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    session.is_active = False
    session.revoked_at = datetime.now(timezone.utc)
    db.session.commit()
    
    log_activity(user_id, 'session_revoked', 'auth', f'Session {session_id} revoked')
    return jsonify({'message': 'Session revoked successfully'}), 200


@auth_bp.route('/admin/sessions/<session_id>/revoke', methods=['POST'])
@auth_bp.route('/admin/sessions/<session_id>', methods=['DELETE'])
@jwt_required()
def admin_revoke_session(session_id):
    """Admin: revoke a specific user session."""
    user_id = get_jwt_identity()
    current = User.query.get(user_id)
    if not current or current.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    session = Session.query.get(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    session.is_active = False
    session.revoked_at = datetime.now(timezone.utc)
    db.session.commit()
    log_activity(user_id, 'admin_revoke_session', 'admin', f'Revoked session {session_id} for user {session.user_id}')
    return jsonify({'message': 'Session revoked successfully'}), 200


# ─── Dashboard Stats ──────────────────────────────────────────

@auth_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_user_stats():
    """Get dashboard statistics for the current user."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404

    _clean_expired_sessions(user_id)
    
    # Get activity counts across all analysis actions
    analysis_actions = ['image_analysis', 'forensic_analysis', 'pose_estimation']
    total_logins = ActivityLog.query.filter_by(user_id=user_id, action='login_success').count()
    act_analyses = ActivityLog.query.filter(
        ActivityLog.user_id == user_id,
        ActivityLog.action.in_(analysis_actions)
    ).count()
    act_uploads = ActivityLog.query.filter(
        ActivityLog.user_id == user_id,
        (ActivityLog.action == 'image_upload') | (ActivityLog.action == 'forensic_analysis')
    ).count()

    total_analyses = max(act_analyses, user.total_analyses or 0)
    total_uploads = max(act_uploads, user.total_uploads or 0)
    
    # Recent activity (last 8)
    recent = ActivityLog.query.filter_by(user_id=user_id)\
        .order_by(ActivityLog.created_at.desc()).limit(8).all()
    
    # Active sessions count
    active_sessions = Session.query.filter_by(user_id=user_id, is_active=True).count()
    if active_sessions == 0:
        active_sessions = 1  # User is currently making this authenticated request

    # Recent analyses deduplicated by filename (up to 4 unique images)
    recent_analyses_logs = ActivityLog.query.filter(
        ActivityLog.user_id == user_id,
        ActivityLog.action.in_(analysis_actions)
    ).order_by(ActivityLog.created_at.desc()).limit(20).all()

    recent_analyses = []
    seen_filenames = set()
    for log in recent_analyses_logs:
        meta = {}
        if log.metadata_json:
            try:
                meta = json.loads(log.metadata_json)
            except Exception:
                meta = {}
        filename = meta.get('filename')
        dedup_key = filename or log.id
        if dedup_key in seen_filenames:
            continue
        seen_filenames.add(dedup_key)
        recent_analyses.append({
            'id': log.id,
            'action': log.action,
            'description': log.description,
            'filename': filename,
            'original_filename': meta.get('original_filename') or filename or 'Analyzed Image',
            'created_at': _format_iso(log.created_at),
            'metadata': meta,
        })
        if len(recent_analyses) >= 4:
            break
    
    return jsonify({
        'stats': {
            'total_logins': total_logins,
            'total_analyses': total_analyses,
            'total_uploads': total_uploads,
            'active_sessions': active_sessions,
            'member_since': _format_iso(user.created_at),
        },
        'recent_activity': [log.to_dict() for log in recent],
        'recent_analyses': recent_analyses,
    }), 200


# ─── Admin: User Management ──────────────────────────────────

def _require_admin():
    """Return the current user if admin, else None."""
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role != 'admin':
        return None
    return user


@auth_bp.route('/admin/users', methods=['GET'])
@jwt_required()
def admin_list_users():
    """Admin: list all users with their sessions and activity history."""
    user_id = get_jwt_identity()
    current = User.query.get(user_id)
    if not current or current.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    _clean_expired_sessions()
    users = User.query.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        sessions = Session.query.filter_by(user_id=u.id).order_by(Session.created_at.desc()).all()
        activity = ActivityLog.query.filter_by(user_id=u.id).order_by(ActivityLog.created_at.desc()).limit(50).all()
        login_history = ActivityLog.query.filter_by(user_id=u.id, action='login_success').order_by(ActivityLog.created_at.desc()).all()
        active_sessions = sum(1 for s in sessions if s.is_active)
        
        last_login_ip = None
        if login_history:
            last_login_ip = login_history[0].ip_address
        elif sessions:
            last_login_ip = sessions[0].ip_address

        last_login_time = u.last_login_at
        if not last_login_time:
            if login_history:
                last_login_time = login_history[0].created_at
            elif sessions:
                last_login_time = sessions[0].created_at

        row = u.to_dict()
        row['last_login_at'] = _format_iso(last_login_time)
        row['sessions'] = [s.to_dict() for s in sessions]
        row['activity'] = [a.to_dict() for a in activity]
        row['login_history'] = [a.to_dict() for a in login_history]
        row['active_sessions'] = active_sessions
        row['last_login_ip'] = last_login_ip or '—'
        result.append(row)

    return jsonify({'users': result, 'total': len(result)}), 200


@auth_bp.route('/admin/users/<user_id>', methods=['DELETE'])
@jwt_required()
def admin_delete_user(user_id):
    """Admin: permanently delete a user account and invalidate their tokens."""
    current_id = get_jwt_identity()
    current = User.query.get(current_id)
    if not current or current.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404
    if target.role == 'admin' or target.email == 'indianthakran@gmail.com':
        return jsonify({'error': 'Cannot delete admin account'}), 403

    target_email = target.email  # capture before session expunges object
    # Deactivate user and invalidate all sessions first
    target.is_active = False
    sessions = Session.query.filter_by(user_id=user_id).all()
    now = datetime.now(timezone.utc)
    for s in sessions:
        s.is_active = False
        s.revoked_at = now
    db.session.flush()  # write flags before cascade-deleting

    # Delete child records explicitly to avoid FK constraint errors
    from module_auth.models import TwoFactorSecret, ActivityLog as _AL
    TwoFactorSecret.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    _AL.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    Session.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    db.session.delete(target)
    db.session.commit()

    remove_user_from_backup(user_id)
    log_activity(current_id, 'admin_delete_user', 'admin', f'Deleted user {target_email}')
    return jsonify({'message': f'User {target_email} deleted and all sessions revoked.'}), 200


@auth_bp.route('/admin/users/<user_id>/status', methods=['PATCH'])
@jwt_required()
def admin_update_user_status(user_id):
    """Admin: activate or deactivate a user account."""
    current_id = get_jwt_identity()
    current = User.query.get(current_id)
    if not current or current.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    data = request.get_json(silent=True) or {}
    is_active = data.get('is_active')
    if not isinstance(is_active, bool):
        return jsonify({'error': 'is_active must be a boolean'}), 400

    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404
    if target.role == 'admin' or target.email == 'indianthakran@gmail.com':
        return jsonify({'error': 'Admin accounts cannot be changed here'}), 403

    target.is_active = is_active
    if not is_active:
        now = datetime.now(timezone.utc)
        sessions = Session.query.filter_by(user_id=user_id, is_active=True).all()
        for session in sessions:
            session.is_active = False
            session.revoked_at = now

    db.session.commit()
    backup_user(target)
    action = 'admin_activate_user' if is_active else 'admin_deactivate_user'
    state = 'activated' if is_active else 'deactivated'
    log_activity(current_id, action, 'admin', f'Admin {state} account {target.email}')
    if is_active:
        log_activity(user_id, 'account_reactivated_by_admin', 'account', 'An admin reactivated this account')
        message = 'Account reactivated successfully. The user can sign in again.'
    else:
        log_activity(user_id, 'account_deactivated_by_admin', 'account', 'An admin deactivated this account')
        message = 'Account deactivated. The user cannot sign in until an admin reactivates it.'
    return jsonify({'message': message, 'user': target.to_dict()}), 200


@auth_bp.route('/admin/users/<user_id>/revoke-sessions', methods=['POST'])
@jwt_required()
def admin_revoke_user_sessions(user_id):
    """Admin: revoke all active sessions for a user immediately."""
    current_id = get_jwt_identity()
    current = User.query.get(current_id)
    if not current or current.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404

    active = Session.query.filter_by(user_id=user_id, is_active=True).all()
    now = datetime.now(timezone.utc)
    for s in active:
        s.is_active = False
        s.revoked_at = now
    db.session.commit()
    log_activity(current_id, 'admin_revoke_sessions', 'admin', f'Revoked {len(active)} sessions for {target.email}')
    return jsonify({'message': f'Revoked {len(active)} active session(s). User logged out.', 'revoked': len(active)}), 200

