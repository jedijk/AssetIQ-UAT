import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * SearchableSelect - A combobox with search functionality
 * 
 * @param {Object} props
 * @param {Array} props.options - Array of { value, label } objects
 * @param {string} props.value - Currently selected value
 * @param {function} props.onValueChange - Callback when value changes
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.searchPlaceholder - Search input placeholder
 * @param {string} props.emptyText - Text shown when no results
 * @param {string} props.className - Additional class names for trigger
 * @param {boolean} props.disabled - Whether the select is disabled
 * @param {boolean} props.allowCustom - Allow custom values not in options
 */
export function SearchableSelect({
  options = [],
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  disabled = false,
  allowCustom = false,
  triggerClassName,
  "data-testid": dataTestId,
}) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options;
    const search = searchValue.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label?.toLowerCase().includes(search) ||
        (typeof opt.value === 'string' && opt.value.toLowerCase().includes(search))
    );
  }, [options, searchValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            triggerClassName,
            className
          )}
          data-testid={dataTestId}
        >
          <span className="truncate">
            {selectedOption?.label || value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onValueChange(option.value === value ? "" : option.value);
                    setOpen(false);
                    setSearchValue("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.icon && <span className="mr-2">{option.icon}</span>}
                  <span className="truncate">{option.label}</span>
                  {option.badge && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {option.badge}
                    </span>
                  )}
                </CommandItem>
              ))}
              {allowCustom && searchValue && !filteredOptions.some(o => o.value === searchValue) && (
                <CommandItem
                  value={searchValue}
                  onSelect={() => {
                    onValueChange(searchValue);
                    setOpen(false);
                    setSearchValue("");
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  <span>Create "{searchValue}"</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SearchableSelect;
