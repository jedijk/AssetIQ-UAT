import { api } from "../apiClient";
import { getBackendUrl } from "../apiConfig";

const publicBase = () => getBackendUrl();

function publicVmbParams(options = {}) {
  const params = new URLSearchParams();
  if (options.dbEnv && options.dbEnv !== "production") {
    params.set("db_env", options.dbEnv);
  }
  if (options.periodDays != null) {
    params.set("period_days", String(options.periodDays));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

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

  uploadDisplaySnapshot: async (boardId, blob) => {
    const form = new FormData();
    form.append("file", blob, "display-snapshot.jpg");
    const response = await api.post(`/boards/${boardId}/display-snapshot`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
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

  createToken: async (boardId, data = {}) => {
    const response = await api.post(`/boards/${boardId}/tokens`, data);
    return response.data;
  },

  listTokens: async (boardId) => {
    const response = await api.get(`/boards/${boardId}/tokens`);
    return response.data;
  },

  revokeToken: async (boardId, tokenId) => {
    const response = await api.delete(`/boards/${boardId}/tokens/${tokenId}`);
    return response.data;
  },

  listVersions: async (boardId) => {
    const response = await api.get(`/boards/${boardId}/versions`);
    return response.data;
  },

  rollbackVersion: async (boardId, version) => {
    const response = await api.post(`/boards/${boardId}/rollback`, { version });
    return response.data;
  },

  generateQrCode: async (url) => {
    const response = await api.post("/boards/qr-code", { url });
    return response.data;
  },

  listScreens: async (boardId) => {
    const response = await api.get(`/boards/${boardId}/screens`);
    return response.data;
  },

  listAllScreens: async () => {
    const response = await api.get("/board-screens");
    return response.data;
  },

  createScreen: async (boardId, data) => {
    const response = await api.post(`/boards/${boardId}/screens`, data);
    return response.data;
  },

  updateScreen: async (screenId, data) => {
    const response = await api.put(`/board-screens/${screenId}`, data);
    return response.data;
  },

  deleteScreen: async (screenId) => {
    const response = await api.delete(`/board-screens/${screenId}`);
    return response.data;
  },

  listTemplates: async () => {
    const response = await api.get("/board-templates");
    return response.data;
  },

  createTemplate: async (data) => {
    const response = await api.post("/board-templates", data);
    return response.data;
  },

  deleteTemplate: async (templateId) => {
    const response = await api.delete(`/board-templates/${templateId}`);
    return response.data;
  },

  createBoardFromTemplate: async (data) => {
    const response = await api.post("/board-templates/create-board", data);
    return response.data;
  },

  getAnalytics: async (days = 30) => {
    const response = await api.get("/boards/analytics", { params: { days } });
    return response.data;
  },

  getPublicLayout: async (token, options = {}) => {
    const response = await fetch(
      `${publicBase()}/api/vmb/${encodeURIComponent(token)}/layout${publicVmbParams(options)}`,
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to load board layout");
    }
    return response.json();
  },

  getPublicData: async (token, periodDays = 30, options = {}) => {
    const response = await fetch(
      `${publicBase()}/api/vmb/${encodeURIComponent(token)}/data${publicVmbParams({ ...options, periodDays })}`,
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to load board data");
    }
    return response.json();
  },

  sendHeartbeat: async (token, payload = {}, options = {}) => {
    await fetch(
      `${publicBase()}/api/vmb/${encodeURIComponent(token)}/heartbeat${publicVmbParams(options)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  },
};
