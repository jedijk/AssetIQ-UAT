import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";

export function useCausalEngineData({
  selectedInvId,
  investigationAPI,
  actionsAPI,
  usersAPI,
  equipmentHierarchyAPI,
  failureModesAPI,
}) {
  const { data: investigationsData, isLoading: loadingInvestigations, error: investigationsError } = useQuery({
    queryKey: queryKeys.investigations.all(),
    queryFn: () => investigationAPI.getAll(),
    staleTime: 0,
    refetchOnMount: "always",
    retry: 2,
  });

  const investigations = investigationsData?.investigations || [];

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.rbac(),
    queryFn: () => usersAPI.getAll(),
    staleTime: 60000,
  });
  const users = usersData?.users || [];

  const { data: equipmentNodesData } = useQuery({
    queryKey: queryKeys.equipment.nodes(),
    queryFn: () => equipmentHierarchyAPI.getNodes(),
    staleTime: 60000,
  });
  const equipmentNodes = equipmentNodesData?.nodes || [];

  const { data: failureModesData } = useQuery({
    queryKey: queryKeys.failureModes.list(),
    queryFn: () => failureModesAPI.getAll(),
    staleTime: 60000,
  });
  const failureModesList = failureModesData?.failure_modes || [];

  const { data: centralActionsData } = useQuery({
    queryKey: queryKeys.investigations.centralActions(selectedInvId),
    queryFn: async () => {
      const response = await actionsAPI.getAll();
      const allActions = response?.actions || response || [];
      return allActions.filter(
        (action) => action.source_type === "investigation" && action.source_id === selectedInvId
      );
    },
    enabled: !!selectedInvId,
    staleTime: 30000,
  });
  const centralActions = centralActionsData || [];

  const { data: investigationData, isLoading: loadingInvestigation } = useQuery({
    queryKey: queryKeys.investigations.detail(selectedInvId),
    queryFn: () => investigationAPI.getById(selectedInvId),
    enabled: !!selectedInvId,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 2,
  });

  const investigation = investigationData?.investigation;

  return {
    investigations,
    loadingInvestigations,
    investigationsError,
    users,
    equipmentNodes,
    failureModesList,
    centralActions,
    investigationData,
    investigation,
    loadingInvestigation,
  };
}

