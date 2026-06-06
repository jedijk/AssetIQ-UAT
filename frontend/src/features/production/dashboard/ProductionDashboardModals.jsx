import React from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { FormExecutionDialog } from "./productionDashboardShared";
import { productionAPI } from "../../../lib/api";
import { toast } from "sonner";
export function ProductionDashboardModals({
  showAddEvent, setShowAddEvent, newEvent, setNewEvent, createEventMutation, fromStr,
  editEntry, setEditEntry, updateSubmissionMutation, invalidateDashboard,
  editBigBag, setEditBigBag, formExec, setFormExec, queryClient,
  deleteConfirm, setDeleteConfirm, deleteSubmissionMutation
}) {
  return (
    <>
      {/* ── Machine Settings Analysis removed ── */}
      <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
        <DialogContent className="max-w-md" data-testid="add-event-dialog">
          <DialogHeader>
            <DialogTitle>Add Production Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={newEvent.type} onValueChange={(v) => setNewEvent({ ...newEvent, type: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="event-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Action</SelectItem>
                  <SelectItem value="insight">Insight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Severity</Label>
              <Select value={newEvent.severity} onValueChange={(v) => setNewEvent({ ...newEvent, severity: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="event-severity-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                className="h-9 mt-1"
                placeholder="e.g. Sheet breaking + downtime"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                data-testid="event-title-input"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                className="mt-1"
                placeholder="Details..."
                rows={3}
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                data-testid="event-description-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddEvent(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newEvent.title || createEventMutation.isPending}
                onClick={() =>
                  createEventMutation.mutate({
                    ...newEvent,
                    date: fromStr,
                    time: new Date().toTimeString().slice(0, 5),
                  })
                }
                data-testid="submit-event-btn"
              >
                {createEventMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Log Entry Dialog ── */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-hidden flex flex-col" data-testid="edit-entry-dialog">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editEntry?._viscosity_only ? `Edit Viscosity — ${editEntry?.time}` : `Edit Log Entry — ${editEntry?.time}`}</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <>
              <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-2">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Viscosity at the top for mobile visibility */}
                  <div className="col-span-2">
                    <Label className="text-xs font-semibold text-blue-700">Viscosity (MU)</Label>
                    <Input
                      type="number"
                      step="any"
                      className="h-10 mt-1 tabular-nums border-blue-200 focus:border-blue-400"
                      placeholder={editEntry._viscosity_submission_id ? "" : "No viscosity sample at this time"}
                      value={editEntry.viscosity ?? ""}
                      onChange={(e) => setEditEntry((prev) => ({ ...prev, viscosity: e.target.value }))}
                      data-testid="edit-viscosity"
                    />
                  </div>
                  {!editEntry._viscosity_only && [
                    { key: "rpm", label: "RPM" },
                    { key: "feed", label: "Feed" },
                    { key: "moisture", label: "M%" },
                    { key: "energy", label: "Energy" },
                    { key: "mt1", label: "MT1" },
                    { key: "mt2", label: "MT2" },
                    { key: "mt3", label: "MT3" },
                    { key: "mp1", label: "MP1" },
                    { key: "mp2", label: "MP2" },
                    { key: "mp3", label: "MP3" },
                    { key: "mp4", label: "MP4" },
                    { key: "co2_feed_p", label: "CO2 Feed/P" },
                    { key: "t_product_ir", label: "T Product IR" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        step="any"
                        className="h-9 mt-1 tabular-nums"
                        value={editEntry[key] ?? ""}
                        onChange={(e) => setEditEntry((prev) => ({ ...prev, [key]: e.target.value }))}
                        data-testid={`edit-${key}`}
                      />
                    </div>
                  ))}
                  {!editEntry._viscosity_only && (
                  <div className="col-span-2">
                    <Label className="text-xs">Remarks</Label>
                    <Input
                      className="h-9 mt-1"
                      value={editEntry.remarks ?? ""}
                      onChange={(e) => setEditEntry((prev) => ({ ...prev, remarks: e.target.value }))}
                      data-testid="edit-remarks"
                    />
                  </div>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 flex justify-end gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setEditEntry(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateSubmissionMutation.isPending}
                  onClick={async () => {
                    const refresh = () => {
                      invalidateDashboard();
                      setEditEntry(null);
                      toast.success("Entry updated");
                    };

                    // Viscosity-only row: only update viscosity
                    if (editEntry._viscosity_only) {
                      if (editEntry._viscosity_submission_id && editEntry.viscosity !== "") {
                        productionAPI.updateSubmission(editEntry._viscosity_submission_id, { Measurement: editEntry.viscosity }).then(refresh).catch(() => toast.error("Failed to update viscosity"));
                      } else {
                        toast.error("No viscosity submission to update");
                      }
                      return;
                    }

                    // Regular row: update extruder submission
                    const fieldMap = {
                      rpm: "RPM", feed: "FEED", moisture: "M%", energy: "ENERGY",
                      mt1: "MT1", mt2: "MT2", mt3: "MT3",
                      mp1: "MP1", mp2: "MP2", mp3: "MP3", mp4: "MP4",
                      co2_feed_p: "CO2 Feed/P", t_product_ir: "T Product IR",
                      remarks: "Remarks",
                    };
                    const values = {};
                    Object.entries(fieldMap).forEach(([k, fieldLabel]) => {
                      if (editEntry[k] !== undefined && editEntry[k] !== "") {
                        values[fieldLabel] = editEntry[k];
                      }
                    });

                    if (editEntry.submission_id) {
                      productionAPI.updateSubmission(editEntry.submission_id, values).then(refresh).catch(() => toast.error("Failed to update extruder entry"));
                    }

                    // Update viscosity - either through viscosity submission, production_log, or create new
                    if (editEntry.viscosity !== "" && editEntry.viscosity !== undefined) {
                      if (editEntry._viscosity_submission_id) {
                        // Has separate viscosity form submission - update it
                        productionAPI.updateSubmission(editEntry._viscosity_submission_id, { Measurement: editEntry.viscosity }).then(refresh).catch(() => toast.error("Failed to update viscosity"));
                      } else if (editEntry.datetime) {
                        // No viscosity submission - create a new one with matching datetime
                        productionAPI.createViscositySubmission(editEntry.datetime, editEntry.viscosity)
                          .then(() => {
                            refresh();
                            toast.success("Viscosity sample created");
                          })
                          .catch((err) => {
                            console.error("Failed to create viscosity:", err);
                            toast.error("Failed to create viscosity sample");
                          });
                      } else if (editEntry.submission_id) {
                        // Fallback: try updating production_log directly
                        productionAPI.updateSubmission(editEntry.submission_id, { mooney_viscosity: editEntry.viscosity }).then(refresh).catch(() => toast.error("Failed to update viscosity"));
                      }
                    }
                  }}
                  data-testid="save-edit-btn"
                >
                  {updateSubmissionMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Big Bag Dialog ── */}
      <Dialog open={!!editBigBag} onOpenChange={(open) => { if (!open) setEditBigBag(null); }}>
        <DialogContent className="max-w-md" data-testid="edit-bigbag-dialog">
          <DialogHeader>
            <DialogTitle>Edit Input Material</DialogTitle>
          </DialogHeader>
          {editBigBag && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { key: "material", label: "Input Material" },
                { key: "supplier", label: "Supplier" },
                { key: "bag_no", label: "Bag No." },
                { key: "lot_no", label: "Lot No." },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    className="h-9 mt-1"
                    value={editBigBag[key] ?? ""}
                    onChange={(e) => setEditBigBag((prev) => ({ ...prev, [key]: e.target.value }))}
                    data-testid={`edit-bag-${key}`}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <Label className="text-xs">Production Date</Label>
                <Input
                  type="date"
                  className="h-9 mt-1"
                  value={editBigBag.production_date ?? ""}
                  onChange={(e) => setEditBigBag((prev) => ({ ...prev, production_date: e.target.value }))}
                  data-testid="edit-bag-production_date"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditBigBag(null)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={updateSubmissionMutation.isPending}
                  onClick={() => {
                    const values = {
                      "Input material": editBigBag.material,
                      "Supplier": editBigBag.supplier,
                      "Bag No.": editBigBag.bag_no,
                      "Lot No.": editBigBag.lot_no,
                      "Production Date": editBigBag.production_date,
                    };
                    updateSubmissionMutation.mutate({ id: editBigBag.submission_id, values });
                    setEditBigBag(null);
                  }}
                  data-testid="save-bag-edit-btn"
                >
                  {updateSubmissionMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Form Execution Dialog ── */}
      <FormExecutionDialog
        open={!!formExec}
        onClose={() => setFormExec(null)}
        templateId={formExec?.templateId}
        templateName={formExec?.templateName || ""}
        equipmentId={formExec?.equipmentId || ""}
        submissionId={formExec?.submissionId}
        initialValues={formExec?.initialValues}
                onSuccess={() => {
          // Invalidate and refetch the production dashboard data
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === "production-dashboard"
          });
          queryClient.refetchQueries({
            predicate: (query) => query.queryKey[0] === "production-dashboard"
          });
        }}
      />

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !deleteSubmissionMutation.isPending) setDeleteConfirm(null); }}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the {deleteConfirm?.label || "entry"}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel-btn" disabled={deleteSubmissionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              data-testid="delete-confirm-btn"
              disabled={deleteSubmissionMutation.isPending}
              onClick={() => {
                const ids = deleteConfirm?.ids || [];
                ids.forEach((id) => deleteSubmissionMutation.mutate(id));
                setDeleteConfirm(null);
              }}
            >
              {deleteSubmissionMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
