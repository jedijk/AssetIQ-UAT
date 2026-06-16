import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Rocket, Loader2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
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

const BOARD_TYPES = ["reliability", "maintenance", "operations", "executive", "custom"];

const VisualBoardEditorPage = () => {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [boardType, setBoardType] = useState("reliability");
  const [refreshInterval, setRefreshInterval] = useState(30);

  const { data: board, isLoading } = useQuery({
    queryKey: ["visual-board", boardId],
    queryFn: () => visualBoardAPI.getBoard(boardId),
    enabled: !!boardId,
  });

  const { data: previewData } = useQuery({
    queryKey: ["visual-board-preview-data", boardId],
    queryFn: () => visualBoardAPI.getPreviewData(boardId),
    enabled: !!boardId,
  });

  useEffect(() => {
    if (board) {
      setName(board.name || "");
      setBoardType(board.board_type || "reliability");
      setRefreshInterval(board.refresh_interval_seconds || 30);
    }
  }, [board]);

  const saveMutation = useMutation({
    mutationFn: () =>
      visualBoardAPI.updateBoard(boardId, {
        name,
        board_type: boardType,
        refresh_interval_seconds: refreshInterval,
        widgets: board?.widgets,
        layout: board?.layout,
      }),
    onSuccess: () => {
      toast.success("Board saved");
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to save board"),
  });

  const publishMutation = useMutation({
    mutationFn: () => visualBoardAPI.publishBoard(boardId, { screen_name: "Default Display" }),
    onSuccess: (data) => {
      toast.success("Board published");
      if (data?.token) {
        toast.info(`Display URL: ${data.url || `/vmb/${data.token}`}`, { duration: 10000 });
      }
      queryClient.invalidateQueries({ queryKey: ["visual-board", boardId] });
      queryClient.invalidateQueries({ queryKey: ["visual-boards"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to publish board"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const widgets = board?.widgets || [];
  const layout = board?.layout || { columns: 12, rows: 6 };

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
        <aside className="w-72 border-r bg-slate-50 p-4 space-y-4 overflow-auto">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Board Type</Label>
            <Select value={boardType} onValueChange={setBoardType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOARD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Refresh Interval (seconds)</Label>
            <Input
              type="number"
              min={10}
              max={300}
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
            />
          </div>
          <div className="text-xs text-slate-500 pt-2">
            {widgets.length} widget(s) configured. Drag-and-drop designer coming in Phase 4.
          </div>
        </aside>

        <main className="flex-1 bg-slate-200 p-6 overflow-auto">
          <VisualBoardCanvas
            layout={layout}
            widgets={widgets}
            data={{
              widgets: previewData?.widgets,
              status: previewData?.status,
            }}
            previewSize="tv-55"
          />
        </main>
      </div>
    </div>
  );
};

export default VisualBoardEditorPage;
