import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Rocket, Loader2, History, Plus, QrCode, Copy, Share2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
import WidgetConfigPanel from "../../components/visual-boards/WidgetConfigPanel";
import BoardHeaderSettings from "../../components/visual-boards/BoardHeaderSettings";
import { WIDGET_LIBRARY, createWidgetFromLibrary } from "../../components/visual-boards/widgetLibrary";
import {
  DEFAULT_BOARD_HEADER,
  DEFAULT_FINE_LAYOUT,
  normalizeBoardHeader,
  upgradeToFineGrid,
  clampWidgetPosition,
  pixelDeltaToGridSteps,
  writeBoardDraft,
  clearBoardDraft,
} from "../../components/visual-boards/boardLayoutUtils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

function resolveBoardDisplayUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
  }
  return url;
}

const VisualBoardEditorPage = () => {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [boardType, setBoardType] = useState("reliability");
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [theme, setTheme] = useState("dark");
  const [widgets, setWidgets] = useState([]);
  const [layout, setLayout] = useState(DEFAULT_FINE_LAYOUT);
  const [header, setHeader] = useState({ ...DEFAULT_BOARD_HEADER });
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const gridMetricsRef = useRef({ colWidth: 36, rowHeight: 28, gap: 8 });

  const publishedDisplayUrl = publishResult?.url ? resolveBoardDisplayUrl(publishResult.url) : "";

  const copyPublishedUrl = async () => {
    if (!publishedDisplayUrl) return;
    try {
      await navigator.clipboard.writeText(publishedDisplayUrl);
      toast.success("Display URL copied");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = publishedDisplayUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Display URL copied");
    }
  };

  const sharePublishedUrl = async () => {
    if (!publishedDisplayUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: name || "Visual Management Board",
          text: "Open this board on a display device",
          url: publishedDisplayUrl,
        });
      } catch (err) {
        if (err?.name !== "AbortError") copyPublishedUrl();
      }
      return;
    }
    await copyPublishedUrl();
    toast.info("Share is not available here — link copied instead");
  };

  const { data: board, isLoading } = useQuery({
    queryKey: ["visual-board", boardId],
    queryFn: () => visualBoardAPI.getBoard(boardId),
    enabled: !!boardId,
  });

  const { data: previewData, refetch: refetchPreview } = useQuery({
    queryKey: ["visual-board-preview-data", boardId],
    queryFn: () => visualBoardAPI.getPreviewData(boardId),
    enabled: !!boardId,
  });

  const { data: versionsData } = useQuery({
    queryKey: ["visual-board-versions", boardId],
    queryFn: () => visualBoardAPI.listVersions(boardId),
    enabled: !!boardId && showVersions,
  });

  useEffect(() => {
    if (board) {
      setName(board.name || "");
      setBoardType(board.board_type || "reliability");
      setRefreshInterval(board.refresh_interval_seconds || 30);
      setTheme(board.theme || "dark");
      const upgraded = upgradeToFineGrid(board.layout, board.widgets || []);
      setWidgets(upgraded.widgets);
      setLayout(upgraded.layout);
      setHeader(normalizeBoardHeader(board.header));
    }
  }, [board]);

  const saveMutation = useMutation({
    mutationFn: () =>
      visualBoardAPI.updateBoard(boardId, {
        name,
        board_type: boardType,
        theme,
        refresh_interval_seconds: refreshInterval,
        widgets,
        layout,
        header,
      }),
    onSuccess: () => {
      toast.success("Board saved");
      clearBoardDraft(boardId);
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
      queryClient.invalidateQueries({ queryKey: ["visual-board-preview", boardId] });
      refetchPreview();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to save board"),
  });

  const publishMutation = useMutation({
    mutationFn: () => visualBoardAPI.publishBoard(boardId, { screen_name: name || "Display" }),
    onSuccess: (data) => {
      toast.success("Board published");
      setPublishResult(data);
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
      queryClient.invalidateQueries({ queryKey: ["visual-boards"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to publish board"),
  });

  const rollbackMutation = useMutation({
    mutationFn: (version) => visualBoardAPI.rollbackVersion(boardId, version),
    onSuccess: (updated) => {
      toast.success("Board rolled back");
      setWidgets(updated.widgets || []);
      setLayout(updated.layout || layout);
      setHeader(normalizeBoardHeader(updated.header));
      setShowVersions(false);
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Rollback failed"),
  });

  const handleDragEnd = useCallback(
    (event) => {
      const { active, delta } = event;
      if (!active || (delta.x === 0 && delta.y === 0)) return;
      const { dx, dy } = pixelDeltaToGridSteps(delta.x, delta.y, gridMetricsRef.current);
      if (dx === 0 && dy === 0) return;
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== active.id) return w;
          const pos = w.position || {};
          return {
            ...w,
            position: clampWidgetPosition(
              {
                ...pos,
                x: (pos.x || 0) + dx,
                y: (pos.y || 0) + dy,
              },
              layout,
            ),
          };
        }),
      );
    },
    [layout],
  );

  const handleResizeWidget = useCallback(
    (widgetId, dw, dh) => {
      if (dw === 0 && dh === 0) return;
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== widgetId) return w;
          const pos = w.position || {};
          return {
            ...w,
            position: clampWidgetPosition(
              {
                ...pos,
                w: (pos.w || 6) + dw,
                h: (pos.h || 4) + dh,
              },
              layout,
            ),
          };
        }),
      );
    },
    [layout],
  );

  const handleGridMetrics = useCallback((metrics) => {
    gridMetricsRef.current = metrics;
  }, []);

  const updateWidget = (updated) => {
    setWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const removeWidget = (id) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (selectedWidgetId === id) setSelectedWidgetId(null);
  };

  const openPreview = () => {
    writeBoardDraft(boardId, { name, layout, widgets, theme, header });
    navigate(`/visual-management/boards/${boardId}/preview`);
  };

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col">
      <div className="border-b bg-white px-3 sm:px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/visual-management/boards">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <h1 className="font-semibold text-slate-900 text-sm sm:text-base break-words">Board Designer</h1>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => setShowVersions(true)} className="flex-1 sm:flex-none">
            <History className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Versions</span>
          </Button>
          <Button variant="outline" size="sm" onClick={openPreview} className="flex-1 sm:flex-none">
            <Eye className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1 sm:flex-none">
            <Save className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} className="flex-1 sm:flex-none">
            <Rocket className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Publish</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 border-r bg-slate-50 p-3 space-y-3 overflow-auto shrink-0">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Board Type</Label>
            <Select value={boardType} onValueChange={setBoardType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["reliability", "maintenance", "operations", "executive", "custom"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Refresh (sec)</Label>
            <Input type="number" min={10} max={300} value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Grid columns</Label>
            <Input
              type="number"
              min={12}
              max={48}
              step={2}
              value={layout.columns}
              onChange={(e) =>
                setLayout((prev) => ({
                  ...prev,
                  columns: Math.max(12, Math.min(48, Number(e.target.value) || 24)),
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Grid rows</Label>
            <Input
              type="number"
              min={8}
              max={48}
              value={layout.rows}
              onChange={(e) =>
                setLayout((prev) => ({
                  ...prev,
                  rows: Math.max(8, Math.min(48, Number(e.target.value) || 16)),
                }))
              }
            />
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            Fine 24-column grid. Drag widgets to move; drag the blue handle to resize. Save after layout changes.
          </p>
          <BoardHeaderSettings
            header={header}
            onChange={setHeader}
            showTyromerControls={boardType === "operations"}
          />
          <div className="pt-2 border-t">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Widget Library</div>
            <div className="space-y-1">
              {WIDGET_LIBRARY.map((entry) => (
                <Button
                  key={entry.type}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => {
                    const w = createWidgetFromLibrary(entry);
                    setWidgets((prev) => [...prev, w]);
                    setSelectedWidgetId(w.id);
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {entry.label}
                </Button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-slate-200 p-4 overflow-auto">
          <VisualBoardCanvas
            layout={layout}
            widgets={widgets}
            theme={theme}
            boardType={boardType}
            header={header}
            data={{ widgets: previewData?.widgets, status: previewData?.status }}
            previewSize="desktop"
            editable
            selectedWidgetId={selectedWidgetId}
            onSelectWidget={setSelectedWidgetId}
            onDragEnd={handleDragEnd}
            onResizeWidget={handleResizeWidget}
            onGridMetricsChange={handleGridMetrics}
          />
        </main>

        <aside className="w-72 border-l bg-white overflow-auto shrink-0">
          <WidgetConfigPanel
            widget={selectedWidget}
            layout={layout}
            onChange={updateWidget}
            onRemove={removeWidget}
          />
        </aside>
      </div>

      <Dialog open={!!publishResult} onOpenChange={(open) => !open && setPublishResult(null)}>
        <DialogContent className="max-w-md sm:max-w-lg w-[calc(100%-2rem)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 shrink-0" />
              Board Published
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm min-w-0">
            {publishedDisplayUrl ? (
              <div className="space-y-2 min-w-0">
                <p className="text-slate-600">Display URL</p>
                <div className="min-w-0 max-w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <a
                    href={publishedDisplayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-xs leading-relaxed text-blue-600 hover:underline break-all [overflow-wrap:anywhere]"
                  >
                    {publishedDisplayUrl}
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyPublishedUrl}>
                    <Copy className="w-3.5 h-3.5" />
                    Copy link
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={sharePublishedUrl}>
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Open this link on a TV or tablet (frontend app). It is not served from the API host.
                </p>
              </div>
            ) : null}
            {publishResult?.qr_code_data_url && (
              <div className="flex justify-center py-2">
                <img src={publishResult.qr_code_data_url} alt="Board QR code" className="w-40 h-40 max-w-full" />
              </div>
            )}
            <p className="text-slate-500">Scan the QR code to open this board on a phone or tablet without login.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-auto">
            {(versionsData?.items || []).map((v) => (
              <div key={v.id || v.version} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                <span>Version {v.version}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rollbackMutation.mutate(v.version)}
                  disabled={rollbackMutation.isPending}
                >
                  Rollback
                </Button>
              </div>
            ))}
            {(versionsData?.items || []).length === 0 && (
              <p className="text-slate-500 text-sm">No published versions yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VisualBoardEditorPage;
