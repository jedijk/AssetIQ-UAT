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
import { VisualManagementPageLayout } from "../../components/visual-boards/VisualManagementPageLayout";
import {
  VMB_PAGE_ACTIONS_CLASS,
  VMB_PAGE_HEADER_CLASS,
  VMB_PAGE_TITLE_CLASS,
} from "../../components/visual-boards/visualManagementLayout";

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
    <VisualManagementPageLayout>
      <VisualManagementNav />

      <div className={VMB_PAGE_HEADER_CLASS}>
        <div className="min-w-0">
          <h1 className={VMB_PAGE_TITLE_CLASS}>
            <Tv className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
            Screens
          </h1>
          <p className="text-sm text-slate-500 mt-1 break-words">Manage paired display devices, status, and assignments.</p>
        </div>
        <div className={VMB_PAGE_ACTIONS_CLASS}>
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
                <div className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[1.5fr_1fr_100px_120px_100px_32px] md:gap-3 md:items-center min-w-0">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 break-words">{device.screen_name}</div>
                    <div className="text-xs text-slate-500 break-words">
                      {[device.location, device.area].filter(Boolean).join(" · ") || device.resolution || "—"}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 break-words md:truncate">{device.board_name || device.board_id || "Unassigned"}</div>
                  <div className="flex flex-wrap items-center gap-2 md:block">
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
    </VisualManagementPageLayout>
  );
};

export default VisualBoardDevicesListPage;
