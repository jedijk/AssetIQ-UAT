import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Trash2,
  Edit,
  Save,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import RiskBadge from "../RiskBadge";

const STATUS_OPTIONS = ["Open", "In Progress", "Parked", "Mitigated", "Closed", "Canceled"];

export const ThreatHeader = ({
  threat,
  isEditing,
  editForm,
  setEditForm,
  startEditing,
  cancelEditing,
  saveChanges,
  updateMutation,
  deleteMutation,
  headerRef,
}) => {
  const navigate = useNavigate();

  return (
    <motion.div
      ref={headerRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <Button
        variant="ghost"
        onClick={() => navigate("/threats")}
        className="mb-4 -ml-2 text-slate-500 hover:text-slate-700"
        data-testid="back-to-threats-button"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Threats
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <RiskBadge level={threat.risk_level} size="lg" />
            <span className="text-slate-500 font-mono text-sm" data-testid="threat-rank-display">
              Rank #{threat.rank} of {threat.total_threats}
            </span>
          </div>
          {isEditing ? (
            <Input
              value={editForm.title || ""}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="text-2xl font-bold h-12"
              data-testid="edit-threat-title"
            />
          ) : (
            <h1 className="text-2xl font-bold text-slate-900" data-testid="threat-title">
              {threat.title}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={cancelEditing}
                data-testid="cancel-edit-button"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={saveChanges}
                disabled={updateMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                data-testid="save-edit-button"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={startEditing}
                data-testid="edit-threat-button"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>

              <Select
                value={threat.status}
                onValueChange={(value) => updateMutation.mutate({ status: value })}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger className="w-36" data-testid="status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" data-testid="delete-threat-button">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Threat</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this threat? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                      data-testid="confirm-delete-button"
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Delete"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ThreatHeader;
