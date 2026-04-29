import { useQuery } from "@tanstack/react-query";
import { productionKeys } from "../../features/production/queryKeys";

/** Build dashboard params purely from React Query keys (avoids stale queryFn closures on manual refresh). */
function dashboardParamsFromKey(queryKey) {
  const [, period, fromStr, toStr, shiftKey] = queryKey;
  if (!fromStr || !shiftKey) return null;
  if (period === "1d") {
    return { date: fromStr, shift: shiftKey };
  }
  if (!toStr) return null;
  return { from_date: fromStr, to_date: toStr, shift: shiftKey };
}

/**
 * Production dashboard: poll on a fixed cadence so KPIs stay current.
 * structuralSharing=false ensures refetches always notify React after JSON round-trip (avoids masked "stuck" UI).
 *
 * @param {object} opts
 * @param {object} [opts.capabilities] — stale window only
 */
export function useProductionDashboardQuery({ period, fromStr, toStr, shift, productionAPI, capabilities }) {
  const realtime = capabilities?.realtimeUpdates !== false;
  const stale = realtime ? 15_000 : 45_000;

  return useQuery({
    queryKey: productionKeys.dashboard(period, fromStr, toStr, shift),
    queryFn: async ({ queryKey }) => {
      const params = dashboardParamsFromKey(queryKey);
      if (!params) throw new Error("Invalid production dashboard params");
      return productionAPI.getDashboard(params);
    },
    enabled:
      !!period &&
      !!shift &&
      !!fromStr &&
      (period === "1d" || !!toStr),
    // Keep previous KPIs visible while reloading; paired with structuralSharing:false + cache-bust GET.
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    staleTime: stale,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    structuralSharing: false,
    retry: 1,
  });
}
