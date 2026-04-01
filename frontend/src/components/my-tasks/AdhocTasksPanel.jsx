/**
 * AdhocTasksPanel Component
 * Displays and manages ad-hoc task plans
 */
import { useState } from "react";
import { Timer, Play, Loader2, ChevronRight, ChevronDown, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export const AdhocTasksPanel = ({ 
  plans = [], 
  isLoading,
  onExecute,
  isExecuting,
  t 
}) => {
  const [expandedPlan, setExpandedPlan] = useState(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-8">
        <Timer className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">{t?.("tasks.noAdhocPlans") || "No ad-hoc plans available"}</p>
        <p className="text-sm text-slate-400 mt-1">
          {t?.("tasks.adhocPlanHint") || "Create ad-hoc plans in the Task Scheduler"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="adhoc-plans-list">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
          data-testid={`adhoc-plan-${plan.id}`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
            onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Timer className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{plan.title || plan.task_template_name}</h3>
                <p className="text-sm text-slate-500">{plan.equipment_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {plan.execution_count > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {plan.execution_count}x
                </Badge>
              )}
              {expandedPlan === plan.id ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </div>

          {/* Expanded content */}
          {expandedPlan === plan.id && (
            <div className="px-4 pb-4 pt-0 border-t border-slate-100">
              {plan.description && (
                <p className="text-sm text-slate-600 mb-3">{plan.description}</p>
              )}
              
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {plan.form_template_name && (
                    <span>Form: {plan.form_template_name}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecute(plan.id);
                  }}
                  disabled={isExecuting}
                >
                  {isExecuting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {t?.("tasks.execute") || "Execute"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default AdhocTasksPanel;
