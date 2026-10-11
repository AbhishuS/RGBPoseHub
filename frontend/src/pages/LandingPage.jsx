import { useNavigate } from 'react-router-dom';
import LiquidChrome from '../components/LiquidChrome';

const team = [
  'Abhishu Shaurya · 241IT003',
  'Hradayastha Thakran · 241IT034',
  'Lavish Temani · 241IT040',
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <main className="landing-page">
      <LiquidChrome />
      <div className="landing-wash" aria-hidden="true" />

      <header className="landing-topbar">
        <a className="landing-brand" href="/" aria-label="RGB PoseHub home">
          <span className="landing-brand-mark"><i /><i /><i /></span>
          <span>RGB <b>POSEHUB</b></span>
        </a>
        <div className="landing-account-links">
          <span className="landing-top-note">6D OBJECT POSE ESTIMATION</span>
          <button className="landing-admin-link" onClick={() => navigate('/admin/login')}>Admin sign in <span>↗</span></button>
        </div>
      </header>

      <section className="landing-hero">
        <h1>RGB<br /><span>POSE HUB</span></h1>
        <div className="landing-project-info">
          <p className="landing-project-label">Software Engineering Course Project · RGB PoseHub</p>
          <p className="landing-guidance">Guided by <strong>Dr. Jaidhar C.D.</strong></p>
          <div className="landing-team" aria-label="Project team">
            {team.map((person) => <span key={person}>{person}</span>)}
          </div>
        </div>

        <p className="landing-description">
          Turn a single image into a deeper understanding of an object’s position and orientation.
          <br className="landing-desktop-break" /> Meet your all-in-one 6D pose estimation workspace.
        </p>

        <div className="landing-actions">
          <button className="landing-button landing-button-primary" onClick={() => navigate('/about')}>
            Explore the project <span aria-hidden="true">↗</span>
          </button>
          <button className="landing-button landing-button-primary" onClick={() => navigate('/login')}>
            User sign in <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="landing-scroll-cue"><span /> Built for curious minds</div>
      </section>
      <footer className="site-legal-footer landing-legal-footer">
        <span>&copy; {new Date().getFullYear()} RGB PoseHub</span>
        <span>Contact: <a href="mailto:indianthakran@gmail.com">indianthakran@gmail.com</a></span>
      </footer>
    </main>
  );
}
