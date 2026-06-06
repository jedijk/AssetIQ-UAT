import { api } from "../apiClient";

/** How often we poll a background job while waiting for completion. */
const JOB_POLL_INTERVAL_MS = 2000;

/** Stop polling after this long and surface a timeout error. */
const JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isSuccessfulJob = (status) => status === "completed";

const isFailedJob = (status) => status === "failed" || status === "dead_letter";

/**
 * Poll GET /pm-import/jobs/{jobId} until the job completes or fails.
 * Returns the handler result payload on success.
 */
export async function pollPmImportJob(
  jobId,
  { intervalMs = JOB_POLL_INTERVAL_MS, timeoutMs = JOB_POLL_TIMEOUT_MS } = {}
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await api.get(`/pm-import/jobs/${jobId}`);
    const job = response.data;
    const status = job?.status;

    if (isSuccessfulJob(status)) {
      return job.result ?? job;
    }

    if (isFailedJob(status)) {
      const error = new Error(job?.error || "PM import job failed");
      error.job = job;
      throw error;
    }

    await sleep(intervalMs);
  }

  throw new Error("PM import job timed out while waiting for background job");
}

/** User-facing PM import statuses: pending | applied | merged */
export const resolvePmImportStatus = (task) => {
  if (!task) return "pending";
  const importStatus = (task.import_status || "").toLowerCase();
  const applyMode = (task.apply_mode || "").toLowerCase();

  if (importStatus === "merged") return "merged";
  if (importStatus === "applied") return "applied";
  if (importStatus === "implemented") {
    return applyMode === "replaced" || applyMode === "existing" ? "merged" : "applied";
  }
  return "pending";
};

export const isPmImportFinalized = (task) => {
  const status = resolvePmImportStatus(task);
  return status === "applied" || status === "merged";
};

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
   * Permanently delete a task from a session
   */
  deleteTask: async (sessionId, taskId) => {
    const response = await api.delete(`/pm-import/session/${sessionId}/task/${taskId}`);
    return response.data;
  },

  /**
   * Delete ALL imported tasks across all sessions for the current user.
   */
  deleteAllTasks: async () => {
    const response = await api.delete(`/pm-import/tasks`);
    return response.data;
  },

  /**
   * Manually map a task to equipment hierarchy node / type / library failure modes.
   */
  updateMapping: async (sessionId, taskId, payload) => {
    const response = await api.patch(`/pm-import/session/${sessionId}/task/${taskId}/mapping`, payload);
    return response.data;
  },

  /**
   * Search equipment hierarchy nodes.
   */
  lookupEquipment: async (q = '') => {
    const response = await api.get(`/pm-import/lookup/equipment`, { params: { q, limit: 50 } });
    return response.data.items || [];
  },

  /**
   * Import all accepted tasks from a session into the pm_tasks collection.
   */
  importToPmTasks: async (sessionId) => {
    const response = await api.post(`/pm-import/session/${sessionId}/import-to-pm-tasks`);
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

  // ============== AI REVIEW APIs ==============

  /**
   * Run AI review on all accepted tasks in a session.
   * Uses background job + polling by default; falls back to sync when no job_id returned.
   * @param {string} sessionId
   * @param {object} [options]
   * @param {boolean} [options.runAsync=true]
   * @param {object} [options.poll] - pollPmImportJob interval/timeout overrides
   * @returns {Promise<{suggestions: array, total_reviewed: number, message: string}>}
   */
  runAIReview: async (sessionId, options = {}) => {
    const runAsync = options.runAsync !== false;
    const response = await api.post(
      `/pm-import/session/${sessionId}/ai-review`,
      {},
      {
        params: runAsync ? { run_async: true } : {},
        timeout: 180000,
      }
    );
    const data = response.data;

    if (data?.job_id && data?.status === "pending") {
      return pollPmImportJob(data.job_id, options.poll);
    }
    return data;
  },

  getJob: async (jobId) => {
    const response = await api.get(`/pm-import/jobs/${jobId}`);
    return response.data;
  },

  /**
   * Get AI review results for a session
   * @param {string} sessionId 
   * @returns {Promise<{suggestions: array, status: string}>}
   */
  getAIReviewResults: async (sessionId) => {
    const response = await api.get(`/pm-import/session/${sessionId}/ai-review`);
    return response.data;
  },

  /**
   * Apply an AI suggestion for a task
   * @param {string} sessionId 
   * @param {string} taskId 
   * @param {object} data - { action, target_failure_mode_id?, new_failure_mode_data? }
   */
  applySuggestion: async (sessionId, taskId, data) => {
    const response = await api.post(
      `/pm-import/session/${sessionId}/task/${taskId}/apply-suggestion`,
      data
    );
    return response.data;
  },

  /**
   * Apply task to a failure mode (replace or add recommended action).
   */
  applyToFailureMode: async (sessionId, taskId, data) => {
    const response = await api.post(
      `/pm-import/session/${sessionId}/task/${taskId}/apply-to-failure-mode`,
      data
    );
    return response.data;
  },

  /**
   * Apply all AI suggestions for a session
   * @param {string} sessionId 
   */
  applyAllSuggestions: async (sessionId) => {
    const response = await api.post(`/pm-import/session/${sessionId}/apply-all-suggestions`);
    return response.data;
  },
};
