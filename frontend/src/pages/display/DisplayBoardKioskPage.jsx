import React, { useCallback, useEffect, useRef, useState } from "react";
import DisplayBoardImagePage from "./DisplayBoardImagePage";
import DisplayBoardPage from "./DisplayBoardPage";
import { displayDeviceAPI, getStoredDeviceToken } from "../../lib/apis/displayDeviceAPI";

const SNAPSHOT_PROBE_MS = 30_000;

/**
 * TV kiosk board route — static snapshot image when available; live canvas fallback.
 * Periodically re-probes for snapshots so publish updates switch back to image mode.
 */
export default function DisplayBoardKioskPage() {
  const [mode, setMode] = useState("snapshot");
  const probing = useRef(false);

  const probeSnapshot = useCallback(async () => {
    const deviceToken = getStoredDeviceToken();
    if (!deviceToken || probing.current) return;
    probing.current = true;
    try {
      await displayDeviceAPI.fetchBoardSnapshot(deviceToken, { cacheBust: Date.now() });
      setMode("snapshot");
    } catch {
      /* stay on canvas */
    } finally {
      probing.current = false;
    }
  }, []);

  useEffect(() => {
    if (mode !== "canvas") return undefined;
    probeSnapshot();
    const id = setInterval(probeSnapshot, SNAPSHOT_PROBE_MS);
    return () => clearInterval(id);
  }, [mode, probeSnapshot]);

  if (mode === "canvas") {
    return <DisplayBoardPage />;
  }

  return <DisplayBoardImagePage onFallbackToCanvas={() => setMode("canvas")} />;
}
