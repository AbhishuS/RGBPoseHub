import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, dataAPI, mlAPI } from '../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [datasetStatus, setDatasetStatus] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [statsRes, dataRes, mlRes, analysesRes] = await Promise.all([
        authAPI.getStats().catch(() => null),
        dataAPI.getStatus().catch(() => null),
        mlAPI.getStatus().catch(() => null),
        mlAPI.getRecentAnalyses().catch(() => null),
      ]);
      if (statsRes?.data) {
        setStats(statsRes.data.stats || {});
        setRecentActivity(statsRes.data.recent_activity || []);
        if (statsRes.data.recent_analyses) {
          setRecentAnalyses(statsRes.data.recent_analyses);
        }
      }
      if (analysesRes?.data?.analyses && (!statsRes?.data?.recent_analyses || statsRes.data.recent_analyses.length === 0)) {
        setRecentAnalyses(analysesRes.data.analyses);
      }
      if (dataRes?.data) setDatasetStatus(dataRes.data.dataset);
      if (mlRes?.data) setModelStatus(mlRes.data);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const actionIcons = {
    login_success: '🔐',
    logout: '🚪',
    register: '🆕',
    image_upload: '📤',
    image_analysis: '🔬',
    forensic_analysis: '🔬',
    pose_estimation: '📐',
    dataset_download_start: '📥',
    dataset_download_complete: '✅',
    dataset_clean: '🧹',
    dataset_preprocess: '⚙️',
    model_build: '🧠',
    training_start: '🚀',
    training_complete: '🏁',
    profile_update: '👤',
    '2fa_setup_complete': '🛡️',
    dataset_analysis: '📊',
  };

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="page-header" style={{ borderBottomColor: 'rgba(23, 105, 210, 0.12)' }}>
        <h2 style={{ color: '#0f2b48', fontWeight: 800 }}>Dashboard</h2>
        <p style={{ color: '#526374' }}>Overview of your RGB-Pose Hub activity, system status, and analyzed imagery</p>
      </div>

      <div className="page-body">
        {/* Stats Grid */}
        <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
          {/* Card 1: Total Analyses — Clickable to open recent analyses */}
          <div
            className="stat-card"
            onClick={() => setShowModal(true)}
            style={{
              cursor: 'pointer',
              position: 'relative',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              border: '1.5px solid rgba(23, 103, 210, 0.22)',
            }}
            title="Click to view your last 4 analysed images"
          >
            <div style={{ position: 'absolute', top: 10, right: 10, fontSize: '0.65rem', background: 'rgba(23, 103, 210, 0.1)', color: '#1767d2', padding: '0.15rem 0.5rem', borderRadius: 999, fontWeight: 700 }}>
              👁️ Click to view
            </div>
            <div className="stat-icon blue">🔬</div>
            <div className="stat-info">
              <h4 style={{ color: '#1767d2' }}>{stats?.total_analyses || 0}</h4>
              <p style={{ fontWeight: 600 }}>Total Analyses</p>
            </div>
          </div>

          {/* Card 2: Images Uploaded — Clickable */}
          <div
            className="stat-card"
            onClick={() => setShowModal(true)}
            style={{
              cursor: 'pointer',
              position: 'relative',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              border: '1.5px solid rgba(5, 150, 105, 0.22)',
            }}
            title="Click to view recently analysed images"
          >
            <div style={{ position: 'absolute', top: 10, right: 10, fontSize: '0.65rem', background: 'rgba(5, 150, 105, 0.1)', color: '#059669', padding: '0.15rem 0.5rem', borderRadius: 999, fontWeight: 700 }}>
              Recent History
            </div>
            <div className="stat-icon emerald">📤</div>
            <div className="stat-info">
              <h4 style={{ color: '#059669' }}>{stats?.total_uploads || 0}</h4>
              <p style={{ fontWeight: 600 }}>Images Uploaded</p>
            </div>
          </div>

          {/* Card 3: Dataset Objects */}
          <div className="stat-card">
            <div className="stat-icon amber">📦</div>
            <div className="stat-info">
              <h4>{datasetStatus?.total_images || 0}</h4>
              <p>Dataset Objects</p>
            </div>
          </div>

          {/* Card 4: Active Sessions */}
          <div className="stat-card">
            <div className="stat-icon purple">🟢</div>
            <div className="stat-info">
              <h4 style={{ color: '#7c3aed' }}>{stats?.active_sessions || 0}</h4>
              <p>Active Sessions</p>
            </div>
          </div>
        </div>

        {/* ── Section: Last 3-4 Images Analysed (Always Visible on Dashboard) ── */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🖼️</span>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f2b48' }}>
                Recently Analysed Images
              </h3>
              <span style={{ fontSize: '0.72rem', background: 'rgba(23, 103, 210, 0.1)', color: '#1767d2', padding: '0.2rem 0.6rem', borderRadius: 999, fontWeight: 700 }}>
                Last {recentAnalyses.length || 0} processed
              </span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/analysis')}
              style={{ fontSize: '0.8rem' }}
            >
              + New Analysis ↗
            </button>
          </div>

          {recentAnalyses.length === 0 ? (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(240, 248, 255, 0.8) 100%)',
                border: '1.5px dashed rgba(23, 105, 210, 0.25)',
                borderRadius: '16px',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔬</div>
              <h4 style={{ color: '#0f2b48', margin: '0 0 0.35rem' }}>No Images Analysed Yet</h4>
              <p style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: 400, margin: '0 auto 1rem' }}>
                Upload an RGB image with optional depth to run forensic inspection and spatial pose estimation.
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/analysis')}>
                Start First Analysis 🔬
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {recentAnalyses.slice(0, 4).map((item, idx) => {
                const imgUrl = item.filename ? mlAPI.getImageUrl(item.filename) : null;
                const isPose = item.action === 'pose_estimation';
                return (
                  <div
                    key={item.id || idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.85)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(23, 105, 210, 0.15)',
                      borderRadius: '14px',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 4px 16px rgba(23, 73, 111, 0.04)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        height: 140,
                        borderRadius: 10,
                        background: '#f1f5f9',
                        overflow: 'hidden',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={item.original_filename || 'Analysis'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement.innerHTML = '<span style="font-size:2.5rem;opacity:0.4;">🖼️</span>';
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '2.5rem', opacity: 0.4 }}>🖼️</span>
                      )}
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          background: isPose ? 'rgba(124, 58, 237, 0.9)' : 'rgba(23, 103, 210, 0.9)',
                          color: '#fff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 999,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {isPose ? '📐 POSE' : '🔬 FORENSIC'}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div style={{ flex: 1, minWidth: 0, marginBottom: '0.75rem' }}>
                      <strong
                        style={{
                          display: 'block',
                          fontSize: '0.88rem',
                          color: '#0f2b48',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={item.original_filename || item.filename}
                      >
                        {item.original_filename || item.filename || 'Processed Image'}
                      </strong>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          🕒 {formatTime(item.created_at)}
                        </span>
                        {item.metadata?.candidate_objects_count != null && (
                          <span style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600 }}>
                            {item.metadata.candidate_objects_count} objects
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action button */}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate('/analysis', { state: { filename: item.filename } })}
                      style={{
                        width: '100%',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        border: '1px solid rgba(23, 105, 210, 0.25)',
                        background: 'rgba(23, 105, 210, 0.05)',
                        color: '#1767d2',
                        justifyContent: 'center',
                      }}
                    >
                      Inspect in Workbench ↗
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Two Column: Recent Activity & System Status ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Recent Activity Card */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="card-title">🕒 Recent Activity</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Audit Log</span>
            </div>
            {recentActivity.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1rem 0' }}>
                No activity yet. Start by uploading an image!
              </p>
            ) : (
              <div className="activity-feed">
                {recentActivity.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <div className={`activity-dot ${item.category || 'system'}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                        {actionIcons[item.action] || '📌'} {item.description || item.action.replace(/_/g, ' ')}
                      </p>
                      <span className="activity-time" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {formatTime(item.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Status Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">⚙️ System Status</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Dataset</span>
                <span className={`badge ${datasetStatus?.status === 'ready' ? 'badge-success' : 'badge-warning'}`}>
                  {datasetStatus?.status === 'ready' ? `✓ ${datasetStatus.total_images} objects` : '○ Not loaded'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ML Model</span>
                <span className={`badge ${modelStatus?.model?.model_exists ? 'badge-success' : 'badge-info'}`}>
                  {modelStatus?.model?.model_exists ? '✓ Active & Ready' : '○ Similarity mode'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Model Accuracy</span>
                <span className="badge badge-purple">
                  {modelStatus?.training_summary?.final_val_accuracy
                    ? `${(modelStatus.training_summary.final_val_accuracy * 100).toFixed(1)}%`
                    : 'Standard Baseline'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Member Since</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {stats?.member_since ? formatTime(stats.member_since) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal Dialog: Last 3-4 Analysed Images Detailed Inspector ── */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
              padding: '1.75rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f2b48', fontSize: '1.25rem', fontWeight: 800 }}>
                  🖼️ Recently Analysed Images
                </h3>
                <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                  Your latest processed images with timestamps and quick-inspect links
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowModal(false)}
                style={{ borderRadius: '50%', width: 34, height: 34, padding: 0, display: 'grid', placeItems: 'center', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {recentAnalyses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                <p>No recent images found in your activity history.</p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setShowModal(false);
                    navigate('/analysis');
                  }}
                >
                  Analyze an Image Now
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {recentAnalyses.slice(0, 4).map((item, idx) => {
                  const imgUrl = item.filename ? mlAPI.getImageUrl(item.filename) : null;
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.85rem',
                        borderRadius: '12px',
                        background: '#f8fafc',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{ width: 64, height: 64, borderRadius: 8, background: '#e2e8f0', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: '0.9rem', color: '#0f2b48', overflowWrap: 'anywhere' }}>
                          {item.original_filename || item.filename || 'Analyzed Image'}
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                          {item.description || item.action} &bull; <span style={{ color: '#0f2b48', fontWeight: 600 }}>{formatTime(item.created_at)}</span>
                        </div>
                      </div>

                      {/* Action */}
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setShowModal(false);
                          navigate('/analysis', { state: { filename: item.filename } });
                        }}
                        style={{ flexShrink: 0, fontSize: '0.78rem' }}
                      >
                        Inspect ↗
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
