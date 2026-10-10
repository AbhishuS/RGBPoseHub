import React from 'react';
import { useNavigate } from 'react-router-dom';
import LiquidChrome from '../components/LiquidChrome';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'transparent' }}>
      {/* 3D Liquid Chrome Background */}
      <LiquidChrome />
      
      {/* Content Overlay */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 0, left: 0, right: 0, bottom: 0, 
          zIndex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          pointerEvents: 'none' // allow clicking canvas if needed, though we don't need to interact
        }}
      >
        <h1 
          style={{ 
            fontSize: 'clamp(4rem, 12vw, 10rem)', 
            fontWeight: 800, 
            lineHeight: 0.9, 
            letterSpacing: '-0.04em',
            color: '#111', 
            textAlign: 'center',
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            zIndex: 2,
            textTransform: 'uppercase'
          }}
        >
          RGB<br/>POSE HUB
        </h1>
        
        <p 
          style={{
            marginTop: '2rem',
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: '#555',
            maxWidth: '600px',
            textAlign: 'center',
            fontWeight: 400,
            lineHeight: 1.5,
            fontFamily: 'Inter, sans-serif',
            zIndex: 2
          }}
        >
          A procedural world of liquid metal and high-contrast light. <br/>6D Object Pose Estimation Platform responding in real-time.
        </p>

        {/* Done By Info integrated nicely */}
        <div 
          style={{
            marginTop: '2.5rem',
            padding: '1.25rem 2.5rem',
            background: 'rgba(255,255,255,0.4)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.5)',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif',
            zIndex: 2,
            pointerEvents: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.05)'
          }}
        >
          <p style={{ margin: '0 0 0.4rem 0', fontWeight: 700, color: '#111', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Software Engineering Course Project</p>
          <p style={{ margin: '0 0 0.6rem 0', color: '#444', fontSize: '0.85rem', fontWeight: 500 }}>Course Instructor: Dr. Jaidhar C.D.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', color: '#333', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>Abhishu Shaurya - 241IT003</span>
            <span style={{ color: '#888' }}>|</span>
            <span>Hradayastha Thakran - 241IT034</span>
            <span style={{ color: '#888' }}>|</span>
            <span>Lavish Temani - 241IT040</span>
          </div>
        </div>


        <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem', pointerEvents: 'auto', zIndex: 2 }}>
          <button 
            onClick={() => navigate('/about')}
            style={{
              padding: '0.75rem 2rem',
              borderRadius: '100px',
              backgroundColor: '#111',
              color: '#fff',
              border: 'none',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'transform 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            Get Started
          </button>
          
          <button 
            onClick={() => navigate('/login')}
            style={{
              padding: '0.75rem 2rem',
              borderRadius: '100px',
              backgroundColor: 'transparent',
              color: '#111',
              border: '1px solid rgba(0,0,0,0.3)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
              e.currentTarget.style.borderColor = '#111';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.3)';
            }}
          >
            Log In
          </button>
        </div>
      </div>
      
      {/* Small top left logo/bookmark text */}
      <div 
        style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          zIndex: 2,
          color: '#555',
          fontSize: '1rem',
          fontWeight: 500,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '1px'
        }}
      >
        RGBPOSE HUB
      </div>
      
    </div>
  );
}
