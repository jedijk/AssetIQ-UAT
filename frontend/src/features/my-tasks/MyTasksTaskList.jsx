import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Zap,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Button } from "../../components/ui/button";
import { AdhocPlanCardContent, SortableAdhocPlanCard } from "./AdhocPlanCard";
import TaskCard, { SortableTaskCard } from "../../components/task-execution/TaskCard";

export function MyTasksTaskList({
  activeFilter,
  adhocPlansLoading,
  adhocPlans,
  sortedAdhocPlans,
  canUseDnD,
  sensors,
  handleDragEnd,
  tasksData,
  setSelectedTask,
  setViewMode,
  executeAdhocMutation,
  setActiveFilter,
  tasksLoading,
  tasksError,
  refetchTasks,
  sortedTasks,
  handleOpenTask,
  handleQuickComplete,
  handleDeleteTask,
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
      <div className="max-w-7xl mx-auto">
        <div className="space-y-3 pt-2">
        {activeFilter === "adhoc" ? (
          // Ad-hoc Plans View
          adhocPlansLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Loading ad-hoc plans...</p>
            </div>
          ) : adhocPlans.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <Zap className="w-12 h-12 mx-auto text-amber-400 mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No ad-hoc plans available</h3>
              <p className="text-slate-500 mb-4">Create ad-hoc task plans in the Task Planner</p>
              <Button variant="outline" onClick={() => setActiveFilter("open")}>
                View scheduled tasks
              </Button>
            </div>
          ) : canUseDnD ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={sortedAdhocPlans.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedAdhocPlans.map((plan) => (
                  <SortableAdhocPlanCard
                    key={plan.id}
                    plan={plan}
                    tasksData={tasksData}
                    setSelectedTask={setSelectedTask}
                    setViewMode={setViewMode}
                    executeAdhocMutation={executeAdhocMutation}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-3">
              {sortedAdhocPlans.map((plan) => (
                <AdhocPlanCardContent
                  key={plan.id}
                  plan={plan}
                  tasksData={tasksData}
                  setSelectedTask={setSelectedTask}
                  setViewMode={setViewMode}
                  executeAdhocMutation={executeAdhocMutation}
                  dragListeners={null}
                  isDragging={false}
                />
              ))}
            </div>
          )
        ) : (
          // Regular Tasks View
          tasksLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Loading tasks...</p>
            </div>
          ) : tasksError ? (
            <div className="text-center py-12 px-4">
              <AlertCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
              <p className="text-red-600 font-medium">Failed to load tasks</p>
              <p className="text-sm text-slate-500 mt-2 mb-4">Check your connection and try again.</p>
              <Button variant="outline" type="button" onClick={() => refetchTasks()}>
                Retry
              </Button>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No tasks for {activeFilter}</h3>
              <p className="text-slate-500 mb-4">You're all caught up!</p>
              <Button variant="outline" onClick={() => setActiveFilter("open")}>
                View open tasks
              </Button>
            </div>
          ) : canUseDnD ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={sortedTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedTasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onOpen={handleOpenTask}
                    onQuickComplete={handleQuickComplete}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={handleOpenTask}
                  onQuickComplete={handleQuickComplete}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>
          )
        )}
        </div>
      </div>
    </div>
  );
}
