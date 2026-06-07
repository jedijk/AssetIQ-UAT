import { motion } from "framer-motion";
import {
  Search,
  Filter,
  AlertTriangle,
  Info,
  CheckCircle,
  Download,
  Sparkles,
  ClipboardList,
  Plus,
  ChevronDown,
} from "lucide-react";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DISCIPLINES } from "../library";
import { disciplineIcons, disciplineColors } from "./disciplineStyles";

export function FailureModesListPanel({
  t,
  displayedTotal,
  totalCategories,
  highSeverityOnly,
  setHighSeverityOnly,
  hideAIImproved,
  setHideAIImproved,
  filterLinkedToEquipment,
  setFilterLinkedToEquipment,
  linkedFailureModeCount,
  canUseAITools,
  aiImprovedCount,
  displayedFailureModes,
  failureModes,
  searchQuery,
  setSearchQuery,
  disciplineFilter,
  setDisciplineFilter,
  typeFilter,
  setTypeFilter,
  isExporting,
  handleExportExcel,
  equipmentTypes,
  isOwner,
  isLoading,
  selectedFm,
  onSelectFm,
  onOpenNewFm,
  onOpenAINewFm,
  onOpenBulkImprove,
  onOpenReviewDisciplines,
  onOpenFindSimilar,
  onOpenFindDuplicateActions,
}) {
  return (
    <div
      className={`${
        selectedFm ? "w-1/2 lg:w-2/5" : "w-full"
      } transition-all duration-300 flex flex-col flex-1 h-full min-h-0 min-w-0`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-4">
        <div className="flex flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
          <div className="p-1.5 rounded-md bg-slate-100">
            <AlertTriangle className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <span className="text-lg font-bold text-slate-900">{displayedTotal}</span>
            <span className="text-xs text-slate-500 ml-1">
              {highSeverityOnly ? "High Severity FMs" : t("library.failureModes")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
          <div className="p-1.5 rounded-md bg-blue-50">
            <Filter className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <span className="text-lg font-bold text-blue-600">{totalCategories}</span>
            <span className="text-xs text-slate-500 ml-1">Disciplines</span>
          </div>
        </div>
        </div>
        <label
          className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors shrink-0"
          title={t("library.filterLinkedToEquipmentHint")}
        >
          <input
            type="checkbox"
            checked={filterLinkedToEquipment}
            onChange={(e) => setFilterLinkedToEquipment(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            data-testid="linked-to-equipment-toggle-fm"
          />
          <span className="text-slate-600 whitespace-nowrap">{t("library.filterLinkedToEquipment")}</span>
          {filterLinkedToEquipment && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              {linkedFailureModeCount}
            </span>
          )}
        </label>
      </div>

      <div className="mb-6 space-y-3" data-testid="filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] sm:min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder={t("library.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 w-full"
              data-testid="search-input"
            />
          </div>
          <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
            <SelectTrigger className="w-44 h-11" data-testid="category-filter">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder={t("disciplines.allDisciplines")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("disciplines.allDisciplines")}</SelectItem>
              {DISCIPLINES.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44 h-11" data-testid="type-filter">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-2">All Types</span>
              </SelectItem>
              <SelectItem value="generic">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Generic (Industry)
                </span>
              </SelectItem>
              <SelectItem value="customer_specific">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Customer Specific
                </span>
              </SelectItem>
              <SelectItem value="recently_added">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Recently Added (30 days)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => setHighSeverityOnly((v) => !v)}
            variant="outline"
            className={`h-11 ${
              highSeverityOnly
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
            data-testid="high-severity-toggle"
            title="Show only failure modes with severity ≥ 8 (high), sorted by severity then RPN"
            aria-pressed={highSeverityOnly}
          >
            <AlertTriangle className="w-4 h-4 mr-1" />
            High Severity
            {highSeverityOnly && (
              <span className="ml-1 text-xs font-semibold bg-red-100 text-red-700 px-1.5 rounded">
                {displayedFailureModes.length}
              </span>
            )}
          </Button>
        </div>
        <div className="flex flex-wrap items-start gap-2" data-testid="action-bar">
          <Button
            onClick={handleExportExcel}
            variant="outline"
            className="h-11"
            disabled={isExporting}
            data-testid="export-excel-btn"
          >
            <Download className="w-4 h-4 mr-1" />
            {isExporting ? t("common.exporting") || "Exporting..." : t("library.exportExcel") || "Export Excel"}
          </Button>
          {(canUseAITools || isOwner) && (
            <div className="flex flex-col gap-2 w-fit">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                  data-testid="ai-actions-menu-btn"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  AI
                  <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {canUseAITools && (
                  <>
                    <DropdownMenuItem
                      onClick={onOpenAINewFm}
                      disabled={equipmentTypes.length === 0}
                      className="cursor-pointer"
                      data-testid="ai-suggest-new-failure-modes-btn"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Suggest Failure Modes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onOpenBulkImprove}
                      disabled={displayedFailureModes.length === 0}
                      className="cursor-pointer"
                      data-testid="bulk-improve-fm-btn"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Bulk Improve ({displayedFailureModes.length})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onOpenReviewDisciplines}
                      disabled={failureModes.length === 0}
                      className="cursor-pointer"
                      data-testid="review-action-disciplines-btn"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Review Disciplines
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onOpenFindSimilar}
                      disabled={failureModes.length === 0}
                      className="cursor-pointer"
                      data-testid="find-similar-fm-btn"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Find Similar
                    </DropdownMenuItem>
                  </>
                )}
                {isOwner && (
                  <DropdownMenuItem
                    onClick={onOpenFindDuplicateActions}
                    disabled={failureModes.length === 0}
                    className="cursor-pointer text-amber-800 focus:text-amber-800"
                    data-testid="find-duplicate-actions-btn"
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Duplicate Actions
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {canUseAITools && (
              <Button
                type="button"
                onClick={() => setHideAIImproved((v) => !v)}
                variant="outline"
                className={`h-11 w-full justify-start ${
                  hideAIImproved
                    ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                data-testid="hide-ai-improved-toggle"
                title={`Hide failure modes already improved by AI (${aiImprovedCount} marked)`}
                aria-pressed={hideAIImproved}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Not improved yet
                {aiImprovedCount > 0 && (
                  <span
                    className={`ml-1 text-xs font-semibold px-1.5 rounded ${
                      hideAIImproved ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {aiImprovedCount} done
                  </span>
                )}
              </Button>
            )}
            </div>
          )}
          <Button
            onClick={onOpenNewFm}
            className="h-11 bg-blue-600 hover:bg-blue-700 ml-auto"
            data-testid="add-failure-mode-btn"
          >
            <Plus className="w-4 h-4 mr-1" /> {t("library.addFailureMode")}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="loading-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : displayedFailureModes.length === 0 ? (
          <div className="empty-state flex flex-1 items-center justify-center flex-col">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Info className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("library.noMatches")}</h3>
            <p className="text-slate-500">
              {hideAIImproved && failureModes.some((fm) => fm.ai_improved_at)
                ? "All visible failure modes have already been improved by AI. Toggle off to see them again."
                : highSeverityOnly
                ? "No failure modes with severity ≥ 8. Toggle off to see all."
                : t("library.tryAdjusting")}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-2" data-testid="failure-modes-list">
            {displayedFailureModes.map((fm, idx) => {
              const Icon = disciplineIcons[fm.discipline] || AlertTriangle;
              const colors = disciplineColors[fm.discipline] || "bg-slate-100 text-slate-700";
              const isSelected = selectedFm?.id === fm.id;

              return (
                <motion.div
                  key={fm.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  }`}
                  onClick={() => onSelectFm(fm)}
                  data-testid={`failure-mode-${fm.id}`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colors.split(" ")[0]}`}>
                    <Icon className={`w-5 h-5 ${colors.split(" ")[1]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge className={`${colors} text-xs px-1.5 py-0`}>
                        {t(`disciplines.${fm.discipline}`) !== `disciplines.${fm.discipline}`
                          ? t(`disciplines.${fm.discipline}`)
                          : fm.discipline}
                      </Badge>
                      {fm.failure_mode_type === "customer_specific" && (
                        <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                          {t("disciplines.Customer") !== "disciplines.Customer" ? t("disciplines.Customer") : "Customer"}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-medium text-slate-900 text-sm line-clamp-1">{fm.failure_mode}</h3>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                      {fm.equipment} • {fm.keywords?.slice(0, 2).join(", ")}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div
                      className={`w-12 h-10 rounded-lg flex flex-col items-center justify-center text-sm font-bold ${
                        fm.severity * fm.occurrence * fm.detectability >= 200
                          ? "bg-red-100 text-red-700"
                          : fm.severity * fm.occurrence * fm.detectability >= 125
                          ? "bg-orange-100 text-orange-700"
                          : fm.severity * fm.occurrence * fm.detectability >= 80
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      <span className="text-lg leading-tight">
                        {fm.severity * fm.occurrence * fm.detectability}
                      </span>
                      <span className="text-[9px] opacity-70">RPN</span>
                    </div>
                    {fm.is_validated ? (
                      <CheckCircle className="w-4 h-4 text-green-500" title={t("library.validated")} />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" title={t("library.notValidated")} />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
