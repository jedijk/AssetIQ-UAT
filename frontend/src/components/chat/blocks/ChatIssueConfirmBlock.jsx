import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { parseIssueSummaryLines, splitIssueConfirmContent } from "../chatMessageUtils";

export default function ChatIssueConfirmBlock({
  msg,
  t,
  isMobile,
  isInteractive,
  isSending,
  onAccept,
  onRevise,
  onCancel,
}) {
  if (isMobile) {
    const { intro, promptText } = splitIssueConfirmContent(msg.content);
    return (
      <div className="issue-confirm-block">
        <p className="issue-confirm-intro">{intro}</p>
        <p className="issue-confirm-summary">{msg.issue_summary}</p>
        {promptText ? <p className="issue-confirm-prompt">{promptText}</p> : null}
        {isInteractive && (
          <>
            <div className="issue-confirm-actions">
              <button
                type="button"
                className="issue-confirm-yes"
                onClick={onAccept}
                disabled={isSending}
                data-testid="issue-confirm-yes-btn"
              >
                {t("chat.accept")}
              </button>
              <button
                type="button"
                className="issue-confirm-revise"
                onClick={onRevise}
                disabled={isSending}
                data-testid="issue-confirm-revise-btn"
              >
                {t("chat.revise")}
              </button>
            </div>
            <p className="issue-confirm-hint">{t("chat.issueConfirmHint")}</p>
          </>
        )}
      </div>
    );
  }

  const { equipment, whatsHappening } = parseIssueSummaryLines(msg.issue_summary);

  return (
    <div className="bg-gradient-to-b from-orange-50 to-white rounded-lg border border-orange-200 overflow-hidden">
      <div className="flex items-center gap-2 text-orange-700 px-3 py-2 bg-orange-100/50 border-b border-orange-200">
        <AlertTriangle className="w-4 h-4" />
        <span className="font-semibold text-sm">{t("chat.draftObservation")}</span>
        <span className="ml-auto text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium">
          {t("chat.pending")}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-semibold text-slate-900 text-sm leading-tight">
            {whatsHappening || equipment || t("chat.newObservation")}
          </h4>
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
            {t("chat.draftObservation")}
          </span>
        </div>
        <div className="space-y-1.5 text-xs text-slate-600 mb-3">
          {equipment && (
            <div className="flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-orange-400" />
              <span>
                <strong>{t("chat.equipmentLabel")}</strong> {equipment}
              </span>
            </div>
          )}
          {whatsHappening && (
            <div className="flex items-start gap-1.5 mt-2">
              <MessageSquare className="w-3.5 h-3.5 text-orange-400 mt-0.5" />
              <div>
                <strong>{t("chat.whatsHappening")}</strong>
                <p className="text-slate-700 mt-0.5">{whatsHappening}</p>
              </div>
            </div>
          )}
        </div>
        {isInteractive && (
          <div className="flex gap-2 pt-2 border-t border-orange-100">
            <button
              type="button"
              onClick={onAccept}
              disabled={isSending}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
              data-testid="issue-confirm-accept-btn"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {t("chat.accept")}
            </button>
            <button
              type="button"
              onClick={onRevise}
              disabled={isSending}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white border border-orange-300 text-orange-700 text-xs font-medium hover:bg-orange-50 disabled:opacity-50 transition-colors"
              data-testid="issue-confirm-revise-btn"
            >
              {t("chat.revise")}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSending}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white border border-red-300 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                data-testid="issue-confirm-cancel-btn"
              >
                {t("chat.cancel")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
