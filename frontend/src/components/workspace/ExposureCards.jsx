import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Target, X } from "lucide-react";
import { Badge } from "../ui/badge";
import RiskBadge from "../RiskBadge";
import { useLanguage } from "../../contexts/LanguageContext";
import { translateEnum } from "../../lib/translateEnum";
import {
  CRITICALITY_FIELD_BY_DIMENSION,
  translateCriticalityDimensionLabel,
  translateCriticalityField,
  translateCriticalityLabel,
} from "../../lib/criticalityDefinitionI18n";

export function ExposureCard({ type, data, icon: Icon, color, dimension, score, criticalityDefs }) {
  const { t } = useLanguage();
  const [popup, setPopup] = useState({ show: false, x: 0, y: 0 });
  const popupRef = useRef(null);

  useEffect(() => {
    if (!popup.show) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopup({ show: false, x: 0, y: 0 });
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popup.show]);

  const colorClasses = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  };

  const severityColorByScore = {
    5: "red",
    4: "orange",
    3: "yellow",
    2: "sky",
    1: "green",
  };
  const effectiveColor = severityColorByScore[score] || color;

  const field = CRITICALITY_FIELD_BY_DIMENSION[dimension];

  const scaleRows = (criticalityDefs || [])
    .slice()
    .sort((a, b) => (a.rank || 0) - (b.rank || 0))
    .filter((d) => field && d[field]);

  const isNotAssessed =
    data?.not_assessed === true ||
    (dimension && (score === null || score === undefined || score === 0));

  return (
    <>
      <div
        className={`rounded-xl border px-3 py-2 ${dimension ? "cursor-context-menu" : ""} ${
          isNotAssessed ? "bg-slate-50 border-slate-200 text-slate-500" : colorClasses[effectiveColor]
        }`}
        onContextMenu={
          dimension
            ? (e) => {
                e.preventDefault();
                setPopup({ show: true, x: e.clientX, y: e.clientY });
              }
            : undefined
        }
        title={dimension ? t("observationWorkspace.criticalityRightClick") : undefined}
        data-testid={dimension ? `exposure-card-${dimension}` : undefined}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[10px] font-medium uppercase tracking-wide truncate">{type}</span>
        </div>
        {isNotAssessed ? (
          <div className="text-sm font-semibold leading-tight italic">
            {t("observationWorkspace.notAssessed")}
          </div>
        ) : (
          <>
            {data.primary && (
              <div className="text-base sm:text-lg font-bold leading-tight break-words">{data.primary}</div>
            )}
            {data.secondary && (
              <div className="text-[11px] opacity-80 leading-tight line-clamp-2">{data.secondary}</div>
            )}
            {data.tertiary && (
              <div className="text-[11px] opacity-70 leading-tight">{data.tertiary}</div>
            )}
          </>
        )}
      </div>

      {popup.show &&
        (() => {
          const currentRow = scaleRows.find((d) => d.rank === score);
          return (
            <div
              ref={popupRef}
              className="fixed z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl"
              style={{
                left: Math.min(Math.max(popup.x, 16), window.innerWidth - 336),
                top: Math.min(Math.max(popup.y, 16), window.innerHeight - 100),
              }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <h3 className="font-semibold text-sm text-slate-800">
                  {t("observationWorkspace.criticalityTitle", {
                    dimension: translateCriticalityDimensionLabel(dimension, t),
                  })}
                </h3>
                <button
                  onClick={() => setPopup({ show: false, x: 0, y: 0 })}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-3">
                {currentRow ? (
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                      {currentRow.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">
                        {translateCriticalityLabel(currentRow, t)}
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap mt-1">
                        {translateCriticalityField(currentRow, field, t)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="text-sm text-slate-500 italic">
                      {t("observationWorkspace.notAssessed")}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </>
  );
}

export function ALARPCard({ alarp }) {
  const { t } = useLanguage();
  const percentage = alarp?.percentage || 0;
  const status = alarp?.status || "Not Started";

  const getStatusColor = () => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-blue-600";
    if (percentage >= 40) return "text-amber-600";
    return "text-slate-500";
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-indigo-600" />
          <span className="text-[10px] font-medium text-indigo-700 uppercase tracking-wide">
            {t("observationWorkspace.mitigated")}
          </span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor()}`}>
          {translateEnum(t, status)}
        </Badge>
      </div>
      <div className="text-lg font-bold text-indigo-700 leading-tight mb-1">{percentage}%</div>
      <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function RiskSummaryCard({ riskSummary }) {
  const { t } = useLanguage();
  const riskScore = riskSummary?.risk_score || 0;
  const riskLevel = riskSummary?.risk_level || "Low";
  const rpn = riskSummary?.rpn;

  const getRiskColor = () => {
    if (riskLevel === "Critical") return "border-red-300 bg-red-50";
    if (riskLevel === "High") return "border-orange-300 bg-orange-50";
    if (riskLevel === "Medium") return "border-yellow-300 bg-yellow-50";
    return "border-green-300 bg-green-50";
  };

  return (
    <div
      className={`rounded-xl border px-3 py-2 cursor-context-menu ${getRiskColor()}`}
      onContextMenu={(e) => {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("workspace:show-score-calc", {
            detail: { x: e.clientX, y: e.clientY },
          })
        );
      }}
      title={t("observationWorkspace.riskRightClick")}
      data-testid="kpi-risk-card"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">
          {t("observationWorkspace.risk")}
        </span>
      </div>
      <div className="flex items-baseline gap-2 leading-tight">
        <span className="text-lg font-bold">{riskScore}</span>
        <RiskBadge level={riskLevel} size="sm" />
      </div>
      {rpn && <div className="text-[11px] mt-0.5 opacity-70 leading-tight">RPN: {rpn}</div>}
    </div>
  );
}
