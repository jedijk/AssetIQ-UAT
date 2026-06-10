import { queryKeys } from "./queryKeys";
import { observationWorkspaceAPI } from "./apis/observationWorkspace";

const WORKSPACE_PREFETCH_STALE_MS = 2 * 60 * 1000;
const hoverTimers = new Map();

function prefetchKey(observationId, language) {
  return `${observationId}:${language || "en"}`;
}

/** Prefetch observation workspace if not already fresh in the cache. */
export function prefetchObservationWorkspace(queryClient, observationId, language) {
  if (!observationId || !queryClient) return;

  const queryKey = queryKeys.observationWorkspace.detail(observationId, language);
  const state = queryClient.getQueryState(queryKey);
  if (
    state?.status === "success" &&
    state.dataUpdatedAt &&
    Date.now() - state.dataUpdatedAt < WORKSPACE_PREFETCH_STALE_MS
  ) {
    return;
  }

  queryClient.prefetchQuery({
    queryKey,
    queryFn: () => observationWorkspaceAPI.getWorkspace(observationId, { language }),
    staleTime: WORKSPACE_PREFETCH_STALE_MS,
  });
}

/** Debounced hover prefetch to avoid storming the API while scrolling the list. */
export function schedulePrefetchObservationWorkspace(
  queryClient,
  observationId,
  language,
  delayMs = 250
) {
  const key = prefetchKey(observationId, language);
  const existing = hoverTimers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    hoverTimers.delete(key);
    prefetchObservationWorkspace(queryClient, observationId, language);
  }, delayMs);
  hoverTimers.set(key, timer);
}

export function cancelPrefetchObservationWorkspace(observationId, language) {
  const key = prefetchKey(observationId, language);
  const existing = hoverTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    hoverTimers.delete(key);
  }
}

/** Prefetch the top list item when the browser is idle. */
export function prefetchTopObservationWhenIdle(queryClient, observationId, language) {
  if (!observationId || !queryClient) return undefined;

  const run = () => prefetchObservationWorkspace(queryClient, observationId, language);
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: 2500 });
    return () => cancelIdleCallback(id);
  }

  const timer = setTimeout(run, 600);
  return () => clearTimeout(timer);
}
