import { useEffect, useRef, useCallback, useState } from "react";
import { getWebSocketBaseUrl } from "../lib/apiConfig";
import { displayDeviceAPI, getDisplayDbEnv } from "../lib/apis/displayDeviceAPI";

/**
 * WebSocket client for paired display devices with polling fallback.
 */
export function useDisplayDeviceRealtime(deviceToken, {
  enabled,
  refreshIntervalSec = 30,
  onEvent,
  onDataRefreshed,
}) {
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const [connectionMode, setConnectionMode] = useState("idle");
  const onEventRef = useRef(onEvent);
  const onDataRef = useRef(onDataRefreshed);
  onEventRef.current = onEvent;
  onDataRef.current = onDataRefreshed;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    setConnectionMode("polling");
    pollRef.current = setInterval(async () => {
      try {
        const data = await displayDeviceAPI.getBoardData(deviceToken);
        onDataRef.current?.(data);
      } catch {
        /* ignore */
      }
    }, Math.max(refreshIntervalSec, 10) * 1000);
  }, [deviceToken, refreshIntervalSec]);

  useEffect(() => {
    if (!enabled || !deviceToken) return undefined;

    let closed = false;
    const dbEnv = getDisplayDbEnv();
    const dbQuery = dbEnv && dbEnv !== "production" ? `&db_env=${encodeURIComponent(dbEnv)}` : "";
    const url = `${getWebSocketBaseUrl()}/ws/display?token=${encodeURIComponent(deviceToken)}${dbQuery}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionMode("websocket");
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
          } else if (msg.event) {
            onEventRef.current?.(msg.event, msg.payload || {});
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
      setConnectionMode("idle");
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, deviceToken, startPolling]);

  return { connectionMode, isLive: connectionMode === "websocket" };
}
