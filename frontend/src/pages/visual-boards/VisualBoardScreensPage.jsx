import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Monitor, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const STATUS_VARIANT = {
  online: "default",
  offline: "destructive",
  inactive: "secondary",
};

const VisualBoardScreensPage = () => {
  const queryClient = useQueryClient();
  const [newScreen, setNewScreen] = useState({ board_id: "", screen_name: "", location: "" });

  const { data: boardsData } = useQuery({
    queryKey: ["visual-boards"],
    queryFn: () => visualBoardAPI.listBoards(),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["visual-board-screens"],
    queryFn: () => visualBoardAPI.listAllScreens(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      visualBoardAPI.createScreen(newScreen.board_id, {
        screen_name: newScreen.screen_name,
        location: newScreen.location,
      }),
    onSuccess: () => {
      toast.success("Screen registered");
      setNewScreen({ board_id: "", screen_name: "", location: "" });
      queryClient.invalidateQueries({ queryKey: ["visual-board-screens"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to create screen"),
  });

  const deleteMutation = useMutation({
    mutationFn: (screenId) => visualBoardAPI.deleteScreen(screenId),
    onSuccess: () => {
      toast.success("Screen removed");
      queryClient.invalidateQueries({ queryKey: ["visual-board-screens"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to delete screen"),
  });

  const screens = data?.items || [];
  const boards = boardsData?.items || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-7 h-7 text-blue-600" />
            Visual Management — Screens
          </h1>
          <p className="text-sm text-slate-500 mt-1">Monitor display devices and heartbeat status.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Register Screen</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Board</Label>
            <select
              className="w-full border rounded-md h-9 px-2 text-sm"
              value={newScreen.board_id}
              onChange={(e) => setNewScreen((s) => ({ ...s, board_id: e.target.value }))}
            >
              <option value="">Select board…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Screen name</Label>
            <Input value={newScreen.screen_name} onChange={(e) => setNewScreen((s) => ({ ...s, screen_name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Input value={newScreen.location} onChange={(e) => setNewScreen((s) => ({ ...s, location: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newScreen.board_id || !newScreen.screen_name || createMutation.isPending}
            >
              Add Screen
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : screens.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-500">No screens registered. Displays auto-register via heartbeat when opened.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {screens.map((screen) => (
            <Card key={screen.id}>
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{screen.screen_name}</div>
                  <div className="text-xs text-slate-500">
                    {screen.board_name || screen.board_id}
                    {screen.location ? ` · ${screen.location}` : ""}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Last seen: {screen.last_seen ? new Date(screen.last_seen).toLocaleString() : "Never"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[screen.status] || "secondary"}>{screen.status}</Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/visual-management/boards/${screen.board_id}/edit`}>Board</Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(screen.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VisualBoardScreensPage;
