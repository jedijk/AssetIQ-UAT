/**
 * Detect whether the frontend is running in a UAT deployment.
 *
 * Checks (in order):
 * 1. REACT_APP_DEPLOY_ENV / REACT_APP_ENVIRONMENT build-time vars
 * 2. Hostname patterns (uat, assetiq-uat, deploy-uat)
 * 3. REACT_APP_BACKEND_URL pointing at a UAT backend
 */
export function isUatEnvironment() {
  const deployEnv = (
    process.env.REACT_APP_DEPLOY_ENV ||
    process.env.REACT_APP_ENVIRONMENT ||
    ""
  ).toLowerCase();

  if (deployEnv === "uat") {
    return true;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (
      host.includes("uat") ||
      host.includes("assetiq-uat") ||
      host.includes("deploy-uat")
    ) {
      return true;
    }
  }

  const backendUrl = (process.env.REACT_APP_BACKEND_URL || "").toLowerCase();
  if (backendUrl.includes("uat")) {
    return true;
  }

  return false;
}
