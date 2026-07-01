import { X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useEquipmentUnitFilterOptional } from "../../contexts/EquipmentUnitFilterContext";
import { Button } from "../ui/button";

export default function EquipmentUnitFilterBanner() {
  const { t } = useLanguage();
  const filter = useEquipmentUnitFilterOptional();
  if (!filter?.isActive) return null;

  const { selectedUnitIds, equipmentUnitNodes, clearFilter } = filter;
  const names = selectedUnitIds
    .map((id) => {
      const node = equipmentUnitNodes.find((n) => n.id === id);
      return node?.tag || node?.name;
    })
    .filter(Boolean);

  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900"
      data-testid="equipment-unit-filter-banner"
    >
      <span className="min-w-0 truncate">
        {t("maintenance.equipmentUnit")}: {names.join(", ")}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-2 text-blue-800 hover:bg-blue-100 hover:text-blue-900"
        onClick={clearFilter}
      >
        <X className="mr-1 h-3 w-3" />
        {t("common.clear")}
      </Button>
    </div>
  );
}
