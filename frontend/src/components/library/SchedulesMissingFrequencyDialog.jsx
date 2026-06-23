/**
 * Drill-down dialog for Intelligence Thread "Schedules Missing Frequency" insight.
 */
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { intelligenceMapAPI } from "../../lib/apis/intelligenceMap";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";

const PAGE_SIZE = 100;

function formatSource(source) {
  if (!source) return "—";
  return source.replace(/_/g, " ");
}

function formatStatus(status) {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

export default function SchedulesMissingFrequencyDialog({
  open,
  onOpenChange,
  filters = {},
  totalCount = 0,
}) {
  const filterKey = useMemo(
    () => [
      filters.plantId ?? "all",
      filters.systemId ?? "all",
      filters.equipmentTypeId ?? "all",
      filters.equipmentId ?? "all",
    ],
    [filters.plantId, filters.systemId, filters.equipmentTypeId, filters.equipmentId]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["intelligence-map-schedules-missing-frequency", ...filterKey],
    queryFn: () =>
      intelligenceMapAPI.getSchedulesMissingFrequency({
        plantId: filters.plantId,
        systemId: filters.systemId,
        equipmentTypeId: filters.equipmentTypeId,
        equipmentId: filters.equipmentId,
        limit: PAGE_SIZE,
        skip: 0,
      }),
    enabled: open,
    staleTime: 30_000,
  });

  const tasks = data?.tasks || [];
  const total = data?.total ?? totalCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="schedules-missing-frequency-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Schedules Missing Frequency
          </DialogTitle>
          <DialogDescription>
            Scheduled tasks without a defined maintenance frequency.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{total.toLocaleString()}</span>{" "}
          schedule{total === 1 ? "" : "s"} missing frequency
          {tasks.length > 0 && total > tasks.length && (
            <span className="text-slate-400">
              {" "}
              · showing first {tasks.length.toLocaleString()}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : isError ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-red-600">Unable to load schedules missing frequency.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No schedules missing frequency for the current filters.
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-3 py-2">Task</th>
                  <th className="text-left font-medium text-slate-600 px-3 py-2">Equipment</th>
                  <th className="text-left font-medium text-slate-600 px-3 py-2">Status</th>
                  <th className="text-left font-medium text-slate-600 px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                    data-testid={`missing-freq-task-${task.id}`}
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{task.task_name || "—"}</div>
                      {task.due_date && (
                        <div className="text-[10px] text-slate-400 mt-0.5">Due {task.due_date}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <div>{task.equipment_tag || task.equipment_name || "—"}</div>
                      {task.equipment_tag && task.equipment_name && (
                        <div className="text-[10px] text-slate-400">{task.equipment_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {formatStatus(task.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-600 capitalize">
                      {formatSource(task.task_source)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}

        {isFetching && !isLoading && (
          <div className="text-[10px] text-slate-400 text-right">Refreshing…</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
