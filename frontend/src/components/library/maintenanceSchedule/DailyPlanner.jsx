import React from "react";
import { AlertTriangle, Calendar, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { ScrollArea } from "../../ui/scroll-area";
import { useLanguage } from "../../../contexts/LanguageContext";
import { PlannerTaskMini } from "./PlannerTaskMini";

export function DailyPlanner({ data, onTaskClick }) {
  const { t } = useLanguage();
  if (!data) return null;
  const buckets = [
    {
      key: "overdue",
      title: t("maintenance.bucketOverdue"),
      color: "border-red-200 bg-red-50",
      titleColor: "text-red-700",
      icon: AlertTriangle,
      bucket: data.overdue,
    },
    {
      key: "today",
      title: t("maintenance.bucketToday"),
      color: "border-blue-200 bg-blue-50",
      titleColor: "text-blue-700",
      icon: Calendar,
      bucket: data.today,
    },
    {
      key: "tomorrow",
      title: t("maintenance.bucketTomorrow"),
      color: "border-slate-200 bg-white",
      titleColor: "text-slate-700",
      icon: ArrowRight,
      bucket: data.tomorrow,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="daily-planner-grid">
      {buckets.map(({ key, title, color, titleColor, icon: Icon, bucket }) => (
        <Card key={key} className={`${color}`}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 font-medium ${titleColor}`}>
                <Icon className="w-4 h-4" />
                {title}
              </div>
              <Badge variant="outline" className="text-xs">{bucket?.count || 0}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {(bucket?.tasks || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">{t("maintenance.noTasksInBucket")}</p>
                ) : (
                  bucket.tasks.map((task) => (
                    <PlannerTaskMini key={task.id} task={task} onClick={onTaskClick} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
