import { useQuery } from "@tanstack/react-query";

export function useProductionDashboardQuery({ fromStr, toStr, shift, period, productionAPI }) {
  const queryParams = period === "1d" ? { date: fromStr, shift } : { from_date: fromStr, to_date: toStr, shift };

  return useQuery({
    queryKey: ["production-dashboard", period, fromStr, toStr, shift],
    queryFn: () => productionAPI.getDashboard(queryParams),
    refetchInterval: 60000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });
}

