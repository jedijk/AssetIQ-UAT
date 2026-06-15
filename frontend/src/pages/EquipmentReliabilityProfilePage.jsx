/**
 * Asset Reliability Profile — /equipment/:id/reliability
 * Single source of truth for equipment reliability intelligence.
 */
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  ClipboardList,
  FileSearch,
  GitBranch,
  Loader2,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { rilDashboardAPI } from "../lib/apis/rilAPI";
import { equipmentHierarchyAPI } from "../lib/apis/equipment";
import { ReliabilityEvidencePanel } from "../components/reliability/ReliabilityEvidencePanel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function StatusBadge({ status, riskLevel }) {
  const isRisky = status === "At Risk" || ["High", "Critical", "high", "critical"].includes(riskLevel);
  return (
    <Badge
      className={
        isRisky
          ? "bg-red-100 text-red-800 border-red-200"
          : "bg-emerald-100 text-emerald-800 border-emerald-200"
      }
    >
      {status || "Unknown"}
    </Badge>
  );
}

function TrendDelta({ delta }) {
  if (delta == null) return <span className="text-slate-400">—</span>;
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : Activity;
  const color = up ? "text-emerald-600" : down ? "text-red-600" : "text-slate-500";
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-slate-500" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyNote({ children }) {
  return <p className="text-sm text-slate-500 py-2">{children}</p>;
}

export default function EquipmentReliabilityProfilePage() {
  const { id: equipmentId } = useParams();
  const navigate = useNavigate();

  const { data: equipment, isLoading: equipmentLoading } = useQuery({
    queryKey: ["equipment-node", equipmentId],
    queryFn: () => equipmentHierarchyAPI.getNode(equipmentId),
    enabled: Boolean(equipmentId),
    staleTime: 5 * 60_000,
  });

  const {
    data: profileResponse,
    isLoading: profileLoading,
    error,
  } = useQuery({
    queryKey: ["reliability-profile", equipmentId],
    queryFn: () => rilDashboardAPI.getEquipmentReliabilityProfile(equipmentId),
    enabled: Boolean(equipmentId),
    staleTime: 60_000,
  });

  const {
    data: stateResponse,
    isLoading: stateLoading,
    error: stateError,
  } = useQuery({
    queryKey: ["reliability-state", equipmentId],
    queryFn: () => rilDashboardAPI.getEquipmentReliabilityState(equipmentId),
    enabled: Boolean(equipmentId),
    staleTime: 30_000,
  });

  const profile = profileResponse?.profile;
  const liveState = stateResponse?.state;
  const summary = profile?.summary;
  const openObservationCount =
    liveState?.open_observation_count ?? summary?.open_observation_count ?? summary?.open_threat_count;
  const equipmentName = summary?.name || equipment?.name || equipment?.tag || equipmentId;
  const isLoading = equipmentLoading || profileLoading;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Building2 className="w-4 h-4" />
                Asset Reliability Profile
              </div>
              <h1 className="text-xl font-bold text-slate-900 truncate">
                {isLoading ? "Loading…" : equipmentName}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ReliabilityEvidencePanel
                equipmentId={equipmentId}
                equipmentName={equipmentName}
                buttonLabel="Graph evidence"
              />
              <Button asChild variant="outline" size="sm">
                <Link to={`/equipment/${equipmentId}/trace`}>
                  <GitBranch className="w-4 h-4 mr-1.5" />
                  Trace
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/equipment-manager">Equipment Manager</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading reliability profile…
          </div>
        ) : error || !profile?.found ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-600">
              {error?.message || "Equipment reliability profile not found."}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Asset Summary */}
            <SectionCard title="Asset Summary" icon={Shield}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Criticality</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{summary.criticality}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Health</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {summary.health_score != null ? `${summary.health_score}/100` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Risk</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {summary.risk_level || "—"}
                    {summary.risk_score != null && (
                      <span className="text-slate-500 font-normal"> · {summary.risk_score}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={summary.status} riskLevel={summary.risk_level} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Open items</p>
                  <p className="text-sm text-slate-700 mt-0.5">
                    {openObservationCount ?? "—"} observations ·{" "}
                    {summary.open_investigation_count} inv · {summary.open_action_count} actions
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Live reliability state */}
            <SectionCard title="Live Reliability State" icon={Activity}>
              {stateLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Refreshing state…
                </div>
              ) : stateError ? (
                <EmptyNote>
                  Could not load live state{stateError?.message ? `: ${stateError.message}` : "."}
                </EmptyNote>
              ) : !liveState?.found ? (
                <EmptyNote>Live state unavailable.</EmptyNote>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Health</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {liveState.health_score != null ? `${liveState.health_score}/100` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Risk</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{liveState.risk_level || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Open observations</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {openObservationCount ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Overdue PM</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {liveState.overdue_pm_count ?? "—"}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-2 pt-1">
                    {liveState.signals?.open_observations && (
                      <Badge variant="outline" className="text-amber-800 border-amber-200 bg-amber-50">
                        Open observations
                      </Badge>
                    )}
                    {liveState.signals?.overdue_pm && (
                      <Badge variant="outline" className="text-red-800 border-red-200 bg-red-50">
                        Overdue PM
                      </Badge>
                    )}
                    {liveState.graph_fingerprint && (
                      <span className="text-xs text-slate-400 self-center">
                        Graph fingerprint {liveState.graph_fingerprint}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Reliability Trend */}
            <SectionCard title="Reliability Trend" icon={Activity}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { key: "30d", label: "30 day" },
                  { key: "90d", label: "90 day" },
                  { key: "12mo", label: "12 month" },
                ].map(({ key, label }) => {
                  const window = profile.trend?.windows?.[key];
                  return (
                    <div key={key} className="rounded-lg border bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      {window?.available ? (
                        <>
                          <p className="text-lg font-bold text-slate-900 mt-1">
                            {window.health_score ?? "—"}
                            <span className="text-sm font-normal text-slate-500"> health</span>
                          </p>
                          <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                            <span>{window.open_threat_count ?? "—"} threats</span>
                            <TrendDelta delta={window.health_score_delta} />
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400 mt-2">No snapshot data</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {profile.trend?.current?.snapshot_at && (
                <p className="text-xs text-slate-400 mt-3">
                  Current snapshot: {profile.trend.current.snapshot_at}
                  {profile.trend.current.source && ` (${profile.trend.current.source})`}
                </p>
              )}
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Open Threats */}
              <SectionCard title="Open Threats" icon={AlertTriangle}>
                {profile.open_threats?.length ? (
                  <ul className="space-y-2">
                    {profile.open_threats.map((threat) => (
                      <li
                        key={threat.id}
                        className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2 last:border-0"
                      >
                        <Link
                          to={`/threats/${threat.id}/workspace`}
                          className="text-slate-800 hover:text-blue-700 hover:underline truncate"
                        >
                          {threat.title || threat.id}
                        </Link>
                        <span className="text-xs text-slate-500 shrink-0">
                          {threat.risk_level} · {threat.exposure_rank_score ?? threat.risk_score}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyNote>No open threats for this asset.</EmptyNote>
                )}
              </SectionCard>

              {/* Failure Modes */}
              <SectionCard title="Failure Modes" icon={Target}>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Most frequent</p>
                    {profile.failure_modes?.stats?.most_frequent?.length ? (
                      <ul className="space-y-1 text-sm">
                        {profile.failure_modes.stats.most_frequent.map((fm) => (
                          <li key={fm.failure_mode} className="flex justify-between gap-2">
                            <span className="truncate">{fm.failure_mode}</span>
                            <Badge variant="secondary">{fm.count}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyNote>No failure mode frequency data.</EmptyNote>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Most severe</p>
                    {profile.failure_modes?.stats?.most_severe?.length ? (
                      <ul className="space-y-1 text-sm">
                        {profile.failure_modes.stats.most_severe.map((fm) => (
                          <li key={fm.failure_mode} className="flex justify-between gap-2">
                            <span className="truncate">{fm.failure_mode}</span>
                            <span className="text-slate-500 shrink-0">{fm.severity_score}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyNote>No severity ranking available.</EmptyNote>
                    )}
                  </div>
                </div>
              </SectionCard>

              {/* Investigations */}
              <SectionCard title="Investigations" icon={FileSearch}>
                {profile.investigations?.open?.length ? (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-500 mb-2">Open</p>
                    <ul className="space-y-2">
                      {profile.investigations.open.map((inv) => (
                        <li key={inv.id} className="text-sm">
                          <Link
                            to={`/causal-engine?inv=${inv.id}`}
                            className="text-slate-800 hover:text-blue-700 hover:underline"
                          >
                            {inv.title || inv.case_number || inv.id}
                          </Link>
                          <span className="text-xs text-slate-400 ml-2">{inv.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {profile.investigations?.items?.length ? (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Recent</p>
                    <ul className="space-y-2">
                      {profile.investigations.items.slice(0, 5).map((inv) => (
                        <li key={inv.id} className="text-sm">
                          <Link
                            to={`/causal-engine?inv=${inv.id}`}
                            className="text-slate-800 hover:text-blue-700 hover:underline"
                          >
                            {inv.title || inv.case_number || inv.id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <EmptyNote>No investigations linked to this asset.</EmptyNote>
                )}
              </SectionCard>

              {/* Actions */}
              <SectionCard title="Actions" icon={Wrench}>
                <p className="text-xs text-slate-500 mb-3">{profile.actions?.effectiveness_note}</p>
                {profile.actions?.open?.length ? (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Open ({profile.actions.open_count})
                    </p>
                    <ul className="space-y-2">
                      {profile.actions.open.slice(0, 6).map((action) => (
                        <li key={action.id} className="text-sm">
                          <Link
                            to={`/actions/${action.id}`}
                            className="text-slate-800 hover:text-blue-700 hover:underline"
                          >
                            {action.title || action.id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {profile.actions?.completed?.length ? (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Completed ({profile.actions.completed_count})
                    </p>
                    <ul className="space-y-2">
                      {profile.actions.completed.slice(0, 4).map((action) => (
                        <li key={action.id} className="text-sm">
                          <Link
                            to={`/actions/${action.id}`}
                            className="text-slate-800 hover:text-blue-700 hover:underline"
                          >
                            {action.title || action.id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : !profile.actions?.open?.length ? (
                  <EmptyNote>No actions linked to this asset.</EmptyNote>
                ) : null}
              </SectionCard>
            </div>

            {/* Strategy Coverage */}
            <SectionCard title="Strategy Coverage" icon={ClipboardList}>
              <div className="flex flex-wrap gap-2 mb-4">
                {profile.strategy_coverage?.coverage_pct != null && (
                  <Badge variant="secondary">{profile.strategy_coverage.coverage_pct}% covered</Badge>
                )}
                <Badge className="bg-emerald-100 text-emerald-800">
                  {profile.strategy_coverage?.covered_count ?? 0} covered
                </Badge>
                <Badge className="bg-amber-100 text-amber-800">
                  {profile.strategy_coverage?.not_covered_count ?? 0} not covered
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Covered</p>
                  {profile.strategy_coverage?.covered?.length ? (
                    <ul className="space-y-1 text-sm">
                      {profile.strategy_coverage.covered.map((fm) => (
                        <li key={fm.failure_mode_id || fm.failure_mode_name} className="truncate">
                          {fm.failure_mode_name}
                          {fm.strategy_type && (
                            <span className="text-slate-400"> · {fm.strategy_type}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyNote>None</EmptyNote>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Not covered</p>
                  {profile.strategy_coverage?.not_covered?.length ? (
                    <ul className="space-y-1 text-sm">
                      {profile.strategy_coverage.not_covered.map((fm) => (
                        <li key={fm.failure_mode_id || fm.failure_mode_name} className="truncate text-amber-800">
                          {fm.failure_mode_name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyNote>All strategy failure modes covered.</EmptyNote>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* AI Reliability Summary */}
            {profile.ai_reliability_summary && (
              <SectionCard title="AI Reliability Summary" icon={Sparkles}>
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {profile.ai_reliability_summary}
                </pre>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
