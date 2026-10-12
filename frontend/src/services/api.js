import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://rgb-pose-hub-api.onrender.com/api' : 'http://localhost:5001/api');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 errors gracefully - attempt silent token refresh before logging out
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest?._retry) {
      const refreshToken = localStorage.getItem('refresh_token');
      const publicPaths = ['/login', '/admin/login'];
      const isPublic = publicPaths.includes(window.location.pathname) ||
        originalRequest?.url?.includes('/auth/login') ||
        originalRequest?.url?.includes('/auth/verify-2fa') ||
        originalRequest?.url?.includes('/auth/refresh');

      if (!refreshToken || isPublic) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        if (!publicPaths.includes(window.location.pathname)) {
          window.location.href = '/login';
        }
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((e) => Promise.reject(e));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${refreshToken}` } }
        );
        const newAccessToken = refreshRes.data.access_token;
        localStorage.setItem('access_token', newAccessToken);
        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        if (!publicPaths.includes(window.location.pathname)) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

// ─── Auth API ──────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  verify2FASetup: (data) => api.post('/auth/verify-2fa-setup', data),
  login: (data) => api.post('/auth/login', data),
  verify2FALogin: (data) => api.post('/auth/verify-2fa-login', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  getHistory: (params) => api.get('/auth/history', { params }),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (id) => api.post(`/auth/sessions/${id}/revoke`),
  getStats: () => api.get('/auth/stats'),
  // Admin user management
  getAdminUsers: () => api.get('/auth/admin/users'),
  deleteAdminUser: (id) => api.delete(`/auth/admin/users/${id}`),
  revokeAdminUserSessions: (id) => api.post(`/auth/admin/users/${id}/revoke-sessions`),
  revokeAdminSession: (id) => api.post(`/auth/admin/sessions/${id}/revoke`),
};


// ─── Data API ──────────────────────────────
export const dataAPI = {
  getStatus: () => api.get('/data/status'),
  downloadDataset: () => api.post('/data/download'),
  listObjects: () => api.get('/data/objects'),
  getObjectImage: (filename) => `${API_BASE}/data/objects/${filename}/image`,
  cleanDataset: (data) => api.post('/data/clean', data),
  preprocessDataset: (data) => api.post('/data/preprocess', data),
  uploadImage: (formData) => api.post('/data/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ─── ML API ────────────────────────────────
export const mlAPI = {
  getStatus: () => api.get('/ml/status'),
  buildModel: (data) => api.post('/ml/build', data),
  trainModel: (data) => api.post('/ml/train', data),
  predict: (formData) => api.post('/ml/predict', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  predictFilename: (data) => api.post('/ml/predict', data),
  predictDatasetImage: (filename) => api.post(`/ml/predict-dataset/${filename}`),
  getTrainingHistory: () => api.get('/ml/training-history'),
  forensicAnalyze: (formData) => api.post('/ml/forensic-analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  forensicAnalyzeJson: (data) => api.post('/ml/forensic-analyze', data),
  estimatePose: (data) => api.post('/ml/estimate-pose', data),
  getPointCloud3D: (data) => api.post('/ml/point-cloud-3d', data),
  getSampleRGBDImages: () => api.get('/ml/sample-rgbd-images'),
  getRecentAnalyses: () => api.get('/ml/recent-analyses'),
  getImageUrl: (filename) => `${API_BASE}/ml/image/${filename}`,
};

export default api;


