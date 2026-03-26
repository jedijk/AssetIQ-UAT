import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

export const RiskScoreCard = ({ threat, rpnValue, linkedFMEAData, linkedCriticalityData }) => {
  const { t } = useLanguage();
  const [scoreCalcPopup, setScoreCalcPopup] = useState({ show: false, x: 0, y: 0 });
  const scorePopupRef = useRef(null);

  // Close score calculation popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (scorePopupRef.current && !scorePopupRef.current.contains(event.target)) {
        setScoreCalcPopup({ show: false, x: 0, y: 0 });
      }
    };

    if (scoreCalcPopup.show) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [scoreCalcPopup.show]);

  // Handle right-click on score to show calculation
  const handleScoreContextMenu = (e) => {
    e.preventDefault();
    setScoreCalcPopup({ show: true, x: e.clientX, y: e.clientY });
  };

  // Calculate actual values for display
  const severityMap = { Minor: 1, Moderate: 3, Significant: 5, Major: 7, Catastrophic: 10 };
  const occurrenceMap = { Once: 1, Rarely: 2, Occasionally: 4, Frequently: 7, Constantly: 10 };
  const detectionMap = { Easy: 1, Moderate: 3, Difficult: 5, "Very Difficult": 7, "Almost Impossible": 10 };

  const severityValue = severityMap[threat.impact] || 5;
  const occurrenceValue = occurrenceMap[threat.frequency] || 5;
  const detectionValue = detectionMap[threat.detectability] || 5;

  const likelihoodScore = Math.round((severityValue * occurrenceValue * detectionValue) / 10);

  // Criticality from linked data
  const critData = linkedCriticalityData || threat.criticality_data;
  const critSafety = critData?.safety || critData?.Safety || 3;
  const critProduction = critData?.production || critData?.Production || 3;
  const critEnvironmental = critData?.environmental || critData?.Environmental || 3;
  const critReputation = critData?.reputation || critData?.Reputation || 3;

  const criticalityScore = Math.round((critSafety * 25 + critProduction * 20 + critEnvironmental * 15 + critReputation * 10) / 3.5);
  const finalScore = Math.round((criticalityScore * 0.75) + (likelihoodScore * 0.25));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={`card p-6 mb-6 border-l-4 cursor-context-menu relative ${
        threat.risk_level === "Critical" ? "border-l-red-500" :
        threat.risk_level === "High" ? "border-l-orange-500" :
        threat.risk_level === "Medium" ? "border-l-yellow-500" :
        "border-l-green-500"
      }`}
      data-testid="risk-score-card"
      onContextMenu={handleScoreContextMenu}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          {/* Risk Score */}
          <div>
            <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
              {t("observations.riskScore")}
              <span className="text-xs text-slate-400 font-normal">({t("observations.rightClickForDetails")})</span>
            </div>
            <div className="text-4xl font-bold text-slate-900">{threat.risk_score}</div>
          </div>

          {/* RPN Display */}
          {rpnValue && (
            <div className="border-l border-slate-200 pl-8">
              <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
                RPN
                <span className="text-xs text-slate-400 font-normal">(Risk Priority Number)</span>
              </div>
              <div className={`text-4xl font-bold ${
                rpnValue >= 300 ? "text-red-600" :
                rpnValue >= 200 ? "text-orange-600" :
                rpnValue >= 100 ? "text-yellow-600" :
                "text-green-600"
              }`}>
                {rpnValue}
              </div>
            </div>
          )}
        </div>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
          threat.risk_level === "Critical" ? "bg-red-50" :
          threat.risk_level === "High" ? "bg-orange-50" :
          threat.risk_level === "Medium" ? "bg-yellow-50" :
          "bg-green-50"
        }`}>
          <AlertTriangle className={`w-8 h-8 ${
            threat.risk_level === "Critical" ? "text-red-500" :
            threat.risk_level === "High" ? "text-orange-500" :
            threat.risk_level === "Medium" ? "text-yellow-500" :
            "text-green-500"
          }`} />
        </div>
      </div>

      {/* Score Calculation Popup */}
      {scoreCalcPopup.show && (
        <div
          ref={scorePopupRef}
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-5 min-w-[400px]"
          style={{ left: Math.min(scoreCalcPopup.x, window.innerWidth - 450), top: Math.min(scoreCalcPopup.y, window.innerHeight - 400) }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h4 className="font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-sm">📊</span>
              Score Calculation
            </h4>
            <button
              onClick={() => setScoreCalcPopup({ show: false, x: 0, y: 0 })}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Likelihood Score */}
          <div className="mb-4">
            <div className="text-sm font-medium text-slate-700 mb-2">Likelihood Score = (S × O × D) / 10</div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Severity</div>
                <div className="font-semibold text-slate-900">{severityValue}</div>
                <div className="text-slate-400">{threat.impact}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Occurrence</div>
                <div className="font-semibold text-slate-900">{occurrenceValue}</div>
                <div className="text-slate-400">{threat.frequency}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Detection</div>
                <div className="font-semibold text-slate-900">{detectionValue}</div>
                <div className="text-slate-400">{threat.detectability}</div>
              </div>
            </div>
            <div className="flex items-center justify-between bg-blue-50 rounded-lg p-2">
              <span className="text-xs text-blue-700">= ({severityValue} × {occurrenceValue} × {detectionValue}) / 10</span>
              <span className="font-bold text-blue-900">{likelihoodScore}</span>
            </div>
          </div>

          {/* Criticality Score */}
          <div className="mb-4">
            <div className="text-sm font-medium text-slate-700 mb-2">Criticality Score = (Safety×25 + Prod×20 + Env×15 + Rep×10) / 3.5</div>
            <div className="grid grid-cols-4 gap-2 text-xs mb-2">
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Safety</div>
                <div className="font-semibold text-slate-900">{critSafety}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Production</div>
                <div className="font-semibold text-slate-900">{critProduction}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Environmental</div>
                <div className="font-semibold text-slate-900">{critEnvironmental}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-slate-500">Reputation</div>
                <div className="font-semibold text-slate-900">{critReputation}</div>
              </div>
            </div>
            <div className="flex items-center justify-between bg-purple-50 rounded-lg p-2">
              <span className="text-xs text-purple-700">= ({critSafety}×25 + {critProduction}×20 + {critEnvironmental}×15 + {critReputation}×10) / 3.5</span>
              <span className="font-bold text-purple-900">{criticalityScore}</span>
            </div>
          </div>

          {/* Final Score */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-3 text-white">
            <div className="text-xs opacity-75 mb-1">Final Score = (Criticality × 0.75) + (Likelihood × 0.25)</div>
            <div className="flex items-center justify-between">
              <span className="text-sm">= ({criticalityScore} × 0.75) + ({likelihoodScore} × 0.25)</span>
              <span className="text-2xl font-bold">{finalScore}</span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default RiskScoreCard;
