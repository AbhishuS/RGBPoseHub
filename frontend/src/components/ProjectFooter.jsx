import React from 'react';

/**
 * DBIM Section 5.6: Footer Compliance
 * - Copyright & Organization attribution (NITK Surathkal · IT303 Course Project)
 * - GIGW 3.0 & DBIM Standards Badge
 * - Accessibility statement & Contact details
 */
export default function ProjectFooter({ onOpenCookies }) {
  return (
    <footer style={{
      padding: '1.25rem 1.5rem',
      margin: '1rem',
      backgroundColor: 'rgba(255, 255, 255, 0.72)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)',
      textAlign: 'center',
      fontFamily: '"Inter", sans-serif',
      color: 'var(--text-secondary, #555)',
      fontSize: '0.85rem'
    }}>
      <p style={{ margin: '0 0 0.5rem 0' }}>
        &copy; {new Date().getFullYear()} <strong>RGB PoseHub</strong> · Software Engineering Course Project (IT303)
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
        <span style={{ color: '#059669', fontWeight: 600 }}>✓ GIGW 3.0 & DBIM Compliant</span>
        <span>•</span>
        {onOpenCookies && (
          <>
            <button
              type="button"
              onClick={onOpenCookies}
              style={{ background: 'none', border: 'none', color: '#087fae', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              Cookie Preferences (DBIM §7.6)
            </button>
            <span>•</span>
          </>
        )}
        <span>
          Contact: <a href="mailto:indianthakran@gmail.com" style={{ color: '#087fae', textDecoration: 'none', fontWeight: 600 }}>indianthakran@gmail.com</a>
        </span>
      </div>
    </footer>
  );
}
