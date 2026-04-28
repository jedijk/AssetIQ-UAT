import { api } from "../apiClient";

// Feedback API
export const feedbackAPI = {
  // Submit new feedback
  submit: async (data) => {
    const response = await api.post("/feedback", data);
    return response.data;
  },

  // Upload screenshot for feedback
  uploadScreenshot: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/feedback/upload-screenshot", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  // Transcribe audio to text
  transcribeAudio: async (audioBlob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    const response = await api.post("/feedback/transcribe", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  // Get user's own feedback
  getMyFeedback: async () => {
    const response = await api.get("/feedback/my");
    return response.data;
  },

  // Get unread responses count for current user
  getUnreadResponsesCount: async () => {
    const response = await api.get("/feedback/my/unread-responses-count");
    return response.data;
  },

  // Mark responses as seen by user
  markResponsesSeen: async () => {
    const response = await api.post("/feedback/my/mark-responses-seen");
    return response.data;
  },

  // Get all feedback (admin/manager/owner only)
  getAllFeedback: async (status = null) => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get(`/feedback/admin/all${params}`);
    return response.data;
  },

  // Get single feedback detail
  getById: async (feedbackId) => {
    const response = await api.get(`/feedback/${feedbackId}`);
    return response.data;
  },

  // Update feedback
  update: async (feedbackId, data) => {
    const response = await api.put(`/feedback/${feedbackId}`, data);
    return response.data;
  },

  // Admin update feedback (status, response)
  adminUpdate: async (feedbackId, data) => {
    const response = await api.put(`/feedback/admin/${feedbackId}`, data);
    return response.data;
  },

  // Delete feedback
  delete: async (feedbackId) => {
    const response = await api.delete(`/feedback/${feedbackId}`);
    return response.data;
  },

  // Admin delete feedback
  adminDelete: async (feedbackId) => {
    const response = await api.delete(`/feedback/admin/${feedbackId}`);
    return response.data;
  },

  // Get unread feedback count (admin/owner)
  getUnreadCount: async () => {
    const response = await api.get("/feedback/admin/unread-count");
    return response.data;
  },

  // Mark all feedback as read (admin/owner)
  markAllRead: async () => {
    const response = await api.post("/feedback/admin/mark-read");
    return response.data;
  },

  // Bulk update status for multiple feedback items
  bulkUpdateStatus: async (feedbackIds, status) => {
    const response = await api.post("/feedback/bulk-status", { feedback_ids: feedbackIds, status });
    return response.data;
  },

  // Generate AI prompt from selected feedback items
  generatePrompt: async (feedbackIds) => {
    const response = await api.post("/feedback/generate-prompt", { feedback_ids: feedbackIds });
    return response.data;
  },
};

