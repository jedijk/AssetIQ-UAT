import { useEffect, useRef, useCallback } from "react";
import { getBackendUrl } from "../lib/apiConfig";

function wsBaseUrl() {
  const http = getBackendUrl();
  return http.replace(/^http/, "ws");
}

/**
 * WebSocket client for public VMB display with polling fallback.
 */
export function useVisualBoardRealtime(token, { enabled, dbEnv, refreshIntervalSec = 30, onDataRefreshed }) {
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const onDataRef = useRef(onDataRefreshed);
  onDataRef.current = onDataRefreshed;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    const dbQuery = dbEnv && dbEnv !== "production" ? `?db_env=${encodeURIComponent(dbEnv)}` : "";
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${getBackendUrl()}/api/vmb/${encodeURIComponent(token)}/data${dbQuery}`,
        );
        if (res.ok) {
          const data = await res.json();
          onDataRef.current?.(data);
        }
      } catch {
        /* ignore */
      }
    }, Math.max(refreshIntervalSec, 10) * 1000);
  }, [token, refreshIntervalSec, dbEnv]);

  useEffect(() => {
    if (!enabled || !token) return undefined;

    let closed = false;
    const url = `${wsBaseUrl()}/ws/vmb/${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === "data_refreshed") {
            onDataRef.current?.(msg.payload);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => startPolling();
      ws.onclose = () => {
        if (!closed) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, token, startPolling]);

  return { usingWebSocket: !!wsRef.current };
}
