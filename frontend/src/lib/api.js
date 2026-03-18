import axios from "axios";

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Chat API
export const chatAPI = {
  sendMessage: async (content, imageBase64 = null) => {
    const response = await api.post("/chat/send", {
      content,
      image_base64: imageBase64,
    });
    return response.data;
  },
  
  getHistory: async (limit = 50) => {
    const response = await api.get(`/chat/history?limit=${limit}`);
    return response.data;
  },
};

// Voice API
export const voiceAPI = {
  transcribe: async (audioBase64) => {
    const formData = new FormData();
    formData.append("audio_base64", audioBase64);
    const response = await api.post("/voice/transcribe", formData);
    return response.data;
  },
};

// Threats API
export const threatsAPI = {
  getAll: async (status = null) => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get(`/threats${params}`);
    return response.data;
  },
  
  getTop: async (limit = 10) => {
    const response = await api.get(`/threats/top?limit=${limit}`);
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/threats/${id}`);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await api.patch(`/threats/${id}`, data);
    return response.data;
  },
  
  delete: async (id) => {
    const response = await api.delete(`/threats/${id}`);
    return response.data;
  },
};

// Stats API
export const statsAPI = {
  get: async () => {
    const response = await api.get("/stats");
    return response.data;
  },
};

// Equipment Hierarchy API (ISO 14224)
export const equipmentHierarchyAPI = {
  // Get library data
  getEquipmentTypes: async () => {
    const response = await api.get("/equipment-hierarchy/types");
    return response.data;
  },
  
  getDisciplines: async () => {
    const response = await api.get("/equipment-hierarchy/disciplines");
    return response.data;
  },
  
  getCriticalityProfiles: async () => {
    const response = await api.get("/equipment-hierarchy/criticality-profiles");
    return response.data;
  },
  
  getISOLevels: async () => {
    const response = await api.get("/equipment-hierarchy/iso-levels");
    return response.data;
  },
  
  // Node operations
  getNodes: async () => {
    const response = await api.get("/equipment-hierarchy/nodes");
    return response.data;
  },
  
  getNode: async (nodeId) => {
    const response = await api.get(`/equipment-hierarchy/nodes/${nodeId}`);
    return response.data;
  },
  
  createNode: async (nodeData) => {
    const response = await api.post("/equipment-hierarchy/nodes", nodeData);
    return response.data;
  },
  
  updateNode: async (nodeId, updateData) => {
    const response = await api.patch(`/equipment-hierarchy/nodes/${nodeId}`, updateData);
    return response.data;
  },
  
  deleteNode: async (nodeId) => {
    const response = await api.delete(`/equipment-hierarchy/nodes/${nodeId}`);
    return response.data;
  },
  
  moveNode: async (nodeId, newParentId, recalculateCriticality = true) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/move`, {
      node_id: nodeId,
      new_parent_id: newParentId,
      recalculate_criticality: recalculateCriticality
    });
    return response.data;
  },
  
  assignCriticality: async (nodeId, assignment) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/criticality`, assignment);
    return response.data;
  },
  
  assignDiscipline: async (nodeId, discipline) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/discipline?discipline=${discipline}`);
    return response.data;
  },
  
  getStats: async () => {
    const response = await api.get("/equipment-hierarchy/stats");
    return response.data;
  },
  
  // Unstructured items operations
  getUnstructuredItems: async () => {
    const response = await api.get("/equipment-hierarchy/unstructured");
    return response.data;
  },
  
  createUnstructuredItem: async (itemData) => {
    const response = await api.post("/equipment-hierarchy/unstructured", itemData);
    return response.data;
  },
  
  parseEquipmentList: async (content, source = "paste") => {
    const response = await api.post("/equipment-hierarchy/parse-list", { content, source });
    return response.data;
  },
  
  parseEquipmentFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/equipment-hierarchy/parse-file", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  },
  
  assignUnstructuredToHierarchy: async (itemId, parentId, level) => {
    const response = await api.post(`/equipment-hierarchy/unstructured/${itemId}/assign`, {
      parent_id: parentId,
      level: level
    });
    return response.data;
  },
  
  deleteUnstructuredItem: async (itemId) => {
    const response = await api.delete(`/equipment-hierarchy/unstructured/${itemId}`);
    return response.data;
  },
  
  clearUnstructuredItems: async () => {
    const response = await api.delete("/equipment-hierarchy/unstructured");
    return response.data;
  },
};

export default api;
