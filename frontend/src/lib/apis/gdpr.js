import { api } from "../apiClient";

// GDPR Compliance API
export const gdprAPI = {
  getPrivacyPolicy: async () => {
    const response = await api.get("/gdpr/privacy-policy");
    return response.data;
  },
  getTermsOfService: async () => {
    const response = await api.get("/gdpr/terms-of-service");
    return response.data;
  },
  getDeletionStatus: async () => {
    const response = await api.get("/gdpr/deletion-status");
    return response.data;
  },
  getConsentStatus: async () => {
    const response = await api.get("/gdpr/consent-status");
    return response.data;
  },
  getTermsStatus: async () => {
    const response = await api.get("/gdpr/terms-status");
    return response.data;
  },
  updateConsent: async (consents) => {
    const response = await api.post("/gdpr/consent", consents);
    return response.data;
  },
  exportData: async () => {
    const response = await api.get("/gdpr/export", {
      responseType: "blob",
    });
    return response.data;
  },
  // Account deletion request (now requires owner approval)
  requestAccountDeletion: async (data) => {
    const response = await api.post("/gdpr/delete-account", data);
    return response.data;
  },
  // Get my pending deletion request
  getMyDeletionRequest: async () => {
    const response = await api.get("/gdpr/my-deletion-request");
    return response.data;
  },
  // Cancel pending deletion request
  cancelDeletionRequest: async () => {
    const response = await api.delete("/gdpr/cancel-deletion-request");
    return response.data;
  },
  // Owner-only: Get all deletion requests
  getDeletionRequests: async (status = null) => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get(`/gdpr/deletion-requests${params}`);
    return response.data;
  },
  // Owner-only: Approve or reject deletion request
  processDeletionRequest: async (requestId, action, rejectionReason = "") => {
    const response = await api.post(`/gdpr/deletion-requests/${requestId}/action`, {
      action,
      rejection_reason: rejectionReason,
    });
    return response.data;
  },
  // Owner-only: Reset consent status for users
  resetConsentStatus: async (
    userIds = [],
    resetTerms = true,
    resetPrivacyConsent = false,
    reason = ""
  ) => {
    const response = await api.post("/gdpr/reset-consent", {
      user_ids: userIds,
      reset_terms: resetTerms,
      reset_privacy_consent: resetPrivacyConsent,
      reason: reason,
    });
    return response.data;
  },
  // Owner-only: Get consent reset history
  getConsentResetHistory: async () => {
    const response = await api.get("/gdpr/consent-reset-history");
    return response.data;
  },
  // Owner-only: Full consent history (acceptances + resets)
  getConsentAcceptanceHistory: async () => {
    const response = await api.get("/gdpr/consent-acceptance-history");
    return response.data;
  },
  // Owner-only: Get all users' consent status
  getUsersConsentStatus: async () => {
    const response = await api.get("/gdpr/users-consent-status");
    return response.data;
  },
  // Owner-only: Get detailed consent info for a specific user
  getUserConsentDetails: async (userId) => {
    const response = await api.get(`/gdpr/user-consent/${userId}`);
    return response.data;
  },
  // Legacy alias for backwards compatibility
  deleteAccount: async (data) => {
    const response = await api.post("/gdpr/delete-account", data);
    return response.data;
  },
};

