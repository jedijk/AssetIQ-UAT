import { api } from "../apiClient";
import type {
  ActionDeleteResponse,
  ActionFilters,
  ActionListResponse,
  CentralAction,
} from "../../types/api/actions";

/** Typed actions API — Wave 6 TypeScript Phase 3 (wraps existing client). */
export const actionsAPI = {
  getAll: async (filters: ActionFilters = {}): Promise<ActionListResponse> => {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.priority) params.append("priority", filters.priority);
    if (filters.assignee) params.append("assignee", filters.assignee);
    if (filters.source_type) params.append("source_type", filters.source_type);
    const response = await api.get<ActionListResponse>(`/actions?${params.toString()}`);
    return response.data;
  },

  getOverdue: async () => {
    const response = await api.get("/actions/overdue");
    return response.data;
  },

  get: async (actionId: string): Promise<CentralAction> => {
    const response = await api.get<CentralAction>(`/actions/${actionId}`);
    return response.data;
  },

  getById: async (actionId: string): Promise<CentralAction> => {
    const response = await api.get<CentralAction>(`/actions/${actionId}`);
    return response.data;
  },

  create: async (data: Partial<CentralAction>) => {
    const response = await api.post("/actions", data);
    return response.data;
  },

  update: async (actionId: string, data: Partial<CentralAction>) => {
    const response = await api.patch(`/actions/${actionId}`, data);
    return response.data;
  },

  delete: async (actionId: string): Promise<ActionDeleteResponse> => {
    const response = await api.delete<ActionDeleteResponse>(`/actions/${actionId}`);
    return response.data;
  },

  uploadAttachment: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/tasks/upload-attachment", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  validate: async (
    actionId: string,
    validatorName: string,
    validatorPosition: string,
    validatorId?: string
  ) => {
    const response = await api.post(`/actions/${actionId}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition,
      validated_by_id: validatorId,
    });
    return response.data;
  },

  unvalidate: async (actionId: string) => {
    const response = await api.post(`/actions/${actionId}/unvalidate`);
    return response.data;
  },

  getOutcome: async (actionId: string) => {
    const response = await api.get(`/actions/${actionId}/outcome`);
    return response.data;
  },
};
