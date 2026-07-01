import { useState } from "react";
import { Check, ChevronDown, Cog, X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useEquipmentUnitFilterOptional } from "../../contexts/EquipmentUnitFilterContext";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { cn } from "../../lib/utils";

export default function EquipmentUnitFilterSelect({ className = "", compact = false, inProfileMenu = false }) {
  const { t } = useLanguage();
  const filter = useEquipmentUnitFilterOptional();
  const [open, setOpen] = useState(false);

  if (!filter) return null;

  const {
    selectedUnitIds,
    toggleUnitId,
    clearFilter,
    isActive,
    equipmentUnitNodes,
  } = filter;

  const label = (() => {
    if (!isActive) return t("maintenance.allEquipmentUnits");
    if (selectedUnitIds.length === 1) {
      const node = equipmentUnitNodes.find((n) => n.id === selectedUnitIds[0]);
      return node?.tag || node?.name || t("maintenance.equipmentUnit");
    }
    return `${selectedUnitIds.length} ${t("maintenance.equipmentUnit")}`;
  })();

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        inProfileMenu && "w-full",
        className
      )}
      data-testid="global-equipment-unit-filter"
    >
      <Popover open={open} onOpenChange={setOpen} modal={inProfileMenu}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-7 max-w-[11rem] justify-between gap-1 px-2 text-xs font-normal",
              isActive && "border-blue-300 bg-blue-50 text-blue-800",
              compact && "h-7 max-w-[9rem]",
              inProfileMenu && "h-8 min-w-0 flex-1 max-w-none"
            )}
            data-testid="global-equipment-unit-filter-trigger"
          >
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Cog className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn("w-72 p-0", inProfileMenu && "z-[300]")}
          align={inProfileMenu ? "end" : "start"}
          side={inProfileMenu ? "left" : "bottom"}
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command
            filter={(value, search) => {
              const lc = (value || "").toLowerCase();
              return lc.includes((search || "").toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput
              placeholder={t("maintenance.searchUnitByNameOrTag")}
              data-testid="global-equipment-unit-filter-search"
            />
            <CommandList>
              <CommandEmpty>{t("common.noResults")}</CommandEmpty>
              <CommandGroup>
                {equipmentUnitNodes.map((node) => {
                  const selected = selectedUnitIds.includes(node.id);
                  return (
                    <CommandItem
                      key={node.id}
                      value={`${node.name || ""}|${node.tag || ""}`}
                      onSelect={() => toggleUnitId(node.id)}
                      data-testid={`global-equipment-unit-filter-option-${node.id}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {node.tag && (
                          <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">
                            {node.tag}
                          </Badge>
                        )}
                        <span className="truncate">{node.name}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isActive && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-slate-500 hover:text-slate-800"
          onClick={clearFilter}
          title={t("common.clear")}
          data-testid="global-equipment-unit-filter-clear"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
