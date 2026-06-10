import {
  Archive,
  Ban,
  CheckCircle2,
  CheckSquare,
  Clock,
  List,
  Loader2,
  Plus,
  Snowflake,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

export function FeedbackPageHeader({
  t,
  viewMode,
  setViewMode,
  canViewAll,
  allFeedbackItems,
  isSelectionMode,
  selectedIds,
  feedbackItems,
  bulkUpdateStatusMutation,
  toggleSelectAll,
  handleBulkStatusUpdate,
  handleGeneratePrompt,
  isGeneratingPrompt,
  cancelSelection,
  setIsSelectionMode,
  openNewFeedbackModal,
  statusFilter,
  setStatusFilter,
  timelineView,
  setTimelineView,
}) {
  return (
        <div className="mb-4 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-shrink-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
                {t("feedback.title") || "Feedback"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {viewMode === 'all' ? "All user submissions" : (t("feedback.subtitle") || "Your submissions")}
              </p>
            </div>
            
            {/* View Mode Toggle for admins/owners */}
            {canViewAll && (
              <div className="flex items-center gap-1 bg-slate-200 rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('my')}
                  className={`text-xs h-7 px-3 ${viewMode === 'my' ? 'bg-white shadow-sm text-slate-900 hover:bg-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                  data-testid="view-my-feedback-btn"
                >
                  My Feedback
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('all')}
                  className={`text-xs h-7 px-3 ${viewMode === 'all' ? 'bg-white shadow-sm text-slate-900 hover:bg-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                  data-testid="view-all-feedback-btn"
                >
                  All Feedback
                </Button>
              </div>
            )}
            
            {/* Action buttons - responsive layout */}
            {allFeedbackItems.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {isSelectionMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                      className="text-xs sm:text-sm"
                      data-testid="select-all-btn"
                    >
                      {selectedIds.size === feedbackItems.length ? (
                        <>
                          <Square className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Deselect All</span>
                          <span className="sm:hidden">Deselect</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Select All</span>
                          <span className="sm:hidden">Select</span>
                        </>
                      )}
                    </Button>
                    {/* Bulk Complete Button */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.size === 0 || bulkUpdateStatusMutation.isPending}
                          className="text-xs sm:text-sm text-green-600 hover:text-green-700 border-green-200"
                          data-testid="bulk-status-btn"
                        >
                          {bulkUpdateStatusMutation.isPending ? (
                            <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          )}
                          <span className="hidden sm:inline">Bulk Status</span>
                          <span className="sm:hidden">Status</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("implemented")} className="text-emerald-600">
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark as Implemented
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("resolved")} className="text-green-600">
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark as Resolved
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("in_review")} className="text-amber-600">
                          <Clock className="w-4 h-4 mr-2" />
                          Mark as In Review
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("parked")} className="text-orange-500">
                          <Archive className="w-4 h-4 mr-2" />
                          Mark as Parked
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("rejected")} className="text-red-600">
                          <Ban className="w-4 h-4 mr-2" />
                          Mark as Rejected
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      onClick={handleGeneratePrompt}
                      disabled={selectedIds.size === 0 || isGeneratingPrompt}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-xs sm:text-sm"
                      data-testid="generate-prompt-btn"
                    >
                      {isGeneratingPrompt ? (
                        <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      )}
                      <span className="hidden sm:inline">Generate Prompt</span>
                      <span className="sm:hidden">Generate</span>
                      <span className="ml-1">({selectedIds.size})</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelSelection}
                      data-testid="cancel-selection-btn"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSelectionMode(true)}
                      className="text-xs sm:text-sm"
                      data-testid="start-selection-btn"
                    >
                      <CheckSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Select
                    </Button>
                    <Button
                      onClick={openNewFeedbackModal}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm"
                      data-testid="add-feedback-btn"
                    >
                      <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{t("feedback.sendFeedback") || "Send feedback"}</span>
                      <span className="sm:hidden">New</span>
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Filters and View Controls Row */}
          {allFeedbackItems.length > 0 && !isSelectionMode && (
            <div className="flex items-center justify-between mt-4 gap-2">
              {/* Status Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 sm:w-40 h-8 text-xs sm:text-sm" data-testid="status-filter">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        New
                      </div>
                    </SelectItem>
                    <SelectItem value="in_review">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        In Review
                      </div>
                    </SelectItem>
                    <SelectItem value="implemented">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Implemented
                      </div>
                    </SelectItem>
                    <SelectItem value="parked">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                        Parked
                      </div>
                    </SelectItem>
                    <SelectItem value="rejected">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Rejected
                      </div>
                    </SelectItem>
                    <SelectItem value="resolved">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Resolved
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {statusFilter !== 'all' && (
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {feedbackItems.length} of {allFeedbackItems.length}
                  </span>
                )}
              </div>
              
              {/* Timeline View Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
                <button
                  onClick={() => setTimelineView('list')}
                  className={`p-1.5 rounded-md transition-colors ${
                    timelineView === 'list' 
                      ? 'bg-white shadow-sm text-slate-900' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title={t("tooltips.listView")}
                  data-testid="view-list-btn"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTimelineView('snowflake')}
                  className={`p-1.5 rounded-md transition-colors ${
                    timelineView === 'snowflake' 
                      ? 'bg-white shadow-sm text-blue-600' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title={t("tooltips.snowflakeView")}
                  data-testid="view-snowflake-btn"
                >
                  <Snowflake className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
  );
}
