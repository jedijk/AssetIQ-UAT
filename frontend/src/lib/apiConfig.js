/**
 * Runtime API URL Configuration
 * 
 * Supports multiple deployment environments:
 *   - Local development (localhost:3000 → localhost:8001)
 *   - Emergent Preview (same-origin, proxied)
 *   - Vercel Production (frontend) + Railway/Emergent Backend (cross-origin)
 * 
 * For Vercel deployments, set in Vercel Environment Variables:
 *   - REACT_APP_BACKEND_URL=https://your-backend.railway.app (base URL without /api)
 * 
 * IMPORTANT: Environment variables are baked in at BUILD TIME in React.
 * You must rebuild after changing env vars in Vercel.
 */

// Debug flag - set to true to enable console logging
const DEBUG_API_CONFIG = true;

const logDebug = (message, ...args) => {
  if (DEBUG_API_CONFIG) {
    console.log(`[API Config] ${message}`, ...args);
  }
};

// Get the backend BASE URL (without /api suffix)
export const getBackendUrl = () => {
  // REACT_APP_BACKEND_URL should be the base URL (e.g., https://backend.railway.app)
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  logDebug("REACT_APP_BACKEND_URL:", backendUrl);
  
  if (backendUrl && backendUrl !== 'undefined' && backendUrl.startsWith('http')) {
    // Remove trailing slash and /api suffix if present
    let url = backendUrl.replace(/\/$/, '');
    // If URL ends with /api, remove it (this is the BASE url function)
    if (url.endsWith('/api')) {
      url = url.slice(0, -4);
    }
    logDebug("Using configured backend URL:", url);
    return url;
  }
  
  // Check if we're on Vercel (production) without env var configured
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isVercel = currentOrigin.includes('vercel.app');
  const isEmergent = currentOrigin.includes('emergentagent.com') || currentOrigin.includes('emergent.host');
  
  logDebug("Current origin:", currentOrigin);
  logDebug("Is Vercel:", isVercel);
  logDebug("Is Emergent:", isEmergent);
  
  if (isVercel && !backendUrl) {
    // Log error - user needs to set REACT_APP_BACKEND_URL in Vercel and rebuild
    console.error("[API Config] ERROR: Running on Vercel but REACT_APP_BACKEND_URL not set!");
    console.error("[API Config] Set REACT_APP_BACKEND_URL in Vercel Environment Variables and REBUILD the app.");
    console.error("[API Config] Example: REACT_APP_BACKEND_URL=https://your-backend.railway.app");
    // Return empty to prevent requests to wrong domain
    return '';
  }
  
  // Fallback for local/preview development (same-origin)
  logDebug("Using same-origin fallback:", currentOrigin);
  return currentOrigin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => {
  // Check if REACT_APP_API_URL is set (takes priority - already includes /api)
  const apiUrl = process.env.REACT_APP_API_URL;
  
  if (apiUrl && apiUrl !== 'undefined' && apiUrl.startsWith('http')) {
    // Remove trailing slash
    const url = apiUrl.replace(/\/$/, '');
    logDebug("Using configured API URL:", url);
    return url;
  }
  
  // Otherwise, build from backend URL
  const baseUrl = getBackendUrl();
  const fullApiUrl = `${baseUrl}/api`;
  logDebug("Built API URL from base:", fullApiUrl);
  return fullApiUrl;
};

// Export as default for convenience
export default getBackendUrl;
