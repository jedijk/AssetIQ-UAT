import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Monitor, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-7 h-7 text-blue-600" />
            Visual Management — Boards
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create, preview, and publish shop-floor display boards.
          </p>
          <div className="flex gap-3 mt-2 text-sm">
            <Link to="/visual-management/templates" className="text-blue-600 hover:underline">Templates</Link>
            <Link to="/visual-management/screens" className="text-blue-600 hover:underline">Screens</Link>
            <Link to="/visual-management/analytics" className="text-blue-600 hover:underline">Analytics</Link>
          </div>
        </div>
        <div className="flex gap-2">
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
