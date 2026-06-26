import { api } from "../apiClient";
import { queryKeys } from "../queryKeys";

/** Map a central_actions document to workspace action_plan row shape. */
export function mapCentralActionToPlanItem(action) {
  if (!action?.id) return null;
  const actionType = action.action_type || "";
  return {
    id: action.id,
    action_number: action.action_number || "",
    title: action.title || "",
    description: action.description || "",
    status: action.status || "open",
    priority: action.priority || "medium",
    action_type: typeof actionType === "string" ? actionType.toUpperCase() : String(actionType || "").toUpperCase(),
    discipline: action.discipline,
    assignee: action.assignee || action.assigned_to || "",
    owner: action.owner_name || action.assigned_to_name || action.owner || "",
    due_date: action.due_date || "",
    comments: action.comments || "",
    recommendation_id: action.recommendation_id,
    linked_investigation_id: action.linked_investigation_id,
  };
}

function patchAllWorkspaceQueries(queryClient, observationId, patchFn) {
  if (!observationId || !queryClient) return;
  const queries = queryClient.getQueriesData({
    queryKey: queryKeys.observationWorkspace.prefix(observationId),
  });
  for (const [key, data] of queries) {
    if (data) {
      queryClient.setQueryData(key, patchFn(data));
    }
  }
}

function patchPlanningStage(processJourney, actionCount) {
  if (!Array.isArray(processJourney) || actionCount <= 0) return processJourney;
  return processJourney.map((stage) => {
    if (stage.stage !== "Planning") return stage;
    return { ...stage, status: "completed" };
  });
}

function markRecommendationInPlan(recommendations, recommendationId) {
  if (!recommendationId || !Array.isArray(recommendations)) return recommendations;
  return recommendations.map((rec) =>
    rec.id === recommendationId ? { ...rec, in_plan: true } : rec
  );
}

/** Merge a newly created action into cached workspace data (no full refetch). */
export function appendActionToWorkspaceCache(queryClient, observationId, rawAction, recommendationId = null) {
  const planItem = mapCentralActionToPlanItem(rawAction);
  if (!planItem) return;

  patchAllWorkspaceQueries(queryClient, observationId, (workspace) => {
    const action_plan = [...(workspace.action_plan || []), planItem];
    return {
      ...workspace,
      action_plan,
      recommended_actions: markRecommendationInPlan(
        workspace.recommended_actions,
        recommendationId
      ),
      process_journey: patchPlanningStage(workspace.process_journey, action_plan.length),
    };
  });
}

/** Update one action row in cached workspace data. */
export function updateActionInWorkspaceCache(queryClient, observationId, actionId, updates) {
  patchAllWorkspaceQueries(queryClient, observationId, (workspace) => {
    const action_plan = (workspace.action_plan || []).map((item) => {
      if (item.id !== actionId) return item;
      const merged = { ...item, ...updates };
      if (updates.action_type) {
        merged.action_type = String(updates.action_type).toUpperCase();
      }
      return merged;
    });
    return { ...workspace, action_plan };
  });
}

/** Remove one action row from cached workspace data. */
export function removeActionFromWorkspaceCache(queryClient, observationId, actionId) {
  patchAllWorkspaceQueries(queryClient, observationId, (workspace) => {
    const action_plan = (workspace.action_plan || []).filter((item) => item.id !== actionId);
    return {
      ...workspace,
      action_plan,
      process_journey: patchPlanningStage(workspace.process_journey, action_plan.length),
    };
  });
}

/** Invalidate workspace in the background without blocking the UI. */
export function reconcileObservationWorkspace(queryClient, observationId) {
  if (!observationId || !queryClient) return;
  void queryClient.invalidateQueries({
    queryKey: queryKeys.observationWorkspace.prefix(observationId),
  });
}

/** Invalidate and refetch workspace data for every cached UI language. */
export async function refreshObservationWorkspace(queryClient, observationId) {
  if (!observationId || !queryClient) return;
  const queryKey = queryKeys.observationWorkspace.prefix(observationId);
  await queryClient.invalidateQueries({ queryKey });
  await queryClient.refetchQueries({ queryKey, type: "active" });
}

/**
 * Observation Workspace API
 * Provides comprehensive data for the Reliability Intelligence Workspace
 */
export const observationWorkspaceAPI = {
  /**
   * Get complete workspace data for an observation
   * @param {string} observationId - The observation ID
   */
  getWorkspace: async (observationId, options = {}) => {
    const params = {};
    if (options.language) {
      params.language = options.language;
    }
    const response = await api.get(`/observation-workspace/${observationId}`, { params });
    return response.data;
  },

  /**
   * Get enhanced equipment timeline for the observation
   * @param {string} observationId - The observation ID
   * @param {number} limit - Maximum number of events to return
   */
  getTimeline: async (observationId, limit = 20) => {
    const response = await api.get(`/observation-workspace/${observationId}/timeline`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Add a new action to the observation's action plan
   * @param {string} observationId - The observation ID
   * @param {object} actionData - Action data to create
   */
  addAction: async (observationId, actionData) => {
    const response = await api.post(`/observation-workspace/${observationId}/add-action`, actionData);
    return response.data;
  },

  /**
   * Add a recommended action to the observation's action plan
   * @param {string} observationId - The observation ID
   * @param {object} recommendation - The recommendation to convert to an action
   */
  addRecommendation: async (observationId, recommendation) => {
    const response = await api.post(`/observation-workspace/${observationId}/add-recommendation`, recommendation);
    return response.data;
  }
};
