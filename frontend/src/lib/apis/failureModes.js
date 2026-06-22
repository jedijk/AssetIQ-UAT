import { api } from "../apiClient";

// Failure Modes API
export const failureModesAPI = {
  getAll: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.category && params.category !== "all") searchParams.append("category", params.category);
    const response = await api.get(`/failure-modes?${searchParams.toString()}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/failure-modes/${id}`);
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get("/failure-modes/categories");
    return response.data;
  },

  create: async (data) => {
    const response = await api.post("/failure-modes", data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.patch(`/failure-modes/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/failure-modes/${id}`);
    return response.data;
  },

  validate: async (id, validatorName, validatorPosition, validatorId) => {
    const response = await api.post(`/failure-modes/${id}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition,
      validated_by_id: validatorId,
    });
    return response.data;
  },

  unvalidate: async (id) => {
    const response = await api.post(`/failure-modes/${id}/unvalidate`);
    return response.data;
  },

  // Version history
  getVersions: async (id) => {
    const response = await api.get(`/failure-modes/${id}/versions`);
    return response.data;
  },

  rollback: async (id, versionId, reason = null) => {
    const response = await api.post(`/failure-modes/${id}/rollback`, {
      version_id: versionId,
      reason,
    });
    return response.data;
  },

  getCountsByEquipmentType: async () => {
    const response = await api.get("/failure-modes/counts-by-equipment-type");
    return response.data;
  },

  /** Lexical similarity candidates for one failure mode (no AI). */
  findSimilar: async (id, params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.threshold != null) searchParams.append("threshold", params.threshold);
    if (params.limit != null) searchParams.append("limit", params.limit);
    if (params.require_shared_equipment_type != null) {
      searchParams.append("require_shared_equipment_type", params.require_shared_equipment_type);
    }
    const qs = searchParams.toString();
    const response = await api.get(
      `/failure-modes/${id}/similar${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  /** Library-wide batch scan for duplicate failure mode groups. */
  scanSimilar: async (body = {}) => {
    const useAi = body.use_ai !== false;
    const response = await api.post("/failure-modes/find-similar", body, {
      timeout: useAi ? 300000 : 120000,
    });
    return response.data;
  },

  /** Scan duplicate recommended_actions inside each failure mode. */
  findDuplicateActions: async (body = {}) => {
    const useAi = body.use_ai !== false;
    const response = await api.post("/failure-modes/find-duplicate-actions", body, {
      timeout: useAi ? 300000 : 120000,
    });
    return response.data;
  },

  mergeDuplicateActions: async (body) => {
    const response = await api.post("/failure-modes/merge-duplicate-actions", body);
    return response.data;
  },

  /** AI-consolidate recommended actions within one failure mode (target 3–5). */
  consolidateFailureModeActions: async (body = {}) => {
    const response = await api.post(
      "/ai-suggestions/consolidate-failure-mode-actions",
      body,
      { timeout: 120000 },
    );
    return response.data;
  },

  /** Batch-classify recommended-action disciplines (library-wide AI review). */
  reviewActionDisciplines: async (actions) => {
    const response = await api.post(
      "/ai-suggestions/review-action-disciplines",
      { actions },
      { timeout: 120000 },
    );
    return response.data;
  },

  /** Map recommended-action disciplines to Settings taxonomy for one failure mode. */
  mapFailureModeActionDisciplines: async (body = {}) => {
    const response = await api.post(
      "/ai-suggestions/map-failure-mode-action-disciplines",
      body,
      { timeout: 120000 },
    );
    return response.data;
  },

  /** AI suggests whether recommended actions require equipment downtime. */
  checkFailureModeActionDowntime: async (body = {}) => {
    const response = await api.post(
      "/ai-suggestions/check-failure-mode-action-downtime",
      body,
      { timeout: 120000 },
    );
    return response.data;
  },

  /** AI suggests downtime requirement for a single action description. */
  suggestActionDowntime: async (body = {}) => {
    const response = await api.post(
      "/ai-suggestions/suggest-action-downtime",
      body,
      { timeout: 120000 },
    );
    return response.data;
  },

  /**
   * Merge losers into winner. Pass dry_run: true to preview.
   * Supports winner_id + loser_ids or primary_id + merge_id.
   */
  merge: async (body) => {
    const response = await api.post("/failure-modes/merge", body);
    return response.data;
  },
};

