/**
 * Authenticated media fetch — Wave 3 frontend convergence.
 * All authenticated HTTP goes through apiClient (cookie or bearer).
 */
import { api } from "./apiClient";
import { getApiUrl } from "./apiConfig";

export async function fetchAuthenticatedBlob(url) {
  if (!url) {
    throw new Error("URL required");
  }

  let path = url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const apiBase = getApiUrl().replace(/\/$/, "");
    if (url.startsWith(apiBase)) {
      path = url.slice(apiBase.length);
    }
  }
  if (path.startsWith("/api/")) {
    path = path.slice(4);
  } else if (path.startsWith("/")) {
    path = path.slice(1);
  }

  const response = await api.get(path, { responseType: "blob" });
  return response.data;
}
