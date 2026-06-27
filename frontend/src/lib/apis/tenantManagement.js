import { api } from "../apiClient";

export const tenantManagementAPI = {
  listTenants: async (params = {}) => {
    const response = await api.get("/admin/tenants", { params });
    return response.data;
  },

  getModulesCatalog: async () => {
    const response = await api.get("/admin/tenants/modules/catalog");
    return response.data;
  },

  createTenant: async (payload) => {
    const response = await api.post("/admin/tenants", payload);
    return response.data;
  },

  getTenant: async (tenantId) => {
    const response = await api.get(`/admin/tenants/${tenantId}`);
    return response.data;
  },

  updateTenant: async (tenantId, payload) => {
    const response = await api.patch(`/admin/tenants/${tenantId}`, payload);
    return response.data;
  },

  registerTenant: async (tenantId) => {
    const response = await api.post(`/admin/tenants/${tenantId}/register`);
    return response.data;
  },

  suspendTenant: async (tenantId) => {
    const response = await api.post(`/admin/tenants/${tenantId}/suspend`);
    return response.data;
  },

  reactivateTenant: async (tenantId) => {
    const response = await api.post(`/admin/tenants/${tenantId}/reactivate`);
    return response.data;
  },

  archiveTenant: async (tenantId) => {
    const response = await api.post(`/admin/tenants/${tenantId}/archive`);
    return response.data;
  },

  getTenantHealth: async (tenantId) => {
    const response = await api.get(`/admin/tenants/${tenantId}/health`);
    return response.data;
  },

  validateTenant: async (tenantId) => {
    const response = await api.post(`/admin/tenants/${tenantId}/validate`);
    return response.data;
  },

  updateModules: async (tenantId, modules) => {
    const response = await api.patch(`/admin/tenants/${tenantId}/modules`, { modules });
    return response.data;
  },

  updateAISettings: async (tenantId, payload) => {
    const response = await api.patch(`/admin/tenants/${tenantId}/ai-settings`, payload);
    return response.data;
  },
};
