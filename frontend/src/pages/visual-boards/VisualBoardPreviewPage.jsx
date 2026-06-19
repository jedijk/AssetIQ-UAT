import React, { useMemo, useEffect, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
import { BoardSyncStatus, useBoardSyncState } from "../../components/visual-boards/BoardSyncStatus";
import { boardSurfaceClass } from "../../components/visual-boards/boardTheme";
import { normalizeBoardForCanvas, readBoardDraft, remapWidgetDataForCanvas } from "../../components/visual-boards/boardLayoutUtils";
import { useKioskDocumentTheme } from "../../hooks/useKioskDocumentTheme";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const PREVIEW_SIZES = [
  { id: "tv-exact", label: "TV (exact — same as /tv)" },
  { id: "tv-55", label: 'TV 55" (scaled)' },
  { id: "tv-75", label: 'TV 75" (scaled)' },
  { id: "tv-98", label: 'TV 98" (scaled)' },
  { id: "desktop", label: "Desktop (editor layout)" },
  { id: "tablet", label: "Tablet (scaled)" },
];

const TV_PREVIEW_SIZES = new Set(["tv-exact", "tv-55", "tv-75", "tv-98"]);

const VisualBoardPreviewPage = () => {
  const { boardId } = useParams();
  const [searchParams] = useSearchParams();
  const snapshotMode = searchParams.get("snapshot") === "1";
  const [previewSize, setPreviewSize] = React.useState(
    snapshotMode ? "tv-exact" : "desktop",
  );
  const snapshotSignalled = useRef(false);

  const { data: board, isLoading } = useQuery({
    queryKey: ["visual-board-preview", boardId],
    queryFn: () => visualBoardAPI.getBoard(boardId),
    enabled: !!boardId,
  });

  const refreshSeconds = board?.refresh_interval_seconds || 30;

  const { data: previewData } = useQuery({
    queryKey: ["visual-board-preview-data", boardId],
    queryFn: () => visualBoardAPI.getPreviewData(boardId),
    enabled: !!boardId,
    refetchInterval: refreshSeconds * 1000,
  });

  const draft = useMemo(() => readBoardDraft(boardId), [boardId]);
  const isTvExact = previewSize === "tv-exact";
  const simulateTv = TV_PREVIEW_SIZES.has(previewSize);
  const useSavedBoardCanvas = simulateTv;

  const canvasBoard = useMemo(() => {
    if (useSavedBoardCanvas) {
      return normalizeBoardForCanvas(board);
    }
    if (draft) {
      return normalizeBoardForCanvas({
        layout: draft.layout,
        widgets: draft.widgets,
        theme: draft.theme,
        header: draft.header,
      });
    }
    return normalizeBoardForCanvas(board);
  }, [board, draft, useSavedBoardCanvas]);

  const boardName = useSavedBoardCanvas ? board?.name : draft?.name || board?.name;
  const hasUnsavedTvDraft = Boolean(draft && useSavedBoardCanvas && board);

  useKioskDocumentTheme(canvasBoard.theme, {
    enabled: simulateTv,
    fullscreen: isTvExact,
  });

  const canvasData = useMemo(
    () => remapWidgetDataForCanvas(board?.widgets, canvasBoard.widgets, previewData),
    [board?.widgets, canvasBoard.widgets, previewData],
  );

  const { lastSyncedAt } = useBoardSyncState(canvasData, { refreshIntervalSec: refreshSeconds });

  useEffect(() => {
    if (!snapshotMode || snapshotSignalled.current || !previewData || isLoading) return undefined;
    snapshotSignalled.current = true;
    const id = window.setTimeout(() => {
      window.parent.postMessage({ type: "vmb-snapshot-ready", boardId }, "*");
    }, 1200);
    return () => window.clearTimeout(id);
  }, [snapshotMode, previewData, isLoading, boardId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const pageClass = isTvExact
    ? `fixed inset-0 z-40 ${boardSurfaceClass(canvasBoard.theme)}`
    : "min-h-[calc(100vh-48px)] bg-slate-900 flex flex-col";

  const canvasPreviewSize = isTvExact ? "fullscreen" : previewSize;
  const hideChrome = snapshotMode && isTvExact;

  return (
    <div className={pageClass} data-vmb-snapshot-root={hideChrome ? "1" : undefined}>
      {!isTvExact && !hideChrome ? (
        <div className="px-3 sm:px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 min-w-0">
          <div className="flex items-start gap-2 sm:gap-3 min-w-0">
            <Button asChild variant="ghost" size="sm" className="text-slate-300 shrink-0">
              <Link to={`/visual-management/boards/${boardId}/edit`}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <span className="text-white font-medium text-sm sm:text-base break-words min-w-0">
              {boardName} — Preview
              {draft ? " (unsaved draft)" : " (saved version)"}
            </span>
          </div>
          <Select value={previewSize} onValueChange={setPreviewSize}>
            <SelectTrigger className="w-full sm:w-56 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREVIEW_SIZES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {!hideChrome && isTvExact ? (
        <div className="absolute top-3 right-3 z-50 flex flex-col items-end gap-2">
          {hasUnsavedTvDraft ? (
            <div className="rounded-md bg-amber-500/90 text-slate-950 text-[11px] px-2 py-1 max-w-xs text-right">
              TV shows the saved board. Save in the editor to publish title and layout changes.
            </div>
          ) : null}
          <div className="flex items-center gap-2">
          <Select value={previewSize} onValueChange={setPreviewSize}>
            <SelectTrigger className="w-52 bg-slate-900/90 border-slate-700 text-white text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREVIEW_SIZES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="secondary" size="sm" className="h-8 text-xs">
            <Link to={`/visual-management/boards/${boardId}/edit`}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Editor
            </Link>
          </Button>
          </div>
        </div>
      ) : null}
      <div
        className={
          isTvExact
            ? "h-full w-full flex flex-col relative"
            : `flex-1 p-6 flex items-center justify-center ${simulateTv ? boardSurfaceClass(canvasBoard.theme) : ""}`
        }
      >
        <VisualBoardCanvas
          layout={canvasBoard.layout}
          widgets={canvasBoard.widgets}
          theme={canvasBoard.theme}
          boardType={board?.board_type}
          boardName={boardName}
          header={canvasBoard.header}
          data={{
            widgets: canvasData?.widgets,
            status: canvasData?.status,
          }}
          previewSize={canvasPreviewSize}
        />
        {isTvExact && !hideChrome ? (
          <BoardSyncStatus
            lastSyncedAt={lastSyncedAt}
            refreshIntervalSec={refreshSeconds}
            theme={canvasBoard.theme}
            isRealtime={false}
          />
        ) : null}
      </div>
    </div>
  );
};

export default VisualBoardPreviewPage;
