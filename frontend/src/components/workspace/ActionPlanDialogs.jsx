import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDisciplines } from "../../hooks/useDisciplines";
import { actionsAPI } from "../../lib/api";
import { getActionStatusLabel, normalizeActionType } from "./actionPlanUtils";

const EditActionForm = ({ fullAction, onSubmit, onCancel, isSaving }) => {
  const { t } = useLanguage();
  const { disciplines, normalize } = useDisciplines();
  const [form, setForm] = useState(() => ({
    title: fullAction?.title || "",
    description: fullAction?.description || "",
    action_type: normalizeActionType(fullAction?.action_type),
    discipline: fullAction?.discipline || "",
    status: fullAction?.status || "open",
    due_date: fullAction?.due_date ? String(fullAction.due_date).split("T")[0] : "",
    comments: fullAction?.comments || "",
  }));

  const disciplineValue = normalize(form.discipline) || form.discipline || "";

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = () => {
    onSubmit({
      title: form.title,
      description: form.description,
      action_type: form.action_type,
      discipline: normalize(form.discipline) || form.discipline || null,
      status: form.status,
      due_date: form.due_date || null,
      comments: form.comments || null,
    });
  };

  return (
    <>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-title">{t("observationWorkspace.titleLabel")}</Label>
          <Input
            id="edit-title"
            value={form.title}
            onChange={(e) => handleChange("title", e.target.value)}
            data-testid="edit-action-title"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="edit-desc">{t("observationWorkspace.descriptionLabel")}</Label>
          <Textarea
            id="edit-desc"
            rows={3}
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            data-testid="edit-action-description"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{t("observationWorkspace.typeLabel")}</Label>
            <Select value={form.action_type} onValueChange={(v) => handleChange("action_type", v)}>
              <SelectTrigger data-testid="edit-action-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CM">{t("observationWorkspace.actionTypeCM")}</SelectItem>
                <SelectItem value="PM">{t("observationWorkspace.actionTypePM")}</SelectItem>
                <SelectItem value="PDM">{t("observationWorkspace.actionTypePDM")}</SelectItem>
                <SelectItem value="OP">{t("observationWorkspace.actionTypeOP")}</SelectItem>
                <SelectItem value="LEARN">{t("observationWorkspace.actionTypeLEARN")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>{t("observationWorkspace.disciplineLabel")}</Label>
            <Select value={disciplineValue || "none"} onValueChange={(v) => handleChange("discipline", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="edit-action-discipline"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("observationWorkspace.noneDiscipline")}</SelectItem>
                {disciplines.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{t("observationWorkspace.status")}</Label>
            <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
              <SelectTrigger data-testid="edit-action-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{getActionStatusLabel(t, "open")}</SelectItem>
                <SelectItem value="planned">{getActionStatusLabel(t, "planned")}</SelectItem>
                <SelectItem value="in_progress">{getActionStatusLabel(t, "in_progress")}</SelectItem>
                <SelectItem value="completed">{getActionStatusLabel(t, "completed")}</SelectItem>
                <SelectItem value="validated">{getActionStatusLabel(t, "validated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-due">{t("observationWorkspace.dueDateLabel")}</Label>
            <Input
              id="edit-due"
              type="date"
              value={form.due_date}
              onChange={(e) => handleChange("due_date", e.target.value)}
              data-testid="edit-action-due-date"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="edit-comments">{t("observationWorkspace.comments")}</Label>
          <Textarea
            id="edit-comments"
            rows={2}
            value={form.comments}
            onChange={(e) => handleChange("comments", e.target.value)}
            data-testid="edit-action-comments"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving} data-testid="edit-action-cancel">{t("common.cancel")}</Button>
        <Button onClick={handleSubmit} disabled={isSaving || !form.title.trim()} data-testid="edit-action-save">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {t("common.saveChanges")}
        </Button>
      </DialogFooter>
    </>
  );
};

/**
 * Edit Action Dialog — popup that allows editing of all action fields.
 * Fetches the full action by ID when opened so every field is populated
 * from the source of truth (the action document itself).
 */
const EditActionDialog = ({ action, open, onClose, onSave, isSaving }) => {
  const { t } = useLanguage();
  // Fetch full action data from the action itself (single source of truth)
  const { data: fullAction, isLoading } = useQuery({
    queryKey: ["action-detail", action?.id],
    queryFn: () => actionsAPI.getById(action.id),
    enabled: !!(open && action?.id),
    staleTime: 30 * 1000,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="edit-action-dialog">
        <DialogHeader>
          <DialogTitle>{t("observationWorkspace.editActionTitle")}</DialogTitle>
          <DialogDescription>
            {t("observationWorkspace.editActionDescription", {
              actionNumber: fullAction?.action_number || action?.action_number || t("observationWorkspace.thisAction"),
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading && !fullAction ? (
          <div className="py-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("observationWorkspace.loadingAction")}
          </div>
        ) : (
          <EditActionForm
            key={fullAction?.id || action?.id || "edit"}
            fullAction={fullAction || action || {}}
            onSubmit={onSave}
            onCancel={onClose}
            isSaving={isSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Delete Action Confirmation Dialog
 */
const DeleteActionDialog = ({ action, open, onClose, onConfirm, isDeleting }) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="delete-action-dialog">
        <DialogHeader>
          <DialogTitle>{t("observationWorkspace.deleteActionTitle")}</DialogTitle>
          <DialogDescription>
            {action ? (
              t("observationWorkspace.deleteActionDescription", {
                title: action.title,
                actionNumber: action.action_number ? ` (${action.action_number})` : "",
              })
            ) : t("observationWorkspace.deleteActionRemovedOnly")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isDeleting} data-testid="delete-action-cancel">{t("common.cancel")}</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="delete-action-confirm"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Add Action Dialog — manual creation of a new action on the observation's plan.
 * Supports the same action_type list (CM/PM/PDM/OP/LEARN), letting users add
 * "Learning" actions such as updating the PM plan.
 */
const AddActionDialog = ({ open, onClose, onCreate, isCreating }) => {
  const { t } = useLanguage();
  const { disciplines, normalize } = useDisciplines();
  const [form, setForm] = useState({
    title: "",
    description: "",
    action_type: "CM",
    discipline: "",
    status: "open",
    due_date: "",
    comments: "",
  });

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const reset = () => setForm({
    title: "", description: "", action_type: "CM", discipline: "",
    status: "open", due_date: "", comments: "",
  });

  const handleSubmit = async () => {
    await onCreate({
      title: form.title,
      description: form.description,
      action_type: form.action_type,
      discipline: normalize(form.discipline) || form.discipline || null,
      status: form.status,
      due_date: form.due_date || null,
      comments: form.comments || null,
    });
    reset();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="add-action-dialog">
        <DialogHeader>
          <DialogTitle>{t("observationWorkspace.addActionTitle")}</DialogTitle>
          <DialogDescription>
            {t("observationWorkspace.addActionDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="add-title">{t("observationWorkspace.titleLabel")}</Label>
            <Input
              id="add-title"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder={t("observationWorkspace.addActionPlaceholder")}
              data-testid="add-action-title"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="add-desc">{t("observationWorkspace.descriptionLabel")}</Label>
            <Textarea
              id="add-desc"
              rows={3}
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              data-testid="add-action-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("observationWorkspace.typeLabel")}</Label>
              <Select value={form.action_type} onValueChange={(v) => handleChange("action_type", v)}>
                <SelectTrigger data-testid="add-action-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CM">{t("observationWorkspace.actionTypeCM")}</SelectItem>
                  <SelectItem value="PM">{t("observationWorkspace.actionTypePM")}</SelectItem>
                  <SelectItem value="PDM">{t("observationWorkspace.actionTypePDM")}</SelectItem>
                  <SelectItem value="OP">{t("observationWorkspace.actionTypeOP")}</SelectItem>
                  <SelectItem value="LEARN">{t("observationWorkspace.actionTypeLEARN")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>{t("observationWorkspace.disciplineLabel")}</Label>
              <Select value={form.discipline || "none"} onValueChange={(v) => handleChange("discipline", v === "none" ? "" : v)}>
                <SelectTrigger data-testid="add-action-discipline"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("observationWorkspace.noneDiscipline")}</SelectItem>
                  {disciplines.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("observationWorkspace.status")}</Label>
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger data-testid="add-action-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{getActionStatusLabel(t, "open")}</SelectItem>
                  <SelectItem value="planned">{getActionStatusLabel(t, "planned")}</SelectItem>
                  <SelectItem value="in_progress">{getActionStatusLabel(t, "in_progress")}</SelectItem>
                  <SelectItem value="completed">{getActionStatusLabel(t, "completed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="add-due">{t("observationWorkspace.dueDateLabel")}</Label>
              <Input
                id="add-due"
                type="date"
                value={form.due_date}
                onChange={(e) => handleChange("due_date", e.target.value)}
                data-testid="add-action-due-date"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="add-comments">{t("observationWorkspace.comments")}</Label>
            <Textarea
              id="add-comments"
              rows={2}
              value={form.comments}
              onChange={(e) => handleChange("comments", e.target.value)}
              data-testid="add-action-comments"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isCreating} data-testid="add-action-cancel">{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isCreating || !form.title.trim()} data-testid="add-action-submit">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {t("observationWorkspace.addToPlanButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { EditActionDialog, DeleteActionDialog, AddActionDialog };
