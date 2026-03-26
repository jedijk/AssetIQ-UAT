import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { threatsAPI, actionsAPI } from "../../lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
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

const ACTION_TYPES = [
  { value: "CM", label: "CM - Corrective", color: "bg-amber-500" },
  { value: "PM", label: "PM - Preventive", color: "bg-blue-500" },
  { value: "PDM", label: "PDM - Predictive", color: "bg-purple-500" },
];

const DISCIPLINES = [
  "Mechanical",
  "Electrical",
  "Instrumentation",
  "Process",
  "Civil/Structural",
  "Rotating Equipment",
  "Static Equipment",
  "Piping",
  "Safety",
  "Operations",
  "Multi-discipline",
];

const TYPE_STYLES = {
  CM: { bg: "bg-amber-500", text: "text-white", label: "CM", fullLabel: "Corrective" },
  PM: { bg: "bg-blue-500", text: "text-white", label: "PM", fullLabel: "Preventive" },
  PDM: { bg: "bg-purple-500", text: "text-white", label: "PDM", fullLabel: "Predictive" },
};

export const RecommendedActionsSection = ({ threat, threatId }) => {
  const queryClient = useQueryClient();
  const [showAddRecommendedDialog, setShowAddRecommendedDialog] = useState(false);
  const [newRecommendedAction, setNewRecommendedAction] = useState({
    action: "",
    action_type: "",
    discipline: "",
  });

  // Promote to action mutation
  const promoteToActionMutation = useMutation({
    mutationFn: ({ text, action_type, discipline }) =>
      actionsAPI.create({
        title: text,
        description: `From threat: ${threat.title}`,
        priority: "medium",
        linked_threat_id: threatId,
        action_type: action_type || null,
        discipline: discipline || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action created in tracker!");
    },
    onError: () => {
      toast.error("Failed to create action");
    },
  });

  // Add recommended action to threat mutation
  const addRecommendedActionMutation = useMutation({
    mutationFn: (newAction) => {
      const currentActions = threat?.recommended_actions || [];
      const updatedActions = [...currentActions, newAction];
      return threatsAPI.update(threatId, { recommended_actions: updatedActions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      toast.success("Recommended action added!");
      setShowAddRecommendedDialog(false);
      setNewRecommendedAction({ action: "", action_type: "", discipline: "" });
    },
    onError: () => {
      toast.error("Failed to add recommended action");
    },
  });

  const handleAddRecommendedAction = () => {
    if (!newRecommendedAction.action.trim()) {
      toast.error("Please enter an action description");
      return;
    }
    addRecommendedActionMutation.mutate(newRecommendedAction);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card p-6"
        data-testid="recommended-actions-section"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Recommended Actions</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddRecommendedDialog(true)}
            className="text-green-600 border-green-200 hover:bg-green-50"
            data-testid="add-recommended-action-button"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Recommendation
          </Button>
        </div>
        <div className="space-y-3">
          {(threat.recommended_actions || []).map((action, idx) => {
            const isObj = typeof action === "object";
            const actionText = isObj ? action.action || action.description || "" : action;
            const actionType = isObj ? action.action_type : null;
            const discipline = isObj ? action.discipline : null;
            const typeStyle = actionType ? TYPE_STYLES[actionType] || { bg: "bg-slate-500", text: "text-white", label: actionType } : null;

            return (
              <div
                key={idx}
                className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-200 hover:shadow-sm transition-all group"
                data-testid={`action-item-${idx}`}
              >
                {/* Action Type Badge */}
                <div className="flex-shrink-0">
                  {typeStyle ? (
                    <div className={`w-12 h-12 rounded-lg ${typeStyle.bg} ${typeStyle.text} flex flex-col items-center justify-center shadow-sm`}>
                      <span className="text-xs font-bold">{typeStyle.label}</span>
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                      <span className="text-lg font-semibold">{idx + 1}</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {discipline && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        {discipline}
                      </span>
                      {actionType && (
                        <span className="text-xs text-slate-400">
                          {typeStyle?.fullLabel} Maintenance
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-slate-700 leading-relaxed">{actionText}</p>
                </div>

                {/* Act Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => promoteToActionMutation.mutate({
                    text: actionText,
                    action_type: actionType,
                    discipline: discipline,
                  })}
                  disabled={promoteToActionMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-all text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg px-4"
                  title="Add to action tracker"
                  data-testid={`promote-action-${idx}`}
                >
                  <ClipboardList className="w-4 h-4 mr-1.5" />
                  Act
                </Button>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Add Recommended Action Dialog */}
      <Dialog open={showAddRecommendedDialog} onOpenChange={setShowAddRecommendedDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-600" />
              Add Recommended Action
            </DialogTitle>
            <DialogDescription>
              Add a maintenance recommendation to this observation. Specify the action type and discipline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rec-action-text">Action Description *</Label>
              <Textarea
                id="rec-action-text"
                value={newRecommendedAction.action}
                onChange={(e) => setNewRecommendedAction({ ...newRecommendedAction, action: e.target.value })}
                placeholder="e.g., Replace worn seals and inspect shaft alignment"
                rows={3}
                data-testid="rec-action-text-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rec-action-type">Action Type *</Label>
                <Select
                  value={newRecommendedAction.action_type}
                  onValueChange={(v) => setNewRecommendedAction({ ...newRecommendedAction, action_type: v })}
                >
                  <SelectTrigger data-testid="rec-action-type-select">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${type.color}`} />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-action-discipline">Discipline *</Label>
                <Select
                  value={newRecommendedAction.discipline}
                  onValueChange={(v) => setNewRecommendedAction({ ...newRecommendedAction, discipline: v })}
                >
                  <SelectTrigger data-testid="rec-action-discipline-select">
                    <SelectValue placeholder="Select discipline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCIPLINES.map((disc) => (
                      <SelectItem key={disc} value={disc}>{disc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Preview */}
            {newRecommendedAction.action && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">Preview:</div>
                <div className="flex items-start gap-3">
                  {newRecommendedAction.action_type && (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                      newRecommendedAction.action_type === "CM" ? "bg-amber-500" :
                      newRecommendedAction.action_type === "PM" ? "bg-blue-500" :
                      newRecommendedAction.action_type === "PDM" ? "bg-purple-500" : "bg-slate-500"
                    }`}>
                      {newRecommendedAction.action_type}
                    </div>
                  )}
                  <div className="flex-1">
                    {newRecommendedAction.discipline && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium mb-1">
                        {newRecommendedAction.discipline}
                      </span>
                    )}
                    <p className="text-sm text-slate-700">{newRecommendedAction.action}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddRecommendedDialog(false);
                setNewRecommendedAction({ action: "", action_type: "", discipline: "" });
              }}
              data-testid="cancel-rec-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddRecommendedAction}
              disabled={
                addRecommendedActionMutation.isPending ||
                !newRecommendedAction.action.trim() ||
                !newRecommendedAction.action_type ||
                !newRecommendedAction.discipline
              }
              className="bg-green-600 hover:bg-green-700"
              data-testid="save-rec-action-button"
            >
              {addRecommendedActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Recommendation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecommendedActionsSection;
