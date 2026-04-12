/**
 * Form Designer API
 * Centralized API calls for form templates and submissions
 */
import { getBackendUrl, getAuthHeaders } from '../../lib/apiConfig';

const API_BASE_URL = getBackendUrl();

export const formAPI = {
  getTemplates: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append("search", params.search);
    if (params.discipline) queryParams.append("discipline", params.discipline);
    const response = await fetch(`${API_BASE_URL}/api/form-templates?${queryParams}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Failed to load templates" }));
      throw new Error(error.detail || "Failed to load templates");
    }
    return response.json();
  },

  getTemplate: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${id}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Template not found" }));
      throw new Error(error.detail || "Template not found");
    }
    return response.json();
  },

  createTemplate: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create template");
    return response.json();
  },

  updateTemplate: async (params) => {
    let id, data;
    if (typeof params === 'object' && params.id && params.data) {
      id = params.id;
      data = params.data;
    } else if (typeof params === 'string') {
      id = params;
      data = arguments[1];
    } else {
      throw new Error("Invalid arguments for updateTemplate. Expected { id, data } object.");
    }
    
    const cleanedData = { ...data };
    delete cleanedData.id;
    delete cleanedData.pendingDocuments;
    
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(cleanedData),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.detail || errorData.message || `Failed to update template (${response.status})`;
      throw new Error(errorMessage);
    }
    
    return response.json();
  },

  deleteTemplate: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to delete template");
    return response.json();
  },

  getSubmissions: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.templateId) queryParams.append("template_id", params.templateId);
    if (params.status) queryParams.append("status", params.status);
    if (params.limit) queryParams.append("limit", params.limit);
    const response = await fetch(`${API_BASE_URL}/api/form-submissions?${queryParams}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Failed to load submissions" }));
      throw new Error(error.detail || "Failed to load submissions");
    }
    return response.json();
  },

  getTemplateAnalytics: async (templateId) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${templateId}/analytics`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  uploadDocument: async (templateId, file, description) => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) formData.append("description", description);

    const headers = getAuthHeaders();
    delete headers["Content-Type"];
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${templateId}/documents`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to upload document");
    }
    return response.json();
  },

  deleteDocument: async (templateId, documentId) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${templateId}/documents/${documentId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to delete document");
    return response.json();
  },

  searchDocuments: async (templateId, query) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${templateId}/documents/search`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ query }),
    });
    return response.json();
  },

  searchEquipment: async (query) => {
    const response = await fetch(
      `${API_BASE_URL}/api/equipment-hierarchy/search?query=${encodeURIComponent(query)}`,
      { headers: getAuthHeaders() }
    );
    if (response.ok) {
      return response.json();
    }
    return { results: [] };
  },
};

export default formAPI;
