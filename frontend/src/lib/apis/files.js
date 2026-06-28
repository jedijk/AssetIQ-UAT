import { api } from "../apiClient";

export async function getFileStatus(fileId) {
  const response = await api.get(`/files/${fileId}`);
  return response.data;
}

export async function getDownloadUrl(fileId) {
  const response = await api.get(`/files/${fileId}/download-url`);
  return response.data;
}

export async function getPreviewUrl(fileId) {
  const response = await api.get(`/files/${fileId}/preview-url`);
  return response.data;
}

export async function getQuarantinedFiles({ page = 1, pageSize = 20 } = {}) {
  const response = await api.get("/admin/files/quarantine", {
    params: { page, page_size: pageSize },
  });
  return response.data;
}

export async function getFileSecurityDashboard() {
  const response = await api.get("/admin/files/security-dashboard");
  return response.data;
}

export async function requestFileRescan(fileId) {
  const response = await api.post(`/admin/files/${fileId}/rescan`);
  return response.data;
}
