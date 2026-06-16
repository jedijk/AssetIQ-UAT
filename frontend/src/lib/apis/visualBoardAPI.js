import { api } from "../apiClient";
import { getBackendUrl } from "../apiConfig";

const publicBase = () => getBackendUrl();

export const visualBoardAPI = {
  listBoards: async (params = {}) => {
    const response = await api.get("/boards", { params });
    return response.data;
  },

  getBoard: async (boardId) => {
    const response = await api.get(`/boards/${boardId}`);
    return response.data;
  },

  getPreviewData: async (boardId, periodDays = 30) => {
    const response = await api.get(`/boards/${boardId}/preview-data`, {
      params: { period_days: periodDays },
    });
    return response.data;
  },

  createBoard: async (data) => {
    const response = await api.post("/boards", data);
    return response.data;
  },

  updateBoard: async (boardId, data) => {
    const response = await api.put(`/boards/${boardId}`, data);
    return response.data;
  },

  deleteBoard: async (boardId) => {
    const response = await api.delete(`/boards/${boardId}`);
    return response.data;
  },

  publishBoard: async (boardId, data = {}) => {
    const response = await api.post(`/boards/${boardId}/publish`, data);
    return response.data;
  },

  unpublishBoard: async (boardId) => {
    const response = await api.post(`/boards/${boardId}/unpublish`);
    return response.data;
  },

  rotateToken: async (boardId, data = {}) => {
    const response = await api.post(`/boards/${boardId}/rotate-token`, data);
    return response.data;
  },

  listVersions: async (boardId) => {
    const response = await api.get(`/boards/${boardId}/versions`);
    return response.data;
  },

  listScreens: async (boardId) => {
    const response = await api.get(`/boards/${boardId}/screens`);
    return response.data;
  },

  getPublicLayout: async (token) => {
    const response = await fetch(`${publicBase()}/api/vmb/${encodeURIComponent(token)}/layout`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to load board layout");
    }
    return response.json();
  },

  getPublicData: async (token, periodDays = 30) => {
    const response = await fetch(
      `${publicBase()}/api/vmb/${encodeURIComponent(token)}/data?period_days=${periodDays}`,
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to load board data");
    }
    return response.json();
  },

  sendHeartbeat: async (token, payload = {}) => {
    await fetch(`${publicBase()}/api/vmb/${encodeURIComponent(token)}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};
