import React from 'react';
import { useNavigate } from 'react-router-dom';
import LiquidChrome from '../components/LiquidChrome';

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'transparent', padding: '4rem 2rem' }}>
      <LiquidChrome />
      
      <div 
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(48px)',
          WebkitBackdropFilter: 'blur(48px)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          borderRadius: '32px',
          padding: '4rem',
          boxShadow: '0 24px 80px rgba(0,0,0,0.07)'
        }}
      >
        <button 
          onClick={() => navigate('/')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '100px',
            backgroundColor: 'transparent',
            color: '#111',
            border: '1px solid rgba(0,0,0,0.3)',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '2rem',
            transition: 'all 0.2s ease'
          }}
        >
          &larr; Back to Home
        </button>

        <h1 style={{ fontSize: '3.5rem', fontWeight: 800, margin: '0 0 1rem 0', color: '#111', letterSpacing: '-0.04em' }}>
          Explore Image Analysis
        </h1>
        <p style={{ fontSize: '1.25rem', color: '#444', lineHeight: 1.6, marginBottom: '3rem', fontWeight: 500 }}>
          Here is a preview of the Image Analysis dashboard you'll get access to. Upload RGB-D images, run forensic checks, and estimate 6D object poses using our dual-track system.
        </p>

        {/* Dummy Image Analysis Dashboard Tab */}
        <div style={{
          background: 'var(--bg-primary, #fff)',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
          border: '1px solid rgba(0,0,0,0.05)',
          marginBottom: '4rem'
        }}>
          {/* Header */}
          <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Image Analysis</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ background: '#eee', padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600 }}>Forensics</div>
              <div style={{ background: '#eee', padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600 }}>Pose Estimation</div>
            </div>
          </div>
          
          {/* Body */}
          <div style={{ padding: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {/* Left: Image Preview (Dummy Picture) */}
            <div style={{ flex: '1 1 400px' }}>
              <div style={{ 
                width: '100%', 
                height: '300px', 
                backgroundColor: '#f8f8f9', 
                borderRadius: '16px', 
                border: '2px dashed #ccc',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <img src="https://images.unsplash.com/photo-1555255707-c07966088b7b?auto=format&fit=crop&w=800&q=80" alt="Dummy Analysis" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                
                {/* Overlay bounding boxes */}
                <div style={{ position: 'absolute', top: '20%', left: '30%', width: '40%', height: '50%', border: '3px solid #059669', borderRadius: '8px' }}>
                  <div style={{ position: 'absolute', top: '-25px', left: '-3px', background: '#059669', color: '#fff', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 'bold', borderRadius: '4px' }}>Object (98%)</div>
                </div>
              </div>
            </div>
            
            {/* Right: Dummy Results Panel */}
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#f8f8fa', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e8e8ec' }}>
                <h3 style={{ fontSize: '0.9rem', color: '#555', margin: '0 0 1rem 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Analysis Results</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>EXIF Data</span> <span style={{ color: '#059669', fontWeight: 600 }}>Verified</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>Compression</span> <span style={{ color: '#059669', fontWeight: 600 }}>Clean</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <span style={{ fontWeight: 600 }}>Pose Precision</span> <span style={{ color: '#0284c7', fontWeight: 600 }}>High Confidence</span>
                </div>
                <button disabled style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#e0e0e8', color: '#787890', fontWeight: 600, cursor: 'not-allowed' }}>
                  Download Report
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.7)', padding: '3rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', color: '#111', letterSpacing: '-0.02em' }}>Log in for the actual app</h2>
          <p style={{ fontSize: '1.1rem', color: '#555', marginBottom: '2rem' }}>To upload your own images and run these analyses live, please log in.</p>
          <button 
            onClick={() => navigate('/login')}
            style={{
              padding: '1rem 3.5rem',
              borderRadius: '100px',
              backgroundColor: '#111',
              color: '#fff',
              border: 'none',
              fontSize: '1.15rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
              boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            Log In to Continue
          </button>
        </div>
      </div>
    </div>
  );
}
