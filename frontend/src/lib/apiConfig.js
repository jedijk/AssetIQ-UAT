/**
 * Runtime API URL Configuration
 * 
 * IMPORTANT: React environment variables are baked in at BUILD time.
 * This means REACT_APP_BACKEND_URL will contain whatever value was set
 * when the app was built, NOT the current deployment domain.
 * 
 * Solution: ALWAYS use window.location.origin for API calls.
 * This ensures the app works on ANY domain it's deployed to.
 */

// Get the backend URL - ALWAYS uses current origin for maximum compatibility
export const getBackendUrl = () => {
  // Always use current window origin - this works on ANY deployment domain
  // (assetiq.tech, *.emergent.host, localhost, etc.)
  return window.location.origin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => `${getBackendUrl()}/api`;

// Export as default for convenience
export default getBackendUrl;
