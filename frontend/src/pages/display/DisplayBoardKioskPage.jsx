import React, { useCallback, useEffect, useRef, useState } from "react";
import DisplayBoardImagePage from "./DisplayBoardImagePage";
import DisplayBoardPage from "./DisplayBoardPage";
import { buildBoardSnapshotUrl, getStoredDeviceToken } from "../../lib/apis/displayDeviceAPI";

const SNAPSHOT_PROBE_MS = 30_000;

/**
 * TV kiosk board route — live canvas by default; upgrades to static snapshot when published.
 * Periodically re-probes for snapshots so publish updates switch back to image mode.
 */
export default function DisplayBoardKioskPage() {
  const [mode, setMode] = useState("canvas");
  const probing = useRef(false);

  const probeSnapshot = useCallback(async () => {
    const deviceToken = getStoredDeviceToken();
    if (!deviceToken || probing.current) return;
    probing.current = true;
    try {
      const url = buildBoardSnapshotUrl(deviceToken, { cacheBust: Date.now() });
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob || blob.size === 0) return;
      setMode("snapshot");
    } catch {
      /* stay on canvas */
    } finally {
      probing.current = false;
    }
  }, []);

  useEffect(() => {
    probeSnapshot();
  }, [probeSnapshot]);

  useEffect(() => {
    if (mode !== "canvas") return undefined;
    const id = setInterval(probeSnapshot, SNAPSHOT_PROBE_MS);
    return () => clearInterval(id);
  }, [mode, probeSnapshot]);

  if (mode === "canvas") {
    return <DisplayBoardPage />;
  }

  return <DisplayBoardImagePage onFallbackToCanvas={() => setMode("canvas")} />;
}
