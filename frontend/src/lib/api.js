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
  
  delete: async (id) => {
    const response = await api.delete(`/threats/${id}`);
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
  
  validate: async (id, validatorName, validatorPosition) => {
    const response = await api.post(`/failure-modes/${id}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition
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
  
  delete: async (id) => {
    const response = await api.delete(`/investigations/${id}`);
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
};

// AI Risk Engine API
export const aiRiskAPI = {
  // Risk Analysis
  analyzeRisk: async (threatId, options = {}) => {
    const response = await api.post(`/ai/analyze-risk/${threatId}`, {
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
  
  // Causal Analysis
  generateCauses: async (threatId, options = {}) => {
    const response = await api.post(`/ai/generate-causes/${threatId}`, {
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
    const response = await api.post(`/ai/explain/${threatId}`);
    return response.data;
  },
  
  // Fault Tree
  generateFaultTree: async (threatId, options = {}) => {
    const response = await api.post(`/ai/fault-tree/${threatId}`, {
      max_depth: options.maxDepth ?? 4,
      include_probabilities: options.includeProbabilities ?? true,
    });
    return response.data;
  },
  
  getFaultTree: async (threatId) => {
    const response = await api.get(`/ai/fault-tree/${threatId}`);
    return response.data;
  },
  
  // Bow-Tie Model
  generateBowTie: async (threatId) => {
    const response = await api.post(`/ai/bow-tie/${threatId}`);
    return response.data;
  },
  
  getBowTie: async (threatId) => {
    const response = await api.get(`/ai/bow-tie/${threatId}`);
    return response.data;
  },
  
  // Action Optimization
  optimizeActions: async (threatId, options = {}) => {
    const response = await api.post(`/ai/optimize-actions/${threatId}`, {
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

export default api;
