/**
 * Runtime API URL Configuration
 * 
 * For deployments where frontend (Vercel) and backend (Railway) are on different domains,
 * we MUST use REACT_APP_BACKEND_URL environment variable.
 * 
 * Set in Vercel: REACT_APP_BACKEND_URL=https://your-backend.railway.app
 */

// Get the backend URL from environment variable (required for Vercel + Railway)
export const getBackendUrl = () => {
  // Use environment variable if set (for Vercel + Railway deployment)
  // Fall back to window.location.origin for same-domain deployments
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  
  if (envUrl && envUrl !== 'undefined') {
    // Remove trailing slash if present
    return envUrl.replace(/\/$/, '');
  }
  
  // Fallback for same-domain deployments (e.g., Emergent preview)
  return window.location.origin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => `${getBackendUrl()}/api`;

// Export as default for convenience
export default getBackendUrl;
