import { api } from "../apiClient";

// Stats API
export const statsAPI = {
  get: async () => {
    const response = await api.get("/stats");
    return response.data;
  },
};

// Reliability Scores API
export const reliabilityAPI = {
  getScores: async (nodeId = null, level = null) => {
    const params = new URLSearchParams();
    if (nodeId) params.append("node_id", nodeId);
    if (level) params.append("level", level);
    const response = await api.get(`/reliability-scores?${params.toString()}`);
    return response.data;
  },
};

