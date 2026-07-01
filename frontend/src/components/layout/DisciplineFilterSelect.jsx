import { useState } from "react";
import { Check, ChevronDown, Wrench, X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDisciplineFilterOptional } from "../../contexts/DisciplineFilterContext";
import { translateDiscipline } from "../../constants/disciplines";
import { Button } from "../ui/button";
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

export default function DisciplineFilterSelect({ className = "", compact = false, inProfileMenu = false }) {
  const { t } = useLanguage();
  const filter = useDisciplineFilterOptional();
  const [open, setOpen] = useState(false);

  if (!filter) return null;

  const { selectedDisciplineIds, toggleDisciplineId, clearFilter, isActive, disciplines } = filter;

  const label = (() => {
    if (!isActive) return t("disciplines.allDisciplines");
    if (selectedDisciplineIds.length === 1) {
      return translateDiscipline(t, selectedDisciplineIds[0]);
    }
    return `${translateDiscipline(t, selectedDisciplineIds[0])} +${selectedDisciplineIds.length - 1}`;
  })();

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        inProfileMenu && "w-full",
        className
      )}
      data-testid="global-discipline-filter"
    >
      <Popover open={open} onOpenChange={setOpen} modal={inProfileMenu}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-7 max-w-[10rem] justify-between gap-1 px-2 text-xs font-normal",
              isActive && "border-violet-300 bg-violet-50 text-violet-900",
              compact && "h-7 max-w-[8rem]",
              inProfileMenu && "h-8 min-w-0 flex-1 max-w-none"
            )}
            data-testid="global-discipline-filter-trigger"
          >
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Wrench className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn("w-56 p-0", inProfileMenu && "z-[300]")}
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
            <CommandInput placeholder={t("common.search")} data-testid="global-discipline-filter-search" />
            <CommandList>
              <CommandEmpty>{t("common.noResults")}</CommandEmpty>
              <CommandGroup>
                {disciplines.map((disc) => {
                  const selected = selectedDisciplineIds.includes(disc.value);
                  return (
                    <CommandItem
                      key={disc.value}
                      value={`${disc.label}|${disc.value}`}
                      onSelect={() => toggleDisciplineId(disc.value)}
                      data-testid={`global-discipline-filter-option-${disc.value}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{translateDiscipline(t, disc.value)}</span>
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
          data-testid="global-discipline-filter-clear"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
