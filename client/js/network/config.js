// Dynamic backend URL configuration for dev/production environments
const getBackendUrl = () => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  // Local fallback
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : `${window.location.protocol}//${window.location.host}`;
};

export const BACKEND_URL = getBackendUrl();
