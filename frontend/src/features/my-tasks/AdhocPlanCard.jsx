import { format, parseISO } from "date-fns";
import { GripVertical, Zap, MapPin, FileText, Play, Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { useEquipmentNodeNameMap, useEquipmentTypeNameMap } from "../../hooks/useTranslatedEntities";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Shared ad-hoc plan body — drag handle omitted when `dragListeners` is null (mobile / no DnD). */
const AdhocPlanCardContent = ({
  plan,
  tasksData,
  setSelectedTask,
  setViewMode,
  executeAdhocMutation,
  dragListeners,
  isDragging,
}) => {
  const nodeNameMap = useEquipmentNodeNameMap();
  const typeNameMap = useEquipmentTypeNameMap();
  const translateEqName = (n) => {
    if (!n) return n;
    const k = String(n).trim().toLowerCase();
    return nodeNameMap[k] || typeNameMap[k] || n;
  };
  return (
  <div
    className={cn(
      "bg-white rounded-lg border border-amber-200 p-4 hover:shadow-md transition-all",
      isDragging && "shadow-lg ring-2 ring-amber-400 opacity-90"
    )}
    data-testid={`adhoc-plan-${plan.id}`}
  >
        <div className="flex items-start justify-between gap-3">
          {dragListeners ? (
          <div
            {...dragListeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 -ml-1 mr-1 mt-1 touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-5 h-5" />
          </div>
          ) : null}
          
          <div className="flex-1 min-w-0">
            {/* Title */}
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 flex-shrink-0 text-amber-500" />
              <h3 className="font-medium text-slate-900 truncate">{plan.title}</h3>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Ad-hoc
              </Badge>
            </div>
            
            {/* Equipment */}
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate">{translateEqName(plan.equipment_name)}</span>
            </div>
            
            {/* Tags Row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {plan.discipline && (
                <Badge variant="outline" className="text-xs bg-slate-50">
                  {plan.discipline}
                </Badge>
              )}
              {plan.has_form && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  <FileText className="w-3 h-3 mr-1" />
                  Form
                </Badge>
              )}
              {plan.execution_count > 0 && (
                <span className="text-xs text-slate-400">
                  Executed {plan.execution_count}x
                </span>
              )}
            </div>
          </div>
          
          {/* Right Side - Execute/Continue Button */}
          <div className="flex flex-col items-end gap-2">
            {plan.has_in_progress_task ? (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-600 hover:bg-amber-50"
                onClick={() => {
                  const task = tasksData?.tasks?.find(t => t.id === plan.in_progress_task_id);
                  if (task) {
                    setSelectedTask(task);
                    setViewMode("execution");
                  } else {
                    executeAdhocMutation.mutate(plan.id);
                  }
                }}
                data-testid={`continue-adhoc-${plan.id}`}
              >
                <Play className="w-4 h-4 mr-1" />
                Continue
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => executeAdhocMutation.mutate(plan.id)}
                disabled={executeAdhocMutation.isPending}
                data-testid={`execute-adhoc-${plan.id}`}
              >
                {executeAdhocMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Execute
                  </>
                )}
              </Button>
            )}
            {plan.last_executed_at && (
              <span className="text-xs text-slate-400">
                Last: {format(parseISO(plan.last_executed_at), "MMM d")}
              </span>
            )}
          </div>
        </div>
  </div>
  );
};

const SortableAdhocPlanCard = ({ plan, tasksData, setSelectedTask, setViewMode, executeAdhocMutation }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <AdhocPlanCardContent
        plan={plan}
        tasksData={tasksData}
        setSelectedTask={setSelectedTask}
        setViewMode={setViewMode}
        executeAdhocMutation={executeAdhocMutation}
        dragListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  );
};

export { AdhocPlanCardContent, SortableAdhocPlanCard };
