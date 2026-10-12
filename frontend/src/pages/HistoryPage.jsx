import { useCallback, useEffect, useState } from 'react';
import { authAPI } from '../services/api';

const fmt = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

const fmtRelative = (v) => {
  if (!v) return 'Never';
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function StatusDot({ active }) {
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: active ? '#10b981' : '#94a3b8',
      boxShadow: active ? '0 0 0 3px rgba(16,185,129,0.2)' : 'none',
      marginRight: '0.4rem', flexShrink: 0,
    }} />
  );
}

export default function HistoryPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.getAdminUsers();
      setUsers(res.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load users. Make sure you are signed in as Admin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleRevoke = async (user) => {
    if (!window.confirm(`Revoke all active sessions for ${user.full_name || user.username}? They will be logged out immediately.`)) return;
    setActionLoading(`revoke-${user.id}`);
    try {
      const res = await authAPI.revokeAdminUserSessions(user.id);
      showSuccess(res.data.message);
      setUsers((prev) => prev.map((u) =>
        u.id === user.id ? { ...u, active_sessions: 0, sessions: (u.sessions || []).map((s) => ({ ...s, is_active: false })) } : u
      ));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not revoke sessions.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeSingleSession = async (user, sessionId) => {
    if (!window.confirm(`Revoke this session for ${user.full_name || user.username}?`)) return;
    setActionLoading(`revoke-sess-${sessionId}`);
    try {
      const res = await authAPI.revokeAdminSession(sessionId);
      showSuccess(res.data?.message || 'Session revoked successfully');
      setUsers((prev) => prev.map((u) => {
        if (u.id !== user.id) return u;
        const updatedSessions = (u.sessions || []).map((s) => s.id === sessionId ? { ...s, is_active: false } : s);
        const newActiveCount = updatedSessions.filter((s) => s.is_active).length;
        return { ...u, sessions: updatedSessions, active_sessions: newActiveCount };
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not revoke session.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Permanently delete account for ${user.full_name || user.username} (${user.email})? This cannot be undone.`)) return;
    setActionLoading(`delete-${user.id}`);
    try {
      await authAPI.deleteAdminUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (expanded === user.id) setExpanded(null);
      showSuccess(`User ${user.email} deleted.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete user.');
    } finally {
      setActionLoading(null);
    }
  };

  const totalActive = users.reduce((s, u) => s + (u.active_sessions || 0), 0);
  const totalLogins = users.reduce((s, u) => s + (u.login_history?.length || 0), 0);
  const nonAdmins = users.filter((u) => u.role !== 'admin');

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>User Management</h2>
        <p>Monitor accounts, login history, active sessions, and revoke access across RGB PoseHub.</p>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>&#9888; {error}</div>}
        {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>&#10003; {successMsg}</div>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.875rem', marginBottom: '1.75rem' }}>
            {[
              { label: 'Total Accounts', value: users.length, emoji: '\uD83D\uDC65', color: '#1767d2', bg: 'rgba(23,103,210,0.08)', border: 'rgba(23,103,210,0.18)' },
              { label: 'Active Sessions', value: totalActive, emoji: '\uD83D\uDFE2', color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)' },
              { label: 'Total Logins', value: totalLogins, emoji: '\uD83D\uDD11', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.18)' },
              { label: 'Non-Admin Users', value: nonAdmins.length, emoji: '\uD83D\uDC64', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.18)' },
            ].map(({ label, value, emoji, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 16, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>{emoji}</span>
                <div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="loading-overlay"><div className="spinner" /><p>Loading user accounts...</p></div>
        ) : users.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>&#128101;</div>
            <p>No user accounts found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {users.map((user) => {
              const isExpanded = expanded === user.id;
              const isAdmin = user.role === 'admin';
              const hasActive = (user.active_sessions || 0) > 0;

              return (
                <div key={user.id} style={{
                  background: 'rgba(255,255,255,0.82)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: `1.5px solid ${isAdmin ? 'rgba(23,103,210,0.28)' : 'rgba(220,236,242,0.9)'}`,
                  borderRadius: 16,
                  boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', flexWrap: 'wrap' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: isAdmin ? 'linear-gradient(135deg,#087fae,#315fe4)' : 'linear-gradient(135deg,#7c3aed,#4f46e5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 800, fontSize: '1rem',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                    }}>
                      {(user.full_name || user.username || 'U').slice(0, 2).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{user.full_name || user.username}</strong>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.06em', background: isAdmin ? 'rgba(23,103,210,0.12)' : 'rgba(124,58,237,0.10)', color: isAdmin ? '#1767d2' : '#7c3aed' }}>{user.role}</span>
                        {user.is_2fa_enabled && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>2FA ON</span>}
                        {!user.is_active && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>DEACTIVATED</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', fontWeight: 600, color: hasActive ? '#10b981' : 'var(--text-muted)' }}>
                        <StatusDot active={hasActive} />
                        {user.active_sessions || 0} active session{user.active_sessions !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Last: {fmtRelative(user.last_login_at)}</div>
                    </div>

                    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 52, padding: '0.25rem 0.5rem', background: 'rgba(217,119,6,0.08)', borderRadius: 10 }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#d97706', lineHeight: 1 }}>{user.login_history?.length || 0}</div>
                      <div style={{ fontSize: '0.62rem', color: '#d97706', fontWeight: 700, textTransform: 'uppercase' }}>logins</div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setExpanded(isExpanded ? null : user.id)} style={{ borderRadius: 8 }}>
                        {isExpanded ? '&#9650; Hide' : '&#9660; Details'}
                      </button>
                      {!isAdmin && (
                        <>
                          <button
                            className="btn btn-sm"
                            disabled={!hasActive || actionLoading === `revoke-${user.id}`}
                            onClick={() => handleRevoke(user)}
                            style={{ background: hasActive ? 'rgba(239,68,68,0.1)' : 'var(--bg-secondary)', color: hasActive ? '#ef4444' : 'var(--text-muted)', border: `1px solid ${hasActive ? 'rgba(239,68,68,0.25)' : 'var(--border-color)'}`, borderRadius: 8 }}
                            title="Revoke all active sessions"
                          >
                            {actionLoading === `revoke-${user.id}` ? 'Revoking...' : '\uD83D\uDD12 Revoke Sessions'}
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={actionLoading === `delete-${user.id}`}
                            onClick={() => handleDelete(user)}
                            style={{ borderRadius: 8 }}
                            title="Permanently delete this user"
                          >
                            {actionLoading === `delete-${user.id}` ? 'Deleting...' : '\uD83D\uDDD1 Remove User'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(241,251,255,0.7)', padding: '1.25rem 1.5rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem 1.5rem', marginBottom: '1.25rem' }}>
                        {[
                          ['Joined', fmt(user.created_at)],
                          ['Last Login', fmt(user.last_login_at)],
                          ['Last IP', user.last_login_ip || '\u2014'],
                          ['2FA Status', user.is_2fa_enabled ? 'Enabled' : 'Not enabled'],
                          ['Account', user.is_active ? 'Active' : 'Deactivated'],
                          ['Username', '@' + user.username],
                        ].map(([k, v]) => (
                          <div key={k} style={{ fontSize: '0.82rem' }}>
                            <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{k}</span>
                            <span style={{ color: 'var(--text-primary)', fontFamily: k === 'Last IP' || k === 'Username' ? 'var(--font-mono)' : undefined }}>{v}</span>
                          </div>
                        ))}
                      </div>

                      <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem', marginTop: '0.5rem' }}>
                        Sessions ({user.sessions?.length || 0})
                      </h4>
                      {user.sessions?.length > 0 ? (
                        <div style={{ overflowX: 'auto', marginBottom: '1.25rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                          <table style={{ minWidth: 540 }}>
                            <thead><tr><th>Status</th><th>Started</th><th>IP Address</th><th>Device / Browser</th><th>Action</th></tr></thead>
                            <tbody>
                              {user.sessions.slice(0, 10).map((s) => (
                                <tr key={s.id}>
                                  <td><span style={{ display: 'flex', alignItems: 'center' }}><StatusDot active={s.is_active} /><span style={{ fontSize: '0.78rem', fontWeight: 600, color: s.is_active ? '#10b981' : 'var(--text-muted)' }}>{s.is_active ? 'Active' : 'Ended'}</span></span></td>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{fmt(s.created_at)}</td>
                                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{s.ip_address || '—'}</td>
                                  <td style={{ fontSize: '0.78rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_agent || '—'}</td>
                                  <td>
                                    {s.is_active ? (
                                      <button
                                        className="btn btn-sm btn-danger"
                                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', borderRadius: 6 }}
                                        disabled={actionLoading === `revoke-sess-${s.id}`}
                                        onClick={() => handleRevokeSingleSession(user, s.id)}
                                        title="Revoke this session"
                                      >
                                        {actionLoading === `revoke-sess-${s.id}` ? '...' : 'Revoke'}
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Revoked</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1rem' }}>No sessions recorded.</p>}

                      <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                        Activity Log ({user.activity?.length || 0})
                      </h4>
                      {user.activity?.length > 0 ? (
                        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                          <table style={{ minWidth: 540 }}>
                            <thead><tr><th>Time</th><th>Action</th><th>Category</th><th>Description</th><th>Status</th></tr></thead>
                            <tbody>
                              {user.activity.slice(0, 20).map((a) => (
                                <tr key={a.id}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{fmt(a.created_at)}</td>
                                  <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{a.action.replace(/_/g, ' ')}</td>
                                  <td><span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: 99, background: 'rgba(23,103,210,0.08)', color: '#1767d2', fontWeight: 700 }}>{a.category}</span></td>
                                  <td style={{ fontSize: '0.78rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description || '\u2014'}</td>
                                  <td><span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: 99, fontWeight: 700, background: a.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: a.status === 'success' ? '#10b981' : '#ef4444' }}>{a.status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No activity recorded.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadUsers}>&#8635; Refresh</button>
          </div>
        )}
      </div>
    </div>
  );
}
