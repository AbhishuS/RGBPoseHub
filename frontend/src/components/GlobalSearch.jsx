import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

/**
 * DBIM Section 9: Search Facility
 * - 9.v Consistent Placement in Header
 * - 9.vi Diverse Content Handling (Pose, Forensics, Point Cloud, Dataset, Docs)
 * - 9.vii Handling Empty Queries & Suggestions
 * - 9.viii Autocomplete and Keyboard Navigation (Ctrl + K)
 */
const searchableItems = [
  {
    id: 'pose-track-a',
    title: 'Track A: EfficientPose Deep Learning Regression',
    category: 'Pose Estimation',
    description: 'Direct 6D pose regression ([Tx, Ty, Tz] translation & Euler/Quaternion rotation vectors)',
    route: '/analysis',
    actionText: 'Open in Image Analysis',
    badge: 'Track A',
  },
  {
    id: 'pose-track-b',
    title: 'Track B: Geometric PnP + RANSAC Solver',
    category: 'Pose Estimation',
    description: 'Perspective-n-Point solver with metric reprojection error & inlier evaluation',
    route: '/analysis',
    actionText: 'Open in Image Analysis',
    badge: 'Track B',
  },
  {
    id: 'pose-dual',
    title: 'Dual Agreement Metric (ΔT & ΔR)',
    category: 'Pose Estimation',
    description: 'Compare neural pose prediction with geometric correspondence solver in real-time',
    route: '/analysis',
    actionText: 'Inspect in Analysis',
    badge: 'Validation',
  },
  {
    id: 'point-cloud-3d',
    title: 'Interactive 3D Point Cloud (WebGL Three.js)',
    category: '3D Visualization',
    description: 'Reconstruct dense 3D point cloud directly from calibrated RGB-D camera matrix',
    route: '/analysis',
    actionText: 'View 3D Point Cloud',
    badge: 'Three.js',
  },
  {
    id: 'forensics-ela',
    title: 'Error Level Analysis (ELA) & JPEG Tampering',
    category: 'Sherloq Forensics',
    description: 'Detect digital forgery, re-compression artifacts, and spliced image boundaries',
    route: '/analysis',
    actionText: 'Run Forensics',
    badge: 'Forensics',
  },
  {
    id: 'forensics-depth',
    title: 'Metric Depth Validator (Uint16 vs 2D RGB)',
    category: 'Sherloq Forensics',
    description: 'Gatekeeper validation differentiating metric uint16 depth maps from standard 2D photos',
    route: '/analysis',
    actionText: 'Check Depth Map',
    badge: 'RGB-D',
  },
  {
    id: 'dataset-clubs',
    title: 'CLUBS Benchmark Dataset Explorer',
    category: 'Dataset',
    description: 'Explore 3D boxes, ground truth poses, and test object bounding instances',
    route: '/dataset',
    actionText: 'Open Dataset Hub',
    badge: 'Dataset',
  },
  {
    id: 'security-audit',
    title: 'Security Audit Trail & Session Logs',
    category: 'Security & Auth',
    description: 'Review immutable user activity logs, 2FA status, and session revocations',
    route: '/history',
    actionText: 'View Audit Logs',
    badge: 'Admin',
  },
  {
    id: 'user-profile',
    title: 'Researcher Profile & Two-Factor Authentication',
    category: 'User Account',
    description: 'Manage account security, TOTP QR setup, and forensic session history',
    route: '/profile',
    actionText: 'Open Profile',
    badge: '2FA',
  },
  {
    id: 'manual-dbim',
    title: 'Digital Brand Identity Manual (DBIM) & GIGW 3.0 Guidelines',
    category: 'Documentation',
    description: 'Compliance matrix, accessibility standards, colors, typography, and government guidelines',
    route: '/about',
    actionText: 'View Documentation',
    badge: 'DBIM',
  },
];

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Global hotkey: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredItems = query.trim() === ''
    ? searchableItems
    : searchableItems.filter((item) => {
        const text = `${item.title} ${item.category} ${item.description}`.toLowerCase();
        return text.includes(query.toLowerCase());
      });

  const handleSelect = (item) => {
    setIsOpen(false);
    navigate(item.route);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filteredItems.length || 1)) % (filteredItems.length || 1));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  return (
    <>
      {/* Header Search Trigger as per DBIM 5.4 / 9.v */}
      <div className="dbim-search-trigger" onClick={() => setIsOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="dbim-search-placeholder">Search pose estimation, forensics, datasets...</span>
        <kbd className="dbim-search-kbd">Ctrl K</kbd>
      </div>

      {/* Modal Overlay & Command Palette (Mounted directly to document.body via Portal) */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="dbim-search-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="dbim-search-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Universal Search & Navigation (DBIM Section 9)"
          >
            <div className="dbim-search-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#087fae" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="dbim-search-input"
                placeholder="Type keywords (e.g. pose, depth, ELA, 3D, audit)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className="dbim-search-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close search"
              >
                ✕
              </button>
            </div>

            <div className="dbim-search-results">
              {filteredItems.length === 0 ? (
                <div className="dbim-search-empty">
                  <p>No results found for <strong>"{query}"</strong></p>
                  <span className="dbim-search-suggestion-label">Suggested topics (DBIM Section 9.vii):</span>
                  <div className="dbim-search-chips">
                    <button type="button" onClick={() => setQuery('Pose')}>Pose</button>
                    <button type="button" onClick={() => setQuery('Forensics')}>Forensics</button>
                    <button type="button" onClick={() => setQuery('Point Cloud')}>3D Point Cloud</button>
                    <button type="button" onClick={() => setQuery('Dataset')}>Dataset</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="dbim-search-section-title">
                    {query.trim() === '' ? 'Quick Access & Workbench Capabilities' : `Results (${filteredItems.length})`}
                  </div>
                  {filteredItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`dbim-search-item ${idx === selectedIndex ? 'selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="dbim-search-item-info">
                        <div className="dbim-search-item-top">
                          <span className="dbim-search-item-title">{item.title}</span>
                          <span className="dbim-search-badge">{item.badge}</span>
                        </div>
                        <p className="dbim-search-item-desc">{item.description}</p>
                      </div>
                      <span className="dbim-search-action-btn">{item.actionText} →</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="dbim-search-footer">
              <span>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
              <span><kbd>Enter</kbd> to select</span>
              <span><kbd>Esc</kbd> to close</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
