import { motion } from "framer-motion";
import {
  CheckSquare,
  Plus,
  Edit,
  Trash2,
  User,
  Calendar,
  MessageSquare,
  CheckCircle,
  ClipboardList,
  ShieldCheck,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export function InvestigationActionsTab({
  actionItems,
  centralActions,
  isLocked,
  actionPriorities,
  actionStatuses,
  formatDate,
  isActionInPlan,
  onAddAction,
  onEditAction,
  onDeleteAction,
  onUpdateActionStatus,
  onPromoteToPlan,
  promotePending,
  onEditPlanAction,
  onDeletePlanAction,
  onValidatePlanAction,
  onUnvalidatePlanAction,
  deletePlanPending,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Corrective Actions</h2>
          <p className="text-sm text-slate-500">Track actions to prevent recurrence</p>
        </div>
        <Button
          onClick={onAddAction}
          className="h-11 bg-blue-600 hover:bg-blue-700"
          data-testid="add-action-btn"
          disabled={isLocked}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Action
        </Button>
      </div>

      {actionItems.length === 0 ? (
        <div className="empty-state py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckSquare className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium mb-1">No actions defined</h3>
          <p className="text-sm text-slate-500">Add corrective actions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {actionItems.map((action, idx) => {
            const priority = actionPriorities.find((p) => p.value === action.priority);
            const isOverdue =
              action.due_date &&
              new Date(action.due_date) < new Date() &&
              action.status !== "completed";
            const alreadyInPlan = isActionInPlan(action);

            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`rounded-xl border p-4 group hover:shadow-md transition-all ${
                  alreadyInPlan
                    ? "bg-green-50 border-green-200"
                    : isOverdue
                      ? "border-red-200 bg-red-50/30"
                      : "bg-white border-slate-200"
                }`}
                data-testid={`action-item-${action.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        priority?.bgClass?.split(" ")[0] || "bg-slate-100"
                      }`}
                    >
                      <CheckSquare
                        className={`w-6 h-6 ${
                          priority?.bgClass?.split(" ")[1] || "text-slate-600"
                        }`}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {action.action_number}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 mb-2 leading-relaxed">
                      {action.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          priority?.bgClass || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {priority?.label || action.priority}
                      </span>
                      {action.action_type && (
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-bold text-white ${
                            action.action_type === "CM"
                              ? "bg-amber-500"
                              : action.action_type === "PM"
                                ? "bg-blue-500"
                                : action.action_type === "PDM"
                                  ? "bg-purple-500"
                                  : "bg-slate-500"
                          }`}
                        >
                          {action.action_type}
                        </span>
                      )}
                      {action.discipline && (
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-700">
                          {action.discipline}
                        </span>
                      )}
                      <Select
                        value={action.status}
                        onValueChange={(v) => onUpdateActionStatus(action.id, v)}
                      >
                        <SelectTrigger
                          className={`h-7 w-28 text-xs border-0 ${
                            action.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : action.status === "in_progress"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {actionStatuses.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isOverdue && (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                          Overdue
                        </span>
                      )}
                      {alreadyInPlan && (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                          <CheckCircle className="w-3 h-3" />
                          In Action Plan
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      {action.owner && (
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" />
                          <span className="font-medium text-slate-700">{action.owner}</span>
                        </span>
                      )}
                      {action.due_date && (
                        <span
                          className={`flex items-center gap-1.5 ${
                            isOverdue ? "text-red-600" : ""
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span className={isOverdue ? "font-medium" : ""}>
                            {formatDate(action.due_date)}
                          </span>
                        </span>
                      )}
                      {action.comment && (
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Comment
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {alreadyInPlan ? (
                      <Badge className="bg-green-100 text-green-700 border-green-300 text-xs px-2 py-1">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Added
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => onPromoteToPlan(action)}
                        disabled={promotePending}
                        title="Add to action plan"
                        data-testid={`promote-action-${action.id}`}
                      >
                        <ClipboardList className="w-4 h-4 mr-1" />
                        Act
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-700"
                      onClick={() => onEditAction(action)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => onDeleteAction(action.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {centralActions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 bg-white rounded-xl border border-slate-200 p-4"
          data-testid="investigation-action-plan-section"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-900">Action Plan</h3>
              <Badge variant="secondary" className="text-xs">
                {centralActions.length}
              </Badge>
              {centralActions.filter((a) => a.is_validated).length > 0 && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {centralActions.filter((a) => a.is_validated).length} validated
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.href = "/actions";
              }}
              className="text-blue-600 hover:text-blue-700 h-7 text-xs px-2"
            >
              View All
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {centralActions.map((action, index) => {
              const statusCfg = {
                open: { bg: "bg-slate-50", color: "text-slate-600", label: "Open" },
                in_progress: { bg: "bg-blue-50", color: "text-blue-600", label: "In Progress" },
                completed: { bg: "bg-green-50", color: "text-green-600", label: "Completed" },
                closed: { bg: "bg-slate-100", color: "text-slate-500", label: "Closed" },
              }[action.status] || {
                bg: "bg-slate-50",
                color: "text-slate-600",
                label: action.status,
              };
              const actionNumber = index + 1;

              return (
                <div
                  key={action.id}
                  className={`flex flex-col gap-2 p-3 rounded-lg border transition-all sm:flex-row sm:items-start sm:gap-3 ${
                    action.is_validated
                      ? "bg-green-50 border-green-200"
                      : `${statusCfg.bg} border-slate-200 hover:shadow-sm`
                  }`}
                  data-testid={`inv-action-plan-item-${action.id}`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex-shrink-0">
                      {action.action_type ? (
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs relative ${
                            action.action_type === "CM"
                              ? "bg-amber-500"
                              : action.action_type === "PM"
                                ? "bg-blue-500"
                                : action.action_type === "PDM"
                                  ? "bg-purple-500"
                                  : "bg-slate-500"
                          }`}
                        >
                          {action.action_type}
                          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center shadow">
                            {actionNumber}
                          </span>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm">
                          {actionNumber}
                        </div>
                      )}
                    </div>

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        window.location.href = `/actions/${action.id}`;
                      }}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        {action.action_number && (
                          <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {action.action_number}
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.bg} ${statusCfg.color}`}
                        >
                          {statusCfg.label}
                        </span>
                        {action.discipline && (
                          <span className="text-[10px] text-slate-400">{action.discipline}</span>
                        )}
                        {action.is_validated && (
                          <Badge className="shrink-0 bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5">
                            <ShieldCheck className="w-3 h-3 mr-0.5" />
                            Validated
                          </Badge>
                        )}
                        {action.priority && (
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] ${
                              action.priority === "high" || action.priority === "critical"
                                ? "border-red-300 text-red-600"
                                : action.priority === "medium"
                                  ? "border-amber-300 text-amber-600"
                                  : "border-slate-300 text-slate-600"
                            }`}
                          >
                            {action.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 leading-snug line-clamp-2">
                        {action.title}
                      </p>
                      {action.is_validated && action.validated_by_name && (
                        <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          {action.validated_by_name} ({action.validated_by_position})
                        </p>
                      )}
                      {action.assignee && !action.is_validated && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Owner: {action.assignee}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2 pl-11 sm:w-auto sm:flex-shrink-0 sm:flex-col sm:items-end sm:gap-1 sm:border-t-0 sm:pt-0 sm:pl-0">
                    {action.due_date && (
                      <p className="shrink-0 text-[10px] text-slate-500">
                        Due: {formatDate(action.due_date)}
                      </p>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditPlanAction(action);
                        }}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        title="Edit action"
                        data-testid={`inv-edit-action-${action.id}`}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePlanAction(action.id);
                        }}
                        disabled={deletePlanPending}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete action"
                        data-testid={`inv-delete-action-${action.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    {!action.is_validated ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onValidatePlanAction(action);
                        }}
                        className="h-6 text-[10px] px-2 text-green-600 border-green-200 hover:bg-green-50 mt-1"
                        data-testid={`inv-validate-action-${action.id}`}
                      >
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Validate
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnvalidatePlanAction(action.id);
                        }}
                        className="h-6 text-[10px] px-2 text-slate-400 hover:text-red-500 mt-1"
                        title="Remove validation"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
