/**
 * useDisciplines — read-only hook backed by the Disciplines configurator API.
 */
import { useQuery } from "@tanstack/react-query";
import {
  DISCIPLINES as LEGACY_DISCIPLINES,
  normalizeDiscipline as legacyNormalize,
} from "../constants/disciplines";
import { api } from "../lib/apiClient";

async function fetchDisciplines() {
  const response = await api.get("/disciplines");
  return response.data.disciplines || [];
}

export function useDisciplines({ includeInactive = false } = {}) {
  const query = useQuery({
    queryKey: ["disciplines", { includeInactive }],
    queryFn: fetchDisciplines,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const disciplines =
    query.data && query.data.length > 0 ? query.data : LEGACY_DISCIPLINES;

  const values = disciplines.map((d) => d.value);
  const labels = disciplines.map((d) => d.label);

  const getColor = (value) => {
    const found = disciplines.find(
      (d) =>
        d.value?.toLowerCase() === (value || "").toLowerCase() ||
        d.label?.toLowerCase() === (value || "").toLowerCase(),
    );
    return found?.color || "bg-slate-100 text-slate-700";
  };

  const getLabel = (value) => {
    const found = disciplines.find(
      (d) =>
        d.value?.toLowerCase() === (value || "").toLowerCase() ||
        d.label?.toLowerCase() === (value || "").toLowerCase(),
    );
    return found?.label || value;
  };

  const normalize = (value) => {
    if (!value) return "";
    const lower = String(value).toLowerCase();
    const direct = disciplines.find(
      (d) =>
        d.value?.toLowerCase() === lower || d.label?.toLowerCase() === lower,
    );
    if (direct) return direct.value;
    const viaAlias = disciplines.find((d) =>
      (d.aliases || []).some((a) => a.toLowerCase() === lower),
    );
    if (viaAlias) return viaAlias.value;
    return legacyNormalize(value);
  };

  return {
    disciplines,
    values,
    labels,
    getColor,
    getLabel,
    normalize,
    isLoading: query.isLoading,
    error: query.error,
  };
}
