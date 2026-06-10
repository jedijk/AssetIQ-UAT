import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Lightbulb,
  MessageCircle,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
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

export function FeedbackSnowflakeView({
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

          <div className="space-y-6">
            {/* Group items by status */}
            {Object.entries(
              feedbackItems.reduce((groups, item) => {
                const status = item.status || 'new';
                if (!groups[status]) groups[status] = [];
                groups[status].push(item);
                return groups;
              }, {})
            )
            .sort(([a], [b]) => {
              // Sort order: new, in_review, implemented, parked, rejected, resolved
              const order = ['new', 'in_review', 'implemented', 'parked', 'rejected', 'resolved', 'planned', 'wont_fix'];
              return order.indexOf(a) - order.indexOf(b);
            })
            .map(([status, items]) => {
              const statusCfg = statusConfig[status] || statusConfig.new;
              return (
                <div key={status} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Status Header */}
                  <div className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 bg-slate-50`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${statusCfg.color}`} />
                    <span className="text-sm font-medium text-slate-700">{statusCfg.label}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {items.length}
                    </Badge>
                  </div>
                  
                  {/* Items */}
                  <div className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const TypeIcon = ({ issue: AlertCircle, improvement: Lightbulb, general: MessageCircle })[item.type] || MessageCircle;
                      const isSelected = selectedIds.has(item.id);
                      
                      return (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-slate-50 transition-colors ${
                            isSelected ? "bg-purple-50/50" : ""
                          } ${!isSelectionMode ? 'cursor-pointer' : ''}`}
                          onClick={isSelectionMode 
                            ? (e) => toggleSelection(item.id, e) 
                            : () => openFeedbackDetail(item)
                          }
                          data-testid={`feedback-item-${item.id}`}
                        >
                          {isSelectionMode && (
                            <div className="mt-0.5 flex-shrink-0">
                              <Checkbox
                                checked={isSelected}
                                className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                              />
                            </div>
                          )}
                          
                          <div className={`mt-0.5 flex-shrink-0 ${typeColors[item.type]}`}>
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm text-slate-800 line-clamp-2">{item.message}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-xs text-slate-400">
                              {viewMode === 'all' && (
                                <>
                                  <span className="text-blue-600 font-medium">{item.user_name || "Unknown"}</span>
                                  <span>•</span>
                                </>
                              )}
                              <span>{formatRelativeTime(item.timestamp)}</span>
                            </div>
                          </div>
                          
                          {!isSelectionMode && (canWrite || canDelete || canViewAll) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 flex-shrink-0">
                                  <MoreVertical className="w-3.5 h-3.5" />
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
                                  <Pencil className="w-4 h-4 mr-2" />Edit
                                </DropdownMenuItem>
                                )}
                                {(canDelete || canViewAll) && (
                                <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(item.id, e); }} className="text-red-600">
                                  <Trash2 className="w-4 h-4 mr-2" />Delete
                                </DropdownMenuItem>
                                </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
  );
}
