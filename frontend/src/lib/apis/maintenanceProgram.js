/**
 * Maintenance Program API Client
 * 
 * The Maintenance Program provides a single executable maintenance program 
 * for each equipment item, consolidating tasks from multiple sources.
 */
import { api } from '../apiClient';

const BASE_URL = '/maintenance-programs';

export const maintenanceProgramAPI = {
  // ============= Program CRUD =============
  
  /**
   * List all maintenance programs
   * @param {Object} params - Query parameters
   * @param {string} [params.equipment_type_id] - Filter by equipment type
   * @param {string} [params.status] - Filter by status (draft, active, archived)
   * @param {string} [params.search] - Search by equipment name
   * @param {number} [params.limit=100] - Maximum results
   * @param {number} [params.offset=0] - Pagination offset
   */
  listPrograms: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.equipment_type_id) queryParams.append('equipment_type_id', params.equipment_type_id);
    if (params.status) queryParams.append('status', params.status);
    if (params.search) queryParams.append('search', params.search);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    
    const query = queryParams.toString();
    const response = await api.get(`${BASE_URL}${query ? `?${query}` : ''}`);
    return response.data;
  },
  
  /**
   * Get summary statistics for maintenance programs
   * @param {string} [equipment_type_id] - Filter by equipment type
   */
  getSummary: async (equipment_type_id = null) => {
    const params = equipment_type_id ? `?equipment_type_id=${equipment_type_id}` : '';
    const response = await api.get(`${BASE_URL}/summary${params}`);
    return response.data;
  },
  
  /**
   * Get maintenance program for specific equipment
   * @param {string} equipmentId - Equipment ID
   */
  getProgram: async (equipmentId) => {
    const response = await api.get(`${BASE_URL}/${equipmentId}`);
    return response.data;
  },
  
  /**
   * Create/initialize a maintenance program for equipment
   * @param {string} equipmentId - Equipment ID
   * @param {Object} options - Creation options
   * @param {boolean} [options.generate_from_strategy=true] - Auto-generate tasks from strategy
   * @param {boolean} [options.include_ai_recommendations=false] - Generate AI recommendations
   */
  createProgram: async (equipmentId, options = {}) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}`, {
      equipment_id: equipmentId,
      generate_from_strategy: options.generate_from_strategy ?? true,
      include_ai_recommendations: options.include_ai_recommendations ?? false,
    });
    return response.data;
  },
  
  /**
   * Delete a maintenance program
   * @param {string} equipmentId - Equipment ID
   */
  deleteProgram: async (equipmentId) => {
    const response = await api.delete(`${BASE_URL}/${equipmentId}`);
    return response.data;
  },
  
  // ============= Task Management =============
  
  /**
   * Get tasks for a maintenance program
   * @param {string} equipmentId - Equipment ID
   * @param {Object} params - Query parameters
   * @param {string} [params.source] - Filter by source (strategy_generated, customer_imported, ai_generated, manual)
   * @param {string} [params.category] - Filter by category
   * @param {boolean} [params.is_active] - Filter by active status
   */
  getTasks: async (equipmentId, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.source) queryParams.append('source', params.source);
    if (params.category) queryParams.append('category', params.category);
    if (params.is_active !== undefined) queryParams.append('is_active', params.is_active);
    
    const query = queryParams.toString();
    const response = await api.get(`${BASE_URL}/${equipmentId}/tasks${query ? `?${query}` : ''}`);
    return response.data;
  },
  
  /**
   * Add a manual task to a maintenance program
   * @param {string} equipmentId - Equipment ID
   * @param {Object} task - Task data
   */
  addTask: async (equipmentId, task) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}/tasks`, task);
    return response.data;
  },
  
  /**
   * Update/override a task in a maintenance program
   * @param {string} equipmentId - Equipment ID
   * @param {string} taskId - Task ID
   * @param {Object} updates - Updates to apply
   */
  updateTask: async (equipmentId, taskId, updates) => {
    const response = await api.patch(`${BASE_URL}/${equipmentId}/tasks/${taskId}`, updates);
    return response.data;
  },
  
  /**
   * Delete a task from a maintenance program
   * @param {string} equipmentId - Equipment ID
   * @param {string} taskId - Task ID
   */
  deleteTask: async (equipmentId, taskId) => {
    const response = await api.delete(`${BASE_URL}/${equipmentId}/tasks/${taskId}`);
    return response.data;
  },
  
  // ============= Program Operations =============
  
  /**
   * Regenerate a maintenance program from strategy
   * @param {string} equipmentId - Equipment ID
   * @param {Object} options - Regeneration options
   */
  regenerateProgram: async (equipmentId, options = {}) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}/regenerate`, {
      preserve_overrides: options.preserve_overrides ?? true,
      preserve_manual_tasks: options.preserve_manual_tasks ?? true,
      preserve_imported_tasks: options.preserve_imported_tasks ?? true,
      preview_only: options.preview_only ?? false,
    });
    return response.data;
  },
  
  /**
   * Import tasks from a PM Import session
   * @param {string} equipmentId - Equipment ID
   * @param {string} importSessionId - PM Import session ID
   * @param {string[]} [taskIds] - Specific task IDs to import (or all if omitted)
   */
  importTasks: async (equipmentId, importSessionId, taskIds = null) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}/import-tasks`, {
      import_session_id: importSessionId,
      task_ids: taskIds,
    });
    return response.data;
  },
  
  /**
   * Generate AI maintenance recommendations
   * @param {string} equipmentId - Equipment ID
   * @param {Object} options - AI options
   */
  generateAIRecommendations: async (equipmentId, options = {}) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}/ai-recommendations`, {
      include_failure_history: options.include_failure_history ?? true,
      include_industry_standards: options.include_industry_standards ?? true,
      max_recommendations: options.max_recommendations ?? 10,
    });
    return response.data;
  },
  
  /**
   * Accept an AI recommendation
   * @param {string} equipmentId - Equipment ID
   * @param {Object} task - The recommendation task to accept
   */
  acceptAIRecommendation: async (equipmentId, task) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}/ai-recommendations/accept`, task);
    return response.data;
  },
  
  // ============= Status & Approval =============
  
  /**
   * Update program status
   * @param {string} equipmentId - Equipment ID
   * @param {string} status - New status (draft, active, archived)
   */
  updateStatus: async (equipmentId, status) => {
    const response = await api.patch(`${BASE_URL}/${equipmentId}/status?status=${status}`);
    return response.data;
  },
  
  /**
   * Approve or reject a maintenance program
   * @param {string} equipmentId - Equipment ID
   * @param {string} approvalStatus - 'approved' or 'rejected'
   * @param {string} [comments] - Optional comments
   */
  approveProgram: async (equipmentId, approvalStatus, comments = null) => {
    const response = await api.post(`${BASE_URL}/${equipmentId}/approve`, {
      approval_status: approvalStatus,
      comments,
    });
    return response.data;
  },
  
  // ============= Version History & Audit =============
  
  /**
   * Get version history for a maintenance program
   * @param {string} equipmentId - Equipment ID
   */
  getVersionHistory: async (equipmentId) => {
    const response = await api.get(`${BASE_URL}/${equipmentId}/version-history`);
    return response.data;
  },
  
  /**
   * Get audit log for a maintenance program
   * @param {string} equipmentId - Equipment ID
   * @param {number} [limit=50] - Maximum entries
   */
  getAuditLog: async (equipmentId, limit = 50) => {
    const response = await api.get(`${BASE_URL}/${equipmentId}/audit-log?limit=${limit}`);
    return response.data;
  },
  
  // ============= Bulk Operations =============
  
  /**
   * Generate maintenance programs for multiple equipment items
   * @param {string[]} equipmentIds - List of equipment IDs
   * @param {boolean} [generateFromStrategy=true] - Auto-generate from strategy
   */
  bulkGenerate: async (equipmentIds, generateFromStrategy = true) => {
    const response = await api.post(`${BASE_URL}/bulk/generate`, {
      equipment_ids: equipmentIds,
      generate_from_strategy: generateFromStrategy,
    });
    return response.data;
  },
  
  /**
   * Regenerate all programs for an equipment type
   * @param {string} equipmentTypeId - Equipment type ID
   * @param {boolean} [preserveOverrides=true] - Keep manual overrides
   * @param {boolean} [preserveManualTasks=true] - Keep manually added tasks
   */
  bulkRegenerate: async (equipmentTypeId, preserveOverrides = true, preserveManualTasks = true) => {
    const response = await api.post(`${BASE_URL}/bulk/regenerate`, {
      equipment_type_id: equipmentTypeId,
      preserve_overrides: preserveOverrides,
      preserve_manual_tasks: preserveManualTasks,
    });
    return response.data;
  },
};

export default maintenanceProgramAPI;
