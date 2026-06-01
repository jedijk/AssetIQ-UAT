import React from "react";
import { Card, CardContent, CardHeader } from "../../ui/card";

export function FourteenDayGrid({ buckets, totalTasks }) {
  return (
  <div className="space-y-2">
    <div className="text-xs text-slate-500" data-testid="planner-summary-14">
      {totalTasks} task{totalTasks === 1 ? "" : "s"} scheduled in the next 14 days
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
      {buckets.map((b) => {
        const util = b.capacityHours > 0 ? Math.min(100, (b.hours / b.capacityHours) * 100) : 0;
        const isOver = b.hours > b.capacityHours && b.capacityHours > 0;
        return (
          <Card key={b.key} className="overflow-hidden">
            <CardHeader className="py-1.5 px-2 bg-slate-50">
              <div className="text-[10px] text-slate-500 truncate">{b.label}</div>
            </CardHeader>
            <CardContent className="p-2">
              <div className="text-xs font-semibold mb-1">
                {b.hours.toFixed(1)}h
                {b.capacityHours > 0 && <span className="text-slate-400 font-normal">/{b.capacityHours}h</span>}
              </div>
              {b.capacityHours > 0 && (
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full ${isOver ? "bg-red-500" : util > 80 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${util}%` }}
                  />
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                {b.tasks.length} task{b.tasks.length === 1 ? "" : "s"}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
  );
}
