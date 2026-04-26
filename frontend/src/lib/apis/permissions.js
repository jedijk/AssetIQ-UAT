import { api } from "../apiClient";

// Permissions API
export const permissionsAPI = {
  // Get all permissions for all roles
  getAll: async () => {
    const response = await api.get("/permissions");
    return response.data;
  },

  // Get permissions for a specific role
  getByRole: async (role) => {
    const response = await api.get(`/permissions/${role}`);
    return response.data;
  },

  // Update all permissions for a role
  updateRole: async (role, permissions) => {
    const response = await api.put(`/permissions/${role}`, permissions);
    return response.data;
  },

  // Update a single permission
  patchPermission: async (update) => {
    const response = await api.patch("/permissions", update);
    return response.data;
  },

  // Reset all permissions to defaults
  reset: async () => {
    const response = await api.post("/permissions/reset");
    return response.data;
  },

  // Check if current user has a specific permission
  check: async (feature, action = "read") => {
    const response = await api.get(`/permissions/check/${feature}?action=${action}`);
    return response.data;
  },

  // Get current user's permissions
  getMy: async () => {
    const response = await api.get("/permissions/my");
    return response.data;
  },

  // List all roles including custom roles
  listRoles: async () => {
    const response = await api.get("/permissions/roles");
    return response.data;
  },

  // Create a new custom role
  createRole: async (roleData) => {
    const response = await api.post("/permissions/roles", roleData);
    return response.data;
  },

  // Delete a custom role
  deleteRole: async (roleName) => {
    const response = await api.delete(`/permissions/roles/${roleName}`);
    return response.data;
  },
};

