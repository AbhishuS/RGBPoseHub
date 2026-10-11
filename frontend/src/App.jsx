import { useState } from 'react';
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
import { isAdminUser, normalizeUserRole } from './utils/auth';
import './styles/index.css';

function LoginScreen({ onLogin, isAdmin = false }) {
  return (
    <div className="auth-screen" style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LiquidChrome />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoginPage onLogin={onLogin} isAdmin={isAdmin} />
      </div>
      <footer className="site-legal-footer">
        <span>&copy; {new Date().getFullYear()} RGB PoseHub</span>
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

  const handleLogin = (userData) => {
    const normalizedUser = normalizeUserRole(userData);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <Router>
      {!user ? (
        <>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={<LoginScreen onLogin={handleLogin} isAdmin={false} />} />
            <Route path="/admin/login" element={<LoginScreen onLogin={handleLogin} isAdmin={true} />} />
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
            
            <footer style={{
              padding: '1rem 1.5rem',
              textAlign: 'center',
              borderTop: '1px solid rgba(0,0,0,0.05)',
              marginTop: 'auto',
              color: '#666',
              fontSize: '0.8rem',
              display: 'flex',
              justifyContent: 'center',
              gap: '1.5rem',
              flexWrap: 'wrap',
            }}>
              <span>&copy; {new Date().getFullYear()} RGB PoseHub</span>
              <span>Contact: <a href="mailto:indianthakran@gmail.com" style={{ color: '#0284c7', textDecoration: 'none' }}>indianthakran@gmail.com</a></span>
            </footer>
          </main>
        </div>
      )}
    </Router>
  );
}
