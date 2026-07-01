import { useQuery } from "@tanstack/react-query";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiStatusBadge } from "../components/SuccessReadinessShared";

const PAGE_CONFIG = {
  assessments: {
    title: "Assessments",
    description: "Manual assessments for training, champions, governance, and infrastructure.",
    queryKey: ["success-readiness", "assessments"],
    queryFn: successReadinessAPI.getAssessments,
    renderItem: (item) => (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-slate-900">{item.title}</h3>
          <KpiStatusBadge status={item.status === "not_started" ? "not_started" : "at_risk"} />
        </div>
        {item.todo && <p className="text-xs text-amber-700 mt-2">{item.todo}</p>}
      </div>
    ),
  },
  evidence: {
    title: "Evidence",
    description: "Supporting evidence linked to KPI scores.",
    queryKey: ["success-readiness", "evidence"],
    queryFn: successReadinessAPI.getEvidence,
    renderItem: (item) => (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="font-medium text-slate-900">{item.title || item.kpi_id || "Evidence"}</div>
        <div className="text-slate-500 mt-1">{item.description || "—"}</div>
      </div>
    ),
    emptyMessage: "No evidence recorded yet. Uploads and links will appear here.",
  },
  history: {
    title: "History",
    description: "Score changes and assessment activity over time.",
    queryKey: ["success-readiness", "history"],
    queryFn: successReadinessAPI.getHistory,
    renderItem: (item) => (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="font-medium text-slate-900">{item.event_type || "Score update"}</div>
        <div className="text-slate-500 mt-1">{item.recorded_at || item.created_at}</div>
      </div>
    ),
    emptyMessage: "No history yet. Score snapshots will be recorded as KPIs update.",
  },
  "ai-recommendations": {
    title: "AI Recommendations",
    description: "Prioritized actions to improve readiness scores.",
    queryKey: ["success-readiness", "ai-recommendations"],
    queryFn: successReadinessAPI.getAiRecommendations,
    renderData: (data) => (
      <div className="space-y-3">
        {(data?.recommendations || []).map((rec) => (
          <div key={rec.kpi_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium text-slate-900">{rec.title}</h3>
              <span className="text-xs uppercase text-slate-500">{rec.priority}</span>
            </div>
            <p className="text-sm text-slate-600 mt-1">{rec.rationale}</p>
          </div>
        ))}
        {data?.todo && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md p-3">
            {data.todo}
          </p>
        )}
      </div>
    ),
  },
  configuration: {
    title: "Configuration",
    description: "Pillar weights, targets, and notification settings (owner only).",
    queryKey: ["success-readiness", "configuration"],
    queryFn: successReadinessAPI.getConfiguration,
    renderData: (data) => (
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Targets locked</span>
          <span className="font-medium">{data?.targets_locked ? "Yes" : "No"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Notifications</span>
          <span className="font-medium">{data?.notification_enabled ? "Enabled" : "Disabled"}</span>
        </div>
        {data?.pillar_weights && (
          <div>
            <p className="text-slate-600 mb-1">Pillar weights</p>
            <ul className="text-slate-900">
              {Object.entries(data.pillar_weights).map(([k, v]) => (
                <li key={k}>
                  {k}: {Math.round(v * 100)}%
                </li>
              ))}
            </ul>
          </div>
        )}
        {data?.todo && <p className="text-xs text-amber-700">{data.todo}</p>}
      </div>
    ),
  },
};

export default function SuccessReadinessShellPage({ pageKey }) {
  const config = PAGE_CONFIG[pageKey];
  const { data, isLoading, error } = useQuery({
    queryKey: config.queryKey,
    queryFn: config.queryFn,
    enabled: Boolean(config),
  });

  if (!config) {
    return <div className="p-6 text-slate-500">Unknown page.</div>;
  }

  if (isLoading) return <SuccessReadinessLoading />;

  if (error) {
    return <div className="p-6 text-red-600">Failed to load {config.title}.</div>;
  }

  const items = Array.isArray(data) ? data : null;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{config.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{config.description}</p>
      </div>

      {config.renderData ? (
        config.renderData(data)
      ) : (
        <div className="space-y-3">
          {items?.length
            ? items.map((item, i) => (
                <div key={item.id || i}>{config.renderItem(item)}</div>
              ))
            : (
                <p className="text-sm text-slate-500">
                  {config.emptyMessage || "No items yet."}
                </p>
              )}
        </div>
      )}
    </div>
  );
}
