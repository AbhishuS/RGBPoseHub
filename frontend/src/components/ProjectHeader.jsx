import React from 'react';
import GlobalSearch from './GlobalSearch';
import AccessibilityToolbar from './AccessibilityToolbar';

const contributors = [
  'Abhishu Shaurya · 241IT003',
  'Hradayastha Thakran · 241IT034',
  'Lavish Temani · 241IT040',
];

export default function ProjectHeader() {
  return (
    <header className="project-banner" aria-label="Project header with brand, universal search, and accessibility toolbar">
      {/* Row 1: Brand & Guided By on the Left, Development Team on the Right */}
      <div className="project-banner-header-row">
        <div className="project-banner-identity">
          <div className="project-banner-mark" aria-hidden="true">RGB</div>
          <div className="project-banner-copy">
            <p className="project-banner-eyebrow">NITK Surathkal · IT303 Software Engineering</p>
            <h1>RGB PoseHub</h1>
            <p className="project-banner-guidance">Guided by <strong>Dr. Jaidhar C.D.</strong></p>
          </div>
        </div>

        <div className="project-banner-team">
          <span className="project-banner-team-label">Development Team:</span>
          <div className="project-banner-chips-wrap">
            {contributors.map((person) => (
              <span className="project-team-chip" key={person}>{person}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Search Bar on the Left, Accessibility & Contrast Controls on the Right */}
      <div className="project-banner-controls-row">
        <div className="project-banner-search-col">
          <GlobalSearch />
        </div>
        <div className="project-banner-a11y-col">
          <AccessibilityToolbar inline={true} />
        </div>
      </div>
    </header>
  );
}
