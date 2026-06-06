import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { getMaintenanceReadiness } from "../lib/apis/admin";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import BackButton from "../components/BackButton";
import {
  ClipboardCheck,
  Lock,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Wrench,
  Database,
  GitBranch,
  ListChecks,
  Terminal,
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

const FlagBadge = ({ enabled, enabledLabel, disabledLabel }) => (
  <Badge
    className={
      enabled
        ? "bg-green-100 text-green-700 border-green-200"
        : "bg-red-100 text-red-700 border-red-200"
    }
  >
    {enabled ? enabledLabel : disabledLabel}
  </Badge>
);

export default function SettingsMaintenanceReadinessPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["maintenance-readiness"],
    queryFn: getMaintenanceReadiness,
    retry: 1,
  });

  if (isMobile) {
    return (
      <DesktopOnlyMessage
        title={t("settings.maintenanceReadiness.title") || "Maintenance Readiness"}
        icon={ClipboardCheck}
      />
    );
  }

  if (user?.role !== "admin" && user?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Lock className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">
          {t("settings.maintenanceReadiness.accessRestricted") || "Access Restricted"}
        </h2>
        <p className="text-slate-500">
          {t("settings.maintenanceReadiness.accessRestrictedDesc") ||
            "Only admins and owners can view maintenance readiness."}
        </p>
        <BackButton className="mt-4" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">
          {t("settings.maintenanceReadiness.errorTitle") || "Error Loading Data"}
        </h2>
        <p className="text-slate-500">{error.message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" /> {t("settings.maintenanceReadiness.retry") || "Retry"}
        </Button>
      </div>
    );
  }

  const queueHealth = data?.background_jobs || {};
  const byStatus = queueHealth.by_status || {};

  return (
    <div className="min-h-screen bg-slate-50" data-testid="maintenance-readiness-page">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton />
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-6 h-6 text-emerald-600" />
                  <h1 className="text-xl font-bold text-slate-900">
                    {t("settings.maintenanceReadiness.title") || "Maintenance Readiness"}
                  </h1>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {t("settings.maintenanceReadiness.subtitle") ||
                    "UAT cutover snapshot: flags, counts, and queue health"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="maintenance-readiness-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {t("settings.maintenanceReadiness.refresh") || "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-slate-600" />
              {t("settings.maintenanceReadiness.envFlagsTitle") || "Environment Flags"}
            </CardTitle>
            <CardDescription>
              {t("settings.maintenanceReadiness.envFlagsDesc") ||
                "Legacy read/sync and external worker configuration"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  {t("settings.maintenanceReadiness.readLegacy") || "Read Legacy Programs"}
                </p>
                <FlagBadge
                  enabled={data?.read_legacy_maintenance_programs}
                  enabledLabel={t("settings.maintenanceReadiness.enabled") || "Enabled"}
                  disabledLabel={t("settings.maintenanceReadiness.disabled") || "Disabled"}
                />
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  {t("settings.maintenanceReadiness.syncLegacy") || "Sync Legacy Programs"}
                </p>
                <FlagBadge
                  enabled={data?.sync_legacy_maintenance_programs}
                  enabledLabel={t("settings.maintenanceReadiness.enabled") || "Enabled"}
                  disabledLabel={t("settings.maintenanceReadiness.disabled") || "Disabled"}
                />
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  {t("settings.maintenanceReadiness.externalWorker") || "External Background Worker"}
                </p>
                <FlagBadge
                  enabled={data?.use_external_background_worker}
                  enabledLabel={t("settings.maintenanceReadiness.enabled") || "Enabled"}
                  disabledLabel={t("settings.maintenanceReadiness.disabled") || "Disabled"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {t("settings.maintenanceReadiness.strategyNeedsApply") || "Strategy Needs Apply"}
                  </p>
                  <p className="text-2xl font-bold text-slate-900" data-testid="strategy-needs-apply-count">
                    {data?.strategy_needs_apply_count ?? 0}
                  </p>
                </div>
                <ListChecks className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {t("settings.maintenanceReadiness.activeStrategies") || "Active Strategies"}
                  </p>
                  <p className="text-2xl font-bold text-slate-900" data-testid="active-strategies-count">
                    {data?.active_strategies ?? 0}
                  </p>
                </div>
                <GitBranch className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {t("settings.maintenanceReadiness.v2Programs") || "V2 Programs"}
                  </p>
                  <p className="text-2xl font-bold text-slate-900" data-testid="v2-program-count">
                    {data?.v2_program_count ?? 0}
                  </p>
                </div>
                <Database className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {t("settings.maintenanceReadiness.legacyPrograms") || "Legacy Programs"}
                  </p>
                  <p className="text-2xl font-bold text-slate-900" data-testid="legacy-program-count">
                    {data?.legacy_program_count ?? 0}
                  </p>
                </div>
                <Database className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {t("settings.maintenanceReadiness.reliabilityEdges") || "Reliability Edges"}
                  </p>
                  <p className="text-2xl font-bold text-slate-900" data-testid="reliability-edges-total">
                    {data?.reliability_edges_total ?? 0}
                  </p>
                </div>
                <GitBranch className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {t("settings.maintenanceReadiness.queueHealthTitle") || "Background Jobs Queue"}
            </CardTitle>
            <CardDescription>
              {t("settings.maintenanceReadiness.queueHealthDesc") ||
                "Current job queue status and dead-letter totals"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-slate-600">
                {t("settings.maintenanceReadiness.queueStatus") || "Status"}:
              </span>
              <Badge
                className={
                  queueHealth.status === "ok"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }
              >
                {queueHealth.status || "unknown"}
              </Badge>
              {queueHealth.dead_letter_total > 0 && (
                <Badge className="bg-red-100 text-red-700">
                  {t("settings.maintenanceReadiness.deadLetter") || "Dead letter"}:{" "}
                  {queueHealth.dead_letter_total}
                </Badge>
              )}
            </div>
            {Object.keys(byStatus).length === 0 ? (
              <p className="text-sm text-slate-500">
                {t("settings.maintenanceReadiness.noJobs") || "No jobs in queue"}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(byStatus).map(([status, count]) => (
                  <div
                    key={status}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <p className="text-xs text-slate-500 capitalize">{status}</p>
                    <p className="text-xl font-bold text-slate-900">{count}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-slate-600" />
              {t("settings.maintenanceReadiness.uatGatesTitle") || "UAT Gates Verification"}
            </CardTitle>
            <CardDescription>
              {t("settings.maintenanceReadiness.uatGatesDesc") ||
                "Run the gates script before production cutover"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-2">
              {t("settings.maintenanceReadiness.uatGatesScript") || "Script path"}:
            </p>
            <code
              className="block p-3 rounded-lg bg-slate-900 text-green-400 text-sm font-mono mb-4"
              data-testid="uat-gates-script-path"
            >
              {data?.uat_gates_script || "backend/scripts/verify_uat_gates.py"}
            </code>
            <p className="text-sm text-slate-600">
              {t("settings.maintenanceReadiness.uatGatesInstruction") ||
                "From the backend directory, run: cd backend && MONGO_URL=<your-db> python scripts/verify_uat_gates.py — exit code 0 means all gates passed."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
