import { motion } from "framer-motion";
import {
  CheckCircle2, Clock, AlertCircle, Search, Calendar, User, Briefcase,
  MoreVertical, Edit2, Trash2, Target, FileText, GitBranch, CheckCircle, Brain,
  ExternalLink, AlertTriangle, Eye, MessageSquare, Paperclip, Repeat, ChevronDown, Check,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { getDisciplineColor } from "../../../constants/disciplines";
import { Skeleton } from "../../../components/ui/skeleton";
import { VirtualList } from "../../../components/ui/VirtualList";
import {
  statusConfig, priorityConfig, sourceConfig, actionSourceLabel,
} from "../actionsPageConstants";

export function ActionsListSection({
  isLoading,
  sortedActions,
  isMobile,
  isIOSLike,
  navigate,
  t,
  canWrite,
  canDelete,
  quickStatusUpdate,
  openEditDialog,
  onRequestDelete,
  isOverdue,
  formatDate,
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="max-w-7xl mx-auto">
          {isLoading ? (
        <div className="py-6 space-y-3" data-testid="actions-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-80 rounded" />
                  <Skeleton className="h-3 w-[28rem] rounded" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedActions.length === 0 ? (
        <div className="empty-state py-16" data-testid="no-actions-message">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("actionsPage.noActions")}</h3>
          <p className="text-slate-500">
            Click "Act" on threat recommendations or investigation actions to track them here.
          </p>
        </div>
      ) : (
        <div className="priority-list" data-testid="actions-list">
          {isMobile && !isIOSLike ? (
            <VirtualList
              className="h-[calc(100vh-220px)]"
              data={sortedActions}
              itemContent={(idx, action) => {
                const StatusIcon = statusConfig[action.status]?.icon || Clock;
                const SourceIcon = sourceConfig[action.source_type]?.icon || FileText;
                const priority = priorityConfig[action.priority] || priorityConfig.medium;
                const overdue = isOverdue(action);
                const isCompleted = action.status === "completed";
                const isClosed = action.status === "closed";

                return (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.01 }}
                    className={`group cursor-pointer p-3 sm:p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all duration-200 relative ${
                      overdue ? "border-l-4 border-l-red-400" : 
                      isCompleted ? "border-l-4 border-l-green-500 bg-green-50/30" :
                      isClosed ? "border-l-4 border-l-slate-400 bg-slate-50/50" : ""
                    }`}
                    data-testid={`action-row-${action.id}`}
                    onClick={() => navigate(`/actions/${action.id}`, { state: { breadcrumbOrigin: '/actions' } })}
                  >
                    {(isCompleted || isClosed) && (
                      <div className="sm:hidden absolute top-2 right-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          isCompleted 
                            ? "bg-green-100 text-green-700" 
                            : "bg-slate-200 text-slate-600"
                        }`}>
                          {isCompleted ? "✓" : "—"} {isCompleted ? "Completed" : "Closed"}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_auto_1fr_4rem_4rem_auto] items-center gap-2 sm:gap-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = action.status === "open" ? "in_progress" : 
                            action.status === "in_progress" ? "completed" : "open";
                          quickStatusUpdate(action, nextStatus);
                        }}
                        className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${priority.iconBg}`}
                        title={`Status: ${statusConfig[action.status]?.label}. Click to change.`}
                      >
                        <StatusIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${priority.iconColor}`} />
                      </button>

                      <div
                        className="hidden sm:flex items-center justify-center px-2 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-500 min-w-[60px]"
                        data-testid={`action-number-${action.id}`}
                      >
                        {action.action_number}
                      </div>

                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                          <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2 sm:line-clamp-1">
                            {action.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${priority.color}`}>
                            {priority.label}
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <SourceIcon className="w-3.5 h-3.5" />
                            {sourceConfig[action.source_type]?.label || "Action"}
                          </span>
                        </div>
                      </div>

                      <ChevronDown className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors sm:hidden" />
                      <ChevronDown className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors hidden sm:block" />
                    </div>
                  </motion.div>
                );
              }}
            />
          ) : (
          sortedActions.map((action, idx) => {
            const StatusIcon = statusConfig[action.status]?.icon || Clock;
            const SourceIcon = sourceConfig[action.source_type]?.icon || FileText;
            const priority = priorityConfig[action.priority] || priorityConfig.medium;
            const overdue = isOverdue(action);
            const isCompleted = action.status === "completed";
            const isClosed = action.status === "closed";

            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`group cursor-pointer p-3 sm:p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all duration-200 relative ${
                  overdue ? "border-l-4 border-l-red-400" : 
                  isCompleted ? "border-l-4 border-l-green-500 bg-green-50/30" :
                  isClosed ? "border-l-4 border-l-slate-400 bg-slate-50/50" : ""
                }`}
                data-testid={`action-row-${action.id}`}
                onClick={() => navigate(`/actions/${action.id}`, { state: { breadcrumbOrigin: '/actions' } })}
              >
                {/* Mobile Status Indicator - Only visible on mobile for Completed/Closed */}
                {(isCompleted || isClosed) && (
                  <div className="sm:hidden absolute top-2 right-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      isCompleted 
                        ? "bg-green-100 text-green-700" 
                        : "bg-slate-200 text-slate-600"
                    }`}>
                      {isCompleted ? "✓" : "—"} {isCompleted ? "Completed" : "Closed"}
                    </span>
                  </div>
                )}
                
                {/* Grid layout for perfect column alignment - Score and RPN as separate fixed columns */}
                <div className="grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_auto_1fr_4rem_4rem_auto] items-center gap-2 sm:gap-4">
                  {/* Status Icon */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextStatus = action.status === "open" ? "in_progress" : 
                        action.status === "in_progress" ? "completed" : "open";
                      quickStatusUpdate(action, nextStatus);
                    }}
                    className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${priority.iconBg}`}
                    title={`Status: ${statusConfig[action.status]?.label}. Click to change.`}
                  >
                    <StatusIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${priority.iconColor}`} />
                  </button>

                  {/* Action Number Badge - Hidden on mobile */}
                  <div 
                    className="hidden sm:flex items-center justify-center px-2 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-500 min-w-[60px]" 
                    data-testid={`action-number-${action.id}`}
                  >
                    {action.action_number}
                  </div>

                  {/* Content - Takes remaining space but doesn't push columns */}
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                      <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2 sm:line-clamp-1">
                        {action.title}
                      </h3>
                    </div>
                    {/* Equipment Tag */}
                    {action.equipment_tag && (
                      <div className="text-xs text-slate-400 font-mono mb-0.5">{action.equipment_tag}</div>
                    )}
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      {/* Priority Badge - Always show */}
                      <Badge className={`${priority.color} text-[10px] sm:text-xs px-1.5 py-0`}>
                        {priority.label}
                      </Badge>
                      {/* Action Type Badge - Hidden on mobile */}
                      {action.action_type && (
                        <Badge className={`hidden sm:inline-flex text-xs ${
                          action.action_type === 'PM' ? 'bg-blue-100 text-blue-700' :
                          action.action_type === 'CM' ? 'bg-amber-100 text-amber-700' :
                          action.action_type === 'PDM' ? 'bg-purple-100 text-purple-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {action.action_type}
                        </Badge>
                      )}
                      {/* Discipline Badge - Hidden on mobile */}
                      {action.discipline && (
                        <Badge className="hidden sm:inline-flex bg-slate-100 text-slate-600 text-xs">
                          {action.discipline}
                        </Badge>
                      )}
                      {overdue && (
                        <Badge className="bg-red-100 text-red-700 text-[10px] sm:text-xs px-1.5 py-0">{t("taskScheduler.overdue")}</Badge>
                      )}
                      {/* Attachment indicator */}
                      {action.attachments?.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-slate-400" title={`${action.attachments.length} attachment(s)`}>
                          <Paperclip className="w-3 h-3" />
                          <span className="text-[10px]">{action.attachments.length}</span>
                        </span>
                      )}
                    </div>
                    {/* Source info - Simplified on mobile */}
                    <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                      {actionSourceLabel(action)}
                    </div>
                  </div>

                  {/* Score & RPN - Stacked on mobile (single grid cell), separate columns on desktop */}
                  {/* Mobile: stacked view */}
                  <div className="sm:hidden flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-medium">{t("observations.riskScore")}</span>
                      <span className={`text-sm font-bold tabular-nums ${
                        action.threat_risk_score >= 70 ? "text-red-600" :
                        action.threat_risk_score >= 50 ? "text-orange-500" :
                        action.threat_risk_score >= 30 ? "text-yellow-500" :
                        action.threat_risk_score ? "text-green-500" : "text-slate-300"
                      }`}>
                        {action.threat_risk_score ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-medium">RPN</span>
                      <span className={`text-sm font-bold tabular-nums ${
                        action.threat_rpn >= 200 ? "text-red-600" :
                        action.threat_rpn >= 100 ? "text-orange-500" :
                        action.threat_rpn ? "text-blue-500" : "text-slate-300"
                      }`}>
                        {action.threat_rpn ?? "—"}
                      </span>
                    </div>
                  </div>
                  {/* Desktop: Score column */}
                  <div className="hidden sm:flex flex-col items-end w-16">
                    <span className="text-xs text-slate-400 font-medium">{t("observations.riskScore")}</span>
                    <span className={`text-lg font-bold tabular-nums ${
                      action.threat_risk_score >= 70 ? "text-red-600" :
                      action.threat_risk_score >= 50 ? "text-orange-500" :
                      action.threat_risk_score >= 30 ? "text-yellow-500" :
                      action.threat_risk_score ? "text-green-500" : "text-slate-300"
                    }`}>
                      {action.threat_risk_score ?? "—"}
                    </span>
                  </div>
                  {/* Desktop: RPN column */}
                  <div className="hidden sm:flex flex-col items-end w-16">
                    <span className="text-xs text-slate-400 font-medium">RPN</span>
                    <span className={`text-lg font-bold tabular-nums ${
                      action.threat_rpn >= 200 ? "text-red-600" :
                      action.threat_rpn >= 100 ? "text-orange-500" :
                      action.threat_rpn ? "text-blue-500" : "text-slate-300"
                    }`}>
                      {action.threat_rpn ?? "—"}
                    </span>
                  </div>

                  {/* Right side - Due date & Status - Hidden on mobile except status */}
                  <div className="flex items-center gap-1.5 sm:gap-3">
                  {/* Due date - Hidden on mobile */}
                  <div className="hidden sm:block text-right">
                    <div className={`text-xs sm:text-sm font-medium ${overdue ? "text-red-600" : "text-slate-700"}`}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {formatDate(action.due_date)}
                    </div>
                  </div>
                  
                  {/* Status Badge - Hidden on mobile */}
                  <Badge className={`hidden sm:inline-flex ${
                    action.status === "completed" ? "bg-green-100 text-green-700" :
                    action.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-700"
                  }`}>
                    {statusConfig[action.status]?.label || "Open"}
                  </Badge>
                  
                  {/* Actions menu - Always visible on mobile */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(action);
                      }}>
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      {canDelete && (
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestDelete(action);
                        }}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </div>{/* Close grid */}
              </motion.div>
            );
          })
          )}
        </div>
      )}
      </div>
    </div>
  );
}
