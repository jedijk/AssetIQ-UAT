import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { applyBackendOverrides, defaultCapabilities } from "./capabilities";

const CapabilitiesContext = createContext(defaultCapabilities);

/**
 * Fetches optional `/api/config/performance` and merges into capability snapshot.
 */
export function CapabilitiesProvider({ children }) {
  const queryClient = useQueryClient();
  const [caps, setCaps] = useState(() => defaultCapabilities);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/config/performance");
        if (!cancelled && data && typeof data === "object") {
          setCaps(applyBackendOverrides(data));
          // Ensure observers that depended on initial caps (before merge) reschedule timers / refetch.
          queryClient.invalidateQueries({ queryKey: ["production-dashboard"], exact: false });
        }
      } catch (_e) {
        if (!cancelled) setCaps(defaultCapabilities);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const value = useMemo(() => caps, [caps]);

  return (
    <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>
  );
}

/** Current capability snapshot (device + network + optional remote flags). */
export function useCapabilities() {
  return useContext(CapabilitiesContext);
}
