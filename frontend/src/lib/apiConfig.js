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

// Fallback backend URL for Railway production deployment
// Used when REACT_APP_BACKEND_URL is not set on Vercel
const FALLBACK_BACKEND_URL = "https://assetiq-production.up.railway.app";

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
  
  // Priority 1: Use configured environment variable
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
  
  // Detect current environment
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isVercel = currentOrigin.includes('vercel.app');
  const isEmergent = currentOrigin.includes('emergentagent.com') || currentOrigin.includes('emergent.host');
  const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');
  
  logDebug("Current origin:", currentOrigin);
  logDebug("Environment - Vercel:", isVercel, "Emergent:", isEmergent, "Local:", isLocalhost);
  
  // Priority 2: Vercel without env var - use Railway fallback (non-blocking warning)
  if (isVercel) {
    console.warn("[API Config] REACT_APP_BACKEND_URL not set on Vercel, using fallback:", FALLBACK_BACKEND_URL);
    console.warn("[API Config] For production, set REACT_APP_BACKEND_URL in Vercel Environment Variables and rebuild.");
    return FALLBACK_BACKEND_URL;
  }
  
  // Priority 3: Emergent preview - use same-origin (proxied)
  if (isEmergent) {
    logDebug("Using Emergent same-origin:", currentOrigin);
    return currentOrigin;
  }
  
  // Priority 4: Local development - use same-origin
  if (isLocalhost) {
    logDebug("Using localhost same-origin:", currentOrigin);
    return currentOrigin;
  }
  
  // Priority 5: Unknown environment - use fallback with warning
  console.warn("[API Config] Unknown environment, using fallback:", FALLBACK_BACKEND_URL);
  return FALLBACK_BACKEND_URL;
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
  logDebug("Resolved API URL:", fullApiUrl);
  return fullApiUrl;
};

// Export as default for convenience
export default getBackendUrl;
