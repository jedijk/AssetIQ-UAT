import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ONBOARDING_PHASES } from "../config/phases";

function PhaseIcon({ status }) {
  if (status === "passed") return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (status === "warning") return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />;
  return <Circle className="w-4 h-4 text-slate-300 shrink-0" />;
}

export function OnboardingProgressSidebar({ phases, currentPhaseId, onNavigate }) {
  const phaseMap = Object.fromEntries((phases || []).map((p) => [p.id, p]));

  return (
    <aside className="w-full lg:w-56 shrink-0">
      <div className="rounded-lg border border-slate-200 bg-white p-4 sticky top-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Progress
        </h3>
        <ul className="space-y-1">
          {ONBOARDING_PHASES.map((phase) => {
            const live = phaseMap[phase.id] || {};
            const isCurrent = phase.id === currentPhaseId;
            return (
              <li key={phase.id}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(phase.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors",
                    isCurrent ? "bg-emerald-50 text-emerald-800 font-medium" : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <PhaseIcon status={live.status} />
                  <span className="truncate">{phase.label}</span>
                  {live.score != null && (
                    <span className="ml-auto text-xs text-slate-400">{live.score}%</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
