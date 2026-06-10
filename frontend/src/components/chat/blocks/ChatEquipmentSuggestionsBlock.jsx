import {
  ArrowRight,
  HelpCircle,
  Loader2,
  X,
} from "lucide-react";

export default function ChatEquipmentSuggestionsBlock({
  suggestions,
  t,
  isMobile,
  isSending,
  onSelect,
  onUnknown,
  onCancel,
}) {
  const list = isMobile ? suggestions.slice(0, 5) : suggestions;

  if (isMobile) {
    return (
      <div className="suggestions">
        {list.map((eq, i) => (
          <button key={eq.id || i} type="button" onClick={() => onSelect(eq)} className="suggestion-btn">
            <span>{eq.name}</span>
            {eq.parent_name && (
              <span className="text-xs text-slate-400 block">
                {t("chat.equipmentInParent", { parent: eq.parent_name })}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={onUnknown}
          disabled={isSending}
          className="suggestion-btn suggestion-btn-muted"
          data-testid="equipment-unknown-btn"
        >
          <HelpCircle className="w-3.5 h-3.5 inline mr-1 opacity-70" />
          {t("chat.dontKnow")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {list.map((eq) => (
        <button
          key={eq.id}
          type="button"
          onClick={() => onSelect(eq)}
          disabled={isSending}
          className="w-full text-left p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-blue-900 text-sm">{eq.name}</span>
                {eq.tag && <span className="text-blue-600 text-xs">({eq.tag})</span>}
              </div>
              {eq.parent_name && (
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {t("chat.equipmentInParent", { parent: eq.parent_name })}
                </div>
              )}
            </div>
            {isSending ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
            ) : (
              <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
            )}
          </div>
          {eq.equipment_type && <span className="text-xs text-blue-500">{eq.equipment_type}</span>}
        </button>
      ))}
      <button
        type="button"
        onClick={onUnknown}
        disabled={isSending}
        className="w-full text-left p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="equipment-unknown-btn"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-700 text-sm">{t("chat.dontKnow")}</span>
          </div>
          {isSending ? (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
          ) : (
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0" />
          )}
        </div>
        <span className="text-xs text-slate-500 ml-6">{t("chat.continueWithoutEquipment")}</span>
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full text-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm"
        >
          <X className="w-3.5 h-3.5 inline mr-1" />
          {t("chat.noneOfTheseCancel")}
        </button>
      )}
    </div>
  );
}
