/**
 * Actions API
 * Centralized API calls for actions management
 */
import { getBackendUrl } from '../../lib/apiConfig';

const API_BASE_URL = getBackendUrl();

export const actionsAPI = {
  getActions: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append("status", params.status);
    if (params.priority) queryParams.append("priority", params.priority);
    if (params.assignee) queryParams.append("assignee", params.assignee);
    if (params.search) queryParams.append("search", params.search);
    const response = await fetch(`${API_BASE_URL}/api/actions?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to fetch actions");
    return response.json();
  },

  getAction: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/actions/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to fetch action");
    return response.json();
  },

  createAction: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create action");
    return response.json();
  },

  updateAction: async (id, data) => {
    const response = await fetch(`${API_BASE_URL}/api/actions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update action");
    return response.json();
  },

  deleteAction: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/actions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to delete action");
    return response.json();
  },

  completeAction: async (id, data = {}) => {
    const response = await fetch(`${API_BASE_URL}/api/actions/${id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to complete action");
    return response.json();
  },
};

export default actionsAPI;
