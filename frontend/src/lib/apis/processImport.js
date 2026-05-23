import { api } from "../apiClient";

/**
 * Process Intelligence Import API
 * 
 * Handles uploading process diagrams and converting them to ISO 14224 asset hierarchies.
 */
export const processImportAPI = {
  /**
   * Upload a process diagram for analysis
   * @param {File} file - PDF or image file
   * @param {Object} options - Processing options
   * @returns {Promise<{session_id: string, status: string}>}
   */
  upload: async (file, options = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    
    const params = new URLSearchParams();
    if (options.generate_subunits !== undefined) {
      params.append("generate_subunits", options.generate_subunits);
    }
    if (options.generate_maintainable_items !== undefined) {
      params.append("generate_maintainable_items", options.generate_maintainable_items);
    }
    if (options.estimate_criticality !== undefined) {
      params.append("estimate_criticality", options.estimate_criticality);
    }
    
    const response = await api.post(`/process-import/upload?${params.toString()}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    return response.data;
  },

  /**
   * Get session status and results
   */
  getSession: async (sessionId) => {
    const response = await api.get(`/process-import/session/${sessionId}`);
    return response.data;
  },

  /**
   * Update a hierarchy item
   */
  updateItem: async (sessionId, itemId, updates) => {
    const response = await api.patch(`/process-import/session/${sessionId}/item/${itemId}`, updates);
    return response.data;
  },

  /**
   * Delete a hierarchy item
   */
  deleteItem: async (sessionId, itemId) => {
    const response = await api.delete(`/process-import/session/${sessionId}/item/${itemId}`);
    return response.data;
  },

  /**
   * Add a new item manually
   */
  addItem: async (sessionId, itemData) => {
    const response = await api.post(`/process-import/session/${sessionId}/item`, itemData);
    return response.data;
  },

  /**
   * Accept an item
   */
  acceptItem: async (sessionId, itemId) => {
    const response = await api.post(`/process-import/session/${sessionId}/item/${itemId}/accept`);
    return response.data;
  },

  /**
   * Reject an item
   */
  rejectItem: async (sessionId, itemId) => {
    const response = await api.post(`/process-import/session/${sessionId}/item/${itemId}/reject`);
    return response.data;
  },

  /**
   * Accept all items with confidence >= threshold
   */
  acceptAll: async (sessionId, minConfidence = 70) => {
    const response = await api.post(
      `/process-import/session/${sessionId}/accept-all?min_confidence=${minConfidence}`
    );
    return response.data;
  },

  /**
   * Import hierarchy to AssetIQ
   */
  importToAssetIQ: async (sessionId, installationId) => {
    const response = await api.post(`/process-import/session/${sessionId}/import`, {
      installation_id: installationId,
    });
    return response.data;
  },

  /**
   * Export as CSV
   */
  exportCSV: async (sessionId) => {
    const response = await api.get(`/process-import/session/${sessionId}/export`, {
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Export as Excel
   */
  exportExcel: async (sessionId) => {
    const response = await api.get(`/process-import/session/${sessionId}/export-excel`, {
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Delete a session
   */
  deleteSession: async (sessionId) => {
    const response = await api.delete(`/process-import/session/${sessionId}`);
    return response.data;
  },

  /**
   * List user's sessions
   */
  listSessions: async (limit = 20, skip = 0) => {
    const response = await api.get(`/process-import/sessions?limit=${limit}&skip=${skip}`);
    return response.data;
  },
};
