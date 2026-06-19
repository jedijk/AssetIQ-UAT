import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Monitor, Tv, X } from "lucide-react";
import { toast } from "sonner";
import { displayDeviceAPI } from "../../lib/apis/displayDeviceAPI";
import { getDatabaseEnvironment } from "../../lib/databaseEnv";
import { rememberDismissedPairing } from "../../lib/localNetwork";
import { useNearbyDisplayPairing } from "../../hooks/useNearbyDisplayPairing";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const ENV_LABEL = { production: "Production", uat: "UAT" };

function formatExpires(seconds) {
  const m = Math.floor((seconds || 0) / 60);
  const s = (seconds || 0) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Bottom sheet when a TV on the same network is waiting to pair.
 */
export default function NearbyDisplayPairingPrompt() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canPair = !!user && hasPermission("visual_boards", "admin");
  const { nearby, dismiss } = useNearbyDisplayPairing({ enabled: canPair });
  const queryClient = useQueryClient();
  const dbEnv = getDatabaseEnvironment();

  const [open, setOpen] = useState(false);
  const [pairForm, setPairForm] = useState({
    board_id: "",
    board_db_env: "",
    screen_name: "",
    location: "",
    area: "",
  });

  useEffect(() => {
    setOpen(!!nearby);
    if (nearby) {
      setPairForm((prev) => ({
        ...prev,
        screen_name: prev.screen_name || nearby.device_label || "Shop Floor TV",
      }));
    }
  }, [nearby]);

  const { data: boardsData, isLoading: boardsLoading } = useQuery({
    queryKey: ["display-pairing-boards", dbEnv, nearby?.pairing_id],
    queryFn: () => displayDeviceAPI.listBoardsForPairing(),
    enabled: open && !!nearby,
  });

  const completeMutation = useMutation({
    mutationFn: () => {
      const payload = {
        pair_code: nearby.pair_code,
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
      if (nearby?.pairing_id) rememberDismissedPairing(nearby.pairing_id);
      dismiss(nearby?.pairing_id);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["display-devices"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || err.message || "Pairing failed");
    },
  });

  const handleDismiss = () => {
    if (nearby?.pairing_id) {
      rememberDismissedPairing(nearby.pairing_id);
      dismiss(nearby.pairing_id);
    }
    setOpen(false);
  };

  if (!canPair || !nearby) return null;

  const boards = boardsData?.items || [];

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : handleDismiss())}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-safe">
        <SheetHeader className="text-left pr-8">
          <SheetTitle className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-blue-600" />
            Display wants to connect
          </SheetTitle>
          <SheetDescription>
            A TV on your network is waiting to pair. Assign a board below or enter the code manually.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Pairing code</p>
              <p className="text-3xl font-mono font-bold tracking-[0.25em]">{nearby.pair_code}</p>
              <p className="text-xs text-slate-500 mt-1">
                Expires in {formatExpires(nearby.expires_in)}
                {nearby.resolution ? ` · ${nearby.resolution}` : ""}
              </p>
            </div>
            <Monitor className="w-10 h-10 text-slate-400 shrink-0" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
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
                disabled={boardsLoading}
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
              <Input
                value={pairForm.screen_name}
                onChange={(e) => setPairForm((f) => ({ ...f, screen_name: e.target.value }))}
                placeholder="Control Room TV"
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={pairForm.location}
                onChange={(e) => setPairForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Plant A"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => completeMutation.mutate()}
              disabled={!pairForm.board_id || !pairForm.screen_name || completeMutation.isPending}
            >
              {completeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Pair display
            </Button>
            <Button variant="outline" asChild>
              <Link to="/visual-management/pair-displays">Open pairing page</Link>
            </Button>
            <Button variant="ghost" onClick={handleDismiss}>
              <X className="w-4 h-4 mr-1" />
              Not now
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
