import { useQuery } from "@tanstack/react-query";
import { productionKeys } from "../../features/production/queryKeys";

/**
 * Production dashboard polling respects centralized performance capabilities.
 * @param {object} opts
 * @param {object} [opts.capabilities] — from useCapabilities()
 */
export function useProductionDashboardQuery({ fromStr, toStr, shift, period, productionAPI, capabilities }) {
  const queryParams = period === "1d" ? { date: fromStr, shift } : { from_date: fromStr, to_date: toStr, shift };

  const realtime = capabilities?.realtimeUpdates !== false;
  const dashboardMs = capabilities?.dashboardPollingMs ?? 60_000;
  const stale = realtime ? 15_000 : 60_000;

  return useQuery({
    queryKey: productionKeys.dashboard(period, fromStr, toStr, shift),
    queryFn: () => productionAPI.getDashboard(queryParams),
    enabled: !!fromStr && (!!toStr || period === "1d"),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    staleTime: stale,
    refetchInterval: dashboardMs,
  });
}
