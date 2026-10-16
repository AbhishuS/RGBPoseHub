import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AnalysisPage from './pages/AnalysisPage';
import DatasetPage from './pages/DatasetPage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import LandingPage from './pages/LandingPage';
import LiquidChrome from './components/LiquidChrome';
import AboutPage from './pages/AboutPage';
import ProjectHeader from './components/ProjectHeader';
import { authAPI } from './services/api';
import { isAdminUser, normalizeUserRole } from './utils/auth';
import CookieConsentModal from './components/CookieConsentModal';
import AccessibilityToolbar from './components/AccessibilityToolbar';
import './styles/index.css';

function LoginScreen({ onLogin, isAdmin = false, onOpenCookies }) {
  return (
    <div className="auth-screen" style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LiquidChrome />
      <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}>
        <AccessibilityToolbar inline={true} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoginPage onLogin={onLogin} isAdmin={isAdmin} />
      </div>
      <footer className="site-legal-footer">
        <span>&copy; {new Date().getFullYear()} RGB PoseHub</span>
        <span>NITK Surathkal · IT303</span>
        <button
          type="button"
          onClick={onOpenCookies}
          style={{ background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
        >
          Cookie Preferences (DBIM §7.6)
        </button>
        <span>Contact: <a href="mailto:indianthakran@gmail.com">indianthakran@gmail.com</a></span>
      </footer>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? normalizeUserRole(JSON.parse(saved)) : null;
    } catch {
      return null;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cookieModalOpen, setCookieModalOpen] = useState(false);

  const handleLogin = (userData) => {
    const normalizedUser = normalizeUserRole(userData);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  useEffect(() => {
    if (!user) return;
    let failureCount = 0;
    const checkSession = async () => {
      try {
        await authAPI.getProfile();
        failureCount = 0;
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          failureCount++;
          if (failureCount >= 2 && !localStorage.getItem('access_token')) {
            handleLogout();
          }
        }
      }
    };
    const interval = setInterval(checkSession, 12000);
    window.addEventListener('focus', checkSession);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkSession);
    };
  }, [user]);

  return (
    <Router>
      {/* Global DBIM Cookie Management Banner & Modal */}
      <CookieConsentModal forceOpen={cookieModalOpen} onClose={() => setCookieModalOpen(false)} />

      {!user ? (
        <>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={<LoginScreen onLogin={handleLogin} isAdmin={false} onOpenCookies={() => setCookieModalOpen(true)} />} />
            <Route path="/admin/login" element={<LoginScreen onLogin={handleLogin} isAdmin={true} onOpenCookies={() => setCookieModalOpen(true)} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      ) : (
        <div className={`app-layout${mobileOpen ? ' nav-expanded' : ''}`}>
          <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>
            Menu
          </button>
          <button
            className="desktop-nav-toggle"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
              <path d="M9 4v16" />
            </svg>
          </button>
          {mobileOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)} />}

          <Sidebar user={user} isAdmin={isAdminUser(user)} isOpen={mobileOpen} onClose={() => {
            if (window.matchMedia('(max-width: 768px)').matches) setMobileOpen(false);
          }} />

          <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
            <ProjectHeader />
            <div className="main-route-content" style={{ flex: 1 }}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/analysis" element={<AnalysisPage isAdmin={isAdminUser(user)} />} />
                <Route path="/dataset" element={isAdminUser(user) ? <DatasetPage /> : <Navigate to="/" replace />} />
                <Route path="/history" element={isAdminUser(user) ? <HistoryPage /> : <Navigate to="/" replace />} />
                <Route path="/profile" element={<ProfilePage user={user} onLogout={handleLogout} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            
            {/* DBIM Section 5.6: Footer Compliance */}
            <footer style={{
              padding: '1.25rem 2rem',
              textAlign: 'center',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              marginTop: 'auto',
              color: 'var(--text-secondary, #666)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap',
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span>&copy; {new Date().getFullYear()} <strong>RGB PoseHub</strong> · NITK Surathkal (IT303)</span>
                <span style={{ color: '#059669', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} /> GIGW 3.0 & DBIM Compliant
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setCookieModalOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#087fae',
                    cursor: 'pointer',
                    fontSize: 'inherit',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Cookie Preferences (DBIM §7.6)
                </button>
                <span>Contact: <a href="mailto:indianthakran@gmail.com" style={{ color: '#087fae', textDecoration: 'none' }}>indianthakran@gmail.com</a></span>
              </div>
            </footer>
          </main>
        </div>
      )}
    </Router>
  );
}
