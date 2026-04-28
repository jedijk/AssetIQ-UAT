import { api, API_URL } from "../apiClient";

// ==================== QR CODE API ====================
export const qrCodeAPI = {
  // Generate a single QR code
  generate: async (data) => {
    const response = await api.post("/qr/generate", data);
    return response.data;
  },

  // Generate QR codes in bulk for multiple equipment
  generateBulk: async (hierarchyItemIds, defaultAction = "view_asset", actions = []) => {
    const response = await api.post("/qr/generate-bulk", {
      hierarchy_item_ids: hierarchyItemIds,
      default_action: defaultAction,
      actions,
    });
    return response.data;
  },

  // List all QR codes
  list: async (params = {}) => {
    const response = await api.get("/qr/list", { params });
    return response.data;
  },

  // Get QR code details
  get: async (qrId) => {
    const response = await api.get(`/qr/${qrId}`);
    return response.data;
  },

  // Update QR code
  update: async (qrId, data) => {
    const response = await api.put(`/qr/${qrId}`, data);
    return response.data;
  },

  // Delete (deactivate) QR code
  delete: async (qrId, permanent = false) => {
    const response = await api.delete(`/qr/${qrId}?permanent=${permanent}`);
    return response.data;
  },

  // Resolve QR scan (get actions)
  resolve: async (qrId) => {
    const response = await api.get(`/qr/resolve/${qrId}`);
    return response.data;
  },

  // Get QR for specific equipment
  getForEquipment: async (equipmentId) => {
    const response = await api.get(`/qr/equipment/${equipmentId}`);
    return response.data;
  },

  // Generate QR for specific equipment
  generateForEquipment: async (equipmentId, defaultAction = "view_asset") => {
    const response = await api.post(`/qr/equipment/${equipmentId}/generate?default_action=${defaultAction}`);
    return response.data;
  },

  // Print QR codes as PDF
  print: async (qrIds, options = {}) => {
    const response = await api.post(
      "/qr/print",
      {
        qr_ids: qrIds,
        template: options.template || "single",
        size: options.size || "medium",
        custom_size_mm: options.customSizeMm,
        show_label: options.showLabel !== false,
        show_description: options.showDescription || false,
        show_logo: options.showLogo || false,
      },
      { responseType: "blob" }
    );
    return response.data;
  },

  // Export QR codes
  export: async (qrIds, format = "png", includeMetadata = false) => {
    const response = await api.post(
      "/qr/export",
      {
        qr_ids: qrIds,
        format,
        include_metadata: includeMetadata,
      },
      { responseType: "blob" }
    );
    return response.data;
  },

  // Get image URL for a QR code
  getImageUrl: (qrId, size = "medium", showLabel = true) => {
    return `${API_URL}/qr/${qrId}/image?size=${size}&show_label=${showLabel}`;
  },
};

