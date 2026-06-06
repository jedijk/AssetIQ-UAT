import { api } from "../apiClient";

// Auth API (Password Reset + OIDC SSO)
export const authAPI = {
  forgotPassword: async (email) => {
    const response = await api.post("/auth/forgot-password", { email });
    return response.data;
  },

  verifyResetToken: async (token) => {
    const response = await api.post("/auth/verify-reset-token", { token });
    return response.data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await api.post("/auth/reset-password", {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  getOidcConfig: async () => {
    const response = await api.get("/auth/oidc/config");
    return response.data;
  },

  getOidcAuthorizeUrl: async (state) => {
    const response = await api.get("/auth/oidc/authorize", {
      params: state ? { state } : undefined,
    });
    return response.data;
  },

  exchangeOidcCode: async (code, state) => {
    const response = await api.post("/auth/oidc/callback", null, {
      params: { code, state },
    });
    return response.data;
  },
};

