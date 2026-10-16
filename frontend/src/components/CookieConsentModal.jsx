import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * DBIM Section 7.6: Personalization and Cookie Management
 * - 7.6.1 Clear Consent & Personalization Choice
 * - 7.6.2 Persistent Cookies (User preferences, accessibility settings, session tokens)
 * - 7.6.3.2 Non-Essential Cookies (Functionality, analytics, UI telemetry)
 * - Meets GIGW 3.0 & Indian Government Data Protection standards
 */
export default function CookieConsentModal({ forceOpen = false, onClose = () => {} }) {
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('dbim_cookie_preferences');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {
      essential: true,       // Mandatory (Session JWT, CSRF, Security)
      functional: true,      // Accessibility, 3D camera angles, UI density
      analytics: false,      // Forensic telemetry, model latency stats
    };
  });

  useEffect(() => {
    const consent = localStorage.getItem('dbim_cookie_consent');
    if (!consent && !forceOpen) {
      setShowBanner(true);
    } else if (forceOpen) {
      setShowModal(true);
    }
  }, [forceOpen]);

  const saveConsent = (updatedPrefs) => {
    localStorage.setItem('dbim_cookie_preferences', JSON.stringify(updatedPrefs));
    localStorage.setItem(
      'dbim_cookie_consent',
      JSON.stringify({
        consentedAt: new Date().toISOString(),
        version: '1.0-DBIM-GIGW3',
        status: 'accepted',
      })
    );
    setPreferences(updatedPrefs);
    setShowBanner(false);
    setShowModal(false);
    onClose();
  };

  const handleAcceptAll = () => {
    saveConsent({ essential: true, functional: true, analytics: true });
  };

  const handleRejectNonEssential = () => {
    saveConsent({ essential: true, functional: false, analytics: false });
  };

  const handleSaveCustom = () => {
    saveConsent(preferences);
  };

  if (!showBanner && !showModal) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* DBIM Section 7.6.1 Consent Notice Banner */}
      {showBanner && !showModal && (
        <aside
          className="dbim-cookie-banner"
          role="region"
          aria-label="Cookie & Privacy Consent (DBIM Section 7.6)"
        >
          <div className="dbim-cookie-banner-content">
            <div className="dbim-cookie-banner-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#087fae" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
                <path d="M8.5 8.5v.01" />
                <path d="M16 15.5v.01" />
                <path d="M12 12v.01" />
                <path d="M11 17v.01" />
                <path d="M7 13v.01" />
              </svg>
            </div>
            <div className="dbim-cookie-banner-text">
              <h4>Digital Privacy & Cookie Notice (GIGW 3.0 / DBIM §7.6)</h4>
              <p>
                We use cookies and local storage to guarantee secure session authentication, remember your accessibility and 3D pose viewer preferences, and provide forensic audit compliance.
              </p>
            </div>
          </div>
          <div className="dbim-cookie-banner-actions">
            <button
              type="button"
              className="dbim-cookie-btn dbim-cookie-btn-secondary"
              onClick={() => setShowModal(true)}
            >
              Cookie Settings
            </button>
            <button
              type="button"
              className="dbim-cookie-btn dbim-cookie-btn-outline"
              onClick={handleRejectNonEssential}
            >
              Essential Only
            </button>
            <button
              type="button"
              className="dbim-cookie-btn dbim-cookie-btn-primary"
              onClick={handleAcceptAll}
            >
              Accept All
            </button>
          </div>
        </aside>
      )}

      {/* DBIM Section 7.6.3 Cookie Settings Modal */}
      {showModal && (
        <div
          className="dbim-cookie-modal-backdrop"
          onClick={() => {
            setShowModal(false);
            onClose();
          }}
        >
          <div
            className="dbim-cookie-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
          >
            <div className="dbim-cookie-modal-header">
              <h3 id="cookie-settings-title">Personalization & Cookie Management</h3>
              <button
                type="button"
                className="dbim-cookie-close-btn"
                onClick={() => {
                  setShowModal(false);
                  onClose();
                }}
                aria-label="Close cookie settings"
              >
                ✕
              </button>
            </div>

            <p className="dbim-cookie-modal-subtitle">
              Configure your preferences as outlined in the Digital Brand Identity Manual (DBIM Section 7.6). You can modify these settings at any time.
            </p>

            <div className="dbim-cookie-categories">
              {/* Category 1: Essential */}
              <div className="dbim-cookie-item">
                <div className="dbim-cookie-item-main">
                  <div>
                    <strong>1. Strictly Essential Cookies (DBIM §7.6.2)</strong>
                    <span className="dbim-cookie-pill-always">Always Active</span>
                  </div>
                  <p>
                    Required for basic site functionality, secure JWT login authentication, 2FA validation, and CSRF protection. Cannot be disabled.
                  </p>
                </div>
                <input type="checkbox" checked disabled className="dbim-switch" aria-label="Essential cookies always active" />
              </div>

              {/* Category 2: Functional */}
              <div className="dbim-cookie-item">
                <div className="dbim-cookie-item-main">
                  <div>
                    <strong>2. Functional & Personalization (DBIM §7.6.3.2-i)</strong>
                  </div>
                  <p>
                    Remembers your accessibility preferences (font scaling, high-contrast mode), Three.js 3D point cloud camera angles, and reticle pinpoint crosshair styles.
                  </p>
                </div>
                <label className="dbim-switch-label">
                  <input
                    type="checkbox"
                    className="dbim-switch"
                    checked={preferences.functional}
                    onChange={(e) =>
                      setPreferences({ ...preferences, functional: e.target.checked })
                    }
                    aria-label="Toggle functional cookies"
                  />
                  <span className="dbim-slider"></span>
                </label>
              </div>

              {/* Category 3: Analytics */}
              <div className="dbim-cookie-item">
                <div className="dbim-cookie-item-main">
                  <div>
                    <strong>3. Forensic Telemetry & Performance (DBIM §7.6.3.2-ii)</strong>
                  </div>
                  <p>
                    Collects anonymized model inference response times and benchmark stats to improve pose estimation accuracy. No personal data is stored outside India.
                  </p>
                </div>
                <label className="dbim-switch-label">
                  <input
                    type="checkbox"
                    className="dbim-switch"
                    checked={preferences.analytics}
                    onChange={(e) =>
                      setPreferences({ ...preferences, analytics: e.target.checked })
                    }
                    aria-label="Toggle analytics cookies"
                  />
                  <span className="dbim-slider"></span>
                </label>
              </div>
            </div>

            <div className="dbim-cookie-modal-footer">
              <button
                type="button"
                className="dbim-cookie-btn dbim-cookie-btn-outline"
                onClick={handleRejectNonEssential}
              >
                Reject Non-Essential
              </button>
              <button
                type="button"
                className="dbim-cookie-btn dbim-cookie-btn-primary"
                onClick={handleSaveCustom}
              >
                Save My Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
