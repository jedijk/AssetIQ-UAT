import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { useDisciplines } from "../hooks/useDisciplines";
import { getActiveTenantId, ACTIVE_TENANT_CHANGED_EVENT } from "../lib/activeTenant";
import {
  clearDisciplineFilterIds,
  DISCIPLINE_FILTER_CHANGED_EVENT,
  getDisciplineFilterIds,
  setDisciplineFilterIds,
} from "../lib/disciplineFilter";
import { itemMatchesDisciplines } from "../lib/myTasksFilterUtils";

const DisciplineFilterContext = createContext(null);

export function DisciplineFilterProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { disciplines, normalize } = useDisciplines();
  const tenantId = user?.tenant_id || user?.company_id || getActiveTenantId() || "default";

  const [selectedDisciplineIds, setSelectedDisciplineIdsState] = useState(() =>
    getDisciplineFilterIds(tenantId)
  );

  const syncFromStorage = useCallback(() => {
    setSelectedDisciplineIdsState(getDisciplineFilterIds(tenantId));
  }, [tenantId]);

  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage, tenantId]);

  useEffect(() => {
    const onChanged = () => syncFromStorage();
    window.addEventListener(DISCIPLINE_FILTER_CHANGED_EVENT, onChanged);
    window.addEventListener(ACTIVE_TENANT_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(DISCIPLINE_FILTER_CHANGED_EVENT, onChanged);
      window.removeEventListener(ACTIVE_TENANT_CHANGED_EVENT, onChanged);
    };
  }, [syncFromStorage]);

  const setSelectedDisciplineIds = useCallback(
    (ids) => {
      const normalized = [...new Set((ids || []).map((id) => normalize(id)).filter(Boolean))];
      setDisciplineFilterIds(tenantId, normalized);
      setSelectedDisciplineIdsState(normalized);
      queryClient.invalidateQueries();
    },
    [normalize, queryClient, tenantId]
  );

  const clearFilter = useCallback(() => {
    clearDisciplineFilterIds(tenantId);
    setSelectedDisciplineIdsState([]);
    queryClient.invalidateQueries();
  }, [queryClient, tenantId]);

  const toggleDisciplineId = useCallback(
    (disciplineId) => {
      const value = normalize(disciplineId);
      if (!value) return;
      setSelectedDisciplineIds(
        selectedDisciplineIds.includes(value)
          ? selectedDisciplineIds.filter((id) => id !== value)
          : [...selectedDisciplineIds, value]
      );
    },
    [normalize, selectedDisciplineIds, setSelectedDisciplineIds]
  );

  const matchesItem = useCallback(
    (item) => itemMatchesDisciplines(item, selectedDisciplineIds),
    [selectedDisciplineIds]
  );

  const value = useMemo(
    () => ({
      selectedDisciplineIds,
      setSelectedDisciplineIds,
      toggleDisciplineId,
      clearFilter,
      isActive: selectedDisciplineIds.length > 0,
      disciplines,
      matchesItem,
      normalize,
    }),
    [
      selectedDisciplineIds,
      setSelectedDisciplineIds,
      toggleDisciplineId,
      clearFilter,
      disciplines,
      matchesItem,
      normalize,
    ]
  );

  return (
    <DisciplineFilterContext.Provider value={value}>
      {children}
    </DisciplineFilterContext.Provider>
  );
}

export function useDisciplineFilter() {
  const ctx = useContext(DisciplineFilterContext);
  if (!ctx) {
    throw new Error("useDisciplineFilter must be used within DisciplineFilterProvider");
  }
  return ctx;
}

export function useDisciplineFilterOptional() {
  return useContext(DisciplineFilterContext);
}
