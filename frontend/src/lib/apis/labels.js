import { api } from "../apiClient";

// Labels API (Smart Labeling System)
export const labelsAPI = {
  getPresets: async () => {
    const res = await api.get("/labels/presets");
    return res.data;
  },
  listTemplates: async (status) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await api.get(`/labels/templates${qs}`);
    return res.data;
  },
  getTemplate: async (id) => {
    const res = await api.get(`/labels/templates/${id}`);
    return res.data;
  },
  createTemplate: async (payload) => {
    const res = await api.post("/labels/templates", payload);
    return res.data;
  },
  updateTemplate: async (id, payload) => {
    const res = await api.put(`/labels/templates/${id}`, payload);
    return res.data;
  },
  deleteTemplate: async (id) => {
    const res = await api.delete(`/labels/templates/${id}`);
    return res.data;
  },
  duplicateTemplate: async (id) => {
    const res = await api.post(`/labels/templates/${id}/duplicate`);
    return res.data;
  },
  previewBlob: async (payload) => {
    const res = await api.post("/labels/preview", payload, { responseType: "blob" });
    const contentType = res.headers?.["content-type"] || res.headers?.["Content-Type"] || "";
    return { blob: res.data, contentType }; // { blob: Blob, contentType: string }
  },
  printBlob: async (payload) => {
    const res = await api.post("/labels/print", payload, { responseType: "blob" });
    return res.data; // Blob
  },
  renderHtml: async (payload) => {
    const res = await api.post("/labels/render-html", payload, { responseType: "text" });
    return res.data; // string (HTML)
  },
  listJobs: async (limit = 50) => {
    const res = await api.get(`/labels/jobs?limit=${limit}`);
    return res.data;
  },
};

