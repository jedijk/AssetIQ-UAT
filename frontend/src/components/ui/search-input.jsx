import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "./input";
import { cn } from "../../lib/utils";

/**
 * SearchInput — drop-in Input replacement with:
 *  - Left "Search" icon
 *  - Right "X" clear button (shown only when value is non-empty)
 *
 * Usage:
 *   <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />
 *
 * Notes:
 *  - Calls onChange with a synthetic event { target: { value: "" } } when the X is clicked,
 *    so existing onChange handlers keep working unchanged.
 *  - All extra props (className, data-testid, autoFocus, disabled, etc.) are forwarded to <Input>.
 */
export const SearchInput = React.forwardRef(
  ({ value = "", onChange, onClear, className, iconClassName, clearTestId, ...rest }, ref) => {
    const hasValue = value !== undefined && value !== null && String(value).length > 0;

    const handleClear = () => {
      if (onClear) onClear();
      if (onChange) {
        onChange({ target: { value: "" } });
      }
    };

    return (
      <div className="relative w-full">
        <Search
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none",
            iconClassName
          )}
        />
        <Input
          ref={ref}
          value={value}
          onChange={onChange}
          className={cn("pl-9", hasValue ? "pr-9" : "pr-3", className)}
          {...rest}
        />
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            data-testid={clearTestId || "search-clear-btn"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full p-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

export default SearchInput;
