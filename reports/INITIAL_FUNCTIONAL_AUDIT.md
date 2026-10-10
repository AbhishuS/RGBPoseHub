# Initial Functional Audit — RGBPoseHub

- **Audit date:** 2026-10-10
- **Scope:** Functional correctness of RGB/depth processing, nominal 6D pose estimation, inference, evaluation, and internal dataflow. This is not a security or deployment-hardening audit.
- **Evidence source:** Read-only inspection and bounded local/synthetic tests described in the audit session. This report is a preserved summary of that audit, not a claim that the current source tree has just been re-audited. Recheck the application repository before acting on the findings.
- **Source repository at audit time:** `RGBPoseHub-main` (the application project, separate from this workflow repository).

## Executive verdict

**NOT READY FOR RELIABLE USE.** The inspected application had an RGB classification path, depth utilities, and two nominal pose-estimation tracks, but the evidence did not support trusting the reported metric depth or 6D poses. One pose path proceeded without its required trained checkpoint; the other could manufacture correspondences and return a confident-looking result on blank imagery. Several depth inputs were treated as metric despite ambiguous or synthetic encoding. No real pose ground truth was available to validate accuracy.

| Area | Audit assessment |
|---|---|
| RGB image processing | Partially implemented; classifier ran, but training/inference preprocessing differed and no end-to-end pose accuracy was established. |
| Depth processing | Incorrect for ambiguous RGB/8-bit/alpha inputs; a uint16 millimeter conversion worked in the tested synthetic case. |
| 6D pose estimation | Not trustworthy: missing pose weights, heuristic translation/rotation, unsupported correspondences, and misleading success paths. |
| Model inference | Classifier inference ran; pose model weights were absent. Loading a classifier does not establish pose inference. |
| Evaluation metrics | Not verified against ground truth; existing pose checks did not assert pose accuracy. |
| End-to-end integration | Incomplete/inconsistent: depth, target region, and calibration did not reliably flow to pose stages. |
| Reproducibility | Incomplete: no pose GT/checkpoint/calibration artifact; no frontend test/build evidence in the audit. |

## Observed architecture and dataflow

```text
React AnalysisPage
  -> POST /api/ml/forensic-analyze with one image
  -> if gate labels input RGB-D:
       POST /api/ml/estimate-pose
       -> optional MobileNet classifier label
       -> PoseEstimator
          -> Track A (EfficientPose-shaped model)
          -> Track B (ORB feature extraction + PnP)
          -> point-cloud / comparison output
  -> frontend displays returned numbers and visualizations
```

The frontend did not provide a separate depth image, camera intrinsics, or a target ROI/point in the observed pose request. A depth filename derived by the gatekeeper was not forwarded to the second request. A detector-like component could produce boxes, but those boxes were not passed into the pose tracks; Track A used a model-predicted box and Track B used a center crop.

The repository contained a MobileNet image classifier and a small RGB classification dataset. The audit did not find a usable pose-labeled dataset, CAD geometry, verified pose checkpoint, or calibration artifact. Thus, the observed pipeline did not have the evidence/assets needed to substantiate a trained, calibrated 6D pose estimator.

## Prioritized findings

### F-01 — Pose Track A returns successful-looking output without trained pose weights

- **Severity:** CRITICAL
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** `backend/module_ml/track_a_efficientpose.py`
- **Evidence:** Required `efficientpose_weights.pt` was absent. The model could initialize with random weights and continue inference instead of failing closed. Translation was derived heuristically from depth; rotation was not trustworthy. Confidence could be copied from classification/default logic rather than calibrated pose evidence. Fresh model instances produced different quaternion outputs.
- **Impact:** A success response can look like an estimate even though it is not produced by a trained pose model. A random or heuristic output can be mistaken for metric translation and rotation.
- **Expected behavior:** Reject inference when a required compatible pose checkpoint is missing; validate finite translation and proper rotation; report only evidence-backed confidence.
- **Recommended regression:** Run with missing, corrupt, and incompatible checkpoint fixtures; all must produce explicit failure, never a pose success. Repeated inference should be deterministic for a fixed model/input where determinism is expected.

### F-02 — PnP inputs are not valid visual correspondences and fallback fabricates evidence

- **Severity:** CRITICAL
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** `backend/module_ml/track_b_pnp.py`
- **Evidence:** ORB keypoints sorted by response were paired with canonical 3D model points without a matching/correspondence mechanism. When too few features were found, the code generated image projections from an assumed translation and passed them into PnP. A blank RGB image with uniform 1 m depth returned success, confidence 93.8, 14/14 inliers, and 0 px reprojection error.
- **Impact:** PnP can solve the fabricated inputs exactly and output an apparently excellent but unsupported pose. Inlier count and residual are misleading when the input correspondences are invented or unrelated.
- **Expected behavior:** Do not form 2D/3D pairs without actual object-specific correspondence evidence. Degenerate or insufficient inputs must fail with an explicit reason and no valid pose.
- **Recommended regression:** Blank image, random texture, insufficient features, repeated points, and mismatched object geometry must not return a confident success. Validate correspondence provenance and reprojection against genuine matched points.

### F-03 — Ambiguous and synthetic depth channels are presented as metric data

- **Severity:** CRITICAL
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** `backend/module_data/rgbd_utils.py`, `backend/module_ml/forensic_analyzer.py`
- **Evidence:** uint16 input was interpreted as millimeters and converted to meters; this path passed a synthetic check under that assumption. Other paths guessed a physical scale for 8-bit grayscale/RGBA alpha and could synthesize a vertical depth gradient from ordinary RGB. Alpha zero could be mapped to 0.3 m and counted as valid. The forensic gatekeeper could report raw channel values as meters. On an observed sample, values 55–219 were presented with meter-like units even though the loader mapping produced roughly 0.78–2.20 m.
- **Impact:** A plausible depth visualization or summary can conceal values that are arbitrary encodings, synthetic values, or raw intensity rather than physical distance. Any downstream backprojection then produces invalid 3D geometry.
- **Expected behavior:** Only accept metric depth when the source format and scale are explicit. Preserve units and validity masks. Unknown visual channels must be marked non-metric or rejected from metric pose paths.
- **Recommended regression:** Test uint16 1000→1 m; zero/sentinel, NaN/Inf, negative and out-of-range values; ordinary RGB; arbitrary alpha; and unsupported formats. Assert units/provenance in gatekeeper responses.

### F-04 — Depth encoder and decoder scales disagree; resize can blend geometry

- **Severity:** HIGH
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** `backend/convert_depth_to_rgbd.py`, `backend/module_data/rgbd_utils.py`
- **Evidence:** The 16-bit-to-RGBA encoder used a 0.3–3.0 m range, while the RGBA alpha decoder used 0.3–2.5 m. In synthetic checks, alpha value 65 mapped to 0.8608 m in one path despite an encoder comment implying 0.65 m; a separate 8-bit path mapped 65 to 1.049 m. Bilinear resizing of a 1 m/3 m edge generated about 1.67/2.33 m intermediate values.
- **Impact:** Encoded depth cannot be reliably round-tripped; resize can create distances that do not belong to either side of an object boundary and corrupt point clouds/poses.
- **Expected behavior:** One explicit shared encoding contract for encoder and decoder, with boundary/invalid tests. Metric resizing must define mask and discontinuity behavior and must not silently create misleading values.
- **Recommended regression:** Round-trip a set of known distances including range endpoints and invalid pixels; verify discontinuity behavior on a synthetic two-depth edge.

### F-05 — Calibration, depth, target ROI, and pose stages are not coherently integrated

- **Severity:** HIGH
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** Frontend `AnalysisPage`, API routes, `PoseEstimator`, pose track modules; default intrinsics observed in pose code
- **Evidence:** Intrinsics generally defaulted to fx=fy=615 pixels; no calibration artifact or frontend calibration input was found. The frontend did not send a separate depth image or target ROI/point. The gatekeeper-derived depth filename was not forwarded to the pose request. Detector boxes were not passed to pose tracks; one track used a predicted box and the other a center crop.
- **Impact:** A pose algorithm may process the wrong region or incorrect/un-calibrated geometry while returning values that appear to correspond to the selected input/object.
- **Expected behavior:** Explicit request contract for RGB, optional metric depth, object/ROI, intrinsics, units, and frames. Trace the same target/calibration through every downstream stage and validate image-coordinate transforms.
- **Recommended regression:** End-to-end test where known ROI, K, and image change; assert each expected module receives the new values and results do not reuse stale inputs.

### F-06 — Pose comparison and confidence can misrepresent estimator disagreement

- **Severity:** HIGH
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** Pose comparison/fusion code in `PoseEstimator`
- **Evidence:** “High Alignment” was based on translation difference below 8 cm and ignored rotation. An observed result with 160.46° rotation disagreement and 3.7 cm translation difference still received “High Alignment.” Track A was always chosen as primary; the audit did not find a mathematically justified fusion mechanism.
- **Impact:** Severe orientation disagreement can be hidden by an alignment label, and an arbitrary primary result can appear selected by consensus.
- **Expected behavior:** Compare rotation and translation in consistent frames/units, represent disagreement, handle failed estimators explicitly, and do not claim fusion without a justified method.
- **Recommended regression:** Same translation/opposite rotation and same rotation/different translation examples must produce distinct, correctly interpreted disagreement results.

### F-07 — Classifier validation/preprocessing limit classifier claims and do not support pose claims

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** Classifier training/preprocessing code (`preprocessor.py`) and inference modules; checkpoint `models/clubs_classifier.pt`
- **Evidence:** The classifier checkpoint loaded. Training/validation split grouped augmented siblings before splitting, risking related-image leakage. Training letterboxed while inference stretched images to 224×224. Missing-model fallback used pixel similarity and could return success/confidence; an exact dataset image scored 100% in the fallback path. A classifier score was also reused as pose confidence in a pose path.
- **Impact:** Classifier score may overstate generalization; fallback and classification confidence can be mistaken for model/pose evidence.
- **Expected behavior:** Split by original scene/object/source before augmentation; share documented preprocessing; report classification confidence only as classification confidence; missing model is explicit failure unless fallback is separately labeled non-model behavior.
- **Recommended regression:** Check split-group disjointness, training/inference transform equivalence, missing/corrupt model behavior, and output semantics.

### F-08 — Non-finite depth error path is not handled cleanly

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** `backend/module_ml/track_a_efficientpose.py`, `backend/module_ml/track_b_pnp.py`
- **Evidence:** Synthetic NaN depth input raised uncaught `ValueError` in both nominal tracks.
- **Impact:** Malformed or sensor-corrupted input can escape the intended result/error contract, potentially leaving partial results or surfacing a generic failure.
- **Expected behavior:** Validate inputs at boundaries; return a structured explicit invalid-input result with no pose and no stale successful output.
- **Recommended regression:** Exercise NaN, +Inf, -Inf, empty arrays, wrong shapes, and all-invalid depth through both isolated and integrated calls.

### F-09 — Detector includes sample/filename behavior rather than reliable object detection

- **Severity:** HIGH
- **Confidence:** CONFIRMED in the audited snapshot
- **Location:** `backend/module_ml/object_detector.py`
- **Evidence:** Certain filename scene names triggered hardcoded boxes; generic behavior produced heuristic central boxes/confidence. Same blank image named `warehouse` and generically produced different box behavior in the audit.
- **Impact:** A filename can alter the supposed image-derived detection. Downstream results can appear target-specific without image evidence.
- **Expected behavior:** Detection results derive from actual image/model evidence or return explicit unsupported/failed status; names must not silently select detections.
- **Recommended regression:** Same image content under different filenames must produce identical detections, and blank-image behavior must not fabricate confident object boxes.

## Independently validated primitives

These passing tests are limited and must not be misread as end-to-end validation:

| Test | Expected/tolerance | Observed | Result |
|---|---|---|---|
| Pinhole backprojection with synthetic intrinsics/depth | Known point, error below 1e-6 m | Error 4.47e-10 m | Pass |
| Quaternion identity and +90° Z rotation matrices | `R.T @ R ≈ I`, `det(R)≈+1`, tolerance 1e-6 | Orthogonality and determinant within tolerance | Pass |
| Direct exact synthetic OpenCV PnP | Translation <0.001 m; rotation <0.1° | 6.99e-16 m; 0° | Pass |
| uint16 millimeter depth conversion | 1000→1 m under declared format | Synthetic conversion behaved as expected | Pass, format-specific only |
| Ambiguous alpha/8-bit depth | Preserve declared physical scale | Observed incompatible mappings and invalid-zero handling | Fail |

The direct PnP test verifies the underlying solver with correct synthetic correspondences. It does not validate Track B's correspondence construction.

## Tests recorded in the prior audit

| Command | Observed result | What it did not establish |
|---|---|---|
| `python -m unittest test_forensic_pipeline -v` | 3 tests passed | Does not prove metric correctness for ambiguous encodings or pose accuracy. |
| `python test_pose_backend.py` | 6 nominal checks passed | No pose-accuracy assertions; success paths could be misleading. |
| `python test_ml_pipeline.py` | Classifier ran; sample Veet score 99.85% | Classification is not 6D pose accuracy; split/preprocessing concerns remain. |
| `python -m unittest discover -s tests -v` | 2 tests passed | Auth/database checks, not CV functionality. |

Database checks used in-memory SQLite. No frontend test script/build was run. No real pose ground-truth dataset was available. These are historical results; rerun against the current application source before relying on them.

## Feature completeness at the time of audit

| Feature | Status | Evidence/limitation |
|---|---|---|
| RGB image upload and classification | **IMPLEMENTED BUT INSUFFICIENTLY TESTED** | Classifier loaded and ran, but validation split/preprocessing concerns and fallback semantics limit trust. |
| uint16 depth conversion | **IMPLEMENTED BUT INSUFFICIENTLY TESTED** | Synthetic millimeter conversion passed; broader sensor/invalid-value coverage absent. |
| Arbitrary 8-bit/RGBA/ordinary RGB metric depth | **PARTIALLY IMPLEMENTED** | Guessed or synthesized values can be represented as metric; contracts disagree. |
| Track A 6D pose | **MOCKED OR HARDCODED in effect** | Required trained pose weights absent; random model and heuristics can return success. |
| Track B PnP pose | **PARTIALLY IMPLEMENTED** | OpenCV PnP primitive works, but pipeline correspondences/fallback are unsupported. |
| Detector | **MOCKED OR HARDCODED in effect** | Filename-specific and heuristic boxes/confidence. |
| Pose comparison/fusion | **PARTIALLY IMPLEMENTED** | Rotation disagreement ignored by alignment label; primary choice not a validated fusion. |
| Pose metrics/benchmark evaluation | **CANNOT VERIFY WITH AVAILABLE EVIDENCE** | No real pose GT/object geometry/benchmark reproducibility established. |
| End-to-end trustworthy 6D pose system | **PARTIALLY IMPLEMENTED** | Stages exist, but missing model/calibration/target data and misleading fallbacks break trust. |
| Vercel deployment readiness | **CANNOT VERIFY WITH AVAILABLE EVIDENCE** | Python/Flask backend architecture was not validated for target deployment. |

## Overall conclusion and recommended order

The application had runnable functionality, but the core metric-depth and 6D-pose claims were not substantiated. Silent plausible outputs on missing weights, blank imagery, ambiguous depth, and severe rotation disagreement are the principal risks. Do not use these outputs as reliable measurements or benchmark evidence.

Recommended phase order recorded for the workflow:
1. Establish explicit metric-depth encoding/provenance and fail closed on ambiguous depth.
2. Remove successful-looking untrained/fabricated pose paths and make failure/confidence truthful.
3. Integrate explicit target, calibration, units, and frame conventions end to end.
4. Select and validate a genuine 6D pose estimator with appropriate data/geometry/checkpoint provenance.
5. Reproduce evaluation on held-out annotated data with suitable symmetry-aware metrics.
6. Integrate the accepted pipeline and later validate deployment architecture.

The first audit phase is defined in `.project_workflow/CURRENT_PHASE.md`. The source repository must be accessible before implementation; this report's existence is not a substitute for current source review.
