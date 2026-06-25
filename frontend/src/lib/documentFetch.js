/**
 * Document fetch via apiClient — Wave 4 frontend convergence.
 */
import { api } from "./apiClient";
import { getApiUrl } from "./apiConfig";

function toApiPath(url) {
  if (!url) return null;
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return null;
  }
  let path = url;
  const apiBase = getApiUrl().replace(/\/$/, "");
  if (url.startsWith("http://") || url.startsWith("https://")) {
    if (url.startsWith(apiBase)) {
      path = url.slice(apiBase.length);
    } else {
      return url;
    }
  }
  if (path.startsWith("/api/")) {
    path = path.slice(4);
  } else if (path.startsWith("/")) {
    path = path.slice(1);
  }
  return path;
}

/** Trigger a browser download for a Blob (authenticated API responses). */
export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function fetchDocumentBlob(url) {
  const path = toApiPath(url);
  if (!path) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.blob();
  }
  if (path.startsWith("http")) {
    const res = await fetch(path, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.blob();
  }
  const response = await api.get(path, { responseType: "blob" });
  return response.data;
}

export async function fetchDocumentArrayBuffer(url) {
  const blob = await fetchDocumentBlob(url);
  return blob.arrayBuffer();
}
