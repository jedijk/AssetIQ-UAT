import { format } from "date-fns";
import {
  AlertCircle,
  ArrowUpDown,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  GripVertical,
  Repeat,
  Search,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";

export function MyTasksPageHeader({
  stats,
  offlineStatus,
  searchQuery,
  setSearchQuery,
  disciplineDropdownOpen,
  setDisciplineDropdownOpen,
  selectedDisciplines,
  getDisciplineLabel,
  getDisciplineDisplayText,
  clearDisciplineFilter,
  disciplines,
  toggleDiscipline,
  selectedDate,
  setSelectedDate,
  isManualSort,
  toggleSortMode,
  activeFilter,
  setActiveFilter,
  tabCounts,
  t,
}) {
  return (
      <div className="flex-shrink-0">
        <div className="app-page-header-band">
          {/* Title row — desktop only; mobile title + badge live in NavigationBreadcrumb */}
          <div className="hidden sm:flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">My Tasks</h1>
              {offlineStatus.isOnline ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-500" />
              )}
            </div>
            <p className="text-xs text-slate-500">Execute and complete your assigned tasks</p>
          </div>
        
          {/* Filters Row - Aligned single row */}
          <div className="flex items-center gap-2 mb-2">
            {/* Search - Flexible width */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
                data-testid="task-search"
              />
            </div>
            
            {/* Discipline Filter — multi-select */}
            <div className="relative">
              {disciplineDropdownOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDisciplineDropdownOpen(false)}
                />
              )}
              <button
                type="button"
                onClick={() => setDisciplineDropdownOpen(!disciplineDropdownOpen)}
                className="flex items-center justify-between w-[96px] sm:w-[140px] h-9 px-2 sm:px-3 bg-white border border-slate-200 rounded-md text-xs sm:text-sm hover:bg-slate-50 transition-colors min-w-0 overflow-hidden"
                data-testid="discipline-filter"
                title={
                  selectedDisciplines.length === 0
                    ? t("disciplines.allDisciplines")
                    : selectedDisciplines.map((d) => getDisciplineLabel(d)).join(", ")
                }
              >
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                  <span
                    className={cn(
                      "truncate min-w-0",
                      selectedDisciplines.length > 0 ? "text-slate-900" : "text-slate-500"
                    )}
                  >
                    {getDisciplineDisplayText()}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ml-0.5",
                    disciplineDropdownOpen && "rotate-180"
                  )}
                />
              </button>
              {disciplineDropdownOpen && (
                <div className="absolute top-full right-0 mt-1 w-52 sm:w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
                  <button
                    type="button"
                    onClick={clearDisciplineFilter}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-slate-100",
                      selectedDisciplines.length === 0
                        ? "text-slate-900 font-medium bg-slate-50"
                        : "text-blue-600 hover:bg-blue-50"
                    )}
                    data-testid="discipline-option-all"
                  >
                    {t("disciplines.allDisciplines")}
                  </button>
                  {disciplines.map((disc) => {
                    const isSelected = selectedDisciplines.includes(disc.value);
                    return (
                      <button
                        key={disc.value}
                        type="button"
                        onClick={() => toggleDiscipline(disc.value)}
                        className="w-full px-3 py-1.5 sm:py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left"
                        data-testid={`discipline-option-${disc.value}`}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-slate-300",
                            isSelected && "border-primary bg-primary text-primary-foreground"
                          )}
                        >
                          {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="text-sm text-slate-700 flex-1">{disc.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Date Picker - Desktop only */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "hidden sm:flex w-[140px] h-9 text-sm justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                  data-testid="date-filter"
                >
                  <CalendarIcon className="mr-1.5 h-4 w-4" />
                  <span className="truncate">{selectedDate ? format(selectedDate, "MMM d") : "Date"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            {/* Sort Mode Toggle */}
            <Button
              variant={isManualSort ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 px-2 sm:px-3",
                isManualSort && "bg-slate-200 hover:bg-slate-300 text-slate-700"
              )}
              onClick={toggleSortMode}
              data-testid="sort-toggle"
              title={isManualSort ? "Manual sorting enabled (drag to reorder)" : "Auto-sorting by priority"}
            >
              {isManualSort ? (
                <>
                  <GripVertical className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">Manual</span>
                </>
              ) : (
                <>
                  <ArrowUpDown className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">Auto</span>
                </>
              )}
            </Button>
          </div>
          
          {/* Quick Filter Tabs */}
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-4 mb-2 sm:mb-0">
                <TabsTrigger value="open" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-open">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Open</span>
                  {tabCounts.open > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{tabCounts.open}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="overdue" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-overdue">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Overdue</span>
                  {tabCounts.overdue > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 px-1 text-[10px]">{tabCounts.overdue}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="recurring" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-recurring">
                  <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Recurring</span>
                  {tabCounts.recurring > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{tabCounts.recurring}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="adhoc" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-adhoc">
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Adhoc</span>
                  {tabCounts.adhoc > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{tabCounts.adhoc}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
          
          {/* Stats Summary - Desktop only */}
          <div className="hidden sm:grid grid-cols-4 gap-2 mt-2">
            <div className="bg-slate-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-slate-900">{stats.total}</div>
              <div className="text-[10px] text-slate-500">Total</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-amber-600">{stats.inProgress}</div>
              <div className="text-[10px] text-slate-500">In Progress</div>
            </div>
            <div className="bg-red-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-red-600">{stats.overdue}</div>
              <div className="text-[10px] text-slate-500">Overdue</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-blue-600">{stats.open}</div>
              <div className="text-[10px] text-slate-500">Open</div>
            </div>
          </div>
        </div>
      </div>
  );
}
