import { api } from "../apiClient";
import { triggerBlobDownload } from "../documentFetch";

export const sparePartsAPI = {
  list: async (params = {}) => {
    const response = await api.get("/spare-parts", { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/spare-parts/${id}`);
    return response.data;
  },

  create: async (payload) => {
    const response = await api.post("/spare-parts", payload);
    return response.data;
  },

  update: async (id, payload) => {
    const response = await api.patch(`/spare-parts/${id}`, payload);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/spare-parts/${id}`);
    return response.data;
  },

  listCategories: async (includeInactive = false) => {
    const response = await api.get("/spare-categories", {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  },

  uploadFile: async (sparePartId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/spare-part-files/${sparePartId}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  deleteFile: async (fileId) => {
    const response = await api.delete(`/spare-part-files/${fileId}`);
    return response.data;
  },

  fileViewUrl: (fileId) => `/api/spare-part-files/${fileId}/view`,
  fileDownloadUrl: (fileId) => `/api/spare-part-files/${fileId}/download`,

  downloadImportTemplate: async () => {
    const response = await api.get("/spare-parts-import/template", { responseType: "blob" });
    triggerBlobDownload(response.data, "spare_parts_import_template.xlsx");
  },

  validateImport: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/spare-parts-import/validate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  executeImport: async (rows) => {
    const response = await api.post("/spare-parts-import/import", { rows });
    return response.data;
  },

  linkEquipment: async (sparePartId, equipmentId, componentPosition = null) => {
    const response = await api.post(`/spare-parts/${sparePartId}/equipment-links`, {
      equipment_id: equipmentId,
      component_position: componentPosition,
    });
    return response.data;
  },

  unlinkEquipment: async (sparePartId, equipmentId) => {
    const response = await api.delete(`/spare-parts/${sparePartId}/equipment-links/${equipmentId}`);
    return response.data;
  },

  getInsights: async (id) => {
    const response = await api.get(`/spare-parts/${id}/insights`);
    return response.data;
  },
};
