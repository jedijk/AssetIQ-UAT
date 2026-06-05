/**
 * Intelligence Map API client
 * 
 * API for the Maintenance Intelligence Map Dashboard
 */
import { api } from "../apiClient";

export const intelligenceMapAPI = {
  /**
   * Get aggregated statistics for the Intelligence Map dashboard
   * 
   * @param {Object} params - Filter parameters
   * @param {string} params.plantId - Filter by plant/installation
   * @param {string} params.systemId - Filter by system/section
   * @param {string} params.equipmentTypeId - Filter by equipment type
   * @param {string} params.equipmentId - Filter by specific equipment
   * @param {boolean} params.showLinkedOnly - Only show linked records
   */
  getStats: async (params = {}) => {
    const queryParams = new URLSearchParams();
    
    if (params.plantId) queryParams.append("plant_id", params.plantId);
    if (params.systemId) queryParams.append("system_id", params.systemId);
    if (params.equipmentTypeId) queryParams.append("equipment_type_id", params.equipmentTypeId);
    if (params.equipmentId) queryParams.append("equipment_id", params.equipmentId);
    if (params.showLinkedOnly !== undefined) queryParams.append("show_linked_only", params.showLinkedOnly);
    
    const queryString = queryParams.toString();
    const url = `/intelligence-map/stats${queryString ? `?${queryString}` : ""}`;
    
    const response = await api.get(url);
    return response.data;
  },

  /**
   * Get available filter options for the Intelligence Map
   */
  getFilters: async () => {
    const response = await api.get("/intelligence-map/filters");
    return response.data;
  },
};
