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
import './styles/index.css';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <Router>
      {!user ? (
        <>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={
              <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <LiquidChrome />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LoginPage onLogin={handleLogin} />
                </div>
              </div>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      ) : (
        <div className="app-layout">
          <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>
            Menu
          </button>

          <Sidebar user={user} isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

          <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/dataset" element={<DatasetPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/profile" element={<ProfilePage user={user} onLogout={handleLogout} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            
            {/* Small Dashboard Footer */}
            <footer style={{
              padding: '1.5rem',
              textAlign: 'center',
              borderTop: '1px solid rgba(0,0,0,0.05)',
              marginTop: 'auto',
              color: '#666',
              fontSize: '0.8rem'
            }}>
              <p style={{ margin: '0 0 0.3rem 0', fontWeight: 600, color: '#444' }}>Software Engineering Course Project: RGB PoseHub</p>
              <p style={{ margin: '0 0 0.3rem 0' }}>Course Instructor: Dr. Jaidhar C.D. | Done by: Abhishu, Hradayastha, Lavish</p>
              <p style={{ margin: 0 }}>&copy; {new Date().getFullYear()} RGB PoseHub. Contact: <a href="mailto:indianthakran@gmail.com" style={{ color: '#0284c7', textDecoration: 'none' }}>indianthakran@gmail.com</a></p>
            </footer>
          </main>
        </div>
      )}
    </Router>
  );
}
