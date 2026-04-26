import { useQuery } from "@tanstack/react-query";
import { productionKeys } from "../../features/production/queryKeys";

export function useProductionDashboardQuery({ fromStr, toStr, shift, period, productionAPI }) {
  const queryParams = period === "1d" ? { date: fromStr, shift } : { from_date: fromStr, to_date: toStr, shift };

  return useQuery({
    queryKey: productionKeys.dashboard(period, fromStr, toStr, shift),
    queryFn: () => productionAPI.getDashboard(queryParams),
    refetchInterval: 60000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });
}

