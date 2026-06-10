import { ImageIcon } from "lucide-react";

export default function ChatContextPromptBlock({
  t,
  isMobile,
  isSending,
  autoSkipCountdown,
  onAddPhoto,
  onSkip,
  embedded,
}) {
  if (isMobile) return null;

  const wrapperClass = embedded
    ? "px-3 pb-3 pt-2 border-t border-slate-200 bg-slate-50/50"
    : "mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200";

  return (
    <div className={wrapperClass}>
      <p className="text-xs text-slate-600 mb-2">
        {embedded ? (
          <>
            {t("chat.contextPrompt")}{" "}
            <span className="text-slate-500">{t("chat.contextTimerHint")}</span>
          </>
        ) : (
          t("chat.contextTimerHint")
        )}
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={onAddPhoto}
          disabled={isSending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-xs font-medium disabled:opacity-50"
          data-testid={embedded ? "add-photo-btn" : "add-more-photo-btn"}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          {t("chat.addPhoto")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={isSending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors text-xs font-medium disabled:opacity-50"
          data-testid={embedded ? "skip-context-btn" : "skip-more-context-btn"}
        >
          {embedded ? t("chat.skip") : t("chat.done")}{" "}
          {autoSkipCountdown ? `(${autoSkipCountdown}s)` : ""}
        </button>
        {autoSkipCountdown && (
          <span className="text-xs text-slate-400 ml-1">
            {embedded
              ? t("chat.autoSkipIn", { seconds: autoSkipCountdown })
              : t("chat.autoContinueIn", { seconds: autoSkipCountdown })}
          </span>
        )}
      </div>
    </div>
  );
}
