import React from "react";

export function FormsDeleteConfirmDialog(props) {
  return (
    <>
            <DialogTitle>{t("common.delete")} {t("forms.templates")}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{showDeleteConfirm?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTemplateMutation.mutate(showDeleteConfirm.id)}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? t("taskScheduler.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Template Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={(open) => { 
        // Don't close if document viewer is open
    </>
  );
}
