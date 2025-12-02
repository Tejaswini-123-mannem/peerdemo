import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000
});

// Request interceptor - always get fresh token from localStorage
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // Remove authorization header if no token
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
let isRedirecting = false;
let redirectTimeout = null;
let lastLoginTime = 0;

// Track successful login to prevent immediate redirects
export const markLoginSuccess = () => {
  lastLoginTime = Date.now();
};

API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login if we're not already on the login/register page
    // and we're not already redirecting
    // Also skip redirect for login/register endpoints
    if (error.response?.status === 401 && !isRedirecting) {
      const currentPath = window.location.pathname;
      const requestUrl = error.config?.url || '';
      const token = localStorage.getItem('token');
      const timeSinceLogin = Date.now() - lastLoginTime;
      
      // Don't redirect if:
      // 1. Already on login/register page
      // 2. The failed request was to login/register endpoint
      // 3. Already redirecting
      // 4. No token exists (might be a legitimate 401 from login attempt)
      // 5. Just logged in (within last 2 seconds) - give time for redirect
      if (
        currentPath !== '/login' && 
        currentPath !== '/register' &&
        !requestUrl.includes('/auth/login') &&
        !requestUrl.includes('/auth/register') &&
        token && // Only redirect if token exists (means it's invalid/expired)
        timeSinceLogin > 2000 // Don't redirect if just logged in
      ) {
        // Clear any pending redirects
        if (redirectTimeout) {
          clearTimeout(redirectTimeout);
        }
        
        isRedirecting = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Use setTimeout to avoid redirect during navigation
        redirectTimeout = setTimeout(() => {
          isRedirecting = false;
          window.location.href = '/login';
        }, 500);
      }
    }
    return Promise.reject(error);
  }
);

export const setToken = (token) => {
  if (token) {
    API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete API.defaults.headers.common['Authorization'];
  }
};

export default API;
