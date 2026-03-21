import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

/**
 * A searchable combobox component that allows users to search and select from a list of options.
 * 
 * @param {Object} props
 * @param {Array} props.options - Array of options with { value, label, description? } structure
 * @param {string} props.value - Currently selected value
 * @param {Function} props.onValueChange - Callback when value changes
 * @param {string} props.placeholder - Placeholder text when no selection
 * @param {string} props.searchPlaceholder - Placeholder for search input
 * @param {string} props.emptyText - Text to show when no results found
 * @param {boolean} props.allowCustom - Allow custom values not in the list
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Whether the combobox is disabled
 */
const SearchableCombobox = ({
  options = [],
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  allowCustom = true,
  className,
  disabled = false,
  "data-testid": testId,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Find the label for the current value
  const selectedOption = options.find(
    (option) => option.value.toLowerCase() === value?.toLowerCase()
  );
  const displayValue = selectedOption?.label || value || "";

  // Filter options based on search query
  const filteredOptions = options.filter((option) => {
    const query = searchQuery.toLowerCase();
    return (
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query) ||
      (option.description && option.description.toLowerCase().includes(query))
    );
  });

  // Check if current search query matches any option exactly
  const exactMatch = options.some(
    (option) => option.label.toLowerCase() === searchQuery.toLowerCase()
  );

  const handleSelect = (selectedValue) => {
    onValueChange(selectedValue);
    setOpen(false);
    setSearchQuery("");
  };

  const handleCustomValue = () => {
    if (searchQuery.trim() && allowCustom) {
      onValueChange(searchQuery.trim());
      setOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-9 font-normal",
            !displayValue && "text-muted-foreground",
            className
          )}
          disabled={disabled}
          data-testid={testId}
        >
          <span className="truncate">
            {displayValue || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-2 text-center text-sm">
                <p className="text-muted-foreground">{emptyText}</p>
                {allowCustom && searchQuery.trim() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-primary"
                    onClick={handleCustomValue}
                    data-testid={testId ? `${testId}-use-custom` : undefined}
                  >
                    Use "{searchQuery.trim()}"
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className="cursor-pointer"
                  data-testid={testId ? `${testId}-option-${option.value.replace(/\s+/g, '-').toLowerCase()}` : undefined}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.toLowerCase() === option.value.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {option.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {/* Allow using custom value when searching */}
              {allowCustom && searchQuery.trim() && !exactMatch && filteredOptions.length > 0 && (
                <CommandItem
                  value={`custom-${searchQuery}`}
                  onSelect={handleCustomValue}
                  className="cursor-pointer border-t mt-1 pt-2"
                  data-testid={testId ? `${testId}-custom-option` : undefined}
                >
                  <Search className="mr-2 h-4 w-4 opacity-50" />
                  <span>Use "{searchQuery.trim()}"</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableCombobox;
