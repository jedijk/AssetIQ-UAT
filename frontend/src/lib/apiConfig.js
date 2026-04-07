/**
 * Runtime API URL Configuration
 * 
 * For deployments where frontend (Vercel) and backend (Railway) are on different domains,
 * set one of these environment variables in Vercel:
 *   - REACT_APP_API_URL=https://your-backend.railway.app (preferred)
 *   - REACT_APP_BACKEND_URL=https://your-backend.railway.app (legacy)
 * 
 * IMPORTANT: The environment variable MUST be set - no fallbacks!
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
  
  // CRITICAL: If no env var is set, log error in production to catch misconfig early
  if (process.env.NODE_ENV === 'production') {
    console.error("[API Config] ERROR: No backend URL configured! Set REACT_APP_API_URL in Vercel.");
  }
  
  // Fallback for local development only
  return window.location.origin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => `${getBackendUrl()}/api`;

// Export as default for convenience
export default getBackendUrl;
