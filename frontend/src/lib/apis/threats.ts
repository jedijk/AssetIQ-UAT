import { api, aiApi } from "../apiClient";
import type { ThreatListResponse } from "../../types/api/threats";
import type { ObservationListResponse } from "../../types/api/observations";

/** Typed threats API — Wave 4 TypeScript Phase 2 (wraps existing client). */
export const threatsAPI = {
  getAll: async (status: string | null = null, options: { language?: string } = {}) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (options.language) params.append("language", options.language);
    const queryString = params.toString();
    const response = await api.get<ThreatListResponse>(
      `/observations/signals${queryString ? `?${queryString}` : ""}`
    );
    return response.data;
  },

  getById: async (id: string, options: { language?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.language) params.append("language", options.language);
    const queryString = params.toString();
    const response = await api.get(`/observations/signals/${id}${queryString ? `?${queryString}` : ""}`);
    return response.data;
  },

  delete: async (
    id: string,
    options: { deleteActions?: boolean; deleteInvestigations?: boolean } = {}
  ) => {
    const params = new URLSearchParams();
    if (options.deleteActions) params.append("delete_actions", "true");
    if (options.deleteInvestigations) params.append("delete_investigations", "true");
    const queryString = params.toString();
    const response = await api.delete(`/observations/signals/${id}${queryString ? `?${queryString}` : ""}`);
    return response.data;
  },

  improveDescription: async (id: string, options: { language?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.language) params.append("language", options.language);
    const queryString = params.toString();
    const response = await aiApi.post(
      `/observations/signals/${id}/improve-description${queryString ? `?${queryString}` : ""}`
    );
    return response.data;
  },
};

export const observationsAPI = {
  list: async (params: Record<string, string | number | boolean | undefined> = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        search.append(key, String(value));
      }
    });
    const qs = search.toString();
    const response = await api.get<ObservationListResponse>(
      `/observations${qs ? `?${qs}` : ""}`
    );
    return response.data;
  },
};
