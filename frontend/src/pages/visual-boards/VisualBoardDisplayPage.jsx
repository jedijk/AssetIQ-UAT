import React, { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";

/**
 * Public kiosk display — no AssetIQ login, token-only access.
 * Route: /vmb/:token
 */
const VisualBoardDisplayPage = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const fullscreen = searchParams.get("fullscreen") === "true";
  const refreshSeconds = Number(searchParams.get("rotation")) || undefined;

  const { data: layout, isLoading: layoutLoading, error: layoutError } = useQuery({
    queryKey: ["vmb-layout", token],
    queryFn: () => visualBoardAPI.getPublicLayout(token),
    enabled: !!token,
    retry: false,
  });

  const intervalMs = (refreshSeconds || layout?.refresh_interval_seconds || 30) * 1000;

  const { data: boardData, isLoading: dataLoading } = useQuery({
    queryKey: ["vmb-data", token],
    queryFn: () => visualBoardAPI.getPublicData(token),
    enabled: !!token && !!layout,
    refetchInterval: intervalMs,
  });

  useEffect(() => {
    if (!token) return;
    const heartbeat = () => {
      visualBoardAPI.sendHeartbeat(token, {
        user_agent: navigator.userAgent,
        fullscreen,
      }).catch(() => {});
    };
    heartbeat();
    const id = setInterval(heartbeat, 60000);
    return () => clearInterval(id);
  }, [token, fullscreen]);

  useEffect(() => {
    if (fullscreen) {
      document.documentElement.classList.add("vmb-kiosk");
      return () => document.documentElement.classList.remove("vmb-kiosk");
    }
    return undefined;
  }, [fullscreen]);

  const isLoading = layoutLoading || dataLoading;
  const error = layoutError;

  const pageClass = useMemo(
    () =>
      fullscreen
        ? "fixed inset-0 bg-slate-950 z-50"
        : "min-h-screen bg-slate-950",
    [fullscreen],
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
      <div className="h-full w-full p-2 md:p-4 flex flex-col">
        <div className="flex items-center justify-between px-2 py-1 mb-2">
          <h1 className="text-white text-lg font-semibold truncate">{layout?.name}</h1>
          <span className="text-xs text-slate-500">v{layout?.version || 1}</span>
        </div>
        <div className="flex-1 min-h-0">
          <VisualBoardCanvas
            layout={layout?.layout}
            widgets={layout?.widgets || []}
            data={{
              widgets: boardData?.widgets,
              status: boardData?.status,
            }}
            previewSize="tv-75"
          />
        </div>
      </div>
    </div>
  );
};

export default VisualBoardDisplayPage;
