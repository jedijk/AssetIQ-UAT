import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { STATUS_LABELS, STATUS_STYLES, PULSE_STATUS_LABELS, PULSE_STATUS_STYLES } from "../config/nav";

export function KpiStatusBadge({ status }) {
  const key = status || "not_started";
  return (
    <Badge variant="outline" className={STATUS_STYLES[key] || STATUS_STYLES.not_started}>
      {STATUS_LABELS[key] || key}
    </Badge>
  );
}

export function ScoreDisplay({ score, label, className = "" }) {
  const display = score == null ? "—" : `${score}%`;
  return (
    <div className={className}>
      {label && <p className="text-sm text-slate-500 mb-1">{label}</p>}
      <p className="text-3xl font-bold text-slate-900 tabular-nums">{display}</p>
    </div>
  );
}

export function PillarCard({ title, weight, score, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">Weight {weight}%</p>
        </div>
        <ScoreDisplay score={score} className="text-right" />
      </div>
      {children}
    </div>
  );
}

export function PulseStatusBadge({ status }) {
  const key = status || "draft";
  return (
    <Badge variant="outline" className={PULSE_STATUS_STYLES[key] || PULSE_STATUS_STYLES.draft}>
      {PULSE_STATUS_LABELS[key] || key}
    </Badge>
  );
}

function KpiImprovementInfo({ kpi }) {
  const actions = kpi?.improvement_actions || [];
  if (!actions.length) return null;

  const gap =
    kpi.score != null && kpi.target != null && kpi.score < kpi.target
      ? kpi.target - kpi.score
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-slate-400 hover:text-blue-600"
          aria-label={`How to improve ${kpi.name}`}
          data-testid={`kpi-improvement-info-${kpi.id}`}
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Improve {kpi.name}</p>
          {gap != null && (
            <p className="mt-1 text-xs text-amber-700">
              {gap} points below target ({kpi.score}% vs {kpi.target}%)
            </p>
          )}
          {kpi.status === "on_track" && gap == null && (
            <p className="mt-1 text-xs text-emerald-700">On track — maintain with the actions below.</p>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto py-2">
          {actions.map((action, index) => (
            <li key={`${kpi.id}-action-${index}`} className="px-4 py-2.5 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-900">{action.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{action.description}</p>
              {action.path && (
                <Link
                  to={action.path}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  Go to action
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function KpiTable({ kpis }) {
  if (!kpis?.length) {
    return <p className="text-sm text-slate-500">No KPIs available.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-2 font-medium">KPI</th>
            <th className="px-4 py-2 font-medium">Score</th>
            <th className="px-4 py-2 font-medium">Target</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Trend</th>
            <th className="px-4 py-2 font-medium">Evidence</th>
            <th className="px-4 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {kpis.map((kpi) => (
            <Fragment key={kpi.id}>
            <tr className="bg-white">
              <td className="px-4 py-3">
                <div className="flex items-start gap-1">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{kpi.name}</div>
                    <div className="text-xs text-slate-500">{kpi.description}</div>
                  </div>
                  <KpiImprovementInfo kpi={kpi} />
                </div>
              </td>
              <td className="px-4 py-3 tabular-nums">{kpi.score == null ? "—" : `${kpi.score}%`}</td>
              <td className="px-4 py-3 tabular-nums">{kpi.target}%</td>
              <td className="px-4 py-3">
                <KpiStatusBadge status={kpi.status} />
              </td>
              <td className="px-4 py-3 tabular-nums text-slate-600">
                {kpi.trend == null ? "—" : `${kpi.trend > 0 ? "+" : ""}${kpi.trend}`}
              </td>
              <td className="px-4 py-3 text-slate-600">{kpi.evidence_count || 0}</td>
              <td className="px-4 py-3 capitalize text-slate-600">{kpi.source}</td>
            </tr>
            {kpi.auto_detail && Object.keys(kpi.auto_detail).length > 0 && (
              <tr key={`${kpi.id}-detail`} className="bg-slate-50">
                <td colSpan={7} className="px-4 py-2 text-xs text-slate-600">
                  {Object.entries(kpi.auto_detail).map(([key, value]) => (
                    <span key={key} className="mr-4">
                      <span className="font-medium">{key}:</span> {String(value)}
                    </span>
                  ))}
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
