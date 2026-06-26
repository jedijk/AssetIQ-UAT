import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { maintenanceStrategyV2API, failureModesAPI } from "../lib/api";
import { maintenanceSchedulerAPI } from "../lib/apis/maintenanceScheduler";
import { queryKeys } from "../lib/queryKeys";
import {
  filterFailureModeStrategies,
  filterTaskTemplates,
} from "../lib/maintenanceStrategyFilters";

export function useMaintenanceStrategyData(
  equipmentTypeId,
  { affectedEquipmentDialogOpen = false } = {},
) {
  const strategyQuery = useQuery({
    queryKey: ["maintenance-strategy-v2", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getStrategy(equipmentTypeId),
    enabled: !!equipmentTypeId,
  });

  const strategyData = strategyQuery.data;
  const strategy = strategyData?.strategy;
  const hasStrategy =
    strategyData?.exists === true &&
    strategyData?.equipment_type_id === equipmentTypeId &&
    !!strategy;

  const libraryFailureModesQuery = useQuery({
    queryKey: queryKeys.failureModes.list(),
    queryFn: () => failureModesAPI.getAll(),
    enabled: !!equipmentTypeId,
    staleTime: 5 * 60 * 1000,
  });

  const schedulableProgramsQuery = useQuery({
    queryKey: ["maintenance-scheduler-programs", equipmentTypeId || "all"],
    queryFn: () =>
      maintenanceSchedulerAPI.getPrograms(
        equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {},
      ),
    enabled: !!equipmentTypeId,
    staleTime: 30_000,
  });

  const affectedEquipmentQuery = useQuery({
    queryKey: ["maintenance-strategy-v2-affected-equipment", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getAffectedEquipment(equipmentTypeId),
    enabled: !!equipmentTypeId && affectedEquipmentDialogOpen,
  });

  const versionHistoryQuery = useQuery({
    queryKey: ["maintenance-strategy-v2-history", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getVersionHistory(equipmentTypeId),
    enabled: !!equipmentTypeId && hasStrategy,
    retry: false,
    staleTime: 30_000,
  });

  const libraryFmsById = useMemo(() => {
    const map = {};
    for (const fm of libraryFailureModesQuery.data?.failure_modes || []) {
      if (fm?.id) map[String(fm.id)] = fm;
    }
    return map;
  }, [libraryFailureModesQuery.data]);

  return {
    strategyQuery,
    libraryFailureModesQuery,
    schedulableProgramsQuery,
    affectedEquipmentQuery,
    versionHistoryQuery,
    strategyData,
    strategy,
    hasStrategy,
    libraryFmsById,
    filterFailureModeStrategies,
    filterTaskTemplates,
  };
}
