# 🎯 RGB-Pose Hub: 6D Object Pose Estimation & Image Forensics Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![React: 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite: 8](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0%2B-EE4C2C.svg)](https://pytorch.org/)

An enterprise-grade, end-to-end workbench for **6D Object Pose Estimation** ($[X, Y, Z]$ translation & $[\text{roll}, \text{pitch}, \text{yaw}]$ / quaternion rotation) and **Sherloq Multi-Category Digital Image Forensics**.

---

## 👥 Course & Project Information

* **Course:** Software Engineering Course Project (IT303)
* **Supervisor / Guide:** **Dr. Jaidhar C.D.**
* **Project Team:**
  * **Abhishu Shaurya** · 241IT003
  * **Hradayastha Thakran** · 241IT034
  * **Lavish Temani** · 241IT040

---

## 🚀 Key Features

### 1. Dual-Track 6D Object Pose Estimation
* **Track A — Deep Learning Regression:** EfficientPose neural network estimating 3D translation ($T_x, T_y, T_z$), Euler angles, unit quaternions, and oriented 3D bounding bounding boxes ($L \times W \times H$ & volume in $\text{cm}^3$).
* **Track B — Geometric Correspondence:** Robust Perspective-n-Point (PnP + RANSAC) solver computing projection matrices, inlier ratios, and mean reprojection errors from metric depth maps.
* **Dual Agreement Metric:** Real-time spatial delta comparison ($\Delta T$ in cm, $\Delta R$ in degrees) between neural predictions and geometric solvers.

### 2. Interactive Object Pinpointing & 3D Point Cloud
* Click-to-pinpoint crosshair reticle on candidate bounding boxes.
* Interactive WebGL/Three.js 3D point cloud reconstructed directly from RGB-D channels.

### 3. Sherloq Digital Forensics Workbench
* **Gatekeeper RGB-D Validator:** Differentiates metric uint16 depth maps from standard 2D images; renders metric inferno depth heatmaps.
* **Tampering Assessment:** JPEG compression analysis, Error Level Analysis (ELA), contrast comb gap detection, noise analysis, and clone detection.
* **Physical Digest & EXIF:** Complete metadata breakdown, color channel inspection, bit-plane slicing, and SHA-256 cryptographic digest.

### 4. 📄 Instant Report Generation
* **Export CSV:** Comprehensive spreadsheet-ready report of all forensic metrics, object bounding boxes, and 6D pose translation/rotation vectors.
* **Download PDF:** Laboratory-grade, beautifully formatted inspection report with visual heatmaps, 3D overlays, and verification badges (ready to print or save as PDF).

### 5. Enterprise Security & Authentication
* Role-based access control (Admin & Researcher tiers).
* Two-Factor Authentication (2FA TOTP with QR codes).
* Session revocation and immutable audit trails.

---

## 📂 Repository Structure

```text
RGBPoseHub/
├── backend/                        # Flask REST API & ML Inference Engines
│   ├── app.py                      # Application Factory & API Routes
│   ├── config.py                   # Environment-driven configuration
│   ├── extensions.py               # SQLAlchemy, JWT, and CORS setup
│   ├── requirements.txt            # Python dependencies (CPU-optimized PyTorch)
│   ├── Procfile                    # Web service definition for Render / Heroku
│   ├── module_auth/                # 2FA, JWT, User accounts & Audit logs
│   ├── module_data/                # Dataset loaders, cleaners & RGB-D utils
│   ├── module_ml/                  # EfficientPose, PnP solver, Forensics & Heatmaps
│   └── uploads/samples/            # Verified demo RGB-D sample pairs
├── frontend/                       # Modern React 19 + Vite Web Application
│   ├── index.html                  # HTML5 entrypoint
│   ├── package.json                # Dependencies (Three.js, Lucide, Axios)
│   ├── vite.config.js              # Vite configuration & proxy
│   ├── vercel.json                 # Vercel SPA routing rules
│   ├── src/
│   │   ├── App.jsx                 # Client-side routing (Landing, Analysis, Dashboard)
│   │   ├── pages/                  # Landing, Analysis, Dashboard, Dataset, Profile
│   │   ├── components/             # PointCloudViewer3D, LiquidChrome, Sidebar
│   │   └── services/api.js         # Centralized Axios API client
│   └── public/                     # Static media & icons
├── models/                         # Pretrained model weights
│   ├── class_names.json            # Target object ontology
│   ├── clubs_classifier.pt         # Neural classifier weights
│   ├── efficientpose_weights.pt    # EfficientPose 6D regression weights
│   └── training_history.json       # Training loss and validation history
├── Dockerfile                      # Production Docker container (Hugging Face / Koyeb)
├── render.yaml                     # 1-Click Render deployment blueprint
├── .gitignore                      # Git exclusion rules
└── README.md                       # Documentation
```

---

## 🛠️ Local Development Setup

### Prerequisites
* **Node.js** v18+ & npm
* **Python** 3.10+
* **Git**

### 1. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies (CPU PyTorch)
pip install -r requirements.txt

# Start Flask backend server (port 5001)
python app.py
```
* Backend will be live at: `http://localhost:5001/api`
* Health check: `http://localhost:5001/api/health`

### 2. Frontend Setup
```bash
# In a new terminal, navigate to frontend
cd frontend

# Install Node modules
npm install

# Start Vite development server (port 5173)
npm run dev
```
* Web app will be live at: `http://localhost:5173/`

### 🔑 Default Login Credentials
* **Admin:** `admin@rgbposehub.org` | Password: `Password123!`
* **Researcher:** `lead_researcher@rgbposehub.org` | Password: `Password123!`

---

## ☁️ 100% Free Cloud Deployment Guide

### Option 1: Frontend on Vercel + Backend on Hugging Face Spaces (Recommended)

#### A. Backend on Hugging Face Spaces (Free 16 GB RAM + 2 vCPUs)
1. Sign up for free at [huggingface.co](https://huggingface.co).
2. Create a **New Space** → SDK: **Docker** → Blank Template.
3. Push or upload `backend/`, `models/`, `uploads/samples/`, and `Dockerfile` to the Space.
4. Your free API endpoint will be: `https://<your-space>.hf.space/api`.

#### B. Frontend on Vercel
1. Import this GitHub repository into [vercel.com](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Vite`.
4. Add Environment Variable:
   * `VITE_API_URL`: `https://<your-space>.hf.space/api`
5. Click **Deploy**.

---

### Option 2: 1-Click Deployment on Render
1. Go to [render.com](https://render.com) and click **New** → **Blueprint**.
2. Select this repository. Render automatically reads `render.yaml` to spin up:
   * The Python Web Service (Backend)
   * The Static Site (Frontend)

---

## 🔄 1-Click Rollback / Undo Instructions

A safety snapshot tag `backup-pre-restructure` and branch `backup-original-main` were created before these changes. To undo any changes and restore the previous repository state in one single command:

```bash
git reset --hard backup-pre-restructure
```
or
```bash
git checkout backup-original-main
```

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.
