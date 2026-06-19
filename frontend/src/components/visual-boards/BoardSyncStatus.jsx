import React, { useEffect, useMemo, useState } from "react";
import { isLegacyDisplayBrowser } from "../../lib/kioskCompat";

function parseSyncTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatSyncTime(value) {
  const d = parseSyncTime(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Bottom-right sync timestamp and live indicator for kiosk board views.
 */
export function BoardSyncStatus({
  lastSyncedAt,
  refreshIntervalSec = 30,
  isRealtime = false,
  theme = "dark",
  className = "",
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const syncDate = parseSyncTime(lastSyncedAt);
  const staleAfterMs = Math.max(refreshIntervalSec, 10) * 2000;
  const isLive = useMemo(() => {
    if (!syncDate) return false;
    if (isRealtime) return true;
    return now - syncDate.getTime() <= staleAfterMs;
  }, [syncDate, isRealtime, now, staleAfterMs]);

  const isLight = theme === "light";
  const labelClass = isLight ? "text-slate-600" : "text-slate-400";
  const timeClass = isLight ? "text-slate-700" : "text-slate-300";
  const legacy = isLegacyDisplayBrowser();

  if (legacy) {
    return (
      <div
        className={`vmb-sync-status pointer-events-none ${className}`}
        aria-live="polite"
        data-testid="board-sync-status"
        style={{ color: isLight ? "#475569" : "#94a3b8" }}
      >
        <span className="vmb-sync-live" style={{ color: isLive ? "#4ade80" : "#fbbf24" }}>
          {isLive ? "Live" : "Sync delayed"}
        </span>
        <span style={{ color: isLight ? "#334155" : "#cbd5e1" }}>
          Synced {formatSyncTime(syncDate)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute bottom-2 right-2 left-2 sm:left-auto z-20 flex justify-end ${className}`}
      aria-live="polite"
      data-testid="board-sync-status"
    >
      <div
        className={`inline-flex max-w-full flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 rounded-md px-1.5 py-0.5 text-[10px] sm:text-xs tabular-nums ${labelClass}`}
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            isLive ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" : "bg-amber-500/80"
          }`}
          aria-hidden
        />
        <span className={`shrink-0 ${isLive ? "text-emerald-400 font-medium" : "text-amber-400/90 font-medium"}`}>
          {isLive ? "Live" : "Sync delayed"}
        </span>
        <span className={`${timeClass} break-words text-right`}>
          · Synced {formatSyncTime(syncDate)}
        </span>
      </div>
    </div>
  );
}

export function useBoardSyncState(data, { refreshIntervalSec = 30 } = {}) {
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  useEffect(() => {
    if (!data) return;
    const fromApi = parseSyncTime(data.last_updated);
    setLastSyncedAt(fromApi || new Date());
  }, [data]);

  return { lastSyncedAt, refreshIntervalSec };
}
