import { api, aiApi } from "../apiClient";

// AI Risk Engine API
export const aiRiskAPI = {
  // Risk Analysis - uses extended timeout
  analyzeRisk: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/analyze-risk/${threatId}`, {
      include_forecast: options.includeForecast ?? true,
      forecast_days: options.forecastDays ?? 7,
      include_similar_incidents: options.includeSimilarIncidents ?? true,
    });
    return response.data;
  },

  getRiskInsights: async (threatId) => {
    const response = await api.get(`/ai/risk-insights/${threatId}`);
    return response.data;
  },

  getTopRisks: async (limit = 5) => {
    const response = await api.get(`/ai/top-risks?limit=${limit}`);
    return response.data;
  },

  // Causal Analysis - uses extended timeout
  generateCauses: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/generate-causes/${threatId}`, {
      max_causes: options.maxCauses ?? 5,
      include_evidence: options.includeEvidence ?? true,
      include_mitigations: options.includeMitigations ?? true,
    });
    return response.data;
  },

  getCausalAnalysis: async (threatId) => {
    const response = await api.get(`/ai/causal-analysis/${threatId}`);
    return response.data;
  },

  explain: async (threatId) => {
    const response = await aiApi.post(`/ai/explain/${threatId}`);
    return response.data;
  },

  // Fault Tree - uses extended timeout
  generateFaultTree: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/fault-tree/${threatId}`, {
      max_depth: options.maxDepth ?? 4,
      include_probabilities: options.includeProbabilities ?? true,
    });
    return response.data;
  },

  getFaultTree: async (threatId) => {
    const response = await api.get(`/ai/fault-tree/${threatId}`);
    return response.data;
  },

  // Bow-Tie Model - uses extended timeout
  generateBowTie: async (threatId) => {
    const response = await aiApi.post(`/ai/bow-tie/${threatId}`);
    return response.data;
  },

  getBowTie: async (threatId) => {
    const response = await api.get(`/ai/bow-tie/${threatId}`);
    return response.data;
  },

  // Action Optimization - uses extended timeout
  optimizeActions: async (threatId, options = {}) => {
    const response = await aiApi.post(`/ai/optimize-actions/${threatId}`, {
      budget_limit: options.budgetLimit ?? null,
      max_downtime_hours: options.maxDowntimeHours ?? null,
      prioritize_by: options.prioritizeBy ?? "roi",
    });
    return response.data;
  },

  getActionOptimization: async (threatId) => {
    const response = await api.get(`/ai/action-optimization/${threatId}`);
    return response.data;
  },
};

