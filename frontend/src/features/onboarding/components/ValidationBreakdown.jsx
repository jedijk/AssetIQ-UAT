import { Badge } from "../../../components/ui/badge";

function formatDetailValue(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function CheckDetail({ detail }) {
  if (!detail || Object.keys(detail).length === 0) return null;

  const labels = {
    equipment_count: "Equipment nodes",
    user_count: "Users",
    coverage_percent: "Coverage %",
    count: "Count",
    duplicates: "Duplicate tags",
    levels: "Hierarchy levels",
  };

  return (
    <dl className="mt-1 ml-6 grid grid-cols-1 gap-1 text-xs text-slate-500">
      {Object.entries(detail).map(([key, value]) => {
        const formatted = formatDetailValue(value);
        if (!formatted) return null;
        return (
          <div key={key} className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-slate-600">{labels[key] || key}:</dt>
            <dd className="text-slate-700 break-words">{formatted}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ValidationScoreHeader({ validation }) {
  const tally = validation?.check_tally;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">Score: {validation?.score ?? 0}%</span>
        <Badge
          className={
            validation?.status === "passed"
              ? "bg-emerald-100 text-emerald-800"
              : validation?.status === "warning"
                ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-800"
          }
        >
          {validation?.status || "pending"}
        </Badge>
      </div>
      {validation?.score_explanation && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          {validation.score_explanation}
        </p>
      )}
      {tally?.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="text-emerald-700 border-emerald-200">
            {tally.passed} passed
          </Badge>
          {tally.warning > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-200">
              {tally.warning} warning
            </Badge>
          )}
          {tally.action_required > 0 && (
            <Badge variant="outline" className="text-red-700 border-red-200">
              {tally.action_required} required
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export function ValidationChecksList({ checks }) {
  if (!checks?.length) {
    return <p className="text-sm text-slate-500">Run validation to check this phase.</p>;
  }

  return (
    <ul className="space-y-3">
      {checks.map((check) => (
        <li key={check.code} className="text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
          <div className="flex items-start gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400 mt-0.5 shrink-0">
              {check.code}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800">{check.message}</p>
              <CheckDetail detail={check.detail} />
            </div>
            <Badge
              variant="outline"
              className={
                check.status === "passed"
                  ? "text-emerald-700 border-emerald-200 shrink-0"
                  : check.status === "warning"
                    ? "text-amber-700 border-amber-200 shrink-0"
                    : "text-red-700 border-red-200 shrink-0"
              }
            >
              {check.status.replace("_", " ")}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReadinessBreakdownPanel({ title, score, breakdownKey, readiness }) {
  const section = readiness?.breakdown?.[breakdownKey];
  if (!section) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 text-left space-y-2">
      <p className="text-xs text-slate-500">{section.formula}</p>
      <ul className="space-y-1.5">
        {section.components?.map((item) => (
          <li key={`${breakdownKey}-${item.phase_id || item.label}`} className="flex justify-between gap-2 text-xs">
            <span className="text-slate-600 truncate">
              {item.label}
              {item.weight_percent != null && (
                <span className="text-slate-400"> · {item.weight_percent}% weight</span>
              )}
            </span>
            <span className="font-medium text-slate-800 shrink-0">
              {item.score ?? 0}%
              {item.contribution != null && (
                <span className="text-slate-400 font-normal"> (+{item.contribution})</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-medium text-slate-700 pt-1">= {score ?? 0}%</p>
    </div>
  );
}
