import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import RiskBadge from "./RiskBadge";

const ThreatCard = ({ threat, compact = false }) => {
  const navigate = useNavigate();

  if (compact) {
    return (
      <div
        onClick={() => navigate(`/threats/${threat.id}`)}
        className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
        data-testid={`threat-card-compact-${threat.id}`}
      >
        <div className="flex items-center justify-between mb-2">
          <RiskBadge level={threat.risk_level} size="sm" />
          <span className="text-xs text-slate-400 font-mono">#{threat.rank}</span>
        </div>
        <h4 className="font-semibold text-slate-900 text-sm line-clamp-1 mb-1">
          {threat.title}
        </h4>
        <p className="text-xs text-slate-500">{threat.asset}</p>
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate(`/threats/${threat.id}`)}
      className={`group card p-6 cursor-pointer border-l-4 ${
        threat.risk_level === "Critical" ? "border-l-red-500" :
        threat.risk_level === "High" ? "border-l-orange-500" :
        threat.risk_level === "Medium" ? "border-l-yellow-500" :
        "border-l-green-500"
      }`}
      data-testid={`threat-card-${threat.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <RiskBadge level={threat.risk_level} />
            <span className="text-sm text-slate-400 font-mono">
              Rank #{threat.rank} of {threat.total_threats}
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
            {threat.title}
          </h3>
        </div>
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
          <span className="text-xl font-bold text-slate-600 group-hover:text-blue-600">
            {threat.risk_score}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div>
          <span className="text-slate-400">Asset</span>
          <p className="font-medium text-slate-700">{threat.asset}</p>
        </div>
        <div>
          <span className="text-slate-400">Equipment</span>
          <p className="font-medium text-slate-700">{threat.equipment_type}</p>
        </div>
        <div>
          <span className="text-slate-400">Failure Mode</span>
          <p className="font-medium text-slate-700">{threat.failure_mode}</p>
        </div>
        <div>
          <span className="text-slate-400">Impact</span>
          <p className="font-medium text-slate-700">{threat.impact}</p>
        </div>
      </div>

      {/* Actions Preview */}
      {threat.recommended_actions?.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {threat.recommended_actions.length} recommended action{threat.recommended_actions.length !== 1 ? "s" : ""}
            </span>
            <span className="text-sm text-blue-600 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              View details
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreatCard;
