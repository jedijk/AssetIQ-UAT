import axios from "axios";
import { getApiUrl, getBackendUrl } from "./apiConfig";

// Get API URL at initialization for static uses
const API_URL = getApiUrl();

// Log API configuration at startup (development only)
if (process.env.NODE_ENV === 'development') {
  console.log("[API] Backend URL:", getBackendUrl());
  console.log("[API] Full API URL:", API_URL);
}

// Create axios instance with dynamic baseURL getter
const api = axios.create({
  baseURL: API_URL, // Set initial baseURL
  timeout: 30000, // 30 second timeout
});

// Add request interceptor to validate URL and add auth
api.interceptors.request.use((config) => {
  // Validate the URL includes /api
  if (!config.baseURL?.includes('/api')) {
    console.error("[API] WARNING: API URL does not include /api prefix:", config.baseURL);
  }
  
  // Add auth token
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add database environment header for multi-database support
  const dbEnv = localStorage.getItem("database_environment");
  if (dbEnv) {
    config.headers["X-Database-Environment"] = dbEnv;
  }
  
  return config;
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized - session expired
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem("token");
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        console.warn("Session expired, redirecting to login");
        window.location.href = "/login";
      }
    }
    
    // Add more context to network errors
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timeout - please try again';
    } else if (!error.response && error.message === 'Network Error') {
      error.code = 'ERR_NETWORK';
      error.message = 'Network error - please check your connection';
    }
    return Promise.reject(error);
  }
);

// Auth API (Password Reset)
export const authAPI = {
  forgotPassword: async (email) => {
    const response = await api.post("/auth/forgot-password", { email });
    return response.data;
  },
  
  verifyResetToken: async (token) => {
    const response = await api.post("/auth/verify-reset-token", { token });
    return response.data;
  },
  
  resetPassword: async (token, newPassword) => {
    const response = await api.post("/auth/reset-password", { 
      token, 
      new_password: newPassword 
    });
    return response.data;
  },
};

// Chat API
export const chatAPI = {
  sendMessage: async (content, imageBase64 = null, language = null) => {
    const payload = { content, image_base64: imageBase64 };
    if (language) payload.language = language;
    const response = await api.post("/chat/send", payload);
    return response.data;
  },
  
  getHistory: async (limit = 50) => {
    const response = await api.get(`/chat/history?limit=${limit}`);
    return response.data;
  },
  
  clearHistory: async () => {
    const response = await api.delete("/chat/clear");
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
  
  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteActions) params.append('delete_actions', 'true');
    if (options.deleteInvestigations) params.append('delete_investigations', 'true');
    const queryString = params.toString();
    const url = `/threats/${id}${queryString ? `?${queryString}` : ''}`;
    const response = await api.delete(url);
    return response.data;
  },
  
  linkToEquipment: async (threatId, equipmentNodeId) => {
    const response = await api.post(`/threats/${threatId}/link-equipment`, { equipment_node_id: equipmentNodeId });
    return response.data;
  },
  
  linkToFailureMode: async (threatId, failureModeId) => {
    const response = await api.post(`/threats/${threatId}/link-failure-mode`, { failure_mode_id: failureModeId });
    return response.data;
  },
  
  recalculateScores: async () => {
    const response = await api.post("/threats/recalculate-scores");
    return response.data;
  },
  
  getTimeline: async (threatId) => {
    const response = await api.get(`/threats/${threatId}/timeline`);
    return response.data;
  },
};

// Observations API
export const observationsAPI = {
  getAll: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.append("equipment_id", params.equipment_id);
    if (params.severity) searchParams.append("severity", params.severity);
    if (params.status) searchParams.append("status", params.status);
    const response = await api.get(`/observations?${searchParams.toString()}`);
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/observations/${id}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await api.post("/observations", data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await api.patch(`/observations/${id}`, data);
    return response.data;
  },
  
  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteActions) params.append('delete_actions', 'true');
    if (options.deleteInvestigations) params.append('delete_investigations', 'true');
    const queryString = params.toString();
    const url = `/observations/${id}${queryString ? `?${queryString}` : ''}`;
    const response = await api.delete(url);
    return response.data;
  },
  
  close: async (id, resolutionNotes = null) => {
    const response = await api.post(`/observations/${id}/close`, { resolution_notes: resolutionNotes });
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

// Reliability Scores API
export const reliabilityAPI = {
  getScores: async (nodeId = null, level = null) => {
    const params = new URLSearchParams();
    if (nodeId) params.append("node_id", nodeId);
    if (level) params.append("level", level);
    const response = await api.get(`/reliability-scores?${params.toString()}`);
    return response.data;
  },
};

// Failure Modes API
export const failureModesAPI = {
  getAll: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.category && params.category !== "all") searchParams.append("category", params.category);
    const response = await api.get(`/failure-modes?${searchParams.toString()}`);
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/failure-modes/${id}`);
    return response.data;
  },
  
  getCategories: async () => {
    const response = await api.get("/failure-modes/categories");
    return response.data;
  },
  
  create: async (data) => {
    const response = await api.post("/failure-modes", data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await api.patch(`/failure-modes/${id}`, data);
    return response.data;
  },
  
  delete: async (id) => {
    const response = await api.delete(`/failure-modes/${id}`);
    return response.data;
  },
  
  validate: async (id, validatorName, validatorPosition, validatorId) => {
    const response = await api.post(`/failure-modes/${id}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition,
      validated_by_id: validatorId
    });
    return response.data;
  },
  
  unvalidate: async (id) => {
    const response = await api.post(`/failure-modes/${id}/unvalidate`);
    return response.data;
  },
  
  // Version history
  getVersions: async (id) => {
    const response = await api.get(`/failure-modes/${id}/versions`);
    return response.data;
  },
  
  rollback: async (id, versionId, reason = null) => {
    const response = await api.post(`/failure-modes/${id}/rollback`, {
      version_id: versionId,
      reason
    });
    return response.data;
  },
  
  getCountsByEquipmentType: async () => {
    const response = await api.get("/failure-modes/counts-by-equipment-type");
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
  
  getDeletionImpact: async (nodeId) => {
    const response = await api.get(`/equipment-hierarchy/nodes/${nodeId}/deletion-impact`);
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
  
  changeNodeLevel: async (nodeId, newLevel, newParentId = null) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/change-level`, {
      new_level: newLevel,
      new_parent_id: newParentId
    });
    return response.data;
  },
  
  reorderNode: async (nodeId, direction) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/reorder`, {
      direction
    });
    return response.data;
  },
  
  reorderNodeToPosition: async (nodeId, targetNodeId, position, newParentId = null) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/reorder-to`, {
      target_node_id: targetNodeId,
      position: position,
      new_parent_id: newParentId
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
  
  // Equipment type management
  createEquipmentType: async (typeData) => {
    const response = await api.post("/equipment-hierarchy/types", typeData);
    return response.data;
  },
  
  updateEquipmentType: async (typeId, updateData) => {
    const response = await api.patch(`/equipment-hierarchy/types/${typeId}`, updateData);
    return response.data;
  },
  
  deleteEquipmentType: async (typeId) => {
    const response = await api.delete(`/equipment-hierarchy/types/${typeId}`);
    return response.data;
  },
  
  // Equipment history timeline
  getEquipmentHistory: async (nodeId) => {
    const response = await api.get(`/equipment-hierarchy/nodes/${nodeId}/history`);
    return response.data;
  },
};

// Causal Investigation API
export const investigationAPI = {
  // Investigation CRUD
  getAll: async (status = null) => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get(`/investigations${params}`);
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/investigations/${id}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await api.post("/investigations", data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await api.patch(`/investigations/${id}`, data);
    return response.data;
  },
  
  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteCentralActions) params.append('delete_central_actions', 'true');
    const queryString = params.toString();
    const url = `/investigations/${id}${queryString ? `?${queryString}` : ''}`;
    const response = await api.delete(url);
    return response.data;
  },
  
  getStats: async (id) => {
    const response = await api.get(`/investigations/${id}/stats`);
    return response.data;
  },
  
  // Create from threat
  createFromThreat: async (threatId) => {
    const response = await api.post(`/threats/${threatId}/investigate`);
    return response.data;
  },
  
  // Timeline events
  createEvent: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/events`, { ...data, investigation_id: invId });
    return response.data;
  },
  
  updateEvent: async (invId, eventId, data) => {
    const response = await api.patch(`/investigations/${invId}/events/${eventId}`, data);
    return response.data;
  },
  
  deleteEvent: async (invId, eventId) => {
    const response = await api.delete(`/investigations/${invId}/events/${eventId}`);
    return response.data;
  },
  
  // Failure identifications
  createFailure: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/failures`, { ...data, investigation_id: invId });
    return response.data;
  },
  
  updateFailure: async (invId, failureId, data) => {
    const response = await api.patch(`/investigations/${invId}/failures/${failureId}`, data);
    return response.data;
  },
  
  deleteFailure: async (invId, failureId) => {
    const response = await api.delete(`/investigations/${invId}/failures/${failureId}`);
    return response.data;
  },
  
  // Cause nodes
  createCause: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/causes`, { ...data, investigation_id: invId });
    return response.data;
  },
  
  updateCause: async (invId, causeId, data) => {
    const response = await api.patch(`/investigations/${invId}/causes/${causeId}`, data);
    return response.data;
  },
  
  deleteCause: async (invId, causeId) => {
    const response = await api.delete(`/investigations/${invId}/causes/${causeId}`);
    return response.data;
  },
  
  // Action items
  createAction: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/actions`, { ...data, investigation_id: invId });
    return response.data;
  },
  
  updateAction: async (invId, actionId, data) => {
    const response = await api.patch(`/investigations/${invId}/actions/${actionId}`, data);
    return response.data;
  },
  
  deleteAction: async (invId, actionId) => {
    const response = await api.delete(`/investigations/${invId}/actions/${actionId}`);
    return response.data;
  },
  
  // Evidence
  addEvidence: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/evidence`, { ...data, investigation_id: invId });
    return response.data;
  },
  
  deleteEvidence: async (invId, evidenceId) => {
    const response = await api.delete(`/investigations/${invId}/evidence/${evidenceId}`);
    return response.data;
  },
  
  // File upload
  uploadFile: async (invId, file, description = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (description) {
      formData.append('description', description);
    }
    const response = await api.post(`/investigations/${invId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  // File download
  downloadFile: async (storagePath) => {
    const response = await api.get(`/files/${storagePath}`, {
      responseType: 'blob',
    });
    return response.data;
  },
  
  // Report generation
  downloadReportPPTX: async (investigationId) => {
    const response = await api.get(`/investigations/${investigationId}/report/pptx`, {
      responseType: 'blob',
    });
    return response.data;
  },
  
  downloadReportPDF: async (investigationId) => {
    const response = await api.get(`/investigations/${investigationId}/report/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },
  
  getAISummary: async (investigationId) => {
    const response = await api.get(`/investigations/${investigationId}/ai-summary`);
    return response.data;
  },
};

// Centralized Actions API
export const actionsAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.assignee) params.append('assignee', filters.assignee);
    if (filters.source_type) params.append('source_type', filters.source_type);
    const response = await api.get(`/actions?${params.toString()}`);
    return response.data;
  },
  
  getOverdue: async () => {
    const response = await api.get('/actions/overdue');
    return response.data;
  },
  
  get: async (actionId) => {
    const response = await api.get(`/actions/${actionId}`);
    return response.data;
  },
  
  // Alias for get() - kept for backward compatibility
  getById: async (actionId) => {
    const response = await api.get(`/actions/${actionId}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await api.post('/actions', data);
    return response.data;
  },
  
  update: async (actionId, data) => {
    const response = await api.patch(`/actions/${actionId}`, data);
    return response.data;
  },
  
  delete: async (actionId) => {
    const response = await api.delete(`/actions/${actionId}`);
    return response.data;
  },
  
  uploadAttachment: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/tasks/upload-attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  
  // Validation
  validate: async (actionId, validatorName, validatorPosition, validatorId) => {
    const response = await api.post(`/actions/${actionId}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition,
      validated_by_id: validatorId
    });
    return response.data;
  },
  
  unvalidate: async (actionId) => {
    const response = await api.post(`/actions/${actionId}/unvalidate`);
    return response.data;
  },
};

// AI Risk Engine API
// Extended timeout axios instance for AI operations (2 minutes)
const aiApi = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 minutes for AI operations
});

// Add auth interceptor for AI API
aiApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// AI-specific error handling
aiApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      if (!window.location.pathname.includes('/login')) {
        window.location.href = "/login";
      }
    }
    
    // Better error messages for AI timeouts
    if (error.code === 'ECONNABORTED') {
      error.message = 'AI analysis taking longer than expected. Please try again.';
      error.isTimeout = true;
    } else if (!error.response && error.message === 'Network Error') {
      error.code = 'ERR_NETWORK';
      error.message = 'Network error - please check your connection';
    }
    return Promise.reject(error);
  }
);

export const aiRiskAPI = {
  // Risk Analysis - uses extended timeout
  analyzeRisk: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/analyze-risk/${threatId}`, {
      include_forecast: options.includeForecast ?? true,
      forecast_days: options.forecastDays ?? 7,
      include_similar_incidents: options.includeSimilarIncidents ?? true,
    });
    return response.data;
  },
  
  getRiskInsights: async (threatId) => {
    const response = await api.get(`/ai/risk-insights/${threatId}`);
    return response.data;
  },
  
  getTopRisks: async (limit = 5) => {
    const response = await api.get(`/ai/top-risks?limit=${limit}`);
    return response.data;
  },
  
  // Causal Analysis - uses extended timeout
  generateCauses: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/generate-causes/${threatId}`, {
      max_causes: options.maxCauses ?? 5,
      include_evidence: options.includeEvidence ?? true,
      include_mitigations: options.includeMitigations ?? true,
    });
    return response.data;
  },
  
  getCausalAnalysis: async (threatId) => {
    const response = await api.get(`/ai/causal-analysis/${threatId}`);
    return response.data;
  },
  
  explain: async (threatId) => {
    const response = await aiApi.post(`/ai/explain/${threatId}`);
    return response.data;
  },
  
  // Fault Tree - uses extended timeout
  generateFaultTree: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/fault-tree/${threatId}`, {
      max_depth: options.maxDepth ?? 4,
      include_probabilities: options.includeProbabilities ?? true,
    });
    return response.data;
  },
  
  getFaultTree: async (threatId) => {
    const response = await api.get(`/ai/fault-tree/${threatId}`);
    return response.data;
  },
  
  // Bow-Tie Model - uses extended timeout
  generateBowTie: async (threatId) => {
    const response = await aiApi.post(`/ai/bow-tie/${threatId}`);
    return response.data;
  },
  
  getBowTie: async (threatId) => {
    const response = await api.get(`/ai/bow-tie/${threatId}`);
    return response.data;
  },
  
  // Action Optimization - uses extended timeout
  optimizeActions: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/optimize-actions/${threatId}`, {
      budget_limit: options.budgetLimit ?? null,
      max_downtime_hours: options.maxDowntimeHours ?? null,
      prioritize_by: options.prioritizeBy ?? "roi",
    });
    return response.data;
  },
  
  getActionOptimization: async (threatId) => {
    const response = await api.get(`/ai/action-optimization/${threatId}`);
    return response.data;
  },
};

// Maintenance Strategy API
export const maintenanceStrategyAPI = {
  // List all strategies with optional search
  getAll: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.equipment_type_id) params.append("equipment_type_id", filters.equipment_type_id);
    if (filters.search) params.append("search", filters.search);
    const response = await api.get(`/maintenance-strategies?${params.toString()}`);
    return response.data;
  },
  
  // Get a single strategy by ID
  getById: async (strategyId) => {
    const response = await api.get(`/maintenance-strategies/${strategyId}`);
    return response.data;
  },
  
  // Get strategy by equipment type
  getByEquipmentType: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-strategies/by-equipment-type/${equipmentTypeId}`);
    return response.data;
  },
  
  // Generate a strategy for an equipment type (all criticality levels)
  generate: async (equipmentTypeId, equipmentTypeName) => {
    const response = await api.post("/maintenance-strategies/generate", {
      equipment_type_id: equipmentTypeId,
      equipment_type_name: equipmentTypeName,
      include_costs: true,
    });
    return response.data;
  },
  
  // Generate strategies for ALL equipment types
  generateAll: async () => {
    const response = await api.post("/maintenance-strategies/generate-all", {
      include_costs: true,
    });
    return response.data;
  },
  
  // Create a manual strategy
  create: async (data) => {
    const response = await api.post("/maintenance-strategies", data);
    return response.data;
  },
  
  // Update a strategy
  update: async (strategyId, data) => {
    const response = await api.patch(`/maintenance-strategies/${strategyId}`, data);
    return response.data;
  },
  
  // Delete a strategy
  delete: async (strategyId) => {
    const response = await api.delete(`/maintenance-strategies/${strategyId}`);
    return response.data;
  },
  
  // Increment version
  incrementVersion: async (strategyId, major = false) => {
    const response = await api.post(`/maintenance-strategies/${strategyId}/increment-version?major=${major}`);
    return response.data;
  },
};

export const usersAPI = {
  getAll: async () => {
    const response = await api.get('/rbac/users');
    return response.data;
  },
  
  // Get pending users awaiting approval
  getPending: async () => {
    const response = await api.get('/rbac/users/pending');
    return response.data;
  },
  
  // Approve or reject a user
  approveUser: async (userId, action, role = null, rejectionReason = null, assignedInstallations = null) => {
    const response = await api.patch(`/rbac/users/${userId}/approve`, {
      action, // 'approve' or 'reject'
      role,
      rejection_reason: rejectionReason,
      assigned_installations: assignedInstallations,
    });
    return response.data;
  },
  
  // Update user's assigned installations
  updateInstallations: async (userId, installations) => {
    const response = await api.patch(`/rbac/users/${userId}/installations`, {
      assigned_installations: installations,
    });
    return response.data;
  },
  
  // Update user status (active/inactive)
  updateStatus: async (userId, isActive) => {
    const response = await api.patch(`/rbac/users/${userId}/status`, {
      is_active: isActive,
    });
    return response.data;
  },
  
  // Update user role
  updateRole: async (userId, role) => {
    const response = await api.patch(`/rbac/users/${userId}/role`, {
      role,
    });
    return response.data;
  },
};

// Feedback API
export const feedbackAPI = {
  // Submit new feedback
  submit: async (data) => {
    const response = await api.post('/feedback', data);
    return response.data;
  },
  
  // Upload screenshot for feedback
  uploadScreenshot: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/feedback/upload-screenshot', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  
  // Transcribe audio to text
  transcribeAudio: async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    const response = await api.post('/feedback/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  
  // Get user's own feedback
  getMyFeedback: async () => {
    const response = await api.get('/feedback/my');
    return response.data;
  },
  
  // Get single feedback detail
  getById: async (feedbackId) => {
    const response = await api.get(`/feedback/${feedbackId}`);
    return response.data;
  },
  
  // Update feedback
  update: async (feedbackId, data) => {
    const response = await api.put(`/feedback/${feedbackId}`, data);
    return response.data;
  },
  
  // Delete feedback
  delete: async (feedbackId) => {
    const response = await api.delete(`/feedback/${feedbackId}`);
    return response.data;
  },
  
  // Bulk update status for multiple feedback items
  bulkUpdateStatus: async (feedbackIds, status) => {
    const response = await api.post('/feedback/bulk-status', { feedback_ids: feedbackIds, status });
    return response.data;
  },
  
  // Generate AI prompt from selected feedback items
  generatePrompt: async (feedbackIds) => {
    const response = await api.post('/feedback/generate-prompt', { feedback_ids: feedbackIds });
    return response.data;
  },
};

// Image Analysis API
export const imageAnalysisAPI = {
  // Analyze single image for damage detection
  analyze: async (imageBase64, context = null, equipmentType = null) => {
    const response = await api.post('/image-analysis/analyze', {
      image_base64: imageBase64,
      context,
      equipment_type: equipmentType,
    });
    return response.data;
  },
  
  // Analyze multiple images
  analyzeMultiple: async (images, context = null, equipmentType = null) => {
    const response = await api.post('/image-analysis/analyze-multiple', {
      images,
      context,
      equipment_type: equipmentType,
    });
    return response.data;
  },
  
  // Health check
  healthCheck: async () => {
    const response = await api.get('/image-analysis/health');
    return response.data;
  },
};

// Permissions API
export const permissionsAPI = {
  // Get all permissions for all roles
  getAll: async () => {
    const response = await api.get('/permissions');
    return response.data;
  },
  
  // Get permissions for a specific role
  getByRole: async (role) => {
    const response = await api.get(`/permissions/${role}`);
    return response.data;
  },
  
  // Update all permissions for a role
  updateRole: async (role, permissions) => {
    const response = await api.put(`/permissions/${role}`, permissions);
    return response.data;
  },
  
  // Update a single permission
  patchPermission: async (update) => {
    const response = await api.patch('/permissions', update);
    return response.data;
  },
  
  // Reset all permissions to defaults
  reset: async () => {
    const response = await api.post('/permissions/reset');
    return response.data;
  },
  
  // Check if current user has a specific permission
  check: async (feature, action = 'read') => {
    const response = await api.get(`/permissions/check/${feature}?action=${action}`);
    return response.data;
  },
  
  // Get current user's permissions
  getMy: async () => {
    const response = await api.get('/permissions/my');
    return response.data;
  },
  
  // List all roles including custom roles
  listRoles: async () => {
    const response = await api.get('/permissions/roles');
    return response.data;
  },
  
  // Create a new custom role
  createRole: async (roleData) => {
    const response = await api.post('/permissions/roles', roleData);
    return response.data;
  },
  
  // Delete a custom role
  deleteRole: async (roleName) => {
    const response = await api.delete(`/permissions/roles/${roleName}`);
    return response.data;
  },
};

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
      actions
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
    const response = await api.post("/qr/print", {
      qr_ids: qrIds,
      template: options.template || "single",
      size: options.size || "medium",
      custom_size_mm: options.customSizeMm,
      show_label: options.showLabel !== false,
      show_description: options.showDescription || false,
      show_logo: options.showLogo || false
    }, { responseType: 'blob' });
    return response.data;
  },
  
  // Export QR codes
  export: async (qrIds, format = "png", includeMetadata = false) => {
    const response = await api.post("/qr/export", {
      qr_ids: qrIds,
      format,
      include_metadata: includeMetadata
    }, { responseType: 'blob' });
    return response.data;
  },
  
  // Get image URL for a QR code
  getImageUrl: (qrId, size = "medium", showLabel = true) => {
    return `${API_URL}/qr/${qrId}/image?size=${size}&show_label=${showLabel}`;
  }
};

// ==================== TASK SCHEDULER API ====================
export const taskSchedulerAPI = {
  // Templates
  getTemplates: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.discipline) searchParams.append("discipline", params.discipline);
    if (params.search) searchParams.append("search", params.search);
    const response = await api.get(`/task-templates?${searchParams}`);
    return response.data;
  },
  createTemplate: async (data) => {
    const response = await api.post("/task-templates", data);
    return response.data;
  },
  deleteTemplate: async (id) => {
    const response = await api.delete(`/task-templates/${id}`);
    return response.data;
  },
  updateTemplate: async (id, data) => {
    const response = await api.patch(`/task-templates/${id}`, data);
    return response.data;
  },

  // Plans
  getPlans: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.append("equipment_id", params.equipment_id);
    const response = await api.get(`/task-plans?${searchParams}`);
    return response.data;
  },
  createPlan: async (data) => {
    const response = await api.post("/task-plans", data);
    return response.data;
  },
  deletePlan: async (id) => {
    const response = await api.delete(`/task-plans/${id}`);
    return response.data;
  },
  updatePlan: async (id, data) => {
    const response = await api.patch(`/task-plans/${id}`, data);
    return response.data;
  },

  // Instances
  getInstances: async (params = {}) => {
    const searchParams = new URLSearchParams();
    searchParams.append("limit", "30");
    if (params.status) searchParams.append("status", params.status);
    if (params.plan_id) searchParams.append("plan_id", params.plan_id);
    const response = await api.get(`/task-instances?${searchParams}`);
    return response.data;
  },
  getCalendar: async (startDate, endDate) => {
    const response = await api.get(`/task-instances/calendar?start_date=${startDate}&end_date=${endDate}`);
    return response.data;
  },
  startInstance: async (id) => {
    const response = await api.post(`/task-instances/${id}/start`);
    return response.data;
  },
  completeInstance: async ({ id, data }) => {
    const response = await api.post(`/task-instances/${id}/complete`, data);
    return response.data;
  },
  generateInstances: async () => {
    const response = await api.post("/tasks/generate-all");
    return response.data;
  },
  deleteInstance: async (id) => {
    const response = await api.delete(`/task-instances/${id}`);
    return response.data;
  },
  getStats: async () => {
    const response = await api.get("/tasks/stats");
    return response.data;
  },
};

// ==================== MY TASKS API ====================
export const myTasksAPI = {
  getTasks: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.filter) searchParams.append("filter", params.filter);
    if (params.date) searchParams.append("date", params.date);
    if (params.status) searchParams.append("status", params.status);
    if (params.discipline) searchParams.append("discipline", params.discipline);
    const response = await api.get(`/my-tasks?${searchParams}`);
    return response.data;
  },
  uploadAttachment: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/tasks/upload-attachment", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  getAdhocPlans: async () => {
    const response = await api.get("/adhoc-plans");
    return response.data;
  },
  executeAdhocPlan: async (planId) => {
    const response = await api.post(`/adhoc-plans/${planId}/execute`);
    return response.data;
  },
  getTaskDetail: async (taskId) => {
    const response = await api.get(`/my-tasks/${taskId}`);
    return response.data;
  },
  startTask: async (taskId, isAction = false) => {
    const endpoint = isAction ? `/my-tasks/action/${taskId}/start` : `/task-instances/${taskId}/start`;
    const response = await api.post(endpoint);
    return response.data;
  },
  completeTask: async ({ taskId, data, isAction = false }) => {
    const endpoint = isAction ? `/my-tasks/action/${taskId}/complete` : `/task-instances/${taskId}/complete`;
    const response = await api.post(endpoint, data);
    return response.data;
  },
  deleteTask: async (taskId, isAction = false) => {
    const endpoint = isAction ? `/actions/${taskId}` : `/task-instances/${taskId}`;
    const response = await api.delete(endpoint);
    return response.data;
  },
};

// ==================== DEFINITIONS API ====================
export const definitionsAPI = {
  getInstallations: async () => {
    const response = await api.get("/definitions/installations");
    return response.data;
  },
  getDefinitions: async (equipmentId) => {
    const response = await api.get(`/definitions/equipment/${equipmentId}`);
    return response.data;
  },
  getDefaults: async () => {
    const response = await api.get("/definitions/defaults");
    return response.data;
  },
  saveDefinitions: async ({ equipmentId, severity, occurrence, detection, criticality }) => {
    const response = await api.post("/definitions", {
      equipment_id: equipmentId,
      severity,
      occurrence,
      detection,
      criticality,
    });
    return response.data;
  },
  resetDefinitions: async (equipmentId) => {
    const response = await api.delete(`/definitions/${equipmentId}`);
    return response.data;
  },
};

// ==================== PREFERENCES API ====================
export const preferencesAPI = {
  getPreferences: async () => {
    const response = await api.get("/users/me/preferences");
    return response.data;
  },
  updatePreferences: async (data) => {
    const response = await api.put("/users/me/preferences", data);
    return response.data;
  },
  getTimezones: async () => {
    const response = await api.get("/timezones");
    return response.data;
  },
};

// ==================== USER STATISTICS API ====================
export const userStatsAPI = {
  getOverview: async (period = "30", roleFilter = null) => {
    const params = new URLSearchParams({ period });
    if (roleFilter) params.append("role_filter", roleFilter);
    const response = await api.get(`/user-stats/overview?${params}`);
    return response.data;
  },
  getTrends: async (period = "30") => {
    const response = await api.get(`/user-stats/trends?period=${period}`);
    return response.data;
  },
};

// ==================== RBAC API (User Management) ====================
export const rbacAPI = {
  getUsers: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.role) searchParams.append("role", params.role);
    if (params.is_active !== undefined) searchParams.append("is_active", params.is_active);
    const response = await api.get(`/rbac/users?${searchParams}`);
    return response.data;
  },
  getPendingUsers: async () => {
    const response = await api.get("/rbac/users/pending");
    return response.data;
  },
  approveUser: async ({ userId, action, role, rejectionReason, assignedInstallations }) => {
    const response = await api.patch(`/rbac/users/${userId}/approve`, {
      action,
      role,
      rejection_reason: rejectionReason,
      assigned_installations: assignedInstallations,
    });
    return response.data;
  },
  getRoles: async () => {
    const response = await api.get("/rbac/roles");
    return response.data;
  },
  updateUserRole: async ({ userId, role }) => {
    const response = await api.patch(`/rbac/users/${userId}/role`, { role });
    return response.data;
  },
  updateUserStatus: async ({ userId, isActive }) => {
    const response = await api.patch(`/rbac/users/${userId}/status`, { is_active: isActive });
    return response.data;
  },
  updateUserProfile: async ({ userId, data }) => {
    const response = await api.patch(`/rbac/users/${userId}/profile`, data);
    return response.data;
  },
  uploadUserAvatar: async ({ userId, file }) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/rbac/users/${userId}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  getUserAvatar: async (userId) => {
    const response = await api.get(`/users/${userId}/avatar`, { responseType: "blob" });
    return URL.createObjectURL(response.data);
  },
  deleteUser: async (userId) => {
    const response = await api.delete(`/rbac/users/${userId}`);
    return response.data;
  },
  resetPassword: async (userId) => {
    const response = await api.post("/auth/admin-reset-password", { user_id: userId });
    return response.data;
  },
  resetIntro: async (userId) => {
    const response = await api.post(`/rbac/users/${userId}/reset-intro`);
    return response.data;
  },
  createUser: async (userData) => {
    const response = await api.post("/users/create", userData);
    return response.data;
  },
};

/**
 * Safely extract error message from API error response.
 * Handles Pydantic validation errors (array of objects) and standard error formats.
 * @param {Error} error - The error object from axios
 * @param {string} fallback - Fallback message if extraction fails
 * @returns {string} The error message as a string
 */
export const getErrorMessage = (error, fallback = "An error occurred") => {
  const detail = error?.response?.data?.detail;
  
  if (typeof detail === 'string') {
    return detail;
  }
  
  if (Array.isArray(detail)) {
    // Pydantic validation errors
    return detail[0]?.msg || detail[0]?.message || fallback;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return fallback;
};


export default api;
