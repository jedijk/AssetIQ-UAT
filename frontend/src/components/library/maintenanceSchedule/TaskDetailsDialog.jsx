import React, { useState } from "react";
import {
  Wrench,
  Sparkles,
  CheckCircle,
  PauseCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { Textarea } from "../../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useTaskStatusConfig, usePriorityConfig } from "./constants";

export function TaskDetailsDialog({
  task,
  technicians,
  onClose,
  onUpdate,
  onComplete,
  onDefer,
  isUpdating,
  isCompleting,
  isDeferring,
}) {
  const { t } = useLanguage();
  const statusConfigMap = useTaskStatusConfig();
  const priorityConfigMap = usePriorityConfig();
  const [mode, setMode] = useState("view"); // view | complete | defer
  const [plannedDate, setPlannedDate] = useState(task?.planned_date || "");
  const [assignedId, setAssignedId] = useState(task?.assigned_technician_id || "");
  const [status, setStatus] = useState(task?.status || "scheduled");
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [notes, setNotes] = useState(task?.notes || "");
  const [actualHours, setActualHours] = useState(task?.estimated_hours || 1);
  const [findings, setFindings] = useState("");
  const [observations, setObservations] = useState("");
  const [failureObserved, setFailureObserved] = useState(false);
  const [deferDate, setDeferDate] = useState("");
  const [deferReason, setDeferReason] = useState("");

  if (!task) return null;

  const statusCfg = statusConfigMap[task.status] || statusConfigMap.draft;
  const priorityCfg = priorityConfigMap[task.priority] || priorityConfigMap.medium;

  const handleSave = () => {
    const data = {};
    if (plannedDate && plannedDate !== task.planned_date) data.planned_date = plannedDate;
    if (status && status !== task.status) data.status = status;
    if (priority && priority !== task.priority) data.priority = priority;
    if (notes !== (task.notes || "")) data.notes = notes;
    if (assignedId !== (task.assigned_technician_id || "")) {
      if (assignedId) {
        const tech = technicians.find((t) => t.id === assignedId);
        data.assigned_technician_id = assignedId;
        data.assigned_technician_name = tech?.name || null;
        if (!data.status) data.status = "assigned";
      } else {
        data.assigned_technician_id = "";
        data.assigned_technician_name = "";
      }
    }
    if (Object.keys(data).length === 0) {
      toast.info(t("maintenance.noChangesToSave"));
      return;
    }
    onUpdate(task.id, data);
  };

  const handleComplete = () => {
    if (!actualHours) {
      toast.error(t("maintenance.enterActualHours"));
      return;
    }
    onComplete(task.id, {
      actual_hours: parseFloat(actualHours),
      findings: findings || null,
      observations: observations || null,
      failure_observed: failureObserved,
    });
  };

  const handleDefer = () => {
    if (!deferDate || !deferReason) {
      toast.error(t("maintenance.pickDeferDateAndReason"));
      return;
    }
    onDefer(task.id, { new_due_date: deferDate, reason: deferReason });
  };

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="task-details-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-600" />
            {task.task_name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap pt-1">
            <Badge variant="outline" className="text-xs">{task.equipment_name}</Badge>
            {task.equipment_tag && (
              <Badge variant="outline" className="text-xs font-mono">{task.equipment_tag}</Badge>
            )}
            <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
            <Badge className={`text-xs ${priorityCfg.color}`}>{priorityCfg.label}</Badge>
            {task.is_overdue && <Badge className="text-xs bg-red-500 text-white">{t("maintenance.overdue")}</Badge>}
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-2 border-b">
          {[
            { key: "view", label: t("maintenance.tabDetails") },
            { key: "complete", label: t("maintenance.tabComplete") },
            { key: "defer", label: t("maintenance.tabDefer") },
          ].map((m) => (
            <button
              key={m.key}
              className={`px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors ${
                mode === m.key
                  ? "border-blue-500 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setMode(m.key)}
              data-testid={`task-mode-${m.key}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* View / Edit mode */}
        {mode === "view" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">{t("maintenance.dueDateLabel")}</Label>
                <div className="text-sm font-medium">{task.due_date}</div>
              </div>
              <div>
                <Label htmlFor="planned-date" className="text-xs text-slate-500">{t("maintenance.plannedDate")}</Label>
                <Input
                  id="planned-date"
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="task-planned-date"
                />
              </div>
              <div>
                <Label htmlFor="task-status" className="text-xs text-slate-500">{t("maintenance.statusLabel")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-sm" data-testid="task-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfigMap).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-priority" className="text-xs text-slate-500">{t("maintenance.priorityLabel")}</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-8 text-sm" data-testid="task-priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfigMap).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="task-tech" className="text-xs text-slate-500">{t("maintenance.assignedTechnician")}</Label>
                <Select value={assignedId || "__unassigned"} onValueChange={(v) => setAssignedId(v === "__unassigned" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm" data-testid="task-technician-select">
                    <SelectValue placeholder={t("maintenance.unassignedTechnician")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">{t("maintenance.unassignedTechnician")}</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.disciplines?.length ? `· ${t.disciplines.join(", ")}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">{t("maintenance.estimatedHours")}</Label>
                <div className="text-sm font-medium">{task.estimated_hours}h</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">{t("maintenance.taskType")}</Label>
                <div className="text-sm font-medium capitalize">{task.task_type}</div>
              </div>
            </div>

            {task.ai_reasoning && (
              <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-purple-700 mb-0.5">{t("maintenance.aiReasoning")}</div>
                    <p className="text-xs text-purple-800">{task.ai_reasoning}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="task-notes" className="text-xs text-slate-500">{t("maintenance.notesLabel")}</Label>
              <Textarea
                id="task-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
                placeholder={t("maintenance.addNotesPlaceholder")}
                data-testid="task-notes-input"
              />
            </div>
          </div>
        )}

        {/* Complete mode */}
        {mode === "complete" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="actual-hours" className="text-xs text-slate-500">{t("maintenance.actualHours")} *</Label>
                <Input
                  id="actual-hours"
                  type="number"
                  step="0.25"
                  value={actualHours}
                  onChange={(e) => setActualHours(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="task-actual-hours"
                />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <Switch
                  checked={failureObserved}
                  onCheckedChange={setFailureObserved}
                  data-testid="task-failure-observed"
                />
                <Label className="text-xs text-slate-700">{t("maintenance.failureObserved")}</Label>
              </div>
            </div>
            <div>
              <Label htmlFor="task-findings" className="text-xs text-slate-500">{t("maintenance.findings")}</Label>
              <Textarea
                id="task-findings"
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                rows={2}
                className="text-sm"
                placeholder={t("maintenance.whatWasFound")}
              />
            </div>
            <div>
              <Label htmlFor="task-observations" className="text-xs text-slate-500">{t("maintenance.observationsLabel")}</Label>
              <Textarea
                id="task-observations"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={2}
                className="text-sm"
                placeholder={t("maintenance.anyObservations")}
              />
            </div>
          </div>
        )}

        {/* Defer mode */}
        {mode === "defer" && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="defer-date" className="text-xs text-slate-500">{t("maintenance.newDueDate")} *</Label>
              <Input
                id="defer-date"
                type="date"
                value={deferDate}
                onChange={(e) => setDeferDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="task-defer-date"
              />
            </div>
            <div>
              <Label htmlFor="defer-reason" className="text-xs text-slate-500">{t("maintenance.reason")} *</Label>
              <Textarea
                id="defer-reason"
                value={deferReason}
                onChange={(e) => setDeferReason(e.target.value)}
                rows={2}
                className="text-sm"
                placeholder={t("maintenance.deferReasonPlaceholder")}
                data-testid="task-defer-reason"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
          {mode === "view" && (
            <Button onClick={handleSave} disabled={isUpdating} data-testid="task-save-btn">
              {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("maintenance.saveChangesBtn")}
            </Button>
          )}
          {mode === "complete" && (
            <Button
              onClick={handleComplete}
              disabled={isCompleting}
              className="bg-green-600 hover:bg-green-700"
              data-testid="task-complete-btn"
            >
              {isCompleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {t("common.markComplete")}
            </Button>
          )}
          {mode === "defer" && (
            <Button
              onClick={handleDefer}
              disabled={isDeferring}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="task-defer-btn"
            >
              {isDeferring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PauseCircle className="w-4 h-4 mr-2" />}
              {t("common.deferTask")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
