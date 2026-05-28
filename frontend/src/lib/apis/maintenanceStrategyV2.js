import api from "../apiClient";

export const maintenanceStrategyV2API = {
  // ============= Equipment Type Strategy =============
  
  /**
   * List all equipment type strategies
   */
  listStrategies: async (params = {}) => {
    const response = await api.get("/maintenance-strategies-v2", { params });
    return response.data;
  },

  /**
   * Get strategy for a specific equipment type
   */
  getStrategy: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-strategies-v2/${equipmentTypeId}`);
    return response.data;
  },

  /**
   * Create a new equipment type strategy
   */
  createStrategy: async (data) => {
    const response = await api.post("/maintenance-strategies-v2", data);
    return response.data;
  },

  /**
   * Update an equipment type strategy
   */
  updateStrategy: async (equipmentTypeId, data) => {
    const response = await api.patch(`/maintenance-strategies-v2/${equipmentTypeId}`, data);
    return response.data;
  },

  /**
   * Delete an equipment type strategy
   */
  deleteStrategy: async (equipmentTypeId) => {
    const response = await api.delete(`/maintenance-strategies-v2/${equipmentTypeId}`);
    return response.data;
  },

  // ============= Failure Mode Strategies =============

  /**
   * Get failure mode strategies for an equipment type
   */
  getFailureModeStrategies: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-strategies-v2/${equipmentTypeId}/failure-modes`);
    return response.data;
  },

  /**
   * Update a failure mode's strategy
   */
  updateFailureModeStrategy: async (equipmentTypeId, failureModeId, data) => {
    const response = await api.patch(
      `/maintenance-strategies-v2/${equipmentTypeId}/failure-modes/${failureModeId}`,
      data
    );
    return response.data;
  },

  // ============= Task Templates =============

  /**
   * Get task templates for an equipment type
   */
  getTaskTemplates: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-strategies-v2/${equipmentTypeId}/tasks`);
    return response.data;
  },

  /**
   * Add a task template
   */
  addTaskTemplate: async (equipmentTypeId, data) => {
    const response = await api.post(`/maintenance-strategies-v2/${equipmentTypeId}/tasks`, data);
    return response.data;
  },

  /**
   * Update a task template
   */
  updateTaskTemplate: async (equipmentTypeId, taskId, data) => {
    const response = await api.patch(
      `/maintenance-strategies-v2/${equipmentTypeId}/tasks/${taskId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a task template
   */
  deleteTaskTemplate: async (equipmentTypeId, taskId) => {
    const response = await api.delete(
      `/maintenance-strategies-v2/${equipmentTypeId}/tasks/${taskId}`
    );
    return response.data;
  },

  // ============= Task Generation =============

  /**
   * Generate tasks for a specific equipment asset
   */
  generateTasks: async (equipmentTypeId, data) => {
    const response = await api.post(
      `/maintenance-strategies-v2/${equipmentTypeId}/generate-tasks`,
      data
    );
    return response.data;
  },

  // ============= Equipment Strategy Instance =============

  /**
   * Get strategy instance for a specific equipment
   */
  getEquipmentStrategy: async (equipmentId) => {
    const response = await api.get(`/maintenance-strategies-v2/equipment/${equipmentId}`);
    return response.data;
  },

  /**
   * Override a task at equipment level
   */
  overrideTask: async (equipmentId, taskId, data) => {
    const response = await api.patch(
      `/maintenance-strategies-v2/equipment/${equipmentId}/tasks/${taskId}`,
      data
    );
    return response.data;
  },

  /**
   * Disable a failure mode for equipment
   */
  disableFailureMode: async (equipmentId, failureModeId, reason = null) => {
    const params = { failure_mode_id: failureModeId };
    if (reason) params.reason = reason;
    const response = await api.post(
      `/maintenance-strategies-v2/equipment/${equipmentId}/disable-failure-mode`,
      null,
      { params }
    );
    return response.data;
  },

  /**
   * Regenerate tasks for equipment
   */
  regenerateTasks: async (equipmentId, data = {}) => {
    const response = await api.post(
      `/maintenance-strategies-v2/equipment/${equipmentId}/regenerate`,
      data
    );
    return response.data;
  },

  // ============= Version History & Audit =============

  /**
   * Get version history for a strategy
   */
  getVersionHistory: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-strategies-v2/${equipmentTypeId}/version-history`);
    return response.data;
  },

  /**
   * Get audit log for a strategy
   */
  getAuditLog: async (equipmentTypeId, limit = 50) => {
    const response = await api.get(`/maintenance-strategies-v2/${equipmentTypeId}/audit-log`, {
      params: { limit },
    });
    return response.data;
  },

  // ============= Local Tasks =============

  /**
   * Add a local task to equipment
   */
  addLocalTask: async (equipmentId, data) => {
    const response = await api.post(
      `/maintenance-strategies-v2/equipment/${equipmentId}/local-tasks`,
      data
    );
    return response.data;
  },

  /**
   * Delete a local task from equipment
   */
  deleteLocalTask: async (equipmentId, taskId) => {
    const response = await api.delete(
      `/maintenance-strategies-v2/equipment/${equipmentId}/local-tasks/${taskId}`
    );
    return response.data;
  },

  /**
   * Enable a failure mode for equipment
   */
  enableFailureMode: async (equipmentId, failureModeId) => {
    const response = await api.post(
      `/maintenance-strategies-v2/equipment/${equipmentId}/enable-failure-mode`,
      null,
      { params: { failure_mode_id: failureModeId } }
    );
    return response.data;
  },

  /**
   * Get sync status for equipment
   */
  getSyncStatus: async (equipmentId) => {
    const response = await api.get(`/maintenance-strategies-v2/equipment/${equipmentId}/sync-status`);
    return response.data;
  },
};
