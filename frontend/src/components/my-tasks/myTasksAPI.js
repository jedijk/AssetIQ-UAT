/**
 * My Tasks API
 * Centralized API calls for tasks and ad-hoc plans
 */
import { getBackendUrl } from '../../lib/apiConfig';

const API_BASE_URL = getBackendUrl();
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"

function getAuthFetchOptions(options = {}) {
  const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
  return {
    ...options,
    credentials: AUTH_MODE === "cookie" ? "include" : "omit",
    headers: {
      ...(options.headers || {}),
      ...(AUTH_MODE === "bearer" && token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export const myTasksAPI = {
  getTasks: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.filter) queryParams.append("filter", params.filter);
    if (params.priority) queryParams.append("priority", params.priority);
    if (params.source) queryParams.append("source", params.source);
    if (params.search) queryParams.append("search", params.search);
    const response = await fetch(
      `${API_BASE_URL}/api/my-tasks?${queryParams}`,
      getAuthFetchOptions()
    );
    if (!response.ok) throw new Error("Failed to fetch tasks");
    return response.json();
  },

  uploadAttachment: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/api/tasks/upload-attachment`, {
      method: "POST",
      ...getAuthFetchOptions(),
      body: formData,
    });
    if (!response.ok) throw new Error("Failed to upload attachment");
    return response.json();
  },

  getAdhocPlans: async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/adhoc-plans`,
      getAuthFetchOptions()
    );
    if (!response.ok) throw new Error("Failed to fetch ad-hoc plans");
    return response.json();
  },

  executeAdhocPlan: async (planId) => {
    const response = await fetch(`${API_BASE_URL}/api/adhoc-plans/${planId}/execute`, {
      method: "POST",
      ...getAuthFetchOptions(),
    });
    if (!response.ok) throw new Error("Failed to execute plan");
    return response.json();
  },

  deleteTask: async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/api/my-tasks/${taskId}`, {
      method: "DELETE",
      ...getAuthFetchOptions(),
    });
    if (!response.ok) throw new Error("Failed to delete task");
    return response.json();
  },

  completeTask: async ({ taskId, data, isAction }) => {
    const endpoint = isAction
      ? `${API_BASE_URL}/api/my-tasks/action/${taskId}/complete`
      : `${API_BASE_URL}/api/task-instances/${taskId}/complete`;

    const response = await fetch(endpoint, {
      method: "POST",
      ...getAuthFetchOptions({
        headers: { "Content-Type": "application/json" },
      }),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to complete task");
    return response.json();
  },

  startTask: async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/api/task-instances/${taskId}/start`, {
      method: "POST",
      ...getAuthFetchOptions(),
    });
    if (!response.ok) throw new Error("Failed to start task");
    return response.json();
  },

  searchEquipment: async (query) => {
    const response = await fetch(
      `${API_BASE_URL}/api/equipment-hierarchy/search?query=${encodeURIComponent(query)}`,
      getAuthFetchOptions()
    );
    if (response.ok) {
      return response.json();
    }
    return { results: [] };
  },
};

export default myTasksAPI;
