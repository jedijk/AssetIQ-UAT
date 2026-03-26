import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export const CompleteDialog = ({
  open,
  onOpenChange,
  selectedInstance,
  completeForm,
  setCompleteForm,
  onSubmit,
  isPending,
}) => {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("taskScheduler.completeExecution")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600">
            {t("taskScheduler.completing")}: <strong>{selectedInstance?.task_template_name}</strong>
          </p>
          <div>
            <Label>{t("taskScheduler.completionNotes")}</Label>
            <Textarea
              value={completeForm.notes}
              onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
              placeholder={t("taskScheduler.anyObservations")}
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="needsFollowUp"
              checked={completeForm.needs_follow_up}
              onChange={(e) => setCompleteForm({ ...completeForm, needs_follow_up: e.target.checked })}
              className="rounded border-slate-300"
            />
            <Label htmlFor="needsFollowUp" className="text-sm font-normal cursor-pointer">
              {t("taskScheduler.needsFollowUp")}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button 
            onClick={onSubmit}
            disabled={isPending}
          >
            {isPending ? t("taskScheduler.completing") + "..." : t("taskScheduler.markComplete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DeleteExecutionDialog = ({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}) => {
  const { t } = useLanguage();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("taskScheduler.deleteExecution")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("taskScheduler.deleteExecutionConfirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
            disabled={isPending}
          >
            {isPending ? t("taskScheduler.deleting") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
