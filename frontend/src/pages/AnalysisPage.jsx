import { useState, useRef, useEffect } from 'react';
import { dataAPI, mlAPI } from '../services/api';
import PointCloudViewer3D from '../components/PointCloudViewer3D';

export default function AnalysisPage() {
  const [tab, setTab] = useState('upload'); // upload | catalog
  const [sherloqCategory, setSherloqCategory] = useState('gatekeeper');
  // gatekeeper | general | metadata | inspection | colors | detail | noise | jpeg

  // Inspection Tool Controls
  const [activeBitPlane, setActiveBitPlane] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [magnifierPos, setMagnifierPos] = useState({ x: 50, y: 50, show: false });

  // State
  const [dragover, setDragover] = useState(false);
  const [preview, setPreview] = useState(null);
  const [depthPreview, setDepthPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDepthFile, setSelectedDepthFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [poseLoading, setPoseLoading] = useState(false);
  const [error, setError] = useState('');
  const [poseTrackTab, setPoseTrackTab] = useState('dual'); // dual | track_a | track_b
  const poseResultsRef = useRef(null);

  // Sample RGB-D State
  const [samples, setSamples] = useState([]);
  const [samplesLoading, setSamplesLoading] = useState(false);

  const [forensics, setForensics] = useState(null);
  const [poseResults, setPoseResults] = useState(null);
  const [currentFilename, setCurrentFilename] = useState(null);
  const [originalFilename, setOriginalFilename] = useState(null);
  const [currentDepthFilename, setCurrentDepthFilename] = useState(null);
  const [currentImageFormat, setCurrentImageFormat] = useState(null);

  // Multi-Object Pinpointing & Candidate State
  const [candidateObjects, setCandidateObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [clickTarget, setClickTarget] = useState(null);

  // Catalog State
  const [objects, setObjects] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const fileInputRef = useRef(null);
  const depthInputRef = useRef(null);

  useEffect(() => {
    loadSamples();
    if (tab === 'catalog') loadCatalog();
  }, [tab]);

  const loadSamples = async () => {
    setSamplesLoading(true);
    try {
      const res = await mlAPI.getSampleRGBDImages();
      setSamples(res.data.samples || []);
    } catch {
      setSamples([]);
    } finally {
      setSamplesLoading(false);
    }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const res = await dataAPI.listObjects();
      setObjects(res.data.objects || []);
    } catch {
      setObjects([]);
    } finally {
      setCatalogLoading(false);
    }
  };

  const isValidMediaFile = (file) => {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    const validExts = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf', '.tiff', '.tif', '.webp', '.bmp'];
    const hasValidExt = validExts.some((ext) => name.endsWith(ext));
    const hasValidType = type.startsWith('image/') || type === 'application/pdf' || type.includes('heic') || type.includes('heif');
    return hasValidExt || hasValidType;
  };

  const handleSelectFile = (file) => {
    if (!isValidMediaFile(file)) {
      setError('Please select a valid image or PDF file (JPG, PNG, HEIC, PDF, TIFF)');
      return;
    }
    setError('');
    setSelectedFile(file);
    setSelectedDepthFile(null);
    setDepthPreview(null);
    const name = (file.name || '').toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';

    if (isPdf) {
      setPreview('pdf-document');
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSelectDepthFile = (file) => {
    if (!file) return;
    const name = (file?.name || '').toLowerCase();
    const type = (file?.type || '').toLowerCase();
    const validExts = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.npy', '.pdf'];
    const hasValidExt = validExts.some((ext) => name.endsWith(ext));
    const hasValidType = type.startsWith('image/') || type === 'application/pdf' || type === '';
    if (!hasValidExt && !hasValidType) {
      setError('Please select a valid depth map file (JPG, JPEG, PNG, TIFF).');
      return;
    }
    setError('');
    setSelectedDepthFile(file);
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
    if (isPdf) {
      setDepthPreview('pdf-document');
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setDepthPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleForensicAnalysis = async (file, depthFile = null) => {
    const imageFile = file || selectedFile;
    const depth = depthFile || selectedDepthFile;
    if (!isValidMediaFile(imageFile)) {
      setError('Please select a valid image or PDF file (JPG, PNG, HEIC, PDF)');
      return;
    }
    setError('');
    setForensics(null);
    setPoseResults(null);

    const isPdf = (imageFile.name || '').toLowerCase().endsWith('.pdf') || imageFile.type === 'application/pdf';
    if (!preview) {
      if (isPdf) {
        setPreview('pdf-document');
      } else {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(imageFile);
      }
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      if (depth) formData.append('depth_image', depth);

      const res = await mlAPI.forensicAnalyze(formData);
      setForensics(res.data.forensics);
      setCurrentFilename(res.data.filename);
      setOriginalFilename(res.data.original_filename || imageFile.name);
      setCurrentImageFormat(res.data.image_format || null);
      setCurrentDepthFilename(res.data.depth_filename || null);
      const objs = res.data.candidate_objects || [];
      setCandidateObjects(objs);
      if (objs.length > 0) {
        setSelectedObject(objs[0]);
      } else {
        setSelectedObject(null);
      }
      setClickTarget(null);
      if (res.data.original_image) {
        const mime = res.data.image_mime || 'image/jpeg';
        setPreview(`data:${mime};base64,${res.data.original_image}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Forensic analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const analyzeFilename = async (filename) => {
    setLoading(true);
    setError('');
    setForensics(null);
    setPoseResults(null);
    setCurrentDepthFilename(null);
    setTab('upload');
    try {
      const res = await mlAPI.forensicAnalyzeJson({ filename });
      setForensics(res.data.forensics);
      setCurrentFilename(filename);
      setOriginalFilename(res.data.original_filename || filename);
      setCurrentImageFormat(res.data.image_format || null);
      setCurrentDepthFilename(res.data.depth_filename || null);
      const objs = res.data.candidate_objects || [];
      setCandidateObjects(objs);
      if (objs.length > 0) {
        setSelectedObject(objs[0]);
      } else {
        setSelectedObject(null);
      }
      setClickTarget(null);
      if (res.data.original_image) {
        const mime = res.data.image_mime || 'image/png';
        setPreview(`data:${mime};base64,${res.data.original_image}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (e) => {
    if (!preview) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x_norm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y_norm = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Check if clicked inside any candidate object bounding box
    const hitObj = candidateObjects.find((obj) => {
      if (!obj.bbox_norm) return false;
      const [x1, y1, x2, y2] = obj.bbox_norm;
      return x_norm >= x1 && x_norm <= x2 && y_norm >= y1 && y_norm <= y2;
    });

    if (hitObj) {
      setSelectedObject(hitObj);
      setClickTarget(null);
      if (poseResults) {
        runPoseForTarget(hitObj, null);
      }
    } else {
      const newTarget = {
        x_norm,
        y_norm,
        px_x: Math.round(x_norm * 480),
        px_y: Math.round(y_norm * 360),
      };
      setClickTarget(newTarget);
      const customObj = {
        id: 'custom_pinpoint',
        label: `Pinpointed Target @ (${newTarget.px_x}, ${newTarget.px_y})`,
        center_norm: { x: x_norm, y: y_norm },
        depth_m: 'Auto',
        color: '#ec4899',
      };
      setSelectedObject(customObj);
      if (poseResults) {
        runPoseForTarget(customObj, newTarget);
      }
    }
  };

  const runPoseForTarget = async (obj = selectedObject, targetPoint = clickTarget) => {
    if (!currentFilename) return;
    // Allow pose with either verified RGB-D or depth preview (user uploaded a depth map)
    const gk = forensics?.rgbd_gatekeeper;
    if (!gk?.is_rgbd && !gk?.has_depth_preview && !currentDepthFilename) return;

    setPoseLoading(true);
    setError('');
    try {
      const res = await mlAPI.estimatePose({
        filename: currentFilename,
        depth_filename: currentDepthFilename,
        depth_stats: forensics?.rgbd_gatekeeper?.depth_stats,
        track: 'both',
        target_point: targetPoint || (obj?.center_norm ? { x_norm: obj.center_norm.x, y_norm: obj.center_norm.y } : undefined),
        bounding_box: obj?.bbox,
        selected_object_name: obj?.label,
      });
      setPoseResults(res.data.pose_result);
      if (res.data.pose_result?.candidate_objects?.length > 0) {
        setCandidateObjects(res.data.pose_result.candidate_objects);
      }
      setPoseTrackTab('dual');
      // Scroll pose results into view
      setTimeout(() => poseResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      const poseResult = err.response?.data?.pose_result;
      if (poseResult) {
        setPoseResults(poseResult);
        if (poseResult.candidate_objects?.length > 0) {
          setCandidateObjects(poseResult.candidate_objects);
        }
        setPoseTrackTab('dual');
        setTimeout(() => poseResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
      const trackReasons = [
        poseResult?.track_a?.error && `Track A: ${poseResult.track_a.error}`,
        poseResult?.track_b?.error && `Track B: ${poseResult.track_b.error}`,
      ].filter(Boolean);
      const explanation = trackReasons.length ? ` ${trackReasons.join(' ')}` : '';
      setError(`${err.response?.data?.error || 'Pose estimation failed'}${explanation}`);
    } finally {
      setPoseLoading(false);
    }
  };

  const proceedToPoseEstimation = () => {
    runPoseForTarget(selectedObject, clickTarget);
  };

  const resetAnalysis = () => {
    setForensics(null);
    setPoseResults(null);
    setPreview(null);
    setDepthPreview(null);
    setSelectedFile(null);
    setSelectedDepthFile(null);
    setCurrentFilename(null);
    setCurrentDepthFilename(null);
    setCandidateObjects([]);
    setSelectedObject(null);
    setClickTarget(null);
    setError('');
  };

  const handleExportCSV = () => {
    if (!forensics) return;
    const rows = [
      ['RGB-Pose Hub Forensic & 6D Pose Inspection Report'],
      ['Generated At', new Date().toISOString()],
      ['Image Filename', originalFilename || 'N/A'],
      ['Detected Format', currentImageFormat || forensics.metadata?.format || 'N/A'],
      ['Dimensions', forensics.metadata?.dimensions || 'N/A'],
      ['Megapixels', forensics.metadata?.megapixels || 'N/A'],
      ['File Size', forensics.metadata?.file_size_formatted || 'N/A'],
      ['Color Mode', forensics.metadata?.color_mode || 'N/A'],
      ['Bit Depth', forensics.metadata?.bit_depth || 'N/A'],
      ['SHA-256 Digest', forensics.metadata?.sha256_hash || 'N/A'],
      [],
      ['--- RGB-D Gatekeeper & Depth Metrics ---'],
      ['Is Metric RGB-D', gatekeeper?.is_rgbd ? 'Yes' : 'No'],
      ['Gatekeeper Status', gatekeeper?.status || 'N/A'],
      ['Gatekeeper Reason', `"${(gatekeeper?.reason || '').replace(/"/g, '""')}"`],
      ['Depth Coverage (%)', gatekeeper?.depth_stats?.coverage_pct ?? 'N/A'],
      ['Min Depth (m)', gatekeeper?.depth_stats?.min_depth ?? 'N/A'],
      ['Mean Depth (m)', gatekeeper?.depth_stats?.mean_depth ?? 'N/A'],
      ['Max Depth (m)', gatekeeper?.depth_stats?.max_depth ?? 'N/A'],
      [],
      ['--- Forensics Tampering Assessment ---'],
      ['Tampering Assessment', forensics.jpeg_info?.tampering_assessment || 'N/A'],
      ['JPEG Quality', forensics.jpeg_info?.estimated_quality ?? 'N/A'],
      ['JPEG Compression Type', forensics.jpeg_info?.compression_type || 'N/A'],
      ['ELA Max Difference', forensics.tamper_assessment?.ela_max_diff ?? 'N/A'],
      ['ELA Anomaly Score', forensics.tamper_assessment?.ela_anomaly_score ?? 'N/A'],
      ['Clone Detection Result', forensics.tamper_assessment?.clone_verdict || 'N/A'],
      [],
      ['--- Detected Candidate Objects ---'],
      ['Object ID', 'Label', 'Confidence/Depth', 'Bounding Box (x1,y1,x2,y2)'],
      ...(candidateObjects.length ? candidateObjects.map((o, idx) => [
        o.id || `obj_${idx + 1}`,
        `"${(o.label || '').replace(/"/g, '""')}"`,
        `${o.depth_m || 'N/A'} m`,
        o.bbox_norm ? `"[${o.bbox_norm.map(n => n.toFixed(3)).join(', ')}]"` : 'N/A'
      ]) : [['None detected']]),
      [],
      ['--- 6D Pose Estimation Results ---'],
      ['Selected Object', selectedObject?.label || (clickTarget ? `Pinpoint (${clickTarget.px_x}, ${clickTarget.px_y})` : 'None')],
      ['Solver Track', poseResults ? (poseTrackTab === 'dual' ? 'Dual Comparison' : poseTrackTab) : 'Not executed'],
      ['Track A Object', poseResults?.track_a?.object_name || 'N/A'],
      ['Track A Classification Confidence (%)', poseResults?.track_a?.classification_confidence_pct ?? 'N/A'],
      ['Track A Translation Vector (m)', `"${poseResults?.track_a?.translation_vector_m?.formatted || 'N/A'}"`],
      ['Track A Euler Rotation (deg)', `"${poseResults?.track_a?.rotation_euler_deg?.formatted || 'N/A'}"`],
      ['Track A Quaternion', `"${poseResults?.track_a?.rotation_quaternion?.formatted || 'N/A'}"`],
      ['Track A 3D Box (L x W x H m)', poseResults?.track_a?.bounding_box_3d ? `${poseResults.track_a.bounding_box_3d.length_m} x ${poseResults.track_a.bounding_box_3d.width_m} x ${poseResults.track_a.bounding_box_3d.height_m}` : 'N/A'],
      ['Track B Solver', poseResults?.track_b?.solver || 'N/A'],
      ['Track B Inlier Ratio (%)', poseResults?.track_b?.pnp_metrics?.inlier_ratio_pct ?? 'N/A'],
      ['Track B Reprojection Error (px)', poseResults?.track_b?.pnp_metrics?.mean_reprojection_error_px ?? 'N/A'],
      ['Track B Translation Vector (m)', `"${poseResults?.track_b?.translation_vector_m?.formatted || 'N/A'}"`],
    ];

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RGBPoseHub_Report_${(originalFilename || 'analysis').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!forensics) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate the PDF report.');
      return;
    }

    const title = 'RGB-Pose Hub Forensic & 6D Pose Report';
    const reportHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.4; margin: 0; padding: 20px; font-size: 11pt; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 18pt; color: #0f172a; }
    .header .meta { font-size: 9pt; color: #64748b; text-align: right; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 8pt; text-transform: uppercase; }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-info { background: #e0f2fe; color: #0369a1; }
    .section-title { font-size: 12pt; font-weight: bold; margin: 18px 0 8px; color: #0369a1; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; color: #334155; }
    .grid-2 { display: flex; gap: 14px; margin-bottom: 14px; }
    .grid-2 > div { flex: 1; }
    .image-preview { width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; background: #000; display: block; }
    .footer { margin-top: 25px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>RGB-Pose Hub Forensic & 6D Pose Report</h1>
      <div style="font-size: 9.5pt; color: #475569; margin-top: 3px;">
        File: <strong>${originalFilename || 'Analysis Sample'}</strong> &bull; Detected Format: <strong>${currentImageFormat || forensics.metadata?.format || 'Unknown'}</strong>
      </div>
    </div>
    <div class="meta">
      <div>Report ID: #${Math.random().toString(36).substring(2, 9).toUpperCase()}</div>
      <div>Date: ${new Date().toLocaleString()}</div>
      <div style="margin-top: 4px;"><span class="badge ${gatekeeper?.is_rgbd ? 'badge-success' : 'badge-warning'}">${gatekeeper?.is_rgbd ? 'VERIFIED RGB-D' : 'STANDARD 2D / HEATMAP'}</span></div>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <div style="font-weight: 600; font-size: 9pt; margin-bottom: 4px;">Original RGB Input</div>
      ${preview ? `<img class="image-preview" src="${preview}" alt="RGB Preview" />` : '<div style="height:120px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#64748b;">No Image</div>'}
    </div>
    <div>
      <div style="font-weight: 600; font-size: 9pt; margin-bottom: 4px;">Depth Map Heatmap</div>
      ${gatekeeper?.depth_heatmap ? `<img class="image-preview" src="data:image/png;base64,${gatekeeper.depth_heatmap}" alt="Depth Heatmap" />` : '<div style="height:120px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#64748b;">Depth Heatmap Unavailable</div>'}
    </div>
  </div>

  <div class="section-title">1. File Digest & Integrity Verification</div>
  <table>
    <tr><th style="width:25%">Dimensions</th><td>${forensics.metadata?.dimensions || 'N/A'} (${forensics.metadata?.megapixels || 'N/A'} MP)</td><th style="width:25%">Color Profile</th><td>${forensics.metadata?.color_mode || 'N/A'} (${forensics.metadata?.channels || 'N/A'} channels, ${forensics.metadata?.bit_depth || 'N/A'} bit)</td></tr>
    <tr><th>File Size</th><td>${forensics.metadata?.file_size_formatted || 'N/A'}</td><th>Tamper Verdict</th><td><span class="badge badge-info">${forensics.jpeg_info?.tampering_assessment || 'N/A'}</span></td></tr>
    <tr><th>SHA-256 Digest</th><td colspan="3" style="font-family: monospace; font-size: 8pt; word-break: break-all;">${forensics.metadata?.sha256_hash || 'N/A'}</td></tr>
    <tr><th>Depth Gatekeeper</th><td colspan="3">${gatekeeper?.reason || 'N/A'} ${gatekeeper?.depth_stats ? `(Range: ${gatekeeper.depth_stats.min_depth}m - ${gatekeeper.depth_stats.max_depth}m, Mean: ${gatekeeper.depth_stats.mean_depth}m, Coverage: ${gatekeeper.depth_stats.coverage_pct}%)` : ''}</td></tr>
  </table>

  ${candidateObjects.length ? `
  <div class="section-title">2. Detected Candidate Objects (${candidateObjects.length})</div>
  <table>
    <thead><tr><th>#</th><th>Object Label</th><th>Est. Depth</th><th>Normalized Bounding Box</th></tr></thead>
    <tbody>
      ${candidateObjects.map((obj, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${obj.label || 'Target'}</strong></td>
          <td>${obj.depth_m || 'N/A'} m</td>
          <td style="font-family:monospace;font-size:8.5pt;">${obj.bbox_norm ? `[${obj.bbox_norm.map(n => n.toFixed(3)).join(', ')}]` : 'N/A'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  ${poseResults ? `
  <div class="section-title">3. 6D Spatial Pose Estimation Workbench Results</div>
  <table>
    <tr><th style="width:25%">Target Object</th><td><strong>${poseResults.object_name || selectedObject?.label || 'Selected Object'}</strong></td><th style="width:25%">Dual Agreement</th><td>${poseResults.comparison?.agreement_status || 'N/A'} (Delta T: ${poseResults.comparison?.translation_delta_m != null ? (poseResults.comparison.translation_delta_m * 100).toFixed(1) + ' cm' : 'N/A'}, Delta R: ${poseResults.comparison?.rotation_delta_deg != null ? poseResults.comparison.rotation_delta_deg + '°' : 'N/A'})</td></tr>
    <tr><th>Track A (EfficientPose)</th><td>Translation: <code>${poseResults.track_a?.translation_vector_m?.formatted || 'N/A'}</code><br/>Rotation: <code>${poseResults.track_a?.rotation_euler_deg?.formatted || 'N/A'}</code></td><th>Track A Box (L x W x H)</th><td>${poseResults.track_a?.bounding_box_3d ? `${poseResults.track_a.bounding_box_3d.length_m}m × ${poseResults.track_a.bounding_box_3d.width_m}m × ${poseResults.track_a.bounding_box_3d.height_m}m (${poseResults.track_a.bounding_box_3d.volume_cm3} cm³)` : 'N/A'}</td></tr>
    <tr><th>Track B (PnP / Depth)</th><td colspan="3">Translation: <code>${poseResults.track_b?.translation_vector_m?.formatted || 'N/A'}</code> &bull; Reprojection Error: ${poseResults.track_b?.pnp_metrics?.mean_reprojection_error_px ?? 'N/A'} px &bull; Inliers: ${poseResults.track_b?.pnp_metrics?.inlier_count ?? 'N/A'}/${poseResults.track_b?.pnp_metrics?.total_correspondences ?? 'N/A'} (${poseResults.track_b?.pnp_metrics?.inlier_ratio_pct ?? 'N/A'}%)</td></tr>
  </table>
  ` : ''}

  <div class="footer">
    <span>RGB-Pose Hub &bull; 6D Object Pose Estimation & Image Forensics Platform</span>
    <span>Generated by RGBPoseHub Client &bull; Page 1 of 1</span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>
    `;
    printWindow.document.open();
    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  const gatekeeper = forensics?.rgbd_gatekeeper;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Sherloq Image Forensics & 6D Pose Estimation Hub</h2>
        <p>Multi-category forensic inspection workbench with heatmaps, bit-planes, EXIF, and RGB-D 6D pose estimation</p>
      </div>

      <div className="page-body">
        {/* Main Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            className={`btn ${tab === 'upload' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setTab('upload')}
          >
            📤 Upload Image / RGB-D
          </button>
          <button
            className={`btn ${tab === 'catalog' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setTab('catalog')}
          >
            🗂️ CLUBS Catalog
          </button>
        </div>

        {error && <div className="alert alert-error">⚠ {error}</div>}

        {/* Upload Tab */}
        {tab === 'upload' && (
          <>
            {!forensics && !loading && (
              <>
                {/* Two-Panel Upload: RGB Image + Depth Map — always side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Panel 1: Main RGB/RGBD Image */}
                  <div
                    className={`upload-zone ${dragover ? 'dragover' : ''}`}
                    style={{ minHeight: '220px', position: 'relative' }}
                    onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
                    onDragLeave={() => setDragover(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragover(false);
                      if (e.dataTransfer.files[0]) handleSelectFile(e.dataTransfer.files[0]);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {preview ? (
                      <div style={{ textAlign: 'center' }}>
                        {preview === 'pdf-document' ? (
                          <div style={{ padding: '0.8rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid #ef4444', display: 'inline-block', marginBottom: '0.5rem' }}>
                            <div style={{ fontSize: '2.5rem' }}>📄</div>
                            <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>PDF Document (RGB Imagery)</span>
                          </div>
                        ) : (
                          <img src={preview} alt="Selected" style={{ maxHeight: '140px', borderRadius: '8px', marginBottom: '0.5rem' }} />
                        )}
                        <p style={{ fontSize: '0.85rem', color: '#10b981', margin: 0 }}>✓ {selectedFile?.name}</p>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon">🖼️</div>
                        <p><strong>Drop your RGB image or PDF here</strong> or click to browse</p>
                        <p className="upload-hint">Color photo: JPG, PNG, TIFF, <strong>HEIC</strong> &amp; <strong>PDF</strong> • Max 20 MB</p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.heic,.heif,.pdf,application/pdf"
                      hidden
                      onChange={(e) => {
                        if (e.target.files[0]) handleSelectFile(e.target.files[0]);
                        e.target.value = '';
                      }}
                    />
                  </div>

                  {/* Panel 2: Depth Map — always visible */}
                  <div
                    className="upload-zone"
                    style={{
                      minHeight: '220px',
                      borderStyle: 'dashed',
                      borderColor: selectedDepthFile ? '#10b981' : 'var(--border)',
                      background: selectedDepthFile ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                    }}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files[0]) handleSelectDepthFile(e.dataTransfer.files[0]);
                    }}
                    onClick={() => depthInputRef.current?.click()}
                  >
                    {selectedDepthFile ? (
                      <div style={{ textAlign: 'center' }}>
                        {depthPreview === 'pdf-document' ? (
                          <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', border: '1px solid #3b82f6', display: 'inline-block', marginBottom: '0.5rem' }}>
                            <div style={{ fontSize: '2rem' }}>📄</div>
                            <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>PDF Depth Map</span>
                          </div>
                        ) : depthPreview ? (
                          <img src={depthPreview} alt="Depth" style={{ maxHeight: '120px', borderRadius: '8px', marginBottom: '0.5rem', filter: 'grayscale(1) contrast(1.5)' }} />
                        ) : null}
                        <p style={{ fontSize: '0.85rem', color: '#10b981', margin: 0 }}>✓ Depth: {selectedDepthFile.name}</p>
                        <button
                          className="btn btn-sm" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#ef4444' }}
                          onClick={(e) => { e.stopPropagation(); setSelectedDepthFile(null); setDepthPreview(null); }}
                        >✕ Remove</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.6 }}>📏</div>
                        <p style={{ margin: '0 0 0.35rem' }}><strong>Drop depth map here</strong> (optional)</p>
                        <p className="upload-hint">Depth map: JPG, PNG, or uint16 TIFF (0.3m – 3.0m metric)</p>
                      </>
                    )}
                    <input
                      ref={depthInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.tif,.tiff,image/png,image/jpeg,image/tiff"
                      hidden
                      onChange={(e) => {
                        if (e.target.files[0]) handleSelectDepthFile(e.target.files[0]);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '1rem', padding: '1rem', background: 'var(--code-bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  {!selectedFile && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: 'auto' }}>
                      ⬆ Upload an RGB image on the left to begin. Depth map (right) is optional.
                    </span>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => handleForensicAnalysis()}
                    disabled={!selectedFile}
                    style={{ opacity: selectedFile ? 1 : 0.45, cursor: selectedFile ? 'pointer' : 'not-allowed' }}
                  >
                    🔬 Run Forensic Analysis{selectedDepthFile ? ' + Depth' : ''}
                  </button>
                </div>

                {/* Quick Educational Guide: What is Depth Map? */}
                <div style={{ marginTop: '1rem', padding: '1rem 1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>💡</span>
                    <strong style={{ fontSize: '0.88rem', color: '#60a5fa' }}>What is a Depth Map & How to provide it?</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                      <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '0.2rem' }}>1. What is Depth (Z)?</strong>
                      Standard photos only have 2D color (X, Y). A Depth Map assigns the real-world distance (e.g. 1.2 meters) to each pixel so 3D spatial pose can be calculated.
                    </div>
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                      <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '0.2rem' }}>2. From iPhone / RealSense</strong>
                      Shoot in Portrait mode on iPhone or use apps like <em>Record3D</em> / <em>Focos</em> to export the grayscale depth image, then drop it in the 2nd box.
                    </div>
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                      <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '0.2rem' }}>3. Standard 2D Photos (No Sensor)</strong>
                      A normal 2D photo has no measured distance data. It can be inspected as RGB, but 6D pose needs a separate uint16 PNG/TIFF depth map measured in millimeters.
                    </div>
                  </div>
                </div>

                {/* Sample RGB-D Test Images Section */}
                <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--code-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🧪</span> Try Sample RGB-D Images (1-Click Test)
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Click a sample to load its RGB image and paired uint16 depth map (millimeters) for the depth gatekeeper and pose flow:
                  </p>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {samples.map((s) => (
                      <button
                        key={s.filename}
                        className="btn btn-secondary btn-sm"
                        style={{ border: '1px solid #10b981', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}
                        onClick={() => analyzeFilename(s.filename)}
                      >
                        📷 {s.name} ({s.type})
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {loading && (
              <div className="loading-overlay">
                <div className="spinner" />
                <p>Running Sherloq Multi-Category Forensic Inspection & Depth Gatekeeper...</p>
              </div>
            )}

            {/* Forensics Analysis Workbench */}
            {forensics && (
              <div className="slide-up">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Part 1: Sherloq Multi-Category Forensic Workbench</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleExportCSV}
                      title="Download full forensic metrics & pose vectors as CSV"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      📊 Export CSV
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleExportPDF}
                      title="Generate and print/save formatted PDF laboratory report"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      📄 Download PDF Report
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={resetAnalysis}>
                      🔄 New Inspection
                    </button>
                  </div>
                </div>

                {/* Gatekeeper Banner */}
                <div
                  style={{
                    padding: '1.25rem',
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                    background: gatekeeper?.is_rgbd ? 'rgba(16, 185, 129, 0.12)' : gatekeeper?.has_depth_preview ? 'rgba(245, 158, 11, 0.10)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1.5px solid ${gatekeeper?.is_rgbd ? '#10b981' : gatekeeper?.has_depth_preview ? '#f59e0b' : '#ef4444'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: gatekeeper?.is_rgbd ? '#10b981' : gatekeeper?.has_depth_preview ? '#f59e0b' : '#ef4444' }}>
                          {gatekeeper?.is_rgbd ? '✅ VERIFIED RGB-D IMAGE' : gatekeeper?.has_depth_preview ? '⚠️ DEPTH CHANNEL PREVIEW (UNSCALED)' : '❌ NO METRIC DEPTH MAP'}
                        </span>
                        <span className="badge" style={{ background: gatekeeper?.is_rgbd ? '#10b98122' : '#ef444422', color: gatekeeper?.is_rgbd ? '#10b981' : '#ef4444' }}>
                          {gatekeeper?.status}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                        {gatekeeper?.reason}
                      </p>
                      {gatekeeper?.is_rgbd && gatekeeper?.depth_stats && (
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                          <span><strong>Coverage:</strong> {gatekeeper.depth_stats.coverage_pct}%</span>
                          <span><strong>Depth Range:</strong> {gatekeeper.depth_stats.min_depth}m – {gatekeeper.depth_stats.max_depth}m</span>
                          <span><strong>Mean Depth:</strong> {gatekeeper.depth_stats.mean_depth}m</span>
                        </div>
                      )}
                    </div>

                    <div>
                      {(gatekeeper?.is_rgbd || gatekeeper?.has_depth_preview || currentDepthFilename) ? (
                        <button className="btn btn-primary" onClick={proceedToPoseEstimation} disabled={poseLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{poseLoading ? '⏳ Computing 6D Pose...' : '🎯 Estimate 6D Pose'}</span>
                          {selectedObject && (
                            <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.2)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                              {selectedObject.label}
                            </span>
                          )}
                        </button>
                      ) : (
                        <div style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                            🚫 Pose Detection Blocked
                          </button>
                          <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                            Requires Depth Data
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sherloq Category Navigation Bar */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', paddingBottom: '0.5rem' }}>
                  <button className={`btn btn-sm ${sherloqCategory === 'gatekeeper' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('gatekeeper')}>
                    📏 Depth Map Heatmap
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'general' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('general')}>
                    🧰 General & Hashes
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'metadata' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('metadata')}>
                    📋 EXIF & GPS
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'inspection' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('inspection')}>
                    🔍 Enhancing Magnifier
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'colors' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('colors')}>
                    🎨 Colors & PCA
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'detail' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('detail')}>
                    🌊 Detail & Filters
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'noise' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('noise')}>
                    🧱 Noise & Bit Planes
                  </button>
                  <button className={`btn btn-sm ${sherloqCategory === 'jpeg' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSherloqCategory('jpeg')}>
                    🛡️ JPEG & Tampering
                  </button>
                </div>

                {/* Depth Heatmap Tab */}
                {/* Depth Heatmap & Interactive Object Pinpointer Tab */}
                {sherloqCategory === 'gatekeeper' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                      <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Original RGB Input <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>(Click Object to Pinpoint 🎯)</span>
                          </h4>
                          <span
                            className="badge badge-info"
                            style={{
                              fontSize: '0.75rem',
                              maxWidth: '280px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}
                            title={currentImageFormat ? `Uploaded: ${originalFilename} • Detected: ${currentImageFormat}` : 'Interactive Target Selector'}
                          >
                            {currentImageFormat ? `Uploaded: ${originalFilename} • Detected: ${currentImageFormat}` : 'Interactive Target Selector'}
                          </span>
                        </div>

                        {/* Interactive Image Container with Bounding Boxes and Reticle */}
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            cursor: 'crosshair',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}
                          onClick={handleImageClick}
                        >
                          <img src={preview} alt="RGB" style={{ width: '100%', display: 'block' }} />

                          {/* Candidate Object Overlays */}
                          {candidateObjects.map((obj) => {
                            if (!obj.bbox_norm) return null;
                            const [x1, y1, x2, y2] = obj.bbox_norm;
                            const isSelected = selectedObject?.id === obj.id;
                            return (
                              <div
                                key={obj.id}
                                style={{
                                  position: 'absolute',
                                  left: `${x1 * 100}%`,
                                  top: `${y1 * 100}%`,
                                  width: `${(x2 - x1) * 100}%`,
                                  height: `${(y2 - y1) * 100}%`,
                                  border: `2px ${isSelected ? 'solid' : 'dashed'} ${obj.color || '#38bdf8'}`,
                                  background: isSelected ? `${obj.color}22` : 'transparent',
                                  boxShadow: isSelected ? `0 0 15px ${obj.color}88` : 'none',
                                  pointerEvents: 'none',
                                  borderRadius: '6px',
                                  transition: 'all 0.2s',
                                }}
                              >
                                <span
                                  style={{
                                    position: 'absolute',
                                    top: '-24px',
                                    left: '0',
                                    background: obj.color || '#38bdf8',
                                    color: '#ffffff',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                                  }}
                                >
                                  {obj.label} ({obj.depth_m}m)
                                </span>
                              </div>
                            );
                          })}

                          {/* Pinpoint Reticle Crosshair */}
                          {(selectedObject?.center_norm || clickTarget) && (
                            <div
                              style={{
                                position: 'absolute',
                                left: `${(clickTarget?.x_norm ?? selectedObject?.center_norm?.x ?? 0.5) * 100}%`,
                                top: `${(clickTarget?.y_norm ?? selectedObject?.center_norm?.y ?? 0.5) * 100}%`,
                                transform: 'translate(-50%, -50%)',
                                pointerEvents: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div
                                style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '50%',
                                  border: '2px solid #ec4899',
                                  background: 'rgba(236, 72, 153, 0.25)',
                                  boxShadow: '0 0 20px #ec4899, inset 0 0 10px #ec4899',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1rem',
                                }}
                              >
                                🎯
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Interactive Target Object Chip Bar */}
                        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--code-bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#38bdf8' }}>
                              🎯 Target Object for 6D Pose Estimation:
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Click image or badge to select
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {candidateObjects.map((obj) => (
                              <button
                                key={obj.id}
                                onClick={() => {
                                  setSelectedObject(obj);
                                  setClickTarget(null);
                                  if (poseResults) runPoseForTarget(obj, null);
                                }}
                                style={{
                                  background: selectedObject?.id === obj.id ? obj.color : 'rgba(255,255,255,0.05)',
                                  color: selectedObject?.id === obj.id ? '#ffffff' : 'var(--text-secondary)',
                                  border: `1px solid ${obj.color || 'var(--border)'}`,
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontWeight: selectedObject?.id === obj.id ? 700 : 400,
                                  boxShadow: selectedObject?.id === obj.id ? `0 0 12px ${obj.color}66` : 'none',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                <span>🎯</span>
                                <span>{obj.label}</span>
                                <span style={{ opacity: 0.75, fontSize: '0.72rem' }}>({obj.depth_m}m)</span>
                              </button>
                            ))}

                            {clickTarget && (
                              <button
                                style={{
                                  background: '#ec4899',
                                  color: '#ffffff',
                                  border: '1px solid #ec4899',
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  boxShadow: '0 0 12px rgba(236, 72, 153, 0.4)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                <span>🎯</span>
                                <span>Custom Pinpoint ({Math.round(clickTarget.x_norm * 100)}%, {Math.round(clickTarget.y_norm * 100)}%)</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Depth Map Visualization (Inferno Heatmap)</h4>
                          <span className="badge" style={{ fontSize: '0.75rem' }}>{gatekeeper?.is_rgbd ? 'Metric depth (meters)' : 'Visualization only • scale unknown'}</span>
                        </div>
                        {gatekeeper?.depth_heatmap ? (
                          <div style={{ marginTop: '0.5rem' }}>
                            <img src={`data:image/png;base64,${gatekeeper.depth_heatmap}`} alt="Depth Heatmap" style={{ width: '100%', borderRadius: '8px' }} />
                            {gatekeeper?.is_rgbd && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}><span>{gatekeeper.depth_stats.min_depth} m</span><span>{gatekeeper.depth_stats.mean_depth} m mean</span><span>{gatekeeper.depth_stats.max_depth} m</span></div>}
                            {!gatekeeper?.is_rgbd && <p style={{ fontSize: '0.8rem', color: '#f59e0b' }}>This channel is shown for inspection only. Upload a uint16 depth map in millimeters to enable 6D pose.</p>}
                          </div>
                        ) : (
                          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <p style={{ fontSize: '2rem' }}>🚫</p>
                            <p>No depth map detected in standard 2D image.</p>
                            <p style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.5rem' }}>
                              💡 Click "Try Sample Verified RGB-D Images" above to test depth heatmaps!
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Category 1: General & Digest */}
                {sherloqCategory === 'general' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    <div className="card">
                      <h4>Physical File Digest</h4>
                      <table className="info-table" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.9rem' }}>
                        <tbody>
                          <tr><td><strong>Format</strong></td><td><span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', fontWeight: 600 }}>{forensics.metadata.format}</span></td></tr>
                          <tr><td><strong>Dimensions</strong></td><td>{forensics.metadata.dimensions}</td></tr>
                          <tr><td><strong>Megapixels</strong></td><td>{forensics.metadata.megapixels} MP</td></tr>
                          <tr><td><strong>Color Mode</strong></td><td>{forensics.metadata.color_mode}</td></tr>
                          <tr><td><strong>Channels</strong></td><td>{forensics.metadata.channels}</td></tr>
                          <tr><td><strong>Bit Depth</strong></td><td>{forensics.metadata.bit_depth}</td></tr>
                          <tr><td><strong>File Size</strong></td><td>{forensics.metadata.file_size_formatted}</td></tr>
                          {forensics.metadata.pdf_info && (
                            <tr><td><strong>PDF Pages</strong></td><td>{forensics.metadata.pdf_info.page_count}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="card">
                      <h4>Cryptographic & Perceptual Hashes</h4>
                      <div style={{ fontSize: '0.85rem' }}>
                        <p style={{ marginBottom: '0.3rem' }}><strong>MD5:</strong></p>
                        <code style={{ wordBreak: 'break-all', display: 'block', padding: '0.4rem', marginBottom: '0.6rem' }}>{forensics.hashes.md5}</code>
                        <p style={{ marginBottom: '0.3rem' }}><strong>SHA-1:</strong></p>
                        <code style={{ wordBreak: 'break-all', display: 'block', padding: '0.4rem', marginBottom: '0.6rem' }}>{forensics.hashes.sha1}</code>
                        <p style={{ marginBottom: '0.3rem' }}><strong>SHA-256:</strong></p>
                        <code style={{ wordBreak: 'break-all', display: 'block', padding: '0.4rem', marginBottom: '0.6rem' }}>{forensics.hashes.sha256}</code>
                        <p style={{ marginBottom: '0.3rem' }}><strong>Difference Hash (dHash):</strong></p>
                        <code style={{ wordBreak: 'break-all', display: 'block', padding: '0.4rem', color: '#10b981' }}>{forensics.hashes.dhash}</code>
                      </div>
                    </div>

                    <div className="card" style={{ gridColumn: '1 / -1' }}>
                      <h4>Raw Hex Byte Viewer (First 256 Bytes)</h4>
                      <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                        {forensics.hex_dump?.rows?.map((row, i) => (
                          <div key={i} style={{ display: 'flex', gap: '1.5rem' }}>
                            <span style={{ color: '#3b82f6' }}>{row.offset}</span>
                            <span style={{ color: '#f59e0b' }}>{row.hex}</span>
                            <span style={{ color: '#10b981' }}>{row.ascii}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Category 2: EXIF & Geolocation */}
                {sherloqCategory === 'metadata' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    <div className="card">
                      <h4>EXIF Full Metadata Scan ({forensics.exif.tags_count} tags)</h4>
                      <div style={{ maxHeight: '350px', overflowY: 'auto', background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                        {Object.entries(forensics.exif.data).map(([k, v]) => (
                          <div key={k} style={{ marginBottom: '0.4rem', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                            <strong style={{ color: '#3b82f6' }}>{k}:</strong> {String(v)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card">
                      <h4>GPS Geolocation Information</h4>
                      {forensics.exif.gps?.has_location ? (
                        <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid #10b981' }}>
                          <p style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#10b981' }}>📍 GPS Location Found</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Coordinates:</strong> {forensics.exif.gps.formatted}</p>
                          <a href={forensics.exif.gps.maps_link} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }}>
                            🌐 View on Google Maps
                          </a>
                        </div>
                      ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <p style={{ fontSize: '2rem' }}>🌐</p>
                          <p>No embedded GPS coordinates found in file header.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Category 3: Enhancing Magnifier */}
                {sherloqCategory === 'inspection' && (
                  <div className="card">
                    <h4>Interactive Enhancing Magnifier & Global Adjustments</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Hover over image to activate digital magnifying lens. Adjust brightness & contrast in real-time.
                    </p>

                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ fontSize: '0.85rem' }}>Brightness: {brightness}%</label>
                        <input type="range" min="50" max="200" value={brightness} onChange={(e) => setBrightness(e.target.value)} style={{ display: 'block' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem' }}>Contrast: {contrast}%</label>
                        <input type="range" min="50" max="200" value={contrast} onChange={(e) => setContrast(e.target.value)} style={{ display: 'block' }} />
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setBrightness(100); setContrast(100); }}>Reset Filters</button>
                    </div>

                    <div
                      style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', cursor: 'crosshair', display: 'inline-block' }}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        setMagnifierPos({ x, y, show: true });
                      }}
                      onMouseLeave={() => setMagnifierPos((prev) => ({ ...prev, show: false }))}
                    >
                      <img
                        src={preview}
                        alt="Magnifier Target"
                        style={{
                          maxWidth: '100%',
                          filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                          display: 'block',
                        }}
                      />
                      {magnifierPos.show && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${magnifierPos.x}%`,
                            top: `${magnifierPos.y}%`,
                            width: '140px',
                            height: '140px',
                            borderRadius: '50%',
                            border: '3px solid #10b981',
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                            backgroundImage: `url(${preview})`,
                            backgroundPosition: `${magnifierPos.x}% ${magnifierPos.y}%`,
                            backgroundSize: '300%',
                            boxShadow: '0 0 15px rgba(0,0,0,0.6)',
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Category 4: Colors & PCA */}
                {sherloqCategory === 'colors' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    <div className="card">
                      <h4>Color Space Conversions (HSV, YCbCr, Gray)</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                        <div>
                          <p style={{ fontSize: '0.8rem', textAlign: 'center', marginBottom: '0.25rem' }}>HSV Color Space</p>
                          {forensics.color_spaces?.hsv && <img src={`data:image/png;base64,${forensics.color_spaces.hsv}`} alt="HSV" style={{ width: '100%', borderRadius: '6px' }} />}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.8rem', textAlign: 'center', marginBottom: '0.25rem' }}>YCbCr Luminance/Chroma</p>
                          {forensics.color_spaces?.ycbcr && <img src={`data:image/png;base64,${forensics.color_spaces.ycbcr}`} alt="YCbCr" style={{ width: '100%', borderRadius: '6px' }} />}
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <h4>PCA Color Component Projection Heatmap</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Projects pixel colors onto 1st principal component to expose subtle color inconsistencies.
                      </p>
                      {forensics.pca_projection?.pca_heatmap && (
                        <img src={`data:image/png;base64,${forensics.pca_projection.pca_heatmap}`} alt="PCA Projection" style={{ width: '100%', borderRadius: '8px' }} />
                      )}
                      {forensics.pca_projection?.explained_variance_pct && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                          <strong>Explained Variance Ratio:</strong> PC1={forensics.pca_projection.explained_variance_pct[0]}% | PC2={forensics.pca_projection.explained_variance_pct[1]}%
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Category 5: Detail & Spatial Filters */}
                {sherloqCategory === 'detail' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                    <div className="card">
                      <h4>Echo Edge Filter (Derivative Sobel)</h4>
                      {forensics.detail_filters?.echo_edges && <img src={`data:image/png;base64,${forensics.detail_filters.echo_edges}`} alt="Echo Edges" style={{ width: '100%', borderRadius: '8px' }} />}
                    </div>

                    <div className="card">
                      <h4>Luminance Gradient Heatmap</h4>
                      {forensics.detail_filters?.luminance_gradient && <img src={`data:image/png;base64,${forensics.detail_filters.luminance_gradient}`} alt="Luminance Gradient" style={{ width: '100%', borderRadius: '8px' }} />}
                    </div>

                    <div className="card">
                      <h4>High-Frequency Split (Details)</h4>
                      {forensics.detail_filters?.high_frequency && <img src={`data:image/png;base64,${forensics.detail_filters.high_frequency}`} alt="High Frequency" style={{ width: '100%', borderRadius: '8px' }} />}
                    </div>
                  </div>
                )}

                {/* Category 6: Noise & Bit Planes */}
                {sherloqCategory === 'noise' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    <div className="card">
                      <h4>Interactive 8 Bit-Plane Slicer</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Select bit plane (Bit 0 LSB reveals hidden noise/steganography; Bit 7 MSB shows structural outline).
                      </p>
                      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => (
                          <button key={b} className={`btn btn-sm ${activeBitPlane === b ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveBitPlane(b)}>
                            Bit {b} {b === 0 ? '(LSB)' : b === 7 ? '(MSB)' : ''}
                          </button>
                        ))}
                      </div>
                      {forensics.bit_planes?.[`bit_${activeBitPlane}`] && (
                        <img src={`data:image/png;base64,${forensics.bit_planes[`bit_${activeBitPlane}`]}`} alt={`Bit ${activeBitPlane}`} style={{ width: '100%', borderRadius: '8px' }} />
                      )}
                    </div>

                    <div className="card">
                      <h4>Block Min/Max Deviation Noise Map</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Highlights local 8x8 block noise variance to pinpoint spliced regions.
                      </p>
                      {forensics.quality_analysis?.block_deviation_map && (
                        <img src={`data:image/png;base64,${forensics.quality_analysis.block_deviation_map}`} alt="Block Noise Map" style={{ width: '100%', borderRadius: '8px' }} />
                      )}
                    </div>
                  </div>
                )}

                {/* Category 7: JPEG & Tampering */}
                {sherloqCategory === 'jpeg' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    <div className="card">
                      <h4>Sherloq Error Level Analysis (ELA) Heatmap</h4>
                      {forensics.ela_heatmap && <img src={`data:image/png;base64,${forensics.ela_heatmap}`} alt="ELA Heatmap" style={{ width: '100%', borderRadius: '8px' }} />}
                    </div>

                    <div className="card">
                      <h4>JPEG Quality & Contrast Tampering Assessment</h4>
                      <table className="info-table" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.9rem' }}>
                        <tbody>
                          <tr><td><strong>Est. JPEG Quality Factor</strong></td><td>{forensics.jpeg_info?.estimated_jpeg_quality}%</td></tr>
                          <tr><td><strong>Contrast Comb Artifacts</strong></td><td>{forensics.jpeg_info?.has_contrast_comb_gaps ? '⚠️ Detected (Comb Gaps)' : 'None (Smooth)'}</td></tr>
                          <tr><td><strong>Tampering Verdict</strong></td><td><span className="badge badge-info">{forensics.jpeg_info?.tampering_assessment}</span></td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Part 2: 6D Pose Estimation Loading */}
                {poseLoading && (
                  <div style={{ marginTop: '2rem', padding: '2rem', textAlign: 'center', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ color: '#34d399', fontWeight: 600 }}>⚡ Running Dual-Track 6D Pose Estimation...</p>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Track A: EfficientPose Neural Regression &amp; Track B: Geometric PnP+RANSAC</p>
                  </div>
                )}

                {/* Part 2: 6D Pose Estimation Results */}
                {poseResults && (
                  <div ref={poseResultsRef} style={{ marginTop: '2.5rem', borderTop: '2px solid rgba(16, 185, 129, 0.3)', paddingTop: '2rem' }}>
                    {/* Startup Header Banner */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '1.5rem',
                      gap: '1rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                          fontSize: '1.35rem',
                        }}>
                          🎯
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                              6D Spatial Pose & Geometry Workbench
                            </h3>
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}>
                              Dual-Track Verified
                            </span>
                          </div>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                            Simultaneous Deep Learning Regression (Track A) & Geometric PnP Correspondence (Track B)
                          </p>
                        </div>
                      </div>

                      {/* Track Selector & Export Buttons */}
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{
                          display: 'flex',
                          background: 'rgba(15, 23, 42, 0.75)',
                          padding: '0.3rem',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          gap: '0.3rem',
                        }}>
                          <button
                            onClick={() => setPoseTrackTab('dual')}
                            style={{
                              background: poseTrackTab === 'dual' ? 'linear-gradient(135deg, #3b82f6, #06b6d4)' : 'transparent',
                              color: poseTrackTab === 'dual' ? '#ffffff' : '#94a3b8',
                              border: 'none',
                              padding: '0.5rem 1rem',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              transition: 'all 0.2s',
                            }}
                          >
                            ⚡ Dual-Track Comparison
                          </button>

                          <button
                            onClick={() => setPoseTrackTab('track_a')}
                            style={{
                              background: poseTrackTab === 'track_a' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
                              color: poseTrackTab === 'track_a' ? '#ffffff' : '#94a3b8',
                              border: 'none',
                              padding: '0.5rem 1rem',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              transition: 'all 0.2s',
                            }}
                          >
                            🧠 Track A: EfficientPose
                          </button>

                          <button
                            onClick={() => setPoseTrackTab('track_b')}
                            style={{
                              background: poseTrackTab === 'track_b' ? 'linear-gradient(135deg, #d946ef, #8b5cf6)' : 'transparent',
                              color: poseTrackTab === 'track_b' ? '#ffffff' : '#94a3b8',
                              border: 'none',
                              padding: '0.5rem 1rem',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              transition: 'all 0.2s',
                            }}
                          >
                            📐 Track B: Geometric PnP
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleExportCSV}
                            title="Download CSV report with 6D pose numbers"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            📊 CSV
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={handleExportPDF}
                            title="Download formatted printable PDF report"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            📄 PDF
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Object Switcher Toolbar */}
                    {candidateObjects.length > 0 && (
                      <div style={{
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '12px',
                        padding: '0.85rem 1.25rem',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>🎯</span>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                              Analyzing Object: <strong style={{ color: '#38bdf8' }}>{poseResults.object_name}</strong>
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.6rem' }}>
                              (Click any other object below to calculate pose for that specific object)
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {candidateObjects.map((obj) => {
                            const isCurrent = poseResults.object_name === obj.label || selectedObject?.id === obj.id;
                            return (
                              <button
                                key={obj.id}
                                disabled={poseLoading}
                                onClick={() => {
                                  setSelectedObject(obj);
                                  setClickTarget(null);
                                  runPoseForTarget(obj, null);
                                }}
                                style={{
                                  background: isCurrent ? obj.color : 'rgba(255, 255, 255, 0.06)',
                                  color: isCurrent ? '#ffffff' : 'var(--text-secondary)',
                                  border: `1px solid ${obj.color || 'rgba(255,255,255,0.1)'}`,
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.65rem',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontWeight: isCurrent ? 700 : 400,
                                  boxShadow: isCurrent ? `0 0 12px ${obj.color}66` : 'none',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                <span>🎯</span>
                                <span>{obj.label}</span>
                                <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>({obj.depth_m}m)</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Dual-Track Comparison Card */}
                    {poseTrackTab === 'dual' && poseResults.comparison && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(59, 130, 246, 0.04))',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        borderRadius: '14px',
                        padding: '1.25rem 1.5rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{
                            padding: '0.5rem 0.8rem',
                            borderRadius: '10px',
                            background: poseResults.comparison.agreement_status === 'High Alignment' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: poseResults.comparison.agreement_status === 'High Alignment' ? '#34d399' : '#fbbf24',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            border: `1px solid ${poseResults.comparison.agreement_status === 'High Alignment' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                          }}>
                            {poseResults.comparison.agreement_status}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
                              Cross-Track Geometric Consistency
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                              {poseResults.comparison.summary}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.5rem', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
                          <div>
                            <span style={{ color: '#94a3b8' }}>Translation Delta (ΔT): </span>
                            <strong style={{ color: '#38bdf8' }}>{poseResults.comparison.translation_delta_m != null ? `${(poseResults.comparison.translation_delta_m * 100).toFixed(1)} cm` : 'N/A'}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#94a3b8' }}>Angular Delta (Δθ): </span>
                            <strong style={{ color: '#a78bfa' }}>{poseResults.comparison.rotation_delta_deg != null ? `${poseResults.comparison.rotation_delta_deg}°` : 'N/A'}</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Content View: Dual Side-by-Side */}
                    {poseTrackTab === 'dual' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                        {/* Track A Card */}
                        <div className="card" style={{ border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>🧠</span>
                              <h4 style={{ margin: 0, color: '#34d399' }}>Track A: EfficientPose (Deep Neural)</h4>
                            </div>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                              Direct Regression
                            </span>
                          </div>

                          {poseResults.track_a && !poseResults.track_a.error ? (
                            <>
                              <img
                                src={`data:image/png;base64,${poseResults.track_a.pose_visualization}`}
                                alt="Track A Overlay"
                                style={{ width: '100%', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px' }}>
                                  <span style={{ color: '#94a3b8' }}>Target Class:</span>
                                  <strong>{poseResults.track_a.object_name} ({poseResults.track_a.classification_confidence_pct != null ? Number(poseResults.track_a.classification_confidence_pct).toFixed(1) : 'N/A'}% classification)</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px', fontFamily: 'var(--mono)' }}>
                                  <span style={{ color: '#94a3b8' }}>Translation [Tx, Ty, Tz]:</span>
                                  <strong style={{ color: '#38bdf8' }}>{poseResults.track_a.translation_vector_m?.formatted ?? 'N/A'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px', fontFamily: 'var(--mono)' }}>
                                  <span style={{ color: '#94a3b8' }}>Quaternion:</span>
                                  <strong style={{ color: '#a78bfa' }}>{poseResults.track_a.rotation_quaternion?.formatted ?? 'N/A'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px' }}>
                                  <span style={{ color: '#94a3b8' }}>3D Box Dimensions:</span>
                                  <span>{poseResults.track_a.bounding_box_3d ? `${poseResults.track_a.bounding_box_3d.length_m}m × ${poseResults.track_a.bounding_box_3d.width_m}m × ${poseResults.track_a.bounding_box_3d.height_m}m` : 'N/A'}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🧠</p>
                              <p style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '0.35rem' }}>Track A Unavailable</p>
                              <p style={{ fontSize: '0.82rem' }}>{poseResults.track_a?.error || 'EfficientPose model not trained yet. Train the model from the Dataset page.'}</p>
                            </div>
                          )}
                        </div>

                        {/* Track B Card */}
                        <div className="card" style={{ border: '1px solid rgba(217, 70, 239, 0.3)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>📐</span>
                              <h4 style={{ margin: 0, color: '#f472b6' }}>Track B: Proper PnP + RANSAC</h4>
                            </div>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(217, 70, 239, 0.15)', color: '#f472b6', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                              Geometric Vision
                            </span>
                          </div>

                          {poseResults.track_b && !poseResults.track_b.error ? (
                            <>
                              <img
                                src={`data:image/png;base64,${poseResults.track_b.pose_visualization}`}
                                alt="Track B Overlay"
                                style={{ width: '100%', borderRadius: '8px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px' }}>
                                  <span style={{ color: '#94a3b8' }}>Solver Engine:</span>
                                  <strong>{poseResults.track_b.solver ?? 'N/A'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px' }}>
                                  <span style={{ color: '#94a3b8' }}>PnP Inlier Ratio:</span>
                                  <strong style={{ color: '#34d399' }}>{poseResults.track_b.pnp_metrics ? `${poseResults.track_b.pnp_metrics.inlier_count}/${poseResults.track_b.pnp_metrics.total_correspondences} (${poseResults.track_b.pnp_metrics.inlier_ratio_pct}%)` : 'N/A'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px' }}>
                                  <span style={{ color: '#94a3b8' }}>Reprojection Error:</span>
                                  <strong style={{ color: '#fbbf24' }}>{poseResults.track_b.pnp_metrics ? `${poseResults.track_b.pnp_metrics.mean_reprojection_error_px} px (${poseResults.track_b.pnp_metrics.convergence})` : 'N/A'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--code-bg)', borderRadius: '6px', fontFamily: 'var(--mono)' }}>
                                  <span style={{ color: '#94a3b8' }}>Translation [Tx, Ty, Tz]:</span>
                                  <strong style={{ color: '#38bdf8' }}>{poseResults.track_b.translation_vector_m?.formatted ?? 'N/A'}</strong>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📐</p>
                              <p style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '0.35rem' }}>Track B Unavailable</p>
                              <p style={{ fontSize: '0.82rem' }}>{poseResults.track_b?.error || 'PnP solver could not find enough correspondences. Try providing a depth map.'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Content View: Track A Solo */}
                    {poseTrackTab === 'track_a' && (
                      poseResults.track_a && !poseResults.track_a.error ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                          <div className="card">
                            <h4>EfficientPose 3D Bounding Box Overlay</h4>
                            <img src={`data:image/png;base64,${poseResults.track_a.pose_visualization}`} alt="Track A 3D Overlay" style={{ width: '100%', borderRadius: '8px' }} />
                          </div>
                          <div className="card">
                            <h4>Track A Deep Regression Metrics</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#10b981' }}>Object Detection & Confidence</h5>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{poseResults.track_a.object_name}</div>
                                <div style={{ fontSize: '0.85rem', color: '#34d399' }}>Classification confidence: {poseResults.track_a.classification_confidence_pct != null ? Number(poseResults.track_a.classification_confidence_pct).toFixed(1) : 'N/A'}%</div>
                              </div>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#38bdf8' }}>Translation Vector (Camera Frame)</h5>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.95rem' }}>{poseResults.track_a.translation_vector_m?.formatted ?? 'N/A'}</div>
                              </div>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#a78bfa' }}>Directly Predicted Euler Angles</h5>
                                <div style={{ fontSize: '0.85rem' }}>{poseResults.track_a.rotation_euler_deg?.formatted ?? 'N/A'}</div>
                                <div style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                                  Quaternion: {poseResults.track_a.rotation_quaternion?.formatted ?? 'N/A'}
                                </div>
                              </div>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#f59e0b' }}>3D Metric Bounding Box</h5>
                                <div style={{ fontSize: '0.85rem' }}>
                                  {poseResults.track_a.bounding_box_3d
                                    ? `${poseResults.track_a.bounding_box_3d.length_m}m (L) × ${poseResults.track_a.bounding_box_3d.width_m}m (W) × ${poseResults.track_a.bounding_box_3d.height_m}m (H)`
                                    : 'N/A'}
                                </div>
                                {poseResults.track_a.bounding_box_3d?.volume_cm3 != null && (
                                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                    Volume: {poseResults.track_a.bounding_box_3d.volume_cm3} cm³
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🧠</p>
                          <p style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '0.35rem' }}>Track A Unavailable</p>
                          <p style={{ fontSize: '0.82rem' }}>{poseResults.track_a?.error || 'EfficientPose model not trained yet. Train the model from the Dataset page.'}</p>
                        </div>
                      )
                    )}

                    {/* Content View: Track B Solo */}
                    {poseTrackTab === 'track_b' && (
                      poseResults.track_b && !poseResults.track_b.error ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                          <div className="card">
                            <h4>PnP 2D-3D Keypoint Correspondences</h4>
                            <img src={`data:image/png;base64,${poseResults.track_b.pose_visualization}`} alt="Track B PnP Overlay" style={{ width: '100%', borderRadius: '8px' }} />
                          </div>
                          <div className="card">
                            <h4>Proper PnP Geometric Metrics</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#d946ef' }}>PnP Solver & Optimizations</h5>
                                <div style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>{poseResults.track_b.solver ?? 'N/A'}</div>
                              </div>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#34d399' }}>Correspondences & Inlier Rate</h5>
                                <div style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>
                                  {poseResults.track_b.pnp_metrics
                                    ? `${poseResults.track_b.pnp_metrics.inlier_count} of ${poseResults.track_b.pnp_metrics.total_correspondences} Inliers (${poseResults.track_b.pnp_metrics.inlier_ratio_pct}%)`
                                    : 'N/A'}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#fbbf24', marginTop: '0.2rem' }}>
                                  Mean Reprojection Error: {poseResults.track_b.pnp_metrics ? `${poseResults.track_b.pnp_metrics.mean_reprojection_error_px} px (${poseResults.track_b.pnp_metrics.convergence})` : 'N/A'}
                                </div>
                              </div>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#38bdf8' }}>PnP + Depth Translation</h5>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.95rem' }}>{poseResults.track_b.translation_vector_m?.formatted ?? 'N/A'}</div>
                              </div>
                              <div style={{ background: 'var(--code-bg)', padding: '0.75rem', borderRadius: '8px' }}>
                                <h5 style={{ margin: '0 0 0.25rem', color: '#a78bfa' }}>Rodrigues Rotation Angles</h5>
                                <div style={{ fontSize: '0.85rem' }}>{poseResults.track_b.rotation_euler_deg?.formatted ?? 'N/A'}</div>
                                <div style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                                  Quaternion: {poseResults.track_b.rotation_quaternion?.formatted ?? 'N/A'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📐</p>
                          <p style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '0.35rem' }}>Track B Unavailable</p>
                          <p style={{ fontSize: '0.82rem' }}>{poseResults.track_b?.error || 'PnP solver could not find enough correspondences. Try providing a depth map.'}</p>
                        </div>
                      )
                    )}

                    {/* Part 3: Interactive 3D Point Cloud WebGL Canvas */}
                    {poseResults.point_cloud_3d && (
                      <PointCloudViewer3D
                        pointCloudData={poseResults.point_cloud_3d}
                        boundingBox3D={poseResults.bounding_box_3d}
                        objectName={poseResults.object_name}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Catalog Tab */}
        {tab === 'catalog' && (
          <div>
            {catalogLoading ? (
              <div className="loading-overlay"><div className="spinner" /><p>Loading CLUBS catalog...</p></div>
            ) : objects.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</p>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Dataset not loaded yet. Download it from the Dataset page first.
                </p>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {objects.length} objects in CLUBS dataset. Click any object for Sherloq Multi-Category Forensics & Depth Gatekeeper analysis.
                </p>
                <div className="object-grid">
                  {objects.map((obj) => (
                    <div className="object-card" key={obj.id} onClick={() => analyzeFilename(obj.filename)}>
                      <img
                        src={dataAPI.getObjectImage(obj.filename)}
                        alt={obj.name}
                        loading="lazy"
                        onError={(e) => { e.target.style.background = '#1a1d27'; e.target.alt = 'Loading...'; }}
                      />
                      <div className="object-info">
                        <div className="object-name">{obj.name}</div>
                        <div className="object-id">#{obj.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
