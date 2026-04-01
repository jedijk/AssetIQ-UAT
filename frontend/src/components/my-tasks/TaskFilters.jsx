/**
 * TaskFilters Component
 * Filter controls for My Tasks page
 */
import { Search, Filter } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";

export const TaskFilters = ({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  sourceFilter,
  setSourceFilter,
  t,
}) => {
  const hasActiveFilters = priorityFilter !== "all" || sourceFilter !== "all";

  const clearFilters = () => {
    setPriorityFilter("all");
    setSourceFilter("all");
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder={t?.("common.search") || "Search tasks..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="task-search-input"
        />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        {["open", "completed", "all"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className="capitalize"
            data-testid={`filter-${status}`}
          >
            {t?.(`tasks.${status}`) || status}
          </Button>
        ))}
      </div>

      {/* Advanced Filters */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <Filter className="w-4 h-4 mr-2" />
            {t?.("common.filters") || "Filters"}
            {hasActiveFilters && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs">
                {(priorityFilter !== "all" ? 1 : 0) + (sourceFilter !== "all" ? 1 : 0)}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t?.("tasks.priority") || "Priority"}</label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger data-testid="priority-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t?.("common.all") || "All"}</SelectItem>
                  <SelectItem value="critical">{t?.("priority.critical") || "Critical"}</SelectItem>
                  <SelectItem value="high">{t?.("priority.high") || "High"}</SelectItem>
                  <SelectItem value="medium">{t?.("priority.medium") || "Medium"}</SelectItem>
                  <SelectItem value="low">{t?.("priority.low") || "Low"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t?.("tasks.source") || "Source"}</label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger data-testid="source-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t?.("common.all") || "All"}</SelectItem>
                  <SelectItem value="task">{t?.("tasks.scheduledTask") || "Scheduled Task"}</SelectItem>
                  <SelectItem value="action">{t?.("common.action") || "Action"}</SelectItem>
                  <SelectItem value="adhoc">{t?.("tasks.adhoc") || "Ad-hoc"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="w-full"
              >
                {t?.("common.clearFilters") || "Clear Filters"}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default TaskFilters;
