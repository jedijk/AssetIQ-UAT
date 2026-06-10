import {
  Activity,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { translateEnum } from "../../../lib/translateEnum";
import { isAwaitingContext } from "../chatMessageUtils";
import ChatContextPromptBlock from "./ChatContextPromptBlock";

export default function ChatThreatRecordedBlock({
  msg,
  t,
  isMobile,
  isInteractive,
  isSending,
  autoSkipCountdown,
  onThreatLinkClick,
  onAddPhoto,
  onSkip,
}) {
  if (isMobile) {
    return (
      <div className="threat-card">
        <div className="threat-header">
          <span className="threat-icon">✓</span>
          <span>{t("chat.observationRecorded")}</span>
        </div>
        <p className="threat-title">{msg.threat_title}</p>
        <div className="threat-meta">
          <span>{translateEnum(t, msg.threat_risk_level) || msg.threat_risk_level}</span>
          <span>
            {t("chat.riskScoreLabel")} {msg.threat_risk_score}
          </span>
          <span>
            {t("chat.rankLabel")} #{msg.threat_rank}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-green-50 to-white rounded-lg border border-green-200 overflow-hidden">
      <div className="flex items-center gap-2 text-green-700 px-3 py-2 bg-green-100/50 border-b border-green-200">
        <CheckCircle2 className="w-4 h-4" />
        <span className="font-semibold text-sm">{t("chat.observationRecorded")}</span>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-semibold text-slate-900 text-sm leading-tight">
            {msg.threat_title || t("chat.threatLogged")}
          </h4>
          <span
            className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
              msg.threat_risk_level === "Critical"
                ? "bg-red-100 text-red-700"
                : msg.threat_risk_level === "High"
                  ? "bg-orange-100 text-orange-700"
                  : msg.threat_risk_level === "Medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-green-100 text-green-700"
            }`}
          >
            {translateEnum(t, msg.threat_risk_level) || translateEnum(t, "Medium")}
          </span>
        </div>
        <div className="space-y-1 text-xs text-slate-600 mb-3">
          {msg.threat_asset && (
            <div className="flex items-center gap-1.5">
              <Wrench className="w-3 h-3 text-slate-400" />
              <span>
                <strong>{t("chat.equipmentLabel")}</strong> {msg.threat_asset}
              </span>
            </div>
          )}
          {msg.threat_equipment_tag && (
            <div className="flex items-center gap-1.5 ml-[18px]">
              <span className="text-slate-400 font-mono">{msg.threat_equipment_tag}</span>
            </div>
          )}
          {msg.threat_description && (
            <div className="flex items-start gap-1.5 mt-1">
              <MessageSquare className="w-3 h-3 text-slate-400 mt-0.5" />
              <span>
                <strong>{t("chat.whatsHappening")}</strong> {msg.threat_description}
              </span>
            </div>
          )}
          {msg.threat_risk_score && (
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-slate-400" />
              <span>
                <strong>{t("chat.riskScoreLabel")}</strong> {msg.threat_risk_score} •{" "}
                <strong>{t("chat.rankLabel")}</strong> #{msg.threat_rank}
              </span>
            </div>
          )}
        </div>
        {msg.threat_id && (
          <a
            href={`/threats/${msg.threat_id}`}
            onClick={onThreatLinkClick}
            className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium hover:underline"
          >
            {t("chat.viewFullDetails")}
            <ArrowRight className="w-3 h-3" />
          </a>
        )}
      </div>
      {isInteractive && isAwaitingContext(msg) && (
        <ChatContextPromptBlock
          t={t}
          isMobile={false}
          isSending={isSending}
          autoSkipCountdown={autoSkipCountdown}
          onAddPhoto={onAddPhoto}
          onSkip={onSkip}
          embedded
        />
      )}
    </div>
  );
}
