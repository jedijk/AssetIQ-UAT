import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { threatsAPI, actionsAPI } from "../../lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, ClipboardList, Loader2, Sparkles, AlertTriangle, Settings, CheckCircle, Clock, XCircle, ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Slider } from "../ui/slider";
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
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

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

const ACTION_STATUS_CONFIG = {
  open: { icon: Clock, color: "text-blue-500", bg: "bg-blue-50", label: "Open" },
  in_progress: { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", label: "In Progress" },
  "in-progress": { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", label: "In Progress" },
  completed: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", label: "Completed" },
  cancelled: { icon: XCircle, color: "text-slate-400", bg: "bg-slate-50", label: "Cancelled" },
};

export const RecommendedActionsSection = ({ threat, threatId }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAddRecommendedDialog, setShowAddRecommendedDialog] = useState(false);
  const [showCreateFMDialog, setShowCreateFMDialog] = useState(false);
  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [actionToValidate, setActionToValidate] = useState(null);
  const [validatorName, setValidatorName] = useState("");
  const [validatorPosition, setValidatorPosition] = useState("");
  const [newRecommendedAction, setNewRecommendedAction] = useState({
    action: "",
    action_type: "",
    discipline: "",
  });
  
  // RPN Scoring state for new failure mode
  const [fmData, setFmData] = useState({
    severity: 5,
    occurrence: 5,
    detection: 5,
    recommended_actions: [],
  });
  const [newFmAction, setNewFmAction] = useState("");

  const rpn = fmData.severity * fmData.occurrence * fmData.detection;
  const rpnLevel = rpn >= 300 ? "Critical" : rpn >= 200 ? "High" : rpn >= 100 ? "Medium" : "Low";
  const rpnColor = rpn >= 300 ? "text-red-600" : rpn >= 200 ? "text-orange-600" : rpn >= 100 ? "text-yellow-600" : "text-green-600";

  // Fetch actions linked to this threat/observation
  const { data: linkedActionsData } = useQuery({
    queryKey: ["actions", "linked", threatId],
    queryFn: async () => {
      const response = await actionsAPI.getAll();
      const allActions = response?.actions || response || [];
      // Filter actions that are linked to this threat (check both source types)
      return allActions.filter(
        action => (action.source_type === "threat" || action.source_type === "observation") 
          && action.source_id === threatId
      );
    },
    enabled: !!threatId,
    staleTime: 30000,
  });
  const linkedActions = linkedActionsData || [];

  // Promote to action mutation
  const promoteToActionMutation = useMutation({
    mutationFn: ({ text, action_type, discipline }) =>
      actionsAPI.create({
        title: text,
        description: `From threat: ${threat.title}`,
        source_type: "threat",
        source_id: threatId,
        source_name: threat.title,
        priority: "medium",
        action_type: action_type || null,
        discipline: discipline || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline", threatId] });
      toast.success("Action added to plan!");
    },
    onError: (error) => {
      console.error("Failed to create action:", error);
      toast.error("Failed to create action");
    },
  });

  // Validate action mutation
  const validateActionMutation = useMutation({
    mutationFn: ({ actionId, validatorName, validatorPosition }) =>
      actionsAPI.validate(actionId, validatorName, validatorPosition, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action validated successfully!");
      setShowValidateDialog(false);
      setActionToValidate(null);
      setValidatorName("");
      setValidatorPosition("");
    },
    onError: (error) => {
      console.error("Failed to validate action:", error);
      toast.error("Failed to validate action");
    },
  });

  // Unvalidate action mutation
  const unvalidateActionMutation = useMutation({
    mutationFn: (actionId) => actionsAPI.unvalidate(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Validation removed");
    },
    onError: (error) => {
      console.error("Failed to remove validation:", error);
      toast.error("Failed to remove validation");
    },
  });

  const handleOpenValidateDialog = (action) => {
    setActionToValidate(action);
    setValidatorName(user?.name || "");
    setValidatorPosition(user?.position || "");
    setShowValidateDialog(true);
  };

  const handleValidateAction = () => {
    if (!validatorName.trim() || !validatorPosition.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    validateActionMutation.mutate({
      actionId: actionToValidate.id,
      validatorName: validatorName.trim(),
      validatorPosition: validatorPosition.trim(),
    });
  };

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

  // Create failure mode mutation
  const createFailureModeMutation = useMutation({
    mutationFn: async () => {
      // Create failure mode in FMEA library
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/failure-modes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          category: threat.equipment_type || "General",
          equipment: threat.equipment_type || threat.asset || "Equipment",
          failure_mode: threat.failure_mode,
          keywords: [threat.failure_mode?.toLowerCase()].filter(Boolean),
          severity: fmData.severity,
          occurrence: fmData.occurrence,
          detectability: fmData.detection,
          recommended_actions: fmData.recommended_actions,
          description: `Created from observation: ${threat.title}`,
          source: "observation",
          linked_threat_id: threatId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create failure mode');
      }
      
      const newFm = await response.json();
      
      // Update the threat to link to the new failure mode and clear is_new_failure_mode flag
      await threatsAPI.update(threatId, {
        failure_mode_id: newFm.id,
        is_new_failure_mode: false,
        fmea_rpn: fmData.severity * fmData.occurrence * fmData.detection,
        failure_mode_data: newFm,
      });
      
      return newFm;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["failure-modes"] });
      toast.success("Failure mode created and linked to FMEA library!");
      setShowCreateFMDialog(false);
      setFmData({ severity: 5, occurrence: 5, detection: 5, recommended_actions: [] });
    },
    onError: () => {
      toast.error("Failed to create failure mode");
    },
  });

  const addFmAction = () => {
    if (newFmAction.trim()) {
      setFmData(prev => ({
        ...prev,
        recommended_actions: [...prev.recommended_actions, newFmAction.trim()]
      }));
      setNewFmAction("");
    }
  };

  const removeFmAction = (index) => {
    setFmData(prev => ({
      ...prev,
      recommended_actions: prev.recommended_actions.filter((_, i) => i !== index)
    }));
  };

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
        className="card p-4"
        data-testid="recommended-actions-section"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 text-sm">Recommended Actions</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddRecommendedDialog(true)}
            className="text-green-600 border-green-200 hover:bg-green-50 h-7 text-xs px-2"
            data-testid="add-recommended-action-button"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {/* Create Failure Mode Action - Show when is_new_failure_mode is true */}
          {threat.is_new_failure_mode && (
            <div
              className="flex items-start gap-3 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg"
              data-testid="create-failure-mode-action"
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-md bg-emerald-500 text-white flex flex-col items-center justify-center shadow-sm">
                  <Settings className="w-4 h-4" />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                    <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                    NEW
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Add "{threat.failure_mode}" to FMEA library with RPN scoring.
                </p>
              </div>

              {/* Create Button */}
              <Button
                onClick={() => setShowCreateFMDialog(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2 h-7 text-xs"
                data-testid="create-failure-mode-button"
              >
                <Plus className="w-3 h-3 mr-1" />
                Create
              </Button>
            </div>
          )}
          
          {(threat.recommended_actions || []).map((action, idx) => {
            const isObj = typeof action === "object";
            const actionText = isObj ? action.action || action.description || "" : action;
            const actionType = isObj ? action.action_type : null;
            const discipline = isObj ? action.discipline : null;
            const typeStyle = actionType ? TYPE_STYLES[actionType] || { bg: "bg-slate-500", text: "text-white", label: actionType } : null;

            // Check if this action has already been acted upon (exists in linked actions)
            const isAlreadyActed = linkedActions.some(linkedAction => {
              const linkedTitle = linkedAction.title?.toLowerCase().trim();
              const actionTextLower = actionText?.toLowerCase().trim();
              return linkedTitle === actionTextLower || linkedTitle?.includes(actionTextLower) || actionTextLower?.includes(linkedTitle);
            });

            return (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 border rounded-lg transition-all group ${
                  isAlreadyActed 
                    ? "bg-green-50 border-green-200" 
                    : "bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm"
                }`}
                data-testid={`action-item-${idx}`}
              >
                {/* Action Type Badge - Smaller */}
                <div className="flex-shrink-0">
                  {typeStyle ? (
                    <div className={`w-8 h-8 rounded-md ${typeStyle.bg} ${typeStyle.text} flex flex-col items-center justify-center shadow-sm`}>
                      <span className="text-[10px] font-bold">{typeStyle.label}</span>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center">
                      <span className="text-sm font-semibold">{idx + 1}</span>
                    </div>
                  )}
                </div>

                {/* Content - Smaller text */}
                <div className="flex-1 min-w-0">
                  {discipline && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                        {discipline}
                      </span>
                      {actionType && (
                        <span className="text-[10px] text-slate-400">
                          {typeStyle?.fullLabel}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-slate-700 leading-snug">{actionText}</p>
                  
                  {/* Already Acted Indicator */}
                  {isAlreadyActed && (
                    <div className="flex items-center gap-1 mt-1.5 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      <span className="text-[10px] font-medium">In Action Plan</span>
                    </div>
                  )}
                </div>

                {/* Act Button - Show only if not already acted */}
                {isAlreadyActed ? (
                  <div className="flex-shrink-0">
                    <Badge 
                      variant="outline" 
                      className="bg-green-100 text-green-700 border-green-300 text-[10px] px-2 py-1"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Added
                    </Badge>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => promoteToActionMutation.mutate({
                      text: actionText,
                      action_type: actionType,
                      discipline: discipline,
                    })}
                    disabled={promoteToActionMutation.isPending}
                    className="opacity-0 group-hover:opacity-100 transition-all text-blue-600 hover:text-white hover:bg-blue-600 rounded-md px-2 py-1 h-7 text-xs"
                    title="Add to action plan"
                    data-testid={`promote-action-${idx}`}
                  >
                    <ClipboardList className="w-3 h-3 mr-1" />
                    Act
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Action Plan Section - Shows actions created from this observation with validation */}
      {linkedActions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-4"
          data-testid="action-plan-section"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">Action Plan</h3>
              <Badge variant="secondary" className="text-xs">
                {linkedActions.length}
              </Badge>
              {/* Show validated count */}
              {linkedActions.filter(a => a.is_validated).length > 0 && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {linkedActions.filter(a => a.is_validated).length} validated
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/actions")}
              className="text-blue-600 hover:text-blue-700 h-7 text-xs px-2"
            >
              View All
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {linkedActions.map((action) => {
              const statusCfg = ACTION_STATUS_CONFIG[action.status] || ACTION_STATUS_CONFIG.open;
              const StatusIcon = statusCfg.icon;
              const typeStyle = action.action_type ? TYPE_STYLES[action.action_type] : null;
              
              return (
                <div
                  key={action.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    action.is_validated 
                      ? "bg-green-50 border-green-200" 
                      : `${statusCfg.bg} border-slate-200 hover:shadow-sm`
                  }`}
                  data-testid={`action-plan-item-${action.id}`}
                >
                  {/* Action Type Badge */}
                  <div className="flex-shrink-0">
                    {typeStyle ? (
                      <div className={`w-8 h-8 rounded-md ${typeStyle.bg} ${typeStyle.text} flex flex-col items-center justify-center shadow-sm`}>
                        <span className="text-[10px] font-bold">{typeStyle.label}</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-slate-200 text-slate-500 flex items-center justify-center">
                        <ClipboardList className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/actions/${action.id}`)}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {/* Status Badge */}
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${statusCfg.bg} border`}>
                        <StatusIcon className={`w-3 h-3 ${statusCfg.color}`} />
                        <span className={`text-[10px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                      </div>
                      {action.discipline && (
                        <span className="text-[10px] text-slate-400">{action.discipline}</span>
                      )}
                      {/* Validation Badge */}
                      {action.is_validated && (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5">
                          <ShieldCheck className="w-3 h-3 mr-0.5" />
                          Validated
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 leading-snug line-clamp-2">{action.title}</p>
                    {action.is_validated && action.validated_by_name && (
                      <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        {action.validated_by_name} ({action.validated_by_position})
                      </p>
                    )}
                    {action.owner && !action.is_validated && (
                      <p className="text-[10px] text-slate-400 mt-1">Owner: {action.owner}</p>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    {action.due_date && (
                      <p className="text-[10px] text-slate-500">
                        Due: {new Date(action.due_date).toLocaleDateString()}
                      </p>
                    )}
                    {action.priority && (
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] ${
                          action.priority === 'high' ? 'border-red-300 text-red-600' :
                          action.priority === 'medium' ? 'border-amber-300 text-amber-600' :
                          'border-slate-300 text-slate-600'
                        }`}
                      >
                        {action.priority}
                      </Badge>
                    )}
                    {/* Validate Button */}
                    {!action.is_validated ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenValidateDialog(action);
                        }}
                        className="h-6 text-[10px] px-2 text-green-600 border-green-200 hover:bg-green-50 mt-1"
                        data-testid={`validate-action-${action.id}`}
                      >
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Validate
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          unvalidateActionMutation.mutate(action.id);
                        }}
                        className="h-6 text-[10px] px-2 text-slate-400 hover:text-red-500 mt-1"
                        title="Remove validation"
                        data-testid={`unvalidate-action-${action.id}`}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

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

      {/* Create Failure Mode Dialog with RPN Scoring */}
      <Dialog open={showCreateFMDialog} onOpenChange={setShowCreateFMDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-600" />
              Create Failure Mode
            </DialogTitle>
            <DialogDescription>
              Add "{threat.failure_mode}" to the FMEA library with RPN scoring.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Failure Mode Info */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Name:</span>
                  <span className="ml-2 font-medium">{threat.failure_mode}</span>
                </div>
                <div>
                  <span className="text-slate-500">Equipment:</span>
                  <span className="ml-2 font-medium">{threat.equipment_type}</span>
                </div>
              </div>
            </div>

            {/* RPN Scoring */}
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                <div>
                  <div className="text-sm font-medium text-slate-600">Risk Priority Number (RPN)</div>
                  <div className="text-xs text-slate-500">Severity × Occurrence × Detection</div>
                </div>
                <div className={`text-4xl font-bold ${rpnColor}`}>
                  {rpn}
                </div>
              </div>

              {/* Severity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Severity</Label>
                  <Badge variant="outline" className="text-sm">
                    {fmData.severity}/10
                  </Badge>
                </div>
                <Slider
                  value={[fmData.severity]}
                  onValueChange={([v]) => setFmData(prev => ({ ...prev, severity: v }))}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Minor</span>
                  <span>Critical</span>
                </div>
              </div>

              {/* Occurrence */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Occurrence</Label>
                  <Badge variant="outline" className="text-sm">
                    {fmData.occurrence}/10
                  </Badge>
                </div>
                <Slider
                  value={[fmData.occurrence]}
                  onValueChange={([v]) => setFmData(prev => ({ ...prev, occurrence: v }))}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Rare</span>
                  <span>Frequent</span>
                </div>
              </div>

              {/* Detection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Detection</Label>
                  <Badge variant="outline" className="text-sm">
                    {fmData.detection}/10
                  </Badge>
                </div>
                <Slider
                  value={[fmData.detection]}
                  onValueChange={([v]) => setFmData(prev => ({ ...prev, detection: v }))}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Easy to detect</span>
                  <span>Hard to detect</span>
                </div>
              </div>
            </div>

            {/* Recommended Actions for FM */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Recommended Actions</Label>
              <div className="flex gap-2">
                <Input
                  value={newFmAction}
                  onChange={(e) => setNewFmAction(e.target.value)}
                  placeholder="Add a recommended action..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFmAction())}
                />
                <Button variant="outline" onClick={addFmAction} disabled={!newFmAction.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {fmData.recommended_actions.length > 0 && (
                <div className="space-y-2">
                  {fmData.recommended_actions.map((action, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                      <span>{action}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFmAction(idx)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateFMDialog(false);
                setFmData({ severity: 5, occurrence: 5, detection: 5, recommended_actions: [] });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createFailureModeMutation.mutate()}
              disabled={createFailureModeMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="save-failure-mode-button"
            >
              {createFailureModeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Failure Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validate Action Dialog */}
      <Dialog open={showValidateDialog} onOpenChange={setShowValidateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              Validate Action
            </DialogTitle>
            <DialogDescription>
              Confirm this action has been reviewed and approved by a subject matter expert.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actionToValidate && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-sm font-medium text-slate-700">{actionToValidate.title}</p>
                {actionToValidate.action_type && (
                  <Badge className={`mt-2 text-[10px] ${
                    actionToValidate.action_type === 'CM' ? 'bg-amber-100 text-amber-700' :
                    actionToValidate.action_type === 'PM' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {actionToValidate.action_type}
                  </Badge>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="validator-name">Validator Name *</Label>
              <Input
                id="validator-name"
                value={validatorName}
                onChange={(e) => setValidatorName(e.target.value)}
                placeholder="e.g., John Smith"
                data-testid="validator-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validator-position">Position / Role *</Label>
              <Input
                id="validator-position"
                value={validatorPosition}
                onChange={(e) => setValidatorPosition(e.target.value)}
                placeholder="e.g., Reliability Engineer"
                data-testid="validator-position-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowValidateDialog(false);
                setActionToValidate(null);
                setValidatorName("");
                setValidatorPosition("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleValidateAction}
              disabled={validateActionMutation.isPending || !validatorName.trim() || !validatorPosition.trim()}
              className="bg-green-600 hover:bg-green-700"
              data-testid="confirm-validate-button"
            >
              {validateActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-2" />
              )}
              Confirm Validation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecommendedActionsSection;
