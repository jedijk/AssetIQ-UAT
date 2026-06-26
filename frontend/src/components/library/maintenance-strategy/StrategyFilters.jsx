import React from "react";
import { Search } from "lucide-react";
import { Input } from "../../ui/input";

export default function StrategyFilters({ searchQuery, onSearchChange, placeholder }) {
  return (
    <div className="relative mt-4">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <Input
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-9 h-9"
        data-testid="strategy-search-input"
      />
    </div>
  );
}
