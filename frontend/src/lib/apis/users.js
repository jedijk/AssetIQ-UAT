import { api } from "../apiClient";

export const usersAPI = {
  getAll: async () => {
    const response = await api.get("/rbac/users");
    return response.data;
  },

  // Get pending users awaiting approval
  getPending: async () => {
    const response = await api.get("/rbac/users/pending");
    return response.data;
  },

  // Approve or reject a user
  approveUser: async (userId, action, role = null, rejectionReason = null, assignedInstallations = null) => {
    const response = await api.patch(`/rbac/users/${userId}/approve`, {
      action, // 'approve' or 'reject'
      role,
      rejection_reason: rejectionReason,
      assigned_installations: assignedInstallations,
    });
    return response.data;
  },

  // Update user's assigned installations
  updateInstallations: async (userId, installations) => {
    const response = await api.patch(`/rbac/users/${userId}/installations`, {
      assigned_installations: installations,
    });
    return response.data;
  },

  // Update user status (active/inactive)
  updateStatus: async (userId, isActive) => {
    const response = await api.patch(`/rbac/users/${userId}/status`, {
      is_active: isActive,
    });
    return response.data;
  },

  // Update user role
  updateRole: async (userId, role) => {
    const response = await api.patch(`/rbac/users/${userId}/role`, {
      role,
    });
    return response.data;
  },
};

// ==================== RBAC API (User Management) ====================
export const rbacAPI = {
  getUsers: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.role) searchParams.append("role", params.role);
    if (params.is_active !== undefined) searchParams.append("is_active", params.is_active);
    const response = await api.get(`/rbac/users?${searchParams}`);
    return response.data;
  },
  getPendingUsers: async () => {
    const response = await api.get("/rbac/users/pending");
    return response.data;
  },
  approveUser: async ({ userId, action, role, rejectionReason, assignedInstallations }) => {
    const response = await api.patch(`/rbac/users/${userId}/approve`, {
      action,
      role,
      rejection_reason: rejectionReason,
      assigned_installations: assignedInstallations,
    });
    return response.data;
  },
  getRoles: async () => {
    const response = await api.get("/rbac/roles");
    return response.data;
  },
  updateUserRole: async ({ userId, role }) => {
    const response = await api.patch(`/rbac/users/${userId}/role`, { role });
    return response.data;
  },
  updateUserStatus: async ({ userId, isActive }) => {
    const response = await api.patch(`/rbac/users/${userId}/status`, { is_active: isActive });
    return response.data;
  },
  updateUserProfile: async ({ userId, data }) => {
    const response = await api.patch(`/rbac/users/${userId}/profile`, data);
    return response.data;
  },
  uploadUserAvatar: async ({ userId, file }) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/rbac/users/${userId}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  getUserAvatar: async (userId) => {
    const response = await api.get(`/users/${userId}/avatar`, { responseType: "blob" });
    return URL.createObjectURL(response.data);
  },
  deleteUser: async (userId) => {
    const response = await api.delete(`/rbac/users/${userId}`);
    return response.data;
  },
  resetPassword: async (userId) => {
    const response = await api.post("/auth/admin-reset-password", { user_id: userId });
    return response.data;
  },
  resetIntro: async (userId) => {
    const response = await api.post(`/rbac/users/${userId}/reset-intro`);
    return response.data;
  },
  resetConsent: async (userId, options = {}) => {
    const response = await api.post("/gdpr/reset-consent", {
      user_ids: [userId],
      reset_terms: options.reset_terms !== false,
      reset_privacy_consent: options.reset_privacy_consent === true,
      reason: options.reason || "Reset from User Management",
    });
    return response.data;
  },
  createUser: async (userData) => {
    const response = await api.post("/users/create", userData);
    return response.data;
  },
};

