import { api } from "../apiClient";

/**
 * Observation Workspace API
 * Provides comprehensive data for the Reliability Intelligence Workspace
 */
export const observationWorkspaceAPI = {
  /**
   * Get complete workspace data for an observation
   * @param {string} observationId - The observation ID
   */
  getWorkspace: async (observationId) => {
    const response = await api.get(`/observation-workspace/${observationId}`);
    return response.data;
  },

  /**
   * Get enhanced equipment timeline for the observation
   * @param {string} observationId - The observation ID
   * @param {number} limit - Maximum number of events to return
   */
  getTimeline: async (observationId, limit = 20) => {
    const response = await api.get(`/observation-workspace/${observationId}/timeline`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Add a new action to the observation's action plan
   * @param {string} observationId - The observation ID
   * @param {object} actionData - Action data to create
   */
  addAction: async (observationId, actionData) => {
    const response = await api.post(`/observation-workspace/${observationId}/add-action`, actionData);
    return response.data;
  },

  /**
   * Add a recommended action to the observation's action plan
   * @param {string} observationId - The observation ID
   * @param {object} recommendation - The recommendation to convert to an action
   */
  addRecommendation: async (observationId, recommendation) => {
    const response = await api.post(`/observation-workspace/${observationId}/add-recommendation`, recommendation);
    return response.data;
  }
};
