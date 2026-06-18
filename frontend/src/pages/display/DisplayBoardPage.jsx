import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  displayDeviceAPI,
  DISPLAY_DEVICE_ID_KEY,
  DISPLAY_DEVICE_TOKEN_KEY,
  getStoredDeviceId,
  getStoredDeviceToken,
} from "../../lib/apis/displayDeviceAPI";
import { useDisplayDeviceRealtime } from "../../hooks/useDisplayDeviceRealtime";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
import { BoardSyncStatus, useBoardSyncState } from "../../components/visual-boards/BoardSyncStatus";
import { boardSurfaceClass } from "../../components/visual-boards/boardTheme";
import { normalizeBoardForCanvas } from "../../components/visual-boards/boardLayoutUtils";

function clearDisplayStorage() {
  try {
    localStorage.removeItem(DISPLAY_DEVICE_TOKEN_KEY);
    localStorage.removeItem(DISPLAY_DEVICE_ID_KEY);
  } catch (_e) {}
}

/**
 * Paired display kiosk — device token auth, no AssetIQ login.
 * Route: /tv/board
 */
const DisplayBoardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const fullscreen = searchParams.get("fullscreen") !== "false";
  const deviceToken = getStoredDeviceToken();
  const deviceId = getStoredDeviceId();
  const [connectError, setConnectError] = useState("");
  const [liveBoardData, setLiveBoardData] = useState(null);

  useEffect(() => {
    if (!deviceToken) {
      navigate("/tv", { replace: true });
    }
  }, [deviceToken, navigate]);

  const { data: config, isLoading: configLoading, error: configError } = useQuery({
    queryKey: ["display-config", deviceToken],
    queryFn: () => displayDeviceAPI.getConfig(deviceToken),
    enabled: !!deviceToken,
    retry: false,
  });

  const refreshSeconds = config?.refresh_interval || 30;

  const { data: layout, isLoading: layoutLoading, error: layoutError } = useQuery({
    queryKey: ["display-board-layout", deviceToken],
    queryFn: () => displayDeviceAPI.getBoardLayout(deviceToken),
    enabled: !!deviceToken && !!config,
    retry: false,
  });

  const { data: boardData, isLoading: dataLoading } = useQuery({
    queryKey: ["display-board-data", deviceToken],
    queryFn: () => displayDeviceAPI.getBoardData(deviceToken),
    enabled: !!deviceToken && !!layout,
  });

  const handleRealtimeEvent = useCallback(
    async (event, _payload) => {
      if (event === "board_reassigned") {
        queryClient.invalidateQueries({ queryKey: ["display-config", deviceToken] });
        queryClient.invalidateQueries({ queryKey: ["display-board-layout", deviceToken] });
        queryClient.invalidateQueries({ queryKey: ["display-board-data", deviceToken] });
        try {
          await displayDeviceAPI.connect(deviceToken);
        } catch {
          /* layout refetch will surface errors */
        }
        return;
      }

      if (event === "board_updated") {
        queryClient.invalidateQueries({ queryKey: ["display-board-layout", deviceToken] });
        queryClient.invalidateQueries({ queryKey: ["display-board-data", deviceToken] });
        return;
      }

      if (event === "token_rotated") {
        try {
          const result = await displayDeviceAPI.acceptTokenRotation(deviceToken);
          if (result?.device_token) {
            localStorage.setItem(DISPLAY_DEVICE_TOKEN_KEY, result.device_token);
            window.location.reload();
          }
        } catch {
          clearDisplayStorage();
          navigate("/tv", { replace: true });
        }
        return;
      }

      if (event === "board_unpublished" || event === "device_disabled") {
        clearDisplayStorage();
        navigate("/tv", { replace: true });
      }
    },
    [deviceToken, navigate, queryClient],
  );

  const { isLive: isWsLive } = useDisplayDeviceRealtime(deviceToken, {
    enabled: !!deviceToken && !!config,
    refreshIntervalSec: refreshSeconds,
    onEvent: handleRealtimeEvent,
    onDataRefreshed: setLiveBoardData,
  });

  useEffect(() => {
    if (!deviceToken) return undefined;

    let cancelled = false;

    const runConnect = async () => {
      try {
        await displayDeviceAPI.connect(deviceToken);
        if (!cancelled) setConnectError("");
      } catch (err) {
        if (!cancelled) setConnectError(err.message || "Could not connect display");
      }
    };

    runConnect();
    return () => {
      cancelled = true;
    };
  }, [deviceToken]);

  useEffect(() => {
    if (!deviceToken || !deviceId) return undefined;
    const heartbeat = () => {
      displayDeviceAPI.sendHeartbeat(deviceId, deviceToken).catch(() => {});
    };
    heartbeat();
    const id = setInterval(heartbeat, 60000);
    return () => clearInterval(id);
  }, [deviceToken, deviceId]);

  useEffect(() => {
    if (fullscreen) {
      document.documentElement.classList.add("vmb-kiosk");
      return () => document.documentElement.classList.remove("vmb-kiosk");
    }
    return undefined;
  }, [fullscreen]);

  const canvasBoard = useMemo(() => normalizeBoardForCanvas(layout), [layout]);
  const boardTheme = canvasBoard.theme;
  const effectiveBoardData = liveBoardData || boardData;
  const { lastSyncedAt } = useBoardSyncState(effectiveBoardData, { refreshIntervalSec: refreshSeconds });
  const pageClass = useMemo(
    () =>
      fullscreen
        ? `fixed inset-0 z-50 ${boardSurfaceClass(boardTheme)}`
        : `min-h-screen ${boardSurfaceClass(boardTheme)}`,
    [fullscreen, boardTheme],
  );

  const error = connectError || configError?.message || layoutError?.message;
  const isLoading = configLoading || layoutLoading || dataLoading;

  if (!deviceToken) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-red-400 flex flex-col items-center justify-center p-8 text-center gap-4">
        <p>{error}</p>
        <button
          type="button"
          className="text-sm text-slate-400 underline"
          onClick={() => {
            clearDisplayStorage();
            navigate("/tv", { replace: true });
          }}
        >
          Re-pair this display
        </button>
      </div>
    );
  }

  if (isLoading || !layout) {
    return (
      <div className={`${pageClass} flex items-center justify-center`}>
        <Loader2 className="w-12 h-12 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="h-full w-full p-2 md:p-4 flex flex-col">
        <div className="flex items-center justify-between px-2 py-1 mb-2">
          <div>
            <h1 className={`text-lg font-semibold truncate ${boardTheme === "light" ? "text-slate-800" : "text-white"}`}>
              {layout?.name || config?.screen_name}
            </h1>
            {config?.screen_name && layout?.name && config.screen_name !== layout.name && (
              <p className={`text-xs truncate ${boardTheme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                {config.screen_name}
              </p>
            )}
          </div>
          <span className={`text-xs ${boardTheme === "light" ? "text-slate-400" : "text-slate-500"}`}>
            v{layout?.version || config?.board_version || 1}
          </span>
        </div>
        <div className="flex-1 min-h-0 relative">
          <VisualBoardCanvas
            layout={canvasBoard.layout}
            widgets={canvasBoard.widgets}
            theme={boardTheme}
            boardType={layout?.board_type}
            header={canvasBoard.header}
            data={{
              widgets: effectiveBoardData?.widgets,
              status: effectiveBoardData?.status,
            }}
            previewSize="fullscreen"
          />
          <BoardSyncStatus
            lastSyncedAt={lastSyncedAt}
            refreshIntervalSec={refreshSeconds}
            theme={boardTheme}
            isRealtime={isWsLive || !!liveBoardData}
          />
        </div>
      </div>
    </div>
  );
};

export default DisplayBoardPage;
