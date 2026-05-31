/**
 * Maintenance Scheduler & Planning Engine API
 */
import api from './index';

export const maintenanceSchedulerAPI = {
  // ============= Equipment Maintenance Programs =============
  
  /**
   * Apply maintenance strategy to equipment
   */
  applyStrategy: async (equipmentTypeId, equipmentIds) => {
    const response = await api.post(`/maintenance-scheduler/apply-strategy/${equipmentTypeId}`, {
      equipment_ids: equipmentIds
    });
    return response.data;
  },

  /**
   * Get maintenance programs
   */
  getPrograms: async (params = {}) => {
    const response = await api.get('/maintenance-scheduler/programs', { params });
    return response.data;
  },

  /**
   * Get programs summary for equipment type
   */
  getProgramsSummary: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-scheduler/programs/${equipmentTypeId}/summary`);
    return response.data;
  },

  // ============= Scheduler Engine =============

  /**
   * Run scheduler engine
   */
  runScheduler: async (params = {}) => {
    const response = await api.post('/maintenance-scheduler/run-scheduler', params);
    return response.data;
  },

  // ============= Scheduled Tasks =============

  /**
   * Get scheduled tasks
   */
  getTasks: async (params = {}) => {
    const response = await api.get('/maintenance-scheduler/tasks', { params });
    return response.data;
  },

  /**
   * Get daily planner view
   */
  getDailyPlanner: async (date) => {
    const response = await api.get('/maintenance-scheduler/tasks/daily-planner', {
      params: date ? { date } : {}
    });
    return response.data;
  },

  /**
   * Get weekly planner view
   */
  getWeeklyPlanner: async (startDate) => {
    const response = await api.get('/maintenance-scheduler/tasks/weekly-planner', {
      params: startDate ? { start_date: startDate } : {}
    });
    return response.data;
  },

  /**
   * Update task
   */
  updateTask: async (taskId, data) => {
    const response = await api.patch(`/maintenance-scheduler/tasks/${taskId}`, data);
    return response.data;
  },

  /**
   * Complete task
   */
  completeTask: async (taskId, data) => {
    const response = await api.post(`/maintenance-scheduler/tasks/${taskId}/complete`, data);
    return response.data;
  },

  /**
   * Defer task
   */
  deferTask: async (taskId, data) => {
    const response = await api.post(`/maintenance-scheduler/tasks/${taskId}/defer`, data);
    return response.data;
  },

  // ============= Timeline =============

  /**
   * Get timeline view
   */
  getTimeline: async (params = {}) => {
    const response = await api.get('/maintenance-scheduler/timeline', { params });
    return response.data;
  },

  // ============= Dashboard =============

  /**
   * Get scheduler dashboard KPIs
   */
  getDashboard: async (equipmentTypeId) => {
    const response = await api.get('/maintenance-scheduler/dashboard', {
      params: equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}
    });
    return response.data;
  },

  // ============= Technicians =============

  /**
   * Get technicians
   */
  getTechnicians: async () => {
    const response = await api.get('/maintenance-scheduler/technicians');
    return response.data;
  },

  /**
   * Create technician
   */
  createTechnician: async (data) => {
    const response = await api.post('/maintenance-scheduler/technicians', data);
    return response.data;
  },
};

export default maintenanceSchedulerAPI;
