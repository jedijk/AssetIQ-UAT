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

// ---------------------------------------------------------------------------
// Small presentational pieces — keep the main page easy to scan top-to-bottom.
// ---------------------------------------------------------------------------

function EnabledBadge({ enabled, enabledLabel, disabledLabel }) {
  const style = enabled
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-red-100 text-red-700 border-red-200";

  return <Badge className={style}>{enabled ? enabledLabel : disabledLabel}</Badge>;
}

function MetricCard({ label, value, icon: Icon, iconClassName, testId }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-900" data-testid={testId}>
              {value ?? 0}
            </p>
          </div>
          <Icon className={`w-8 h-8 ${iconClassName}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function EnvironmentFlagCard({ title, enabled, enabledLabel, disabledLabel }) {
  return (
    <div className="p-4 rounded-lg border border-slate-200 bg-white">
      <p className="text-sm font-medium text-slate-700 mb-2">{title}</p>
      <EnabledBadge enabled={enabled} enabledLabel={enabledLabel} disabledLabel={disabledLabel} />
    </div>
  );
}

function PageHeader({ title, subtitle, onRefresh, isRefreshing, refreshLabel }) {
  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-6 h-6 text-emerald-600" />
                <h1 className="text-xl font-bold text-slate-900">{title}</h1>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid="maintenance-readiness-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {refreshLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <Lock className="w-16 h-16 text-slate-300 mb-4" />
      <h2 className="text-xl font-semibold text-slate-600 mb-2">{title}</h2>
      <p className="text-slate-500">{description}</p>
      <BackButton className="mt-4" />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
}

function ErrorState({ title, message, onRetry, retryLabel }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
      <h2 className="text-xl font-semibold text-slate-600 mb-2">{title}</h2>
      <p className="text-slate-500">{message}</p>
      <Button onClick={onRetry} className="mt-4">
        <RefreshCw className="w-4 h-4 mr-2" /> {retryLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsMaintenanceReadinessPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const labels = {
    title: t("settings.maintenanceReadiness.title") || "Maintenance Readiness",
    subtitle:
      t("settings.maintenanceReadiness.subtitle") ||
      "UAT cutover snapshot: flags, counts, and queue health",
    refresh: t("settings.maintenanceReadiness.refresh") || "Refresh",
    enabled: t("settings.maintenanceReadiness.enabled") || "Enabled",
    disabled: t("settings.maintenanceReadiness.disabled") || "Disabled",
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["maintenance-readiness"],
    queryFn: getMaintenanceReadiness,
    retry: 1,
  });

  if (isMobile) {
    return <DesktopOnlyMessage title={labels.title} icon={ClipboardCheck} />;
  }

  if (user?.role !== "admin" && user?.role !== "owner") {
    return (
      <AccessDenied
        title={t("settings.maintenanceReadiness.accessRestricted") || "Access Restricted"}
        description={
          t("settings.maintenanceReadiness.accessRestrictedDesc") ||
          "Only admins and owners can view maintenance readiness."
        }
      />
    );
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <ErrorState
        title={t("settings.maintenanceReadiness.errorTitle") || "Error Loading Data"}
        message={error.message}
        onRetry={() => refetch()}
        retryLabel={t("settings.maintenanceReadiness.retry") || "Retry"}
      />
    );
  }

  const queueHealth = data?.background_jobs || {};
  const jobsByStatus = queueHealth.by_status || {};

  return (
    <div className="min-h-screen bg-slate-50" data-testid="maintenance-readiness-page">
      <PageHeader
        title={labels.title}
        subtitle={labels.subtitle}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        refreshLabel={labels.refresh}
      />

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
              <EnvironmentFlagCard
                title={t("settings.maintenanceReadiness.readLegacy") || "Read Legacy Programs"}
                enabled={data?.read_legacy_maintenance_programs}
                enabledLabel={labels.enabled}
                disabledLabel={labels.disabled}
              />
              <EnvironmentFlagCard
                title={t("settings.maintenanceReadiness.syncLegacy") || "Sync Legacy Programs"}
                enabled={data?.sync_legacy_maintenance_programs}
                enabledLabel={labels.enabled}
                disabledLabel={labels.disabled}
              />
              <EnvironmentFlagCard
                title={
                  t("settings.maintenanceReadiness.externalWorker") || "External Background Worker"
                }
                enabled={data?.use_external_background_worker}
                enabledLabel={labels.enabled}
                disabledLabel={labels.disabled}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            label={t("settings.maintenanceReadiness.strategyNeedsApply") || "Strategy Needs Apply"}
            value={data?.strategy_needs_apply_count}
            icon={ListChecks}
            iconClassName="text-amber-500"
            testId="strategy-needs-apply-count"
          />
          <MetricCard
            label={t("settings.maintenanceReadiness.activeStrategies") || "Active Strategies"}
            value={data?.active_strategies}
            icon={GitBranch}
            iconClassName="text-blue-500"
            testId="active-strategies-count"
          />
          <MetricCard
            label={t("settings.maintenanceReadiness.v2Programs") || "V2 Programs"}
            value={data?.v2_program_count}
            icon={Database}
            iconClassName="text-emerald-500"
            testId="v2-program-count"
          />
          <MetricCard
            label={t("settings.maintenanceReadiness.legacyPrograms") || "Legacy Programs"}
            value={data?.legacy_program_count}
            icon={Database}
            iconClassName="text-orange-500"
            testId="legacy-program-count"
          />
          <MetricCard
            label={t("settings.maintenanceReadiness.reliabilityEdges") || "Reliability Edges"}
            value={data?.reliability_edges_total}
            icon={GitBranch}
            iconClassName="text-purple-500"
            testId="reliability-edges-total"
          />
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

            {Object.keys(jobsByStatus).length === 0 ? (
              <p className="text-sm text-slate-500">
                {t("settings.maintenanceReadiness.noJobs") || "No jobs in queue"}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(jobsByStatus).map(([status, count]) => (
                  <div key={status} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
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
