import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";

export function ActionsClosureDialog({ suggestion, onClose }) {
  const navigate = useNavigate();

  return (
    <Dialog open={!!suggestion} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5 text-green-500" />
            All Actions Completed!
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-800">
                {suggestion?.total_actions} action{suggestion?.total_actions !== 1 ? "s" : ""} completed
              </p>
              <p className="text-sm text-green-600">{suggestion?.source_name}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            {suggestion?.message
              || `All corrective actions for this ${suggestion?.source_type === "threat" ? "observation" : "investigation"} have been completed.`}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Later
          </Button>
          <Button
            onClick={() => {
              const sourceType = suggestion?.source_type;
              const sourceId = suggestion?.source_id;
              onClose();
              if (!sourceId) {
                toast.error("Source ID missing, cannot navigate");
                return;
              }
              if (sourceType === "threat") {
                navigate(`/threats/${sourceId}`);
              } else if (sourceType === "investigation") {
                navigate(`/causal-engine?inv=${sourceId}`);
              }
            }}
            className="bg-green-600 hover:bg-green-700"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Go to {suggestion?.source_type === "threat" ? "Observation" : "Investigation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
