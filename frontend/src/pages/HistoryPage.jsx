import { Fragment, useCallback, useEffect, useState } from 'react';
import { authAPI } from '../services/api';

export default function HistoryPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedUser, setExpandedUser] = useState(null);
  const [removingUser, setRemovingUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authAPI.getAdminUsers();
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load user accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const formatDateTime = (value) => value
    ? new Date(value).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never';

  const removeUser = async (user) => {
    if (!window.confirm(`Remove ${user.full_name || user.username} (${user.email}) and their activity history?`)) return;
    setRemovingUser(user.id);
    setError('');
    try {
      await authAPI.deleteAdminUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      if (expandedUser === user.id) setExpandedUser(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove this account.');
    } finally {
      setRemovingUser(null);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>User Management</h2>
        <p>Review account details, sign-in history, and activity across RGB PoseHub.</p>
      </div>
      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="loading-overlay"><div className="spinner" /><p>Loading users and activity...</p></div>
        ) : users.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>No accounts found.</div>
        ) : (
          <div className="table-container admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Joined</th><th>Last login</th><th>Last login IP</th><th>Logins</th><th>Active sessions</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <Fragment key={user.id}>
                    <tr>
                      <td className="admin-user-name"><strong>{user.full_name || user.username}</strong><br /><small>@{user.username}</small></td>
                      <td className="admin-user-email">{user.email}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(user.created_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(user.last_login_at)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem' }}>{user.last_login_ip || '—'}</td>
                      <td>{user.login_history.length}</td>
                      <td>{user.active_sessions}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}>
                          {expandedUser === user.id ? 'Hide activity' : 'View activity'} ({user.activity.length})
                        </button>{' '}
                        {user.role !== 'admin' && <button className="btn btn-sm btn-danger" disabled={removingUser === user.id} onClick={() => removeUser(user)}>
                          {removingUser === user.id ? 'Removing…' : 'Remove user'}
                        </button>}
                      </td>
                    </tr>
                    {expandedUser === user.id && (
                      <tr key={`${user.id}-activity`}>
                        <td colSpan="8" style={{ padding: '1rem', background: 'rgba(20,45,70,.035)' }}>
                          <strong style={{ display: 'block', marginBottom: '.7rem' }}>Sign-in and account activity</strong>
                          {user.sessions.length > 0 && <>
                            <strong style={{ display: 'block', margin: '1rem 0 .5rem' }}>Login sessions</strong>
                            <div style={{ overflowX: 'auto' }}>
                              <table>
                                <thead><tr><th>Started</th><th>IP address</th><th>Device / browser</th><th>Session state</th></tr></thead>
                                <tbody>{user.sessions.map((session) => (
                                  <tr key={session.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(session.created_at)}</td>
                                    <td>{session.ip_address || '—'}</td>
                                    <td>{session.user_agent || '—'}</td>
                                    <td>{session.is_active ? 'Active' : `Ended${session.revoked_at ? ` · ${formatDateTime(session.revoked_at)}` : ''}`}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          </>}
                          {user.activity.length === 0 ? <span>No activity recorded.</span> : (
                            <div style={{ overflowX: 'auto' }}>
                              <table>
                                <thead><tr><th>Time</th><th>Action</th><th>Category</th><th>Description</th><th>Status</th><th>IP address</th></tr></thead>
                                <tbody>{user.activity.map((entry) => (
                                  <tr key={entry.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.created_at)}</td>
                                    <td>{entry.action.replace(/_/g, ' ')}</td>
                                    <td>{entry.category}</td>
                                    <td>{entry.description || '—'}</td>
                                    <td>{entry.status}</td>
                                    <td>{entry.ip_address || '—'}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
