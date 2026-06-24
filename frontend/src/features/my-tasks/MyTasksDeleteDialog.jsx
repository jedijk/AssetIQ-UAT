import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Loader2, Trash2 } from "lucide-react";

export function MyTasksDeleteDialog({ deleteTaskData, deleteMutation, setDeleteTaskData }) {
  return (
    <Dialog open={!!deleteTaskData} onOpenChange={(open) => !open && setDeleteTaskData(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            Delete {deleteTaskData?.source_type === "action" ? "Action" : "Task"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            <span className="block">Are you sure you want to delete this item?</span>
            <span className="block mt-2 font-medium text-slate-700 line-clamp-2 break-words">
              &quot;{deleteTaskData?.title}&quot;
            </span>
            <span className="block mt-2 text-xs text-slate-500">This cannot be undone.</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => setDeleteTaskData(null)}
            disabled={deleteMutation.isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              deleteMutation.mutate({
                taskId: deleteTaskData?.id,
                isAction: deleteTaskData?.source_type === "action",
              })
            }
            disabled={deleteMutation.isPending}
            className="w-full sm:w-auto"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
