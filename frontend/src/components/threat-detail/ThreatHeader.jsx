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
      className="mb-4 sm:mb-6"
    >
      {/* Back button - smaller on mobile */}
      <Button
        variant="ghost"
        onClick={() => navigate("/threats")}
        className="mb-2 sm:mb-4 -ml-2 text-slate-500 hover:text-slate-700 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
        data-testid="back-to-threats-button"
      >
        <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
        Back
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          {/* Risk badge and rank - hidden criticality on mobile, show only essential info */}
          <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
            {/* Risk badge - smaller on mobile */}
            <div className="hidden sm:block">
              <RiskBadge level={threat.risk_level} size="lg" />
            </div>
            <div className="sm:hidden">
              <RiskBadge level={threat.risk_level} size="sm" />
            </div>
            <span className="text-slate-500 font-mono text-[10px] sm:text-sm" data-testid="threat-rank-display">
              #{threat.rank}/{threat.total_threats}
            </span>
          </div>
          
          {/* Title */}
          {isEditing ? (
            <Input
              value={editForm.title || ""}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="text-lg sm:text-2xl font-bold h-10 sm:h-12"
              data-testid="edit-threat-title"
            />
          ) : (
            <h1 className="text-base sm:text-2xl font-bold text-slate-900 leading-tight line-clamp-2 sm:line-clamp-none" data-testid="threat-title">
              {threat.title}
            </h1>
          )}
        </div>

        {/* Action buttons - compact on mobile */}
        <div className="flex items-center gap-1 sm:gap-2 mt-2 sm:mt-0 flex-shrink-0">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={cancelEditing}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                data-testid="cancel-edit-button"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Cancel</span>
              </Button>
              <Button
                onClick={saveChanges}
                disabled={updateMutation.isPending}
                className="bg-green-600 hover:bg-green-700 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                data-testid="save-edit-button"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin sm:mr-2" />
                ) : (
                  <Save className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">Save</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={startEditing}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                data-testid="edit-threat-button"
              >
                <Edit className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Edit</span>
              </Button>

              <Select
                value={threat.status}
                onValueChange={(value) => updateMutation.mutate({ status: value })}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger className="w-24 sm:w-36 h-8 sm:h-9 text-xs sm:text-sm" data-testid="status-select">
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
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 sm:h-9 sm:w-9" data-testid="delete-threat-button">
                    <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
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
