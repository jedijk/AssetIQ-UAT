import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Tv, Loader2, RefreshCw, ChevronRight } from "lucide-react";
import { displayDeviceAPI } from "../../lib/apis/displayDeviceAPI";
import { getDatabaseEnvironment } from "../../lib/databaseEnv";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { VisualManagementNav } from "../../components/visual-boards/VisualManagementNav";

const STATUS_VARIANT = {
  online: "default",
  offline: "destructive",
  inactive: "secondary",
  disabled: "secondary",
};

function formatRelativeTime(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleString();
}

const VisualBoardDevicesListPage = () => {
  const dbEnv = getDatabaseEnvironment();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["display-devices", dbEnv],
    queryFn: () => displayDeviceAPI.listDevices(),
  });

  const devices = data?.items || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <VisualManagementNav />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Tv className="w-7 h-7 text-blue-600" />
            Screens
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage paired display devices, status, and assignments.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/visual-management/pair-displays">Pair a display</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No paired devices yet.{" "}
            <Link to="/visual-management/pair-displays" className="text-blue-600 underline">Pair a display</Link>
            {" "}or open <Link to="/tv" className="text-blue-600 underline" target="_blank" rel="noreferrer">/tv</Link> on a TV.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <div className="hidden md:grid grid-cols-[1.5fr_1fr_100px_120px_100px_32px] gap-3 px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Screen</span>
            <span>Board</span>
            <span>Status</span>
            <span>Last seen</span>
            <span>Version</span>
            <span />
          </div>
          <div className="divide-y divide-slate-100">
            {devices.map((device) => (
              <Link
                key={device.id}
                to={`/visual-management/screens/${device.id}`}
                className="block hover:bg-slate-50 transition-colors"
              >
                <div className="grid md:grid-cols-[1.5fr_1fr_100px_120px_100px_32px] gap-3 px-4 py-3 items-center">
                  <div>
                    <div className="font-medium text-slate-900">{device.screen_name}</div>
                    <div className="text-xs text-slate-500">
                      {[device.location, device.area].filter(Boolean).join(" · ") || device.resolution || "—"}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 truncate">{device.board_name || device.board_id || "Unassigned"}</div>
                  <div>
                    <Badge variant={STATUS_VARIANT[device.status] || "secondary"}>{device.status}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">{formatRelativeTime(device.last_seen)}</div>
                  <div className="text-xs text-slate-500">v{device.board_version ?? "—"}</div>
                  <ChevronRight className="w-4 h-4 text-slate-400 hidden md:block" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualBoardDevicesListPage;
