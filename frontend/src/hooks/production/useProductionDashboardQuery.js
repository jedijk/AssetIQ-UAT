import { useQuery } from "@tanstack/react-query";
import { productionKeys } from "../../features/production/queryKeys";

export function useProductionDashboardQuery({ fromStr, toStr, shift, period, productionAPI }) {
  const queryParams = period === "1d" ? { date: fromStr, shift } : { from_date: fromStr, to_date: toStr, shift };

  return useQuery({
    queryKey: productionKeys.dashboard(period, fromStr, toStr, shift),
    queryFn: () => productionAPI.getDashboard(queryParams),
    enabled: !!fromStr && (!!toStr || period === "1d"),
    // Perceived speed: keep the last successful data while fetching a new period/range.
    placeholderData: (prev) => prev,
    // Power efficiency + iOS smoothness: avoid aggressive refetch-on-focus.
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

