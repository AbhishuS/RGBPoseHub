import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LiquidChrome from '../components/LiquidChrome';

const sampleImage = '/images/explore-blue-door.jpeg';

export default function AboutPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(sampleImage);
  const [filename, setFilename] = useState('explore-blue-door.jpeg');
  const [imageError, setImageError] = useState('');
  const [demoStatus, setDemoStatus] = useState('complete');
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Choose a JPG, PNG, or other image file to preview.');
      return;
    }
    setImageError('');
    setPreview((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setFilename(file.name);
    setDemoStatus('ready');
    event.target.value = '';
  };

  const runDemoEstimate = () => {
    setDemoLoading(true);
    setDemoStatus('running');
    window.setTimeout(() => {
      setDemoLoading(false);
      setDemoStatus('complete');
    }, 850);
  };

  return (
    <main className="explore-page" style={{ position: 'relative', background: 'transparent' }}>
      <LiquidChrome />
      <header className="explore-topbar">
        <button className="explore-back" onClick={() => navigate('/')}>← <span>RGB PoseHub</span></button>
        <span className="explore-top-note">IMAGE ANALYSIS · POSE ESTIMATION</span>
      </header>

      <section className="explore-hero">
        <div className="explore-kicker"><span /> THE WORKBENCH, PREVIEWED</div>
        <h1>Explore image<br /><span>analysis.</span></h1>
        <p>Inspect image integrity, understand RGB-D depth, and see how pose estimation locates an object in 3D space.</p>
      </section>

      <section className="explore-demo" aria-label="Sample image analysis preview">
        <div className="explore-demo-heading">
          <div>
            <span className="explore-overline">LIVE WORKFLOW PREVIEW</span>
            <h2>Image Analysis</h2>
            <p>One image. A closer look at every detail.</p>
          </div>
          <div className="explore-tabs"><span className="active">Upload Image / RGB-D</span><span>CLUBS Catalog</span></div>
        </div>

        <nav className="explore-category-tabs" aria-label="Analysis tools">
          <span className="active">Depth Map Heatmap</span><span>General &amp; Hashes</span><span>EXIF &amp; GPS</span>
          <span>Enhancing Magnifier</span><span>Colors &amp; PCA</span><span>Detail &amp; Filters</span>
          <span>Noise &amp; Bit Planes</span><span>JPEG Analysis</span>
        </nav>

        <div className="explore-workspace">
          <div className="explore-preview-column">
            <div className="explore-image-frame">
              <img src={preview} alt="Weathered blue door set into a yellow exterior wall" />
              {demoStatus === 'complete' && <div className="explore-detection-box"><span>DOOR · 96.8%</span></div>}
              <div className="explore-image-stamp"><span /> RGB IMAGE</div>
            </div>
            <div className="explore-file-row">
              <span className="explore-file-name" title={filename}>{filename}</span>
              <button onClick={() => fileInputRef.current?.click()}>Choose image</button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageSelect} />
            </div>
            <button className="explore-run-demo" onClick={runDemoEstimate} disabled={demoLoading}>
              {demoLoading ? 'Running demo preview…' : 'Run demo pose estimate'} <span>↗</span>
            </button>
            {imageError && <p className="explore-error" role="alert">{imageError}</p>}
            <p className="explore-local-note">Your selection is previewed in this browser. Sign in to run the real analysis.</p>
          </div>

          <div className="explore-results">
            <div className="explore-result-heading">
              <div><span className="explore-overline">PART 1 · IMAGE FORENSIC WORKBENCH</span><h3>Analysis results</h3></div>
              <span className="explore-demo-badge">{demoStatus === 'complete' ? 'DEMO' : 'READY'}</span>
            </div>
            <div className="explore-result-group">
              <span className="explore-result-label">IMAGE FORENSICS</span>
              <div className="explore-result-row"><span>Metadata</span><strong className="status-neutral">Image loaded</strong></div>
              <div className="explore-result-row"><span>Image integrity</span><strong className="status-blue">Ready to inspect</strong></div>
              <div className="explore-result-row"><span>Depth map</span><strong className="status-red">RGB only</strong></div>
            </div>
            {demoStatus === 'complete' ? <div className="explore-result-group pose-sample">
              <span className="explore-result-label">PART 2 · POSE ESTIMATION · EXAMPLE</span>
              <div className="explore-object-result"><span className="explore-object-icon">3D</span><div><strong>Door detected</strong><small>Bounding box · illustrative confidence</small></div></div>
              <div className="explore-pose-values"><div><small>YAW</small><strong>1°</strong></div><div><small>PITCH</small><strong>0°</strong></div><div><small>ROLL</small><strong>−2°</strong></div></div>
              <div className="explore-track-samples"><span><b>TRACK A</b> EfficientPose</span><span><b>TRACK B</b> Geometric PnP</span></div>
            </div> : <div className="explore-pose-empty">{demoLoading ? 'Preparing the illustrated pose output…' : 'Choose an image, then run the demo estimate to preview this step.'}</div>}
            <p className="explore-demo-disclaimer">Illustrative demo values only. To run the actual forensics and RGB-D pose models, sign in and use the authenticated analysis workbench.</p>
          </div>
        </div>

        <div className="explore-demo-footer">
          <span><b>01</b> Upload an image</span><i />
          <span><b>02</b> Inspect image signals</span><i />
          <span><b>03</b> Estimate pose</span>
          <button onClick={() => navigate('/login')}>Sign in to analyze images <span>↗</span></button>
        </div>
      </section>

      <footer className="explore-footer">
        <span>RGB POSEHUB <span>·</span> COMPUTER VISION, MADE CLEAR</span>
        <span>Contact: <a href="mailto:indianthakran@gmail.com" style={{ color: '#0284c7' }}>indianthakran@gmail.com</a></span>
      </footer>
    </main>
  );
}
