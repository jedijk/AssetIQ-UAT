import { api } from "../apiClient";

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
    const response = await api.get(
      `/task-instances/calendar?start_date=${startDate}&end_date=${endDate}`
    );
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
    const endpoint = isAction
      ? `/my-tasks/action/${taskId}/complete`
      : `/task-instances/${taskId}/complete`;
    const response = await api.post(endpoint, data);
    return response.data;
  },
  deleteTask: async (taskId, isAction = false) => {
    const endpoint = isAction ? `/actions/${taskId}` : `/task-instances/${taskId}`;
    const response = await api.delete(endpoint);
    return response.data;
  },
};

