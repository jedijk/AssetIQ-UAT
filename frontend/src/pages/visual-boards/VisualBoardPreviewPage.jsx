import React, { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import VisualBoardCanvas from "../../components/visual-boards/VisualBoardCanvas";
import { normalizeBoardForCanvas, readBoardDraft } from "../../components/visual-boards/boardLayoutUtils";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const PREVIEW_SIZES = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "tv-55", label: 'TV 55"' },
  { id: "tv-75", label: 'TV 75"' },
  { id: "tv-98", label: 'TV 98"' },
];

const VisualBoardPreviewPage = () => {
  const { boardId } = useParams();
  const [previewSize, setPreviewSize] = useState("desktop");

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
  const canvasBoard = useMemo(() => {
    if (draft) {
      return normalizeBoardForCanvas({
        layout: draft.layout,
        widgets: draft.widgets,
        theme: draft.theme,
        header: draft.header,
      });
    }
    return normalizeBoardForCanvas(board);
  }, [board, draft]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-900 flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="text-slate-300">
            <Link to={`/visual-management/boards/${boardId}/edit`}>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <span className="text-white font-medium">
            {draft?.name || board?.name} — Preview
            {draft ? " (unsaved draft)" : " (saved version)"}
          </span>
        </div>
        <Select value={previewSize} onValueChange={setPreviewSize}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
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
      <div className="flex-1 p-6 flex items-center justify-center">
        <VisualBoardCanvas
          layout={canvasBoard.layout}
          widgets={canvasBoard.widgets}
          theme={canvasBoard.theme}
          boardType={board?.board_type}
          header={canvasBoard.header}
          data={{
            widgets: previewData?.widgets,
            status: previewData?.status,
          }}
          previewSize={previewSize}
        />
      </div>
    </div>
  );
};

export default VisualBoardPreviewPage;
