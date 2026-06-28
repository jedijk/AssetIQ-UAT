import { statsAPI, threatsAPI } from "./api";
import { queryKeys } from "./queryKeys";

const OBSERVATIONS_LIST_STALE_MS = 30 * 1000;
const OBSERVATIONS_STATS_STALE_MS = 60 * 1000;

/** Warm the observations list + stats caches (shared by dashboard and observations page). */
export function prefetchObservationsList(queryClient, language) {
  if (!queryClient) return;

  queryClient.prefetchQuery({
    queryKey: [...queryKeys.threats.all(), language],
    queryFn: async () => {
      const result = await threatsAPI.getAll(null, { language });
      return Array.isArray(result) ? result : [];
    },
    staleTime: OBSERVATIONS_LIST_STALE_MS,
  });

  queryClient.prefetchQuery({
    queryKey: queryKeys.stats.all(),
    queryFn: statsAPI.get,
    staleTime: OBSERVATIONS_STATS_STALE_MS,
  });
}

/** Prefetch observations when the browser is idle after initial shell load. */
export function prefetchObservationsWhenIdle(queryClient, language) {
  if (!queryClient) return undefined;

  const run = () => prefetchObservationsList(queryClient, language);
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(run, { timeout: 3000 });
  }
  return setTimeout(run, 500);
}

export function cancelObservationsPrefetch(handle) {
  if (handle == null) return;
  if (typeof cancelIdleCallback === "function" && typeof handle === "number") {
    cancelIdleCallback(handle);
    return;
  }
  clearTimeout(handle);
}
