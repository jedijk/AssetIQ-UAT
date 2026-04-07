/**
 * Runtime API URL Configuration
 * 
 * For deployments where frontend (Vercel) and backend (Railway) are on different domains,
 * set one of these environment variables in Vercel:
 *   - REACT_APP_BACKEND_URL=https://your-backend.railway.app (base URL without /api)
 *   - REACT_APP_API_URL=https://your-backend.railway.app/api (full API URL with /api)
 * 
 * IMPORTANT: Environment variables are baked in at BUILD TIME in React.
 * You must rebuild after changing env vars in Vercel.
 */

// Get the backend BASE URL (without /api suffix)
export const getBackendUrl = () => {
  // REACT_APP_BACKEND_URL should be the base URL (e.g., https://backend.railway.app)
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  if (backendUrl && backendUrl !== 'undefined' && backendUrl.startsWith('http')) {
    // Remove trailing slash and /api suffix if present
    let url = backendUrl.replace(/\/$/, '');
    // If URL ends with /api, remove it (this is the BASE url function)
    if (url.endsWith('/api')) {
      url = url.slice(0, -4);
    }
    return url;
  }
  
  // Check if we're on Vercel (production) without env var configured
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isVercel = currentOrigin.includes('vercel.app');
  
  if (isVercel) {
    // Log error - user needs to set REACT_APP_BACKEND_URL in Vercel and rebuild
    console.error("[API Config] ERROR: Running on Vercel but REACT_APP_BACKEND_URL not set!");
    console.error("[API Config] Set REACT_APP_BACKEND_URL in Vercel Environment Variables and REBUILD the app.");
    // Return empty to prevent requests to wrong domain
    return '';
  }
  
  // Fallback for local/preview development (same-origin)
  return currentOrigin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => {
  // Check if REACT_APP_API_URL is set (takes priority - already includes /api)
  const apiUrl = process.env.REACT_APP_API_URL;
  
  if (apiUrl && apiUrl !== 'undefined' && apiUrl.startsWith('http')) {
    // Remove trailing slash
    return apiUrl.replace(/\/$/, '');
  }
  
  // Otherwise, build from backend URL
  return `${getBackendUrl()}/api`;
};

// Export as default for convenience
export default getBackendUrl;
