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
const DEBUG_API_CONFIG = false;

// No hardcoded fallback - require explicit configuration for production
// This prevents accidental cross-environment API calls

const logDebug = (message, ...args) => {
  if (DEBUG_API_CONFIG) {
    console.log(`[API Config] ${message}`, ...args);
  }
};

// Get the backend BASE URL (without /api suffix)
export const getBackendUrl = () => {
  // Cookie auth should be same-origin to avoid third-party cookie restrictions
  // (notably Safari/iOS). We rely on Vercel rewrites for /api -> backend.
  const authMode = process.env.REACT_APP_AUTH_MODE || "bearer";
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  if (authMode === "cookie" && currentOrigin) {
    return currentOrigin;
  }

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
  // Note: currentOrigin already defined above
  const isVercel = currentOrigin.includes('vercel.app');
  const isEmergent = currentOrigin.includes('emergentagent.com') || currentOrigin.includes('emergent.host');
  const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');
  
  logDebug("Current origin:", currentOrigin);
  logDebug("Environment - Vercel:", isVercel, "Emergent:", isEmergent, "Local:", isLocalhost);
  
  // Priority 2: Vercel without env var - use same origin (assumes backend is on same domain or proxied)
  if (isVercel) {
    console.warn("[API Config] REACT_APP_BACKEND_URL not set. Set it in Vercel Environment Variables and rebuild.");
    // Fall back to same-origin - this works if using a proxy or same domain
    return currentOrigin;
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
  
  // Priority 5: Unknown environment - use same-origin
  console.warn("[API Config] Unknown environment, using same-origin:", currentOrigin);
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
  logDebug("Resolved API URL:", fullApiUrl);
  return fullApiUrl;
};

// Export as default for convenience
export default getBackendUrl;

/**
 * Get standard auth headers including database environment for fetch() calls.
 * Use this for any raw fetch() calls to ensure database switching works.
 * 
 * @param {Object} additionalHeaders - Additional headers to merge
 * @returns {Object} Headers object with Authorization and X-Database-Environment
 */
export const getAuthHeaders = (additionalHeaders = {}) => {
  const token = localStorage.getItem("token");
  const dbEnv = localStorage.getItem("database_environment");
  
  const headers = {
    "Content-Type": "application/json",
    ...additionalHeaders
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  if (dbEnv) {
    headers["X-Database-Environment"] = dbEnv;
  }
  
  return headers;
};

/**
 * Wrapper for fetch() that automatically includes auth and database headers.
 * Drop-in replacement for fetch() in authenticated API calls.
 * 
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response>} Fetch response
 */
export const authFetch = async (url, options = {}) => {
  const headers = getAuthHeaders(options.headers || {});
  
  return fetch(url, {
    ...options,
    headers
  });
};

