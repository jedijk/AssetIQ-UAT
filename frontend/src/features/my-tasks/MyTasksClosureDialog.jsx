import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { CheckCircle2 } from "lucide-react";

export function MyTasksClosureDialog({ closureSuggestion, setClosureSuggestion, navigate }) {
  return (
    <Dialog open={!!closureSuggestion} onOpenChange={() => setClosureSuggestion(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            All Actions Completed
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="flex items-center gap-3 mb-3 p-3 bg-green-50 rounded-lg">
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                {closureSuggestion?.total_actions} action
                {closureSuggestion?.total_actions !== 1 ? "s" : ""} completed
              </p>
              <p className="text-xs text-green-600 mt-1">{closureSuggestion?.source_name}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            {closureSuggestion?.message ||
              `All corrective actions for this ${
                closureSuggestion?.source_type === "threat" ? "observation" : "investigation"
              } have been completed.`}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setClosureSuggestion(null)}>
            Dismiss
          </Button>
          <Button
            onClick={() => {
              const sourceType = closureSuggestion?.source_type;
              const sourceId = closureSuggestion?.source_id;
              setClosureSuggestion(null);
              if (sourceType === "threat") {
                navigate(`/threats/${sourceId}`);
              } else if (sourceType === "investigation") {
                navigate(`/causal-engine?investigation=${sourceId}`);
              }
            }}
          >
            Go to {closureSuggestion?.source_type === "threat" ? "Observation" : "Investigation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
