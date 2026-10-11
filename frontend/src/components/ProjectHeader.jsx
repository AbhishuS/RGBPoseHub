import React from 'react';
import { useLocation } from 'react-router-dom';

const contributors = [
  'Abhishu Shaurya · 241IT003',
  'Hradayastha Thakran · 241IT034',
  'Lavish Temani · 241IT040',
];

export default function ProjectHeader() {
  const { pathname } = useLocation();
  return (
    <header className={`project-banner${pathname === '/history' ? ' project-banner-history' : ''}`} aria-label="Project information">
      <div className="project-banner-mark" aria-hidden="true">RGB</div>
      <div className="project-banner-copy">
        <p className="project-banner-eyebrow">Software Engineering · Course Project</p>
        <h1>RGB PoseHub</h1>
        <p className="project-banner-guidance">Guided by <strong>Dr. Jaidhar C.D.</strong></p>
      </div>
      <div className="project-banner-team">
        <span className="project-banner-team-label">Done by</span>
        <div>{contributors.map((person) => <span className="project-team-chip" key={person}>{person}</span>)}</div>
      </div>
    </header>
  );
}
