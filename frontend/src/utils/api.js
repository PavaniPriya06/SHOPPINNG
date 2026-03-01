import axios from 'axios';

// ══════════════════════════════════════════════════════════════════════════════
// API CONFIGURATION - Production-Ready
// ══════════════════════════════════════════════════════════════════════════════
// Priority: VITE_API_URL env var > Auto-detect production URL > Localhost fallback

const getApiUrl = () => {
    // 1. First check environment variable (set in Vercel/Render dashboard)
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    
    // 2. Production auto-detection based on hostname
    const hostname = window.location.hostname;
    
    // Vercel deployment
    if (hostname.includes('vercel.app')) {
        // Backend on Render - update this URL after backend deployment
        return import.meta.env.VITE_BACKEND_URL || 'https://tcs-backend.onrender.com/api';
    }
    
    // Render deployment
    if (hostname.includes('onrender.com')) {
        return '/api'; // Same origin
    }
    
    // Custom domain
    if (hostname !== 'localhost' && !hostname.includes('127.0.0.1')) {
        return import.meta.env.VITE_BACKEND_URL || '/api';
    }
    
    // 3. Local development - use Vite proxy
    return '/api';
};

const API_URL = getApiUrl();

// Log API URL in development
if (import.meta.env.DEV) {
    console.log('🔌 API URL:', API_URL);
}

const api = axios.create({ 
    baseURL: API_URL,
    timeout: 30000,  // 30 second timeout
    headers: {
        'Content-Type': 'application/json'
    }
});

// Attach token to every request
api.interceptors.request.use(config => {
    const token = localStorage.getItem('tcs_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => {
    return Promise.reject(error);
});

// Handle responses and errors
api.interceptors.response.use(
    response => response,
    error => {
        // Handle 401 Unauthorized
        if (error.response?.status === 401) {
            localStorage.removeItem('tcs_token');
            localStorage.removeItem('tcs_user');
            // Only redirect if not already on auth page
            if (!window.location.pathname.includes('/auth')) {
                window.location.href = '/auth';
            }
        }
        
        // Handle network errors (server might be sleeping on Render)
        if (!error.response && error.message === 'Network Error') {
            console.error('Network error - server might be waking up...');
        }
        
        return Promise.reject(error);
    }
);

// Helper to get full URL for images/uploads
export const getMediaUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    
    // For production, construct full URL to backend
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && !hostname.includes('127.0.0.1')) {
        const backendBase = import.meta.env.VITE_BACKEND_URL || 
                           (hostname.includes('vercel.app') ? 'https://tcs-backend.onrender.com' : '');
        return `${backendBase}${path}`;
    }
    
    // Local development - Backend runs on port 5000, Frontend on 3000
    // Using relative path since Vite proxy handles it
    return path;
};

export default api;
