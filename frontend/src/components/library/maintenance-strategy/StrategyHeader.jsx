import React from "react";
import { Sparkles, Loader2, Trash2, RefreshCw, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "../../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";

export default function StrategyHeader({
  equipmentTypeName,
  maintenanceStrategyLabel,
  hasStrategy,
  strategy,
  t,
  onRefresh,
  onSyncLibrary,
  syncPending,
  onDeleteStrategy,
  deletePending,
  onCreateStrategy,
  createPending,
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-900">
          <Wrench className="w-7 h-7 text-blue-600" />
          {equipmentTypeName}{" "}
          <span className="text-slate-400 font-normal">|</span> {maintenanceStrategyLabel}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {hasStrategy ? (
          <>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              {t("maintenance.refresh")}
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onSyncLibrary}
                    disabled={syncPending}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {syncPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    )}
                    {t("maintenance.syncLibrary")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Sync with library to add new failure modes and tasks.
                    <strong> Existing configurations will be preserved.</strong>
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  {t("maintenance.deleteStrategyBtn")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                    Delete Maintenance Strategy?
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>
                        This will permanently delete the maintenance strategy for{" "}
                        <strong>{equipmentTypeName}</strong>, including all{" "}
                        {strategy?.failure_mode_strategies?.length || 0} failure mode configurations
                        and {strategy?.task_templates?.length || 0} task templates.
                      </p>
                      {(strategy?.affected_equipment_count || 0) > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-amber-800">
                                This will impact {strategy?.affected_equipment_count} equipment items
                              </p>
                              <p className="text-sm text-amber-700 mt-1">
                                All equipment in the hierarchy using this equipment type will lose their
                                maintenance strategy and scheduled tasks will no longer be generated.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      <p className="text-red-600 font-medium">This action cannot be undone.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDeleteStrategy}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={deletePending}
                  >
                    {deletePending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete Strategy
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <Button size="sm" onClick={onCreateStrategy} disabled={createPending}>
            {createPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generate Strategy
          </Button>
        )}
      </div>
    </div>
  );
}
