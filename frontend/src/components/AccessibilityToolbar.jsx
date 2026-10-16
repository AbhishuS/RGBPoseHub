import React, { useState, useEffect } from 'react';

/**
 * DBIM Section 8: Adherence to Accessibility (GIGW 3.0 / RPWD Act Compliance)
 * - 8.1 Perceivable: High Contrast mode, Font size scaling (A-, A, A+, A++)
 * - 8.2 Operable: Screen reader focus outlines, keyboard shortcuts, skip to main content
 * - 7.6.2 Persistent storage of user accessibility preferences
 */
export default function AccessibilityToolbar({ inline = false }) {
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('dbim_font_size') || 'normal';
  });

  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('dbim_high_contrast') === 'true';
  });

  const [focusOutline, setFocusOutline] = useState(() => {
    return localStorage.getItem('dbim_focus_outline') === 'true';
  });

  // Apply font scale to root HTML element
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-font-scale', fontSize);
    localStorage.setItem('dbim_font_size', fontSize);
  }, [fontSize]);

  // Apply high contrast mode
  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) {
      root.setAttribute('data-contrast', 'high');
      localStorage.setItem('dbim_high_contrast', 'true');
    } else {
      root.removeAttribute('data-contrast');
      localStorage.setItem('dbim_high_contrast', 'false');
    }
  }, [highContrast]);

  // Apply focus outline enhancements
  useEffect(() => {
    const root = document.documentElement;
    if (focusOutline) {
      root.setAttribute('data-focus-ring', 'enhanced');
      localStorage.setItem('dbim_focus_outline', 'true');
    } else {
      root.removeAttribute('data-focus-ring');
      localStorage.setItem('dbim_focus_outline', 'false');
    }
  }, [focusOutline]);

  return (
    <div
      className={`dbim-accessibility-bar ${inline ? 'dbim-accessibility-bar-inline' : ''}`}
      role="region"
      aria-label="Accessibility controls (DBIM Section 8)"
    >
      <div className="dbim-a11y-group" title="Adjust Text Size (DBIM Section 4.3 & 8.1)">
        <span className="dbim-a11y-label">Text:</span>
        <button
          type="button"
          className={`dbim-a11y-btn ${fontSize === 'small' ? 'active' : ''}`}
          onClick={() => setFontSize('small')}
          title="Decrease font size"
          aria-label="Decrease font size"
        >
          A-
        </button>
        <button
          type="button"
          className={`dbim-a11y-btn ${fontSize === 'normal' ? 'active' : ''}`}
          onClick={() => setFontSize('normal')}
          title="Standard font size"
          aria-label="Reset font size to normal"
        >
          A
        </button>
        <button
          type="button"
          className={`dbim-a11y-btn ${fontSize === 'large' ? 'active' : ''}`}
          onClick={() => setFontSize('large')}
          title="Increase font size (112%)"
          aria-label="Increase font size"
        >
          A+
        </button>
        <button
          type="button"
          className={`dbim-a11y-btn ${fontSize === 'xlarge' ? 'active' : ''}`}
          onClick={() => setFontSize('xlarge')}
          title="Maximum font size (125%)"
          aria-label="Maximum font size"
        >
          A++
        </button>
      </div>

      <div className="dbim-a11y-separator" aria-hidden="true" />

      <div className="dbim-a11y-group">
        <button
          type="button"
          className={`dbim-a11y-btn dbim-contrast-btn ${highContrast ? 'active' : ''}`}
          onClick={() => setHighContrast(!highContrast)}
          title="Toggle High Contrast Mode (WCAG 2.1 AAA)"
          aria-pressed={highContrast}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8v16z"/>
          </svg>
          <span>{highContrast ? 'Contrast: ON' : 'Contrast: OFF'}</span>
        </button>

        <button
          type="button"
          className={`dbim-a11y-btn ${focusOutline ? 'active' : ''}`}
          onClick={() => setFocusOutline(!focusOutline)}
          title="Toggle Visible Keyboard Focus Indicators"
          aria-pressed={focusOutline}
        >
          <span style={{ fontSize: '11px', fontWeight: 700 }}>[ ⌖ ]</span>
          <span>{focusOutline ? 'Focus Ring: ON' : 'Focus Ring: OFF'}</span>
        </button>
      </div>
    </div>
  );
}
