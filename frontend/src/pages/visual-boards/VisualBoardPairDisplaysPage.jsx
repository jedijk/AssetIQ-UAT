import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Monitor, Loader2, RefreshCw, Trash2, Link2, Search } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import { displayDeviceAPI } from "../../lib/apis/displayDeviceAPI";
import { getDatabaseEnvironment } from "../../lib/databaseEnv";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { DisplayPairingInstructions, getDisplayPairingUrl } from "../../components/visual-boards/DisplayPairingInstructions";
import { VisualManagementNav } from "../../components/visual-boards/VisualManagementNav";

const STATUS_VARIANT = {
  online: "default",
  offline: "destructive",
  inactive: "secondary",
  active: "default",
  disabled: "secondary",
  pending: "secondary",
};

const ENV_LABEL = { production: "Production", uat: "UAT" };

const VisualBoardPairDisplaysPage = () => {
  const queryClient = useQueryClient();
  const dbEnv = getDatabaseEnvironment();
  const [pairCodeInput, setPairCodeInput] = useState("");
  const [pairPreview, setPairPreview] = useState(null);
  const [pairForm, setPairForm] = useState({ board_id: "", board_db_env: "", screen_name: "", location: "", area: "" });
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: pairingBoardsData, isLoading: pairingBoardsLoading } = useQuery({
    queryKey: ["display-pairing-boards", dbEnv],
    queryFn: () => displayDeviceAPI.listBoardsForPairing(),
    enabled: !!pairPreview,
  });

  const { data: legacyScreens, isLoading: legacyLoading, refetch: refetchLegacy } = useQuery({
    queryKey: ["visual-board-screens", dbEnv],
    queryFn: () => visualBoardAPI.listAllScreens(),
  });

  const deleteMutation = useMutation({
    mutationFn: (screenId) => visualBoardAPI.deleteScreen(screenId),
    onSuccess: () => {
      toast.success("Screen removed");
      queryClient.invalidateQueries({ queryKey: ["visual-board-screens"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Failed to delete screen"),
  });

  const completePairMutation = useMutation({
    mutationFn: () => {
      const payload = {
        pair_code: pairPreview.pair_code,
        board_id: pairForm.board_id,
        screen_name: pairForm.screen_name,
        location: pairForm.location || undefined,
        area: pairForm.area || undefined,
      };
      if (pairForm.board_db_env) {
        payload.database_environment = pairForm.board_db_env;
      }
      return displayDeviceAPI.completePairing(payload);
    },
    onSuccess: (result) => {
      toast.success(`Paired "${result.screen_name}"`);
      setPairPreview(null);
      setPairCodeInput("");
      setPairForm({ board_id: "", board_db_env: "", screen_name: "", location: "", area: "" });
      queryClient.invalidateQueries({ queryKey: ["display-devices"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message || "Pairing failed"),
  });

  const lookupPairCode = async () => {
    const code = pairCodeInput.trim().toUpperCase();
    if (code.length !== 6) {
      toast.error("Enter a 6-character pairing code");
      return;
    }
    setPreviewLoading(true);
    try {
      const preview = await displayDeviceAPI.previewPairing(code);
      setPairPreview(preview);
      if (!pairForm.screen_name && preview.device_label) {
        setPairForm((f) => ({ ...f, screen_name: preview.device_label }));
      }
    } catch (err) {
      setPairPreview(null);
      toast.error(err.response?.data?.detail || err.message || "Code not found or expired");
    } finally {
      setPreviewLoading(false);
    }
  };

  const boards = pairingBoardsData?.items || [];
  const legacyItems = legacyScreens?.items || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <VisualManagementNav />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-7 h-7 text-blue-600" />
            Pair Displays
          </h1>
          <p className="text-sm text-slate-500 mt-1">Connect shop-floor TVs and tablets, then assign a board to each screen.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/visual-management/screens">View screens</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/tv" target="_blank" rel="noopener noreferrer">
              <Link2 className="w-4 h-4 mr-1" />
              Open display pairing
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchLegacy()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      <DisplayPairingInstructions variant="admin" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Register Screen — Enter Pairing Code</CardTitle>
          <p className="text-sm text-slate-500 font-normal mt-1">
            Display URL for TVs:{" "}
            <a href={getDisplayPairingUrl()} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">
              {getDisplayPairingUrl()}
            </a>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-[10rem] font-mono uppercase tracking-widest"
              placeholder="A7KD92"
              maxLength={6}
              value={pairCodeInput}
              onChange={(e) => setPairCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && lookupPairCode()}
            />
            <Button onClick={lookupPairCode} disabled={previewLoading}>
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              Look up
            </Button>
          </div>

          {pairPreview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div><span className="text-slate-500">Code:</span> <span className="font-mono font-semibold">{pairPreview.pair_code}</span></div>
                <div><span className="text-slate-500">Resolution:</span> {pairPreview.resolution || "Unknown"}</div>
                <div className="sm:col-span-2"><span className="text-slate-500">Browser:</span> {pairPreview.user_agent || "Unknown"}</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Board</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 text-sm"
                    value={pairForm.board_id}
                    onChange={(e) => {
                      const boardId = e.target.value;
                      const board = boards.find((b) => b.id === boardId);
                      setPairForm((f) => ({
                        ...f,
                        board_id: boardId,
                        board_db_env: board?.database_environment || "",
                      }));
                    }}
                    disabled={pairingBoardsLoading}
                  >
                    <option value="">Select board…</option>
                    {boards.map((b) => (
                      <option key={`${b.database_environment}:${b.id}`} value={b.id}>
                        {b.name}
                        {b.database_environment ? ` (${ENV_LABEL[b.database_environment] || b.database_environment})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Screen name</Label>
                  <Input value={pairForm.screen_name} onChange={(e) => setPairForm((f) => ({ ...f, screen_name: e.target.value }))} placeholder="Control Room TV" />
                </div>
                <div className="space-y-1">
                  <Label>Location</Label>
                  <Input value={pairForm.location} onChange={(e) => setPairForm((f) => ({ ...f, location: e.target.value }))} placeholder="Plant A" />
                </div>
                <div className="space-y-1">
                  <Label>Area</Label>
                  <Input value={pairForm.area} onChange={(e) => setPairForm((f) => ({ ...f, area: e.target.value }))} placeholder="Extrusion" />
                </div>
              </div>

              <Button onClick={() => completePairMutation.mutate()} disabled={!pairForm.board_id || !pairForm.screen_name || completePairMutation.isPending}>
                {completePairMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Pair Device
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {legacyItems.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Legacy heartbeat screens</h2>
          {legacyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-3">
              {legacyItems.map((screen) => (
                <Card key={screen.id}>
                  <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{screen.screen_name}</div>
                      <div className="text-xs text-slate-500">{screen.board_name || screen.board_id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[screen.status] || "secondary"}>{screen.status}</Badge>
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
      )}
    </div>
  );
};

export default VisualBoardPairDisplaysPage;
