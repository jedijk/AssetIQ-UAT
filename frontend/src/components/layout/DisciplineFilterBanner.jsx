import { X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDisciplineFilterOptional } from "../../contexts/DisciplineFilterContext";
import { translateDiscipline } from "../../constants/disciplines";
import { Button } from "../ui/button";

export default function DisciplineFilterBanner() {
  const { t } = useLanguage();
  const filter = useDisciplineFilterOptional();
  if (!filter?.isActive) return null;

  const { selectedDisciplineIds, clearFilter } = filter;
  const names = selectedDisciplineIds.map((id) => translateDiscipline(t, id)).filter(Boolean);

  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-900"
      data-testid="discipline-filter-banner"
    >
      <span className="min-w-0 truncate">
        {t("maintenance.discipline")}: {names.join(", ")}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-2 text-violet-800 hover:bg-violet-100 hover:text-violet-900"
        onClick={clearFilter}
      >
        <X className="mr-1 h-3 w-3" />
        {t("common.clear")}
      </Button>
    </div>
  );
}
