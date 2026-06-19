import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { visualBoardAPI } from "../../lib/apis/visualBoardAPI";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { VisualManagementNav } from "../../components/visual-boards/VisualManagementNav";

const VisualBoardAnalyticsPage = () => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["visual-board-analytics"],
    queryFn: () => visualBoardAPI.getAnalytics(30),
  });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <VisualManagementNav />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">Board views, screen uptime, and display health (last 30 days).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-slate-500">Total Views</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{data?.total_views ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-slate-500">Active Screens</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-green-600">{data?.active_screens ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-slate-500">Offline Screens</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-red-600">{data?.offline_screens ?? 0}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-slate-500">Heartbeats</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{data?.total_heartbeats ?? 0}</CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Most Viewed Boards</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.most_viewed_boards || []).length === 0 ? (
                <p className="text-sm text-slate-500">No view data yet.</p>
              ) : (
                data.most_viewed_boards.map((row) => (
                  <div key={row.board_id} className="flex justify-between text-sm border-b pb-2">
                    <span>{row.name}</span>
                    <span className="font-medium">{row.views} views</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Screen Status</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.screens || []).slice(0, 20).map((screen) => (
                <div key={screen.id} className="flex justify-between items-center text-sm">
                  <span>{screen.screen_name} <span className="text-slate-400">({screen.board_id})</span></span>
                  <Badge variant={screen.status === "online" ? "default" : "secondary"}>{screen.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default VisualBoardAnalyticsPage;
