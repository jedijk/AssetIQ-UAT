import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { getActiveTenantId, ACTIVE_TENANT_CHANGED_EVENT } from "../lib/activeTenant";
import {
  clearEquipmentUnitFilterIds,
  EQUIPMENT_UNIT_FILTER_CHANGED_EVENT,
  expandEquipmentUnitDescendants,
  getEquipmentUnitFilterIds,
  setEquipmentUnitFilterIds,
} from "../lib/equipmentUnitFilter";
import { equipmentHierarchyAPI } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

const EquipmentUnitFilterContext = createContext(null);

export function EquipmentUnitFilterProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id || user?.company_id || getActiveTenantId() || "default";

  const [selectedUnitIds, setSelectedUnitIdsState] = useState(() =>
    getEquipmentUnitFilterIds(tenantId)
  );

  const syncFromStorage = useCallback(() => {
    setSelectedUnitIdsState(getEquipmentUnitFilterIds(tenantId));
  }, [tenantId]);

  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage, tenantId]);

  useEffect(() => {
    const onChanged = () => syncFromStorage();
    window.addEventListener(EQUIPMENT_UNIT_FILTER_CHANGED_EVENT, onChanged);
    window.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(EQUIPMENT_UNIT_FILTER_CHANGED_EVENT, onChanged);
      window.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, onChanged);
    };
  }, [syncFromStorage]);

  const setSelectedUnitIds = useCallback(
    (ids) => {
      const normalized = [...new Set((ids || []).filter(Boolean))];
      setEquipmentUnitFilterIds(tenantId, normalized);
      setSelectedUnitIdsState(normalized);
      queryClient.invalidateQueries();
    },
    [queryClient, tenantId]
  );

  const clearFilter = useCallback(() => {
    clearEquipmentUnitFilterIds(tenantId);
    setSelectedUnitIdsState([]);
    queryClient.invalidateQueries();
  }, [queryClient, tenantId]);

  const toggleUnitId = useCallback(
    (unitId) => {
      if (!unitId) return;
      setSelectedUnitIds(
        selectedUnitIds.includes(unitId)
          ? selectedUnitIds.filter((id) => id !== unitId)
          : [...selectedUnitIds, unitId]
      );
    },
    [selectedUnitIds, setSelectedUnitIds]
  );

  const { data: nodesData } = useQuery({
    queryKey: [...queryKeys.equipment.nodes(), "equipment-unit-filter"],
    queryFn: equipmentHierarchyAPI.getNodes,
    enabled: Boolean(user),
    staleTime: 1000 * 60 * 5,
  });

  const allNodes = useMemo(() => nodesData?.nodes || nodesData || [], [nodesData]);

  const equipmentUnitNodes = useMemo(
    () =>
      allNodes
        .filter((n) => n.level === "equipment_unit" || n.level === "equipment")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [allNodes]
  );

  const filteredEquipmentIds = useMemo(() => {
    if (!selectedUnitIds.length) return null;
    return expandEquipmentUnitDescendants(allNodes, selectedUnitIds);
  }, [allNodes, selectedUnitIds]);

  const matchesEquipmentId = useCallback(
    (equipmentId) => {
      if (!filteredEquipmentIds) return true;
      if (!equipmentId) return false;
      return filteredEquipmentIds.has(equipmentId);
    },
    [filteredEquipmentIds]
  );

  const value = useMemo(
    () => ({
      selectedUnitIds,
      setSelectedUnitIds,
      toggleUnitId,
      clearFilter,
      isActive: selectedUnitIds.length > 0,
      equipmentUnitNodes,
      filteredEquipmentIds,
      matchesEquipmentId,
    }),
    [
      selectedUnitIds,
      setSelectedUnitIds,
      toggleUnitId,
      clearFilter,
      equipmentUnitNodes,
      filteredEquipmentIds,
      matchesEquipmentId,
    ]
  );

  return (
    <EquipmentUnitFilterContext.Provider value={value}>
      {children}
    </EquipmentUnitFilterContext.Provider>
  );
}

export function useEquipmentUnitFilter() {
  const ctx = useContext(EquipmentUnitFilterContext);
  if (!ctx) {
    throw new Error("useEquipmentUnitFilter must be used within EquipmentUnitFilterProvider");
  }
  return ctx;
}

export function useEquipmentUnitFilterOptional() {
  return useContext(EquipmentUnitFilterContext);
}
