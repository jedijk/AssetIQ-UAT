import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, Trash2, RotateCw, Ban, CheckCircle } from "lucide-react";
import { displayDeviceAPI } from "../../lib/apis/displayDeviceAPI";
import { getDatabaseEnvironment } from "../../lib/databaseEnv";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { VisualManagementNav } from "../../components/visual-boards/VisualManagementNav";
import { VMB_PAGE_CLASS } from "../../components/visual-boards/visualManagementLayout";

const STATUS_VARIANT = {
  online: "default",
  offline: "destructive",
  inactive: "secondary",
  disabled: "secondary",
};

const ENV_LABEL = { production: "Production", uat: "UAT" };

const VisualBoardDeviceDetailPage = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dbEnv = getDatabaseEnvironment();
  const [editForm, setEditForm] = useState(null);
  const [reassignBoardId, setReassignBoardId] = useState("");

  const { data: device, isLoading, refetch } = useQuery({
    queryKey: ["display-device", deviceId, dbEnv],
    queryFn: () => displayDeviceAPI.getDevice(deviceId),
    enabled: !!deviceId,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["display-device-events", deviceId, dbEnv],
    queryFn: () => displayDeviceAPI.listDeviceEvents(deviceId),
    enabled: !!deviceId,
  });

  const { data: boardsData } = useQuery({
    queryKey: ["display-pairing-boards", dbEnv],
    queryFn: () => displayDeviceAPI.listBoardsForPairing(),
    enabled: !!device,
  });

  React.useEffect(() => {
    if (device && !editForm) {
      setEditForm({
        screen_name: device.screen_name || "",
        location: device.location || "",
        area: device.area || "",
      });
    }
  }, [device, editForm]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["display-device", deviceId] });
    queryClient.invalidateQueries({ queryKey: ["display-devices"] });
    queryClient.invalidateQueries({ queryKey: ["display-device-events", deviceId] });
  };

  const updateMutation = useMutation({
    mutationFn: () => displayDeviceAPI.updateDevice(deviceId, editForm),
    onSuccess: () => {
      toast.success("Device updated");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Update failed"),
  });

  const reassignMutation = useMutation({
    mutationFn: () => {
      const board = (boardsData?.items || []).find((b) => b.id === reassignBoardId);
      return displayDeviceAPI.reassignBoard(deviceId, {
        board_id: reassignBoardId,
        database_environment: board?.database_environment,
      });
    },
    onSuccess: () => {
      toast.success("Board reassigned");
      setReassignBoardId("");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Reassign failed"),
  });

  const disableMutation = useMutation({
    mutationFn: () => displayDeviceAPI.disableDevice(deviceId),
    onSuccess: () => {
      toast.success("Device disabled");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Disable failed"),
  });

  const enableMutation = useMutation({
    mutationFn: () => displayDeviceAPI.enableDevice(deviceId),
    onSuccess: () => {
      toast.success("Device enabled");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Enable failed"),
  });

  const rotateMutation = useMutation({
    mutationFn: () => displayDeviceAPI.rotateDeviceToken(deviceId),
    onSuccess: () => {
      toast.success("Token rotation started — device will pick up the new token");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Rotation failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => displayDeviceAPI.deleteDevice(deviceId),
    onSuccess: () => {
      toast.success("Device deleted");
      queryClient.invalidateQueries({ queryKey: ["display-devices"] });
      navigate("/visual-management/screens", { replace: true });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Delete failed"),
  });

  if (isLoading || !device) {
    return (
      <div className="p-6 flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const events = eventsData?.items || [];
  const boards = boardsData?.items || [];

  return (
    <div className={`${VMB_PAGE_CLASS} max-w-4xl`}>
      <VisualManagementNav />

      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/visual-management/screens">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Screens
          </Link>
        </Button>
        <Badge variant={STATUS_VARIANT[device.status] || "secondary"}>{device.status}</Badge>
        {device.token_rotation_pending && <Badge variant="outline">Token rotation pending</Badge>}
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{device.screen_name}</h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{device.id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchEvents(); }}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Device info</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-slate-500">Board:</span> {device.board_name || device.board_id || "—"} (v{device.board_version ?? "—"})</div>
            <div><span className="text-slate-500">Resolution:</span> {device.resolution || "—"}</div>
            <div><span className="text-slate-500">Last seen:</span> {device.last_seen ? new Date(device.last_seen).toLocaleString() : "Never"}</div>
            <div><span className="text-slate-500">Token age:</span> {device.token_age_days != null ? `${device.token_age_days} days` : "—"}</div>
            <div><span className="text-slate-500">Uptime:</span> {device.uptime_seconds != null ? `${Math.floor(device.uptime_seconds / 60)} min` : "—"}</div>
            {device.user_agent && <div className="text-xs text-slate-400 break-all">{device.user_agent}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Edit details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editForm && (
              <>
                <div className="space-y-1">
                  <Label>Screen name</Label>
                  <Input value={editForm.screen_name} onChange={(e) => setEditForm((f) => ({ ...f, screen_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Location</Label>
                  <Input value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Area</Label>
                  <Input value={editForm.area} onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))} />
                </div>
                <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  Save changes
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>Reassign board</Label>
              <select
                className="w-full border rounded-md h-9 px-2 text-sm"
                value={reassignBoardId}
                onChange={(e) => setReassignBoardId(e.target.value)}
              >
                <option value="">Select board…</option>
                {boards.map((b) => (
                  <option key={`${b.database_environment}:${b.id}`} value={b.id}>
                    {b.name}{b.database_environment ? ` (${ENV_LABEL[b.database_environment] || b.database_environment})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={() => reassignMutation.mutate()} disabled={!reassignBoardId || reassignMutation.isPending}>
              Reassign
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {device.status === "disabled" ? (
              <Button size="sm" variant="outline" onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending}>
                <CheckCircle className="w-4 h-4 mr-1" />
                Enable
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending}>
                <Ban className="w-4 h-4 mr-1" />
                Disable
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending || device.status === "disabled"}>
              <RotateCw className="w-4 h-4 mr-1" />
              Rotate token
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (window.confirm(`Delete "${device.screen_name}"? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent events</CardTitle></CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">No events recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="font-medium">{ev.event}</span>
                  <span className="text-slate-500 shrink-0">{new Date(ev.timestamp).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VisualBoardDeviceDetailPage;
