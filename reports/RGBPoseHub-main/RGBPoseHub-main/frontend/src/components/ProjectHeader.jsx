import React from 'react';

export default function ProjectHeader() {
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
      fontFamily: '"Inter", sans-serif'
    }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#111' }}>
        Software Engineering Course Project: RGB PoseHub
      </h2>
      <p style={{ margin: '0 0 0.25rem 0', color: '#333', fontWeight: 600 }}>Done by:-</p>
      <p style={{ margin: '0 0 0.25rem 0', color: '#555' }}>Abhishu Shaurya - 241IT003</p>
      <p style={{ margin: '0 0 0.25rem 0', color: '#555' }}>Hradayastha Thakran - 241IT034</p>
      <p style={{ margin: 0, color: '#555' }}>Lavish Temani - 241IT040</p>
    </div>
  );
}
