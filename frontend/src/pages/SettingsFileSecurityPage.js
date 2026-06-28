import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useIsMobile } from "../hooks/useIsMobile";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import BackButton from "../components/BackButton";
import {
  Shield,
  Loader2,
  RefreshCw,
  FileWarning,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from "sonner";
import { formatDate } from "../lib/dateUtils";
import {
  getFileSecurityDashboard,
  getQuarantinedFiles,
  requestFileRescan,
} from "../lib/apis/files";

function StatCard({ title, value, icon: Icon, variant = "default" }) {
  const variantClasses = {
    default: "text-foreground",
    success: "text-green-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${variantClasses[variant] || variantClasses.default}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value ?? 0}</div>
      </CardContent>
    </Card>
  );
}

export default function SettingsFileSecurityPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [quarantinePage, setQuarantinePage] = useState(1);

  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const dashboardQuery = useQuery({
    queryKey: ["file-security-dashboard"],
    queryFn: getFileSecurityDashboard,
    enabled: isAdmin,
  });

  const quarantineQuery = useQuery({
    queryKey: ["file-security-quarantine", quarantinePage],
    queryFn: () => getQuarantinedFiles({ page: quarantinePage, pageSize: 20 }),
    enabled: isAdmin,
  });

  const rescanMutation = useMutation({
    mutationFn: requestFileRescan,
    onSuccess: () => {
      toast.success(t("settings.fileSecurity.rescanQueued") || "Re-scan queued");
      queryClient.invalidateQueries({ queryKey: ["file-security-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["file-security-quarantine"] });
    },
    onError: (err) => {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : t("settings.fileSecurity.rescanFailed") || "Re-scan failed"
      );
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          {t("settings.fileSecurity.accessRestricted") || "Admin or owner access required."}
        </p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <DesktopOnlyMessage
        title={t("settings.fileSecurity.desktopOnly") || "File Security"}
      />
    );
  }

  const summary = dashboardQuery.data?.summary || {};
  const recentEvents = dashboardQuery.data?.recent_events || [];
  const quarantineItems = quarantineQuery.data?.items || [];
  const quarantineTotal = quarantineQuery.data?.total || 0;
  const quarantinePageSize = quarantineQuery.data?.page_size || 20;
  const totalPages = Math.max(1, Math.ceil(quarantineTotal / quarantinePageSize));

  return (
    <div className="space-y-6 p-6" data-testid="file-security-page">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton fallbackPath="/settings" />
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            {t("settings.fileSecurity.title") || "File Security"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("settings.fileSecurity.subtitle") ||
              "Upload pipeline status, quarantined files, and audit activity"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            dashboardQuery.refetch();
            quarantineQuery.refetch();
          }}
          disabled={dashboardQuery.isFetching}
        >
          {dashboardQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">{t("settings.fileSecurity.refresh") || "Refresh"}</span>
        </Button>
      </div>

      {dashboardQuery.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("settings.fileSecurity.loadingDashboard") || "Loading dashboard…"}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t("settings.fileSecurity.available") || "Available"}
              value={summary.available}
              icon={CheckCircle2}
              variant="success"
            />
            <StatCard
              title={t("settings.fileSecurity.quarantined") || "Quarantined"}
              value={summary.quarantined}
              icon={FileWarning}
              variant="warning"
            />
            <StatCard
              title={t("settings.fileSecurity.rejected") || "Rejected"}
              value={summary.rejected}
              icon={XCircle}
              variant="danger"
            />
            <StatCard
              title={t("settings.fileSecurity.pendingScan") || "Pending scan"}
              value={summary.pending}
              icon={Clock}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.fileSecurity.ratesTitle") || "Rates"}</CardTitle>
                <CardDescription>
                  {t("settings.fileSecurity.ratesDesc") ||
                    "Share of all uploaded file records"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  {t("settings.fileSecurity.rejectionRate") || "Rejection rate"}:{" "}
                  <span className="font-medium">
                    {((summary.rejection_rate || 0) * 100).toFixed(1)}%
                  </span>
                </p>
                <p>
                  {t("settings.fileSecurity.quarantineRate") || "Quarantine rate"}:{" "}
                  <span className="font-medium">
                    {((summary.quarantine_rate || 0) * 100).toFixed(1)}%
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {t("settings.fileSecurity.totalRecords") || "Total records"}: {summary.total ?? 0}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("settings.fileSecurity.recentEventsTitle") || "Recent upload events"}
                </CardTitle>
                <CardDescription>
                  {t("settings.fileSecurity.recentEventsDesc") ||
                    "Latest secure file upload audit entries"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.fileSecurity.noRecentEvents") || "No recent events"}
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                    {recentEvents.map((evt) => (
                      <li key={evt.id || `${evt.event}-${evt.timestamp}`} className="border-b pb-2 last:border-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{evt.event}</Badge>
                          {evt.result && (
                            <Badge variant={evt.result === "failure" ? "destructive" : "secondary"}>
                              {evt.result}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1">
                          {formatDate(evt.timestamp || evt.ts)}
                          {evt.reason ? ` — ${evt.reason}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.fileSecurity.quarantineTitle") || "Quarantined files"}</CardTitle>
          <CardDescription>
            {t("settings.fileSecurity.quarantineDesc") ||
              "Technical details for admin review"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {quarantineQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("settings.fileSecurity.loadingQuarantine") || "Loading quarantine list…"}
            </div>
          ) : quarantineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.fileSecurity.noQuarantined") || "No quarantined files"}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.fileSecurity.filename") || "Filename"}</TableHead>
                    <TableHead>{t("settings.fileSecurity.user") || "User"}</TableHead>
                    <TableHead>{t("settings.fileSecurity.reason") || "Reason"}</TableHead>
                    <TableHead>{t("settings.fileSecurity.malware") || "Malware"}</TableHead>
                    <TableHead>{t("settings.fileSecurity.date") || "Date"}</TableHead>
                    <TableHead className="text-right">
                      {t("settings.fileSecurity.actions") || "Actions"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarantineItems.map((item) => (
                    <TableRow key={item.file_id}>
                      <TableCell className="max-w-[180px] truncate">{item.original_filename}</TableCell>
                      <TableCell>{item.uploaded_by_name || item.uploaded_by || "—"}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={item.rejection_reason}>
                        {item.rejection_reason || "—"}
                      </TableCell>
                      <TableCell>{item.malware_scan_result || "—"}</TableCell>
                      <TableCell>{formatDate(item.updated_at || item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rescanMutation.isPending}
                          onClick={() => rescanMutation.mutate(item.file_id)}
                        >
                          {t("settings.fileSecurity.rescan") || "Re-scan"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={quarantinePage <= 1}
                    onClick={() => setQuarantinePage((p) => Math.max(1, p - 1))}
                  >
                    {t("settings.fileSecurity.previous") || "Previous"}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t("settings.fileSecurity.pageOf", {
                      page: quarantinePage,
                      total: totalPages,
                    }) || `Page ${quarantinePage} of ${totalPages}`}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={quarantinePage >= totalPages}
                    onClick={() => setQuarantinePage((p) => p + 1)}
                  >
                    {t("settings.fileSecurity.next") || "Next"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
