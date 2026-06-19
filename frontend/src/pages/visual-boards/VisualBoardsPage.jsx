import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Monitor, RefreshCw, Loader2, ExternalLink, Tv } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { getDisplayPairingUrl } from "../../components/visual-boards/DisplayPairingInstructions";
import { VisualManagementNav } from "../../components/visual-boards/VisualManagementNav";

const STATUS_VARIANT = {
  draft: "secondary",
  published: "default",
  archived: "outline",
};

const VisualBoardsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["visual-boards"],
    queryFn: () => visualBoardAPI.listBoards(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      visualBoardAPI.createBoard({
        name: "New Reliability Board",
        board_type: "reliability",
      }),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ["visual-boards"] });
      navigate(`/visual-management/boards/${board.id}/edit`);
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to create board"),
  });

  const boards = data?.items || data?.boards || [];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <VisualManagementNav />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-7 h-7 text-blue-600" />
            Boards
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create, preview, and publish shop-floor display boards.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/visual-management/pair-displays">
              <Tv className="w-4 h-4 mr-1" />
              Pair a TV
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            New Board
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">Connect a shop-floor TV</p>
          <p className="mt-1 text-slate-600">
            Open{" "}
            <a href={getDisplayPairingUrl()} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-700 hover:underline">
              {getDisplayPairingUrl()}
            </a>{" "}
            on the display, then enter the code under{" "}
            <span className="font-medium">Pair Displays</span>.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/visual-management/screens">
            <Tv className="w-4 h-4 mr-1" />
            Pair Displays
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : boards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No boards yet. Create your first reliability or maintenance display board.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {boards.map((board) => (
            <Card key={board.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{board.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[board.status] || "secondary"}>
                    {board.status || "draft"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 capitalize">{board.board_type || "custom"}</p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/visual-management/boards/${board.id}/edit`}>Edit</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/visual-management/boards/${board.id}/preview`}>Preview</Link>
                </Button>
                {board.status === "published" && board.public_url && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={board.public_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Open Display
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VisualBoardsPage;
