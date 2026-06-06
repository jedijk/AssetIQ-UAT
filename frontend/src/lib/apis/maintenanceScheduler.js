/**
 * Maintenance Scheduler & Planning Engine API
 */
import { api } from "../apiClient";

/** React Query keys use `maintenance-scheduler-*`; prefix invalidation must use a predicate. */
export const isMaintenanceSchedulerQuery = (query) => {
  const key = query?.queryKey?.[0];
  return typeof key === "string" && key.startsWith("maintenance-scheduler");
};

export async function refreshMaintenanceSchedulerQueries(queryClient) {
  await queryClient.invalidateQueries({ predicate: isMaintenanceSchedulerQuery });
  await queryClient.refetchQueries({
    predicate: isMaintenanceSchedulerQuery,
    type: "active",
  });
}

const APPLY_STRATEGY_ASYNC_THRESHOLD = 5;
const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export async function pollSchedulerJob(jobId, { intervalMs = JOB_POLL_INTERVAL_MS, timeoutMs = JOB_POLL_TIMEOUT_MS } = {}) {
  const started = Date.now();
  while Date.now() - started < timeoutMs) {
    const response = await api.get(`/maintenance-scheduler/jobs/${jobId}`);
    const job = response.data;
    const status = job?.status;
    if (status === "completed") {
      return job.result ?? job;
    }
    if (status === "failed" || status === "dead_letter") {
      const err = new Error(job?.error || "Apply strategy job failed");
      err.job = job;
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Apply strategy timed out while waiting for background job");
}

export const maintenanceSchedulerAPI = {
  // ============= Equipment Maintenance Programs =============
  
  /**
   * Apply maintenance strategy to equipment.
   * Automatically uses background job + polling when batch is large.
   */
  applyStrategy: async (equipmentTypeId, equipmentIds, options = {}) => {
    const runAsync =
      options.runAsync ??
      (Array.isArray(equipmentIds) && equipmentIds.length >= APPLY_STRATEGY_ASYNC_THRESHOLD);

    const response = await api.post(`/maintenance-scheduler/apply-strategy/${equipmentTypeId}`, {
      equipment_ids: equipmentIds,
      run_async: runAsync,
    });
    const data = response.data;

    if (data?.job_id && data?.status === "pending") {
      return pollSchedulerJob(data.job_id, options.poll);
    }
    return data;
  },

  getJob: async (jobId) => {
    const response = await api.get(`/maintenance-scheduler/jobs/${jobId}`);
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

  /**
   * Cleanup orphan scheduled tasks (whose program no longer exists)
   * and orphan maintenance_programs (whose strategy was removed).
   */
  cleanupOrphans: async (params = {}) => {
    const response = await api.post('/maintenance-scheduler/cleanup-orphans', params);
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

  // ============= AI Maintenance Planner =============

  /**
   * Generate AI-driven maintenance plan
   */
  aiPlan: async (params = {}) => {
    const response = await api.post('/maintenance-scheduler/ai-plan', params);
    return response.data;
  },

  /**
   * Apply AI recommendations to scheduled tasks
   */
  applyAiPlan: async (recommendations) => {
    const response = await api.post('/maintenance-scheduler/ai-plan/apply', { recommendations });
    return response.data;
  },
};

export default maintenanceSchedulerAPI;
