import {
  Search,
  Filter,
  ChevronDown,
  Check,
  Clock,
  Target,
  Activity,
  ArrowUpDown,
  BarChart3,
} from "lucide-react";
import BackButton from "../../../components/BackButton";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../actionsPageConstants";

export function ActionsPageToolbar({
  location,
  t,
  stats,
  statCards,
  searchQuery,
  setSearchQuery,
  statusFilter,
  statusDropdownOpen,
  setStatusDropdownOpen,
  toggleStatus,
  clearStatusFilter,
  priorityFilter,
  setPriorityFilter,
  sortBy,
  setSortBy,
  sortDropdownOpen,
  setSortDropdownOpen,
}) {
  return (
    <div className="app-page-header-band">
      {location.state?.from && (
        <div className="mb-3 hidden sm:block">
          <BackButton />
        </div>
      )}

      <div className="hidden sm:flex items-center justify-between mb-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">{t("actionsPage.title") || "Actions"}</h1>
          <p className="text-xs text-slate-500">{t("actionsPage.subtitle") || "Track and manage corrective actions"}</p>
        </div>
      </div>

      <div className="hidden sm:flex flex-wrap gap-2 mb-3">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200"
            data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className={`p-1.5 rounded-md ${stat.bg}`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <span className="text-lg font-bold text-slate-900">{stat.value}</span>
            <span className="text-xs text-slate-500">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-2" data-testid="actions-filters">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            id="actions-search"
            name="actions-search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
            data-testid="actions-search"
          />
        </div>

        <div className="relative">
          {statusDropdownOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(false)} />
          )}

          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="flex items-center justify-between w-[90px] sm:w-40 h-9 px-2 sm:px-3 bg-white border border-slate-200 rounded-md text-xs sm:text-sm hover:bg-slate-50 transition-colors"
            data-testid="status-filter-select"
          >
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className={`truncate ${statusFilter.length > 0 ? "text-slate-900" : "text-slate-500"}`}>
                {statusFilter.length === 0 ? "Status" : statusFilter.length === 1 ? statusFilter[0] : `${statusFilter.length} sel`}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${statusDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {statusDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-48 sm:w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
              {statusFilter.length > 0 && (
                <button
                  onClick={clearStatusFilter}
                  className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 border-b border-slate-100"
                >
                  Clear all filters
                </button>
              )}

              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status.value}
                  onClick={() => toggleStatus(status.value)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  data-testid={`status-option-${status.value}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.color}`}></span>
                    <span className="text-sm text-slate-700">{status.label}</span>
                  </div>
                  {statusFilter.includes(status.value) && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="hidden sm:flex w-36 h-9 text-sm" data-testid="priority-filter">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.color}`}></span>
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative sm:hidden">
          {sortDropdownOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setSortDropdownOpen(false)} />
          )}

          <button
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="flex items-center justify-center w-9 h-9 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            data-testid="mobile-sort-button"
            aria-label="Sort"
          >
            <ArrowUpDown className={`w-4 h-4 ${sortBy === "latest" ? "text-blue-600" : "text-slate-400"}`} />
          </button>

          {sortDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
              <button
                onClick={() => { setSortBy("latest"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-sm text-slate-700">Latest First</span>
                </div>
                {sortBy === "latest" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              <button
                onClick={() => { setSortBy("oldest"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-700">Oldest First</span>
                </div>
                {sortBy === "oldest" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              <button
                onClick={() => { setSortBy("risk_score"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-sm text-slate-700">Risk Score</span>
                </div>
                {sortBy === "risk_score" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              <button
                onClick={() => { setSortBy("rpn"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-sm text-slate-700">RPN</span>
                </div>
                {sortBy === "rpn" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            </div>
          )}
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="hidden sm:flex w-36 h-9 text-sm" data-testid="sort-by-select">
            <BarChart3 className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="risk_score">
              <span className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-purple-500" />
                Risk Score
              </span>
            </SelectItem>
            <SelectItem value="rpn">
              <span className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                RPN
              </span>
            </SelectItem>
            <SelectItem value="latest">
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-green-500" />
                Latest First
              </span>
            </SelectItem>
            <SelectItem value="oldest">
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Oldest First
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
