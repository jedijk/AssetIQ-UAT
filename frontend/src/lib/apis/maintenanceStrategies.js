import { api } from "../apiClient";

// Maintenance Strategy API
export const maintenanceStrategyAPI = {
  // List all strategies with optional search
  getAll: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.equipment_type_id) params.append("equipment_type_id", filters.equipment_type_id);
    if (filters.search) params.append("search", filters.search);
    const response = await api.get(`/maintenance-strategies?${params.toString()}`);
    return response.data;
  },

  // Get a single strategy by ID
  getById: async (strategyId) => {
    const response = await api.get(`/maintenance-strategies/${strategyId}`);
    return response.data;
  },

  // Get strategy by equipment type
  getByEquipmentType: async (equipmentTypeId) => {
    const response = await api.get(`/maintenance-strategies/by-equipment-type/${equipmentTypeId}`);
    return response.data;
  },

  // Generate a strategy for an equipment type (all criticality levels)
  generate: async (equipmentTypeId, equipmentTypeName) => {
    const response = await api.post("/maintenance-strategies/generate", {
      equipment_type_id: equipmentTypeId,
      equipment_type_name: equipmentTypeName,
      include_costs: true,
    });
    return response.data;
  },

  // Generate strategies for ALL equipment types
  generateAll: async () => {
    const response = await api.post("/maintenance-strategies/generate-all", {
      include_costs: true,
    });
    return response.data;
  },

  // Create a manual strategy
  create: async (data) => {
    const response = await api.post("/maintenance-strategies", data);
    return response.data;
  },

  // Update a strategy
  update: async (strategyId, data) => {
    const response = await api.patch(`/maintenance-strategies/${strategyId}`, data);
    return response.data;
  },

  // Delete a strategy
  delete: async (strategyId) => {
    const response = await api.delete(`/maintenance-strategies/${strategyId}`);
    return response.data;
  },

  // Increment version
  incrementVersion: async (strategyId, major = false) => {
    const response = await api.post(`/maintenance-strategies/${strategyId}/increment-version?major=${major}`);
    return response.data;
  },
};

