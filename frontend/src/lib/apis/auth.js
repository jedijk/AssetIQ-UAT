import { api } from "../apiClient";

// Auth API (Password Reset)
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
};

