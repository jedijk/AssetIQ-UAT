import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
import { BoardSyncStatus, useBoardSyncState } from "../../components/visual-boards/BoardSyncStatus";
import { boardSurfaceClass } from "../../components/visual-boards/boardTheme";
import { normalizeBoardForCanvas } from "../../components/visual-boards/boardLayoutUtils";
import { useVisualBoardRealtime } from "../../hooks/useVisualBoardRealtime";

/**
 * Public kiosk display — no AssetIQ login, token-only access.
 * Route: /vmb/:token
 */
const VisualBoardDisplayPage = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fullscreen = searchParams.get("fullscreen") === "true";
  const dbEnv = searchParams.get("db_env") || undefined;
  const refreshSeconds = Number(searchParams.get("rotation")) || undefined;
  const [liveData, setLiveData] = useState(null);

  const { data: layout, isLoading: layoutLoading, error: layoutError } = useQuery({
    queryKey: ["vmb-layout", token, dbEnv],
    queryFn: () => visualBoardAPI.getPublicLayout(token, { dbEnv }),
    enabled: !!token,
    retry: false,
  });

  const intervalMs = (refreshSeconds || layout?.refresh_interval_seconds || 30) * 1000;

  const { data: boardData, isLoading: dataLoading } = useQuery({
    queryKey: ["vmb-data", token, dbEnv],
    queryFn: () => visualBoardAPI.getPublicData(token, undefined, { dbEnv }),
    enabled: !!token && !!layout,
    refetchInterval: intervalMs,
  });

  const onDataRefreshed = useCallback(
    (payload) => {
      setLiveData(payload);
      queryClient.setQueryData(["vmb-data", token], payload);
    },
    [queryClient, token],
  );

  useVisualBoardRealtime(token, {
    enabled: !!token && !!layout,
    dbEnv,
    refreshIntervalSec: refreshSeconds || layout?.refresh_interval_seconds || 30,
    onDataRefreshed,
  });

  useEffect(() => {
    if (!token) return;
    const heartbeat = () => {
      visualBoardAPI.sendHeartbeat(token, {
        user_agent: navigator.userAgent,
        fullscreen,
      }, { dbEnv }).catch(() => {});
    };
    heartbeat();
    const id = setInterval(heartbeat, 60000);
    return () => clearInterval(id);
  }, [token, fullscreen, dbEnv]);

  useEffect(() => {
    if (fullscreen) {
      document.documentElement.classList.add("vmb-kiosk");
      return () => document.documentElement.classList.remove("vmb-kiosk");
    }
    return undefined;
  }, [fullscreen]);

  const displayData = liveData || boardData;
  const isLoading = layoutLoading || dataLoading;
  const error = layoutError;
  const refreshSec = refreshSeconds || layout?.refresh_interval_seconds || 30;
  const { lastSyncedAt } = useBoardSyncState(displayData, { refreshIntervalSec: refreshSec });

  const canvasBoard = useMemo(() => normalizeBoardForCanvas(layout), [layout]);
  const boardTheme = canvasBoard.theme;

  const pageClass = useMemo(
    () =>
      fullscreen
        ? `fixed inset-0 z-50 ${boardSurfaceClass(boardTheme)}`
        : `min-h-screen ${boardSurfaceClass(boardTheme)}`,
    [fullscreen, boardTheme],
  );

  if (!token) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Invalid board link</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-red-400 flex items-center justify-center p-8 text-center">
        {error.message || "Board not available"}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${pageClass} flex items-center justify-center`}>
        <Loader2 className="w-12 h-12 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="h-full w-full flex flex-col relative">
        <VisualBoardCanvas
          layout={canvasBoard.layout}
          widgets={canvasBoard.widgets}
          theme={boardTheme}
          boardType={layout?.board_type}
          header={canvasBoard.header}
          data={{
            widgets: displayData?.widgets,
            status: displayData?.status,
          }}
          previewSize="fullscreen"
        />
        <BoardSyncStatus
          lastSyncedAt={lastSyncedAt}
          refreshIntervalSec={refreshSec}
          theme={boardTheme}
          isRealtime={!!liveData}
        />
      </div>
    </div>
  );
};

export default VisualBoardDisplayPage;
