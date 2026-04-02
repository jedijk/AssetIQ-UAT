import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Trash2,
  Edit,
  Save,
  X,
  Loader2,
  MoreVertical,
  Share2,
  ChevronDown,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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
import { toast } from "sonner";

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

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/threats/${threat.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: threat.title,
          text: `Observation: ${threat.title}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard");
      }
    }
  };

  return (
    <motion.div
      ref={headerRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 sm:mb-6"
    >
      {/* Mobile Header - Compact single row */}
      <div className="sm:hidden">
        {/* Back button row */}
        <Button
          variant="ghost"
          onClick={() => navigate("/threats")}
          className="mb-2 -ml-2 text-slate-500 hover:text-slate-700 text-xs h-7 px-2"
          data-testid="back-to-threats-button"
        >
          <ArrowLeft className="w-3 h-3 mr-1" />
          Back
        </Button>

        {/* Title and actions row */}
        <div className="flex items-start gap-2">
          {/* Title section - takes most space */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="text-sm font-bold h-8"
                data-testid="edit-threat-title"
              />
            ) : (
              <h1 className="text-sm font-bold text-slate-900 leading-tight line-clamp-2 pr-1" data-testid="threat-title">
                {threat.title}
              </h1>
            )}
            
            {/* Risk Score and RPN row */}
            {!isEditing && (
              <div className="flex items-center gap-2 mt-1.5">
                <RiskBadge level={threat.risk_level} size="sm" />
                <span className="text-[10px] font-medium text-slate-500">
                  Score: {threat.risk_score || 0}
                </span>
                {threat.rpn && (
                  <span className="text-[10px] font-medium text-slate-500">
                    RPN: {threat.rpn}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons - compact */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={cancelEditing}
                  className="h-8 w-8"
                  data-testid="cancel-edit-button"
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={saveChanges}
                  disabled={updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 h-8 w-8"
                  data-testid="save-edit-button"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </Button>
              </>
            ) : (
              <>
                {/* Status dropdown - minimal arrow only */}
                <Select
                  value={threat.status}
                  onValueChange={(value) => updateMutation.mutate({ status: value })}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="h-8 w-auto px-2 text-xs border-slate-200 gap-1" data-testid="status-select-mobile">
                    <span className={`truncate max-w-[60px] ${
                      threat.status === "Open" ? "text-blue-600" :
                      threat.status === "In Progress" ? "text-amber-600" :
                      threat.status === "Mitigated" ? "text-green-600" :
                      threat.status === "Closed" ? "text-slate-500" :
                      "text-slate-700"
                    }`}>
                      {threat.status}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 3-dot menu for Edit, Share, Delete */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="mobile-actions-menu">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={startEditing} data-testid="mobile-edit-button">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShare} data-testid="mobile-share-button">
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          className="text-red-600 focus:text-red-600"
                          onSelect={(e) => e.preventDefault()}
                          data-testid="mobile-delete-button"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Observation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this observation? This action cannot be undone.
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Header - Full layout */}
      <div className="hidden sm:block">
        <Button
          variant="ghost"
          onClick={() => navigate("/threats")}
          className="mb-4 -ml-2 text-slate-500 hover:text-slate-700"
          data-testid="back-to-threats-button-desktop"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Observations
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <RiskBadge level={threat.risk_level} size="lg" />
              <span className="text-slate-500 font-mono text-sm" data-testid="threat-rank-display">
                Rank #{threat.rank} of {threat.total_threats}
              </span>
              {threat.risk_score && (
                <span className="text-sm text-slate-500">
                  Score: <span className="font-semibold">{threat.risk_score}</span>
                </span>
              )}
              {threat.rpn && (
                <span className="text-sm text-slate-500">
                  RPN: <span className="font-semibold">{threat.rpn}</span>
                </span>
              )}
            </div>
            {isEditing ? (
              <Input
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="text-2xl font-bold h-12"
                data-testid="edit-threat-title-desktop"
              />
            ) : (
              <h1 className="text-2xl font-bold text-slate-900" data-testid="threat-title-desktop">
                {threat.title}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={cancelEditing}
                  data-testid="cancel-edit-button-desktop"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={saveChanges}
                  disabled={updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="save-edit-button-desktop"
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
                  size="icon"
                  onClick={handleShare}
                  className="h-9 w-9"
                  data-testid="share-button-desktop"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="outline"
                  onClick={startEditing}
                  data-testid="edit-threat-button-desktop"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>

                <Select
                  value={threat.status}
                  onValueChange={(value) => updateMutation.mutate({ status: value })}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="w-36" data-testid="status-select-desktop">
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
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" data-testid="delete-threat-button-desktop">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Observation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this observation? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                        data-testid="confirm-delete-button-desktop"
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
      </div>
    </motion.div>
  );
};

export default ThreatHeader;
