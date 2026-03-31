/**
 * Runtime API URL Configuration
 * Determines the correct backend URL at runtime, supporting:
 * - Preview environments (uses REACT_APP_BACKEND_URL)
 * - Production deployments (falls back to window.location.origin)
 */

// Get the backend URL - works for any deployment domain
export const getBackendUrl = () => {
  // Check if we have an environment variable set
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  // Fallback to current origin for production deployments
  return window.location.origin;
};

// Get the full API URL (with /api prefix)
export const getApiUrl = () => `${getBackendUrl()}/api`;

// Export as default for convenience
export default getBackendUrl;
