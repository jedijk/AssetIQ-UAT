import { api } from "../apiClient";

/**
 * PM Intelligence Import API
 * 
 * Handles uploading maintenance plans and converting them to failure mode intelligence.
 */
export const pmImportAPI = {
  /**
   * Upload a maintenance plan file for processing
   * @param {File} file - The file to upload (Excel, PDF, or Image)
   * @returns {Promise<{session_id: string, status: string, stats: object}>}
   */
  upload: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    
    const response = await api.post("/pm-import/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 120000, // 2 minute timeout for processing
    });
    return response.data;
  },

  /**
   * Get session status and results
   * @param {string} sessionId 
   * @returns {Promise<object>} Session with tasks and stats
   */
  getSession: async (sessionId) => {
    const response = await api.get(`/pm-import/session/${sessionId}`);
    return response.data;
  },

  /**
   * Update a specific task in the session
   * @param {string} sessionId 
   * @param {string} taskId 
   * @param {object} updates 
   */
  updateTask: async (sessionId, taskId, updates) => {
    const response = await api.patch(`/pm-import/session/${sessionId}/task/${taskId}`, updates);
    return response.data;
  },

  /**
   * Accept a task for import
   */
  acceptTask: async (sessionId, taskId) => {
    const response = await api.post(`/pm-import/session/${sessionId}/task/${taskId}/accept`);
    return response.data;
  },

  /**
   * Reject a task (won't be imported)
   */
  rejectTask: async (sessionId, taskId) => {
    const response = await api.post(`/pm-import/session/${sessionId}/task/${taskId}/reject`);
    return response.data;
  },

  /**
   * Bulk actions on tasks
   * @param {string} sessionId 
   * @param {string} action - "accept", "reject", or "accept_high_confidence"
   * @param {string[]} taskIds - Required for accept/reject
   */
  bulkAction: async (sessionId, action, taskIds = null) => {
    const response = await api.post(`/pm-import/session/${sessionId}/bulk-action`, {
      action,
      task_ids: taskIds,
    });
    return response.data;
  },

  /**
   * Accept all high confidence tasks (>=70%)
   */
  acceptAllHighConfidence: async (sessionId) => {
    return pmImportAPI.bulkAction(sessionId, "accept_high_confidence");
  },

  /**
   * Select a failure mode match for a task (Scenario B)
   * When multiple matches exist, user selects one
   * @param {string} sessionId
   * @param {string} taskId
   * @param {string} matchId - ID of the selected failure mode
   */
  selectMatch: async (sessionId, taskId, matchId) => {
    const response = await api.post(
      `/pm-import/session/${sessionId}/task/${taskId}/select-match`,
      { match_id: matchId }
    );
    return response.data;
  },

  /**
   * Approve creation of a new failure mode (Scenario C)
   * When no match found, user approves the proposed new failure mode
   * @param {string} sessionId
   * @param {string} taskId
   * @param {object} failureModeData - { failure_mode, equipment, category, severity, occurrence, detectability }
   */
  approveNewFailureMode: async (sessionId, taskId, failureModeData) => {
    const response = await api.post(
      `/pm-import/session/${sessionId}/task/${taskId}/approve-new-fm`,
      failureModeData
    );
    return response.data;
  },

  /**
   * Import accepted tasks to the Failure Mode Library
   */
  importToLibrary: async (sessionId, includeLowConfidence = true) => {
    const response = await api.post(`/pm-import/session/${sessionId}/import`, {
      include_low_confidence: includeLowConfidence,
    });
    return response.data;
  },

  /**
   * Export review results as Excel
   */
  exportReview: async (sessionId) => {
    const response = await api.get(`/pm-import/session/${sessionId}/export`, {
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Delete a session
   */
  deleteSession: async (sessionId) => {
    const response = await api.delete(`/pm-import/session/${sessionId}`);
    return response.data;
  },

  /**
   * List user's import sessions
   */
  listSessions: async (limit = 20, skip = 0) => {
    const response = await api.get(`/pm-import/sessions?limit=${limit}&skip=${skip}`);
    return response.data;
  },

  /**
   * List all extracted tasks across all sessions (flattened view).
   */
  listAllTasks: async () => {
    const response = await api.get(`/pm-import/tasks`);
    return response.data;
  },
};
