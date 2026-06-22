import { useCallback, useEffect, useState } from "react";

/**
 * Session-persisted open/close state for Intelligence Context panels.
 */
export function useIntelligenceContextPanel(storageKey) {
  const [open, setOpenState] = useState(() => {
    if (!storageKey || typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const setOpen = useCallback(
    (value) => {
      const next = typeof value === "function" ? value(open) : value;
      setOpenState(!!next);
      if (!storageKey || typeof sessionStorage === "undefined") return;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [storageKey, open],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  return [open, setOpen];
}
