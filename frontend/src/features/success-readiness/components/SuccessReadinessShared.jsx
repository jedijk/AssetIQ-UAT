import { Badge } from "../../../components/ui/badge";
import { STATUS_LABELS, STATUS_STYLES } from "../config/nav";

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
            <th className="px-4 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {kpis.map((kpi) => (
            <tr key={kpi.id} className="bg-white">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{kpi.name}</div>
                <div className="text-xs text-slate-500">{kpi.description}</div>
              </td>
              <td className="px-4 py-3 tabular-nums">{kpi.score == null ? "—" : `${kpi.score}%`}</td>
              <td className="px-4 py-3 tabular-nums">{kpi.target}%</td>
              <td className="px-4 py-3">
                <KpiStatusBadge status={kpi.status} />
              </td>
              <td className="px-4 py-3 capitalize text-slate-600">{kpi.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
