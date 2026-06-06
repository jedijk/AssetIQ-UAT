/**
 * useDisciplines — read-only hook backed by the Disciplines configurator API.
 *
 * Wraps `GET /api/disciplines` with React Query so all consumers
 * (Forms, Tasks, Actions, AI Recs, FMEA) share a single cached source.
 *
 * Falls back to the legacy hardcoded list in `constants/disciplines.js`
 * while the API is still bootstrapping (first ever request after deploy),
 * so dropdowns never render empty.
 */
import { useQuery } from "@tanstack/react-query";
import {
  DISCIPLINES as LEGACY_DISCIPLINES,
  normalizeDiscipline as legacyNormalize,
} from "../constants/disciplines";
import { getBackendUrl } from "../lib/apiConfig";

const API_BASE_URL = getBackendUrl();
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer";

function authHeaders() {
  const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchDisciplines() {
  const res = await fetch(`${API_BASE_URL}/api/disciplines`, {
    headers: authHeaders(),
    credentials: AUTH_MODE === "cookie" ? "include" : "omit",
  });
  if (!res.ok) throw new Error("Failed to fetch disciplines");
  const data = await res.json();
  return data.disciplines || [];
}

export function useDisciplines({ includeInactive = false } = {}) {
  const query = useQuery({
    queryKey: ["disciplines", { includeInactive }],
    queryFn: fetchDisciplines,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Use API data when available; fall back to legacy constants during bootstrap
  const disciplines =
    query.data && query.data.length > 0 ? query.data : LEGACY_DISCIPLINES;

  // Convenience helpers — same shape as the legacy constants module so call
  // sites can switch over with minimal changes.
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

  // Client-side normalize: direct value/label match → alias match → legacy fallback
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
