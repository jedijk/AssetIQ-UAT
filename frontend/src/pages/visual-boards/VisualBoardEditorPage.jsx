import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Rocket, Loader2, History, Plus, QrCode } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
import WidgetConfigPanel from "../../components/visual-boards/WidgetConfigPanel";
import { WIDGET_LIBRARY, createWidgetFromLibrary } from "../../components/visual-boards/widgetLibrary";
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

const VisualBoardEditorPage = () => {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [boardType, setBoardType] = useState("reliability");
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [widgets, setWidgets] = useState([]);
  const [layout, setLayout] = useState({ columns: 12, rows: 8 });
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [showVersions, setShowVersions] = useState(false);

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
      setWidgets(board.widgets || []);
      setLayout(board.layout || { columns: 12, rows: 8 });
    }
  }, [board]);

  const saveMutation = useMutation({
    mutationFn: () =>
      visualBoardAPI.updateBoard(boardId, {
        name,
        board_type: boardType,
        refresh_interval_seconds: refreshInterval,
        widgets,
        layout,
      }),
    onSuccess: () => {
      toast.success("Board saved");
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
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
      setShowVersions(false);
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Rollback failed"),
  });

  const handleDragEnd = useCallback(
    (event) => {
      const { active, delta } = event;
      if (!active || (delta.x === 0 && delta.y === 0)) return;
      const colWidth = 72;
      const rowHeight = 36;
      const dx = Math.round(delta.x / colWidth);
      const dy = Math.round(delta.y / rowHeight);
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== active.id) return w;
          const pos = w.position || {};
          return {
            ...w,
            position: {
              ...pos,
              x: Math.max(0, Math.min((layout.columns || 12) - (pos.w || 3), (pos.x || 0) + dx)),
              y: Math.max(0, Math.min((layout.rows || 8) - (pos.h || 2), (pos.y || 0) + dy)),
            },
          };
        }),
      );
    },
    [layout],
  );

  const updateWidget = (updated) => {
    setWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const removeWidget = (id) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (selectedWidgetId === id) setSelectedWidgetId(null);
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
      <div className="border-b bg-white px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/visual-management/boards">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <h1 className="font-semibold text-slate-900">Board Designer</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowVersions(true)}>
            <History className="w-4 h-4 mr-1" />
            Versions
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/visual-management/boards/${boardId}/preview`)}>
            <Eye className="w-4 h-4 mr-1" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-1" />
            Save
          </Button>
          <Button size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
            <Rocket className="w-4 h-4 mr-1" />
            Publish
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
            data={{ widgets: previewData?.widgets, status: previewData?.status }}
            previewSize="desktop"
            editable
            selectedWidgetId={selectedWidgetId}
            onSelectWidget={setSelectedWidgetId}
            onDragEnd={handleDragEnd}
          />
        </main>

        <aside className="w-72 border-l bg-white overflow-auto shrink-0">
          <WidgetConfigPanel
            widget={selectedWidget}
            onChange={updateWidget}
            onRemove={removeWidget}
          />
        </aside>
      </div>

      <Dialog open={!!publishResult} onOpenChange={(open) => !open && setPublishResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Board Published
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Display URL: <code className="bg-slate-100 px-1 rounded">{publishResult?.url}</code></p>
            {publishResult?.qr_code_data_url && (
              <div className="flex justify-center py-2">
                <img src={publishResult.qr_code_data_url} alt="Board QR code" className="w-40 h-40" />
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
