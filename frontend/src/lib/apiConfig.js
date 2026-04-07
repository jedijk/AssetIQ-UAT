/**
 * Runtime API URL Configuration
 * 
 * For deployments where frontend (Vercel) and backend (Railway) are on different domains,
 * set one of these environment variables in Vercel:
 *   - REACT_APP_API_URL=https://your-backend.railway.app (preferred)
 *   - REACT_APP_BACKEND_URL=https://your-backend.railway.app (legacy)
 * 
 * IMPORTANT: Environment variables are baked in at BUILD TIME in React.
 * You must rebuild after changing env vars in Vercel.
 */

// Get the backend URL from environment variable
export const getBackendUrl = () => {
  // Check both possible env var names (API_URL takes priority)
  const apiUrl = process.env.REACT_APP_API_URL;
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  const envUrl = apiUrl || backendUrl;
  
  if (envUrl && envUrl !== 'undefined' && envUrl.startsWith('http')) {
    // Remove trailing slash if present
    return envUrl.replace(/\/$/, '');
  }
  
  // Check if we're on Vercel (production) without env var configured
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isVercel = currentOrigin.includes('vercel.app');
  
  if (isVercel) {
    // Log error - user needs to set REACT_APP_API_URL in Vercel and rebuild
    console.error("[API Config] ERROR: Running on Vercel but REACT_APP_API_URL not set!");
    console.error("[API Config] Set REACT_APP_API_URL in Vercel Environment Variables and REBUILD the app.");
    // Return empty to prevent requests to wrong domain
    return '';
  }
  
  // Fallback for local/preview development (same-origin)
  return currentOrigin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => `${getBackendUrl()}/api`;

// Export as default for convenience
export default getBackendUrl;
