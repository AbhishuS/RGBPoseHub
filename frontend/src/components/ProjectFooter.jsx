import React from 'react';

export default function ProjectFooter() {
  return (
    <div style={{
      padding: '1.5rem',
      margin: '1rem',
      backgroundColor: 'rgba(255, 255, 255, 0.6)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)',
      textAlign: 'center',
      fontFamily: '"Inter", sans-serif',
      color: '#555',
      fontSize: '0.9rem'
    }}>
      <p style={{ margin: '0 0 0.5rem 0' }}>&copy; {new Date().getFullYear()} RGB PoseHub. All rights reserved.</p>
      <p style={{ margin: 0 }}>
        Contact: <a href="mailto:indianthakran@gmail.com" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>indianthakran@gmail.com</a>
      </p>
    </div>
  );
}
