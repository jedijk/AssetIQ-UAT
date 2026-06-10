import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Lightbulb,
  MessageCircle,
  MoreVertical,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { formatRelativeTime, statusConfig, typeColors } from "./feedbackShared";

export function FeedbackListView({
  t,
  feedbackItems,
  viewMode,
  selectedIds,
  isSelectionMode,
  canViewAll,
  canWrite,
  canDelete,
  openFeedbackDetail,
  toggleSelection,
  handleQuickStatusChange,
  handleEdit,
  handleDelete,
}) {
  return (

          <div className="space-y-2 sm:space-y-3">
            {feedbackItems.map((item) => {
              const TypeIcon = ({ issue: AlertCircle, improvement: Lightbulb, general: MessageCircle })[item.type] || MessageCircle;
              const statusCfg = statusConfig[item.status] || statusConfig.new;
              const isSelected = selectedIds.has(item.id);
              
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-lg sm:rounded-xl border p-3 sm:p-4 transition-all duration-150 ${
                    isSelected 
                      ? "border-purple-400 bg-purple-50/50" 
                      : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  } ${!isSelectionMode ? 'cursor-pointer active:bg-slate-50' : ''}`}
                  data-testid={`feedback-item-${item.id}`}
                  onClick={!isSelectionMode ? () => openFeedbackDetail(item) : (e) => toggleSelection(item.id, e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && (!isSelectionMode ? openFeedbackDetail(item) : toggleSelection(item.id, e))}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    {/* Checkbox in selection mode */}
                    {isSelectionMode && (
                      <div 
                        className="mt-0.5 flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); toggleSelection(item.id, e); }}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                        />
                      </div>
                    )}
                    
                    {/* Type Icon */}
                    <div className={`mt-0.5 flex-shrink-0 ${typeColors[item.type]}`}>
                      <TypeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 line-clamp-2 text-xs sm:text-sm">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 flex-wrap">
                        {/* Status indicator */}
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${statusCfg.color}`} />
                          <span className="text-[10px] sm:text-xs text-slate-500">{statusCfg.label}</span>
                        </div>
                        {/* Submitted by - only show in All Feedback view */}
                        {viewMode === 'all' && (
                          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-600 font-medium">
                            <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            <span className="truncate max-w-[100px] sm:max-w-none">{item.user_name || "Unknown"}</span>
                          </div>
                        )}
                        {/* Timestamp */}
                        <span className="text-[10px] sm:text-xs text-slate-400">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Actions Menu - hide in selection mode */}
                    {!isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 sm:h-8 sm:w-8 text-slate-400 hover:text-slate-600 flex-shrink-0"
                            data-testid={`feedback-menu-${item.id}`}
                          >
                            <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* Quick status changes for owner/admin/manager */}
                          {canViewAll && (
                            <>
                              <DropdownMenuItem 
                                onClick={(e) => handleQuickStatusChange(item.id, 'in_review', e)}
                                className="text-amber-600"
                              >
                                <Clock className="w-4 h-4 mr-2" />
                                Mark In Review
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => handleQuickStatusChange(item.id, 'implemented', e)}
                                className="text-emerald-600"
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Mark Implemented
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {canWrite && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(item, e); }}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {t("common.edit") || "Edit"}
                          </DropdownMenuItem>
                          )}
                          {(canDelete || canViewAll) && (
                          <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id, e); }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("common.delete") || "Delete"}
                          </DropdownMenuItem>
                          </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
  );
}
