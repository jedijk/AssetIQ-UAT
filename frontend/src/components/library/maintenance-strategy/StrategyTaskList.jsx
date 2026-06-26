import React from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "../../ui/card";

export default function StrategyTaskList({
  filteredFMStrategies,
  searchQuery,
  expandedFMs,
  onToggleFM,
  onUpdateFMStrategy,
  onUpdateTask,
  onEditTask,
  taskTemplates,
  onViewInFMEA,
  onSyncNewVersion,
  syncingFmId,
  syncFmPending,
  strategyHighlight,
  libraryFmsById,
  FailureModeStrategyRow,
}) {
  if (filteredFMStrategies.length === 0) {
    return (
      <Card className="p-8 text-center" data-testid="strategy-task-list-empty">
        <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          {searchQuery ? "No failure modes match your search" : "No failure modes defined"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2" data-testid="strategy-task-list">
      {filteredFMStrategies.map((fm) => (
        <FailureModeStrategyRow
          key={fm.failure_mode_id}
          fmStrategy={fm}
          isExpanded={expandedFMs.has(fm.failure_mode_id)}
          onToggle={() => onToggleFM(fm.failure_mode_id)}
          onUpdate={(updates) => onUpdateFMStrategy(fm.failure_mode_id, updates)}
          onUpdateTask={onUpdateTask}
          onEditTask={onEditTask}
          taskTemplates={taskTemplates}
          onViewInFMEA={onViewInFMEA}
          onSyncNewVersion={() => onSyncNewVersion(fm.failure_mode_id)}
          isSyncingFm={syncingFmId === fm.failure_mode_id && syncFmPending}
          highlightedTask={
            strategyHighlight &&
            (!strategyHighlight.failureModeId ||
              strategyHighlight.failureModeId === fm.failure_mode_id)
              ? { taskName: strategyHighlight.taskName }
              : null
          }
          libraryFmsById={libraryFmsById}
        />
      ))}
    </div>
  );
}
