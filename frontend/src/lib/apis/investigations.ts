import { api } from "../apiClient";
import type {
  Investigation,
  InvestigationDeleteOptions,
  InvestigationDeleteResponse,
  InvestigationListResponse,
  InvestigationStatus,
} from "../../types/api/investigations";

/** Typed investigations API — Wave 6 TypeScript Phase 3 (wraps existing client). */
export const investigationAPI = {
  getAll: async (status: InvestigationStatus | null = null): Promise<InvestigationListResponse> => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get<InvestigationListResponse>(`/investigations${params}`);
    return response.data;
  },

  getById: async (id: string): Promise<Investigation> => {
    const response = await api.get<Investigation>(`/investigations/${id}`);
    return response.data;
  },

  create: async (data: Partial<Investigation>) => {
    const response = await api.post("/investigations", data);
    return response.data;
  },

  update: async (id: string, data: Partial<Investigation>) => {
    const response = await api.patch(`/investigations/${id}`, data);
    return response.data;
  },

  delete: async (
    id: string,
    options: InvestigationDeleteOptions = {}
  ): Promise<InvestigationDeleteResponse> => {
    const params = new URLSearchParams();
    if (options.deleteCentralActions) params.append("delete_central_actions", "true");
    const queryString = params.toString();
    const url = `/investigations/${id}${queryString ? `?${queryString}` : ""}`;
    const response = await api.delete<InvestigationDeleteResponse>(url);
    return response.data;
  },

  getStats: async (id: string) => {
    const response = await api.get(`/investigations/${id}/stats`);
    return response.data;
  },

  createFromThreat: async (threatId: string) => {
    const response = await api.post(`/threats/${threatId}/investigate`);
    return response.data;
  },
};
