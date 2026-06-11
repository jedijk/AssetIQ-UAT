import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { threatsAPI, actionsAPI, api } from "../../lib/api";
import { formatDate } from "../../lib/dateUtils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, ClipboardList, Loader2, Sparkles, AlertTriangle, Settings, CheckCircle, Clock, XCircle, ExternalLink, ShieldCheck, UserCheck, Pencil, Trash2 } from "lucide-react";
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
import { SearchableSelect } from "../ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDisciplines } from "../../hooks/useDisciplines";
import { queryKeys } from "../../lib/queryKeys";

const ACTION_TYPE_KEYS = {
  CM: "observationWorkspace.actionTypeCM",
  PM: "observationWorkspace.actionTypePM",
  PDM: "observationWorkspace.actionTypePDM",
};

const getActionTypes = (t) => [
  { value: "CM", label: t(ACTION_TYPE_KEYS.CM), color: "bg-amber-500" },
  { value: "PM", label: t(ACTION_TYPE_KEYS.PM), color: "bg-blue-500" },
  { value: "PDM", label: t(ACTION_TYPE_KEYS.PDM), color: "bg-purple-500" },
];

const getTypeStyles = (t) => ({
  CM: { bg: "bg-amber-500", text: "text-white", label: "CM", fullLabel: t(ACTION_TYPE_KEYS.CM) },
  PM: { bg: "bg-blue-500", text: "text-white", label: "PM", fullLabel: t(ACTION_TYPE_KEYS.PM) },
  PDM: { bg: "bg-purple-500", text: "text-white", label: "PDM", fullLabel: t(ACTION_TYPE_KEYS.PDM) },
});

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
  const location = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { selectOptions, getLabel, normalize } = useDisciplines();
  const actionTypes = getActionTypes(t);
  const typeStyles = getTypeStyles(t);
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
  
  // Edit recommended action state
  const [showEditRecommendedDialog, setShowEditRecommendedDialog] = useState(false);
  const [editingActionIndex, setEditingActionIndex] = useState(null);
  const [editRecommendedAction, setEditRecommendedAction] = useState({
    action: "",
    action_type: "",
    discipline: "",
  });
  
  // Edit action plan item state
  const [showEditActionDialog, setShowEditActionDialog] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [editActionForm, setEditActionForm] = useState({
    title: "",
    description: "",
    action_type: "",
    discipline: "",
    priority: "",
    status: "",
  });
  
  // RPN Scoring state for new failure mode
  const [fmData, setFmData] = useState({
    severity: 5,
    occurrence: 5,
    detection: 5,
    recommended_actions: [],
  });
  const [newFmAction, setNewFmAction] = useState("");
  const [newFmActionMinutes, setNewFmActionMinutes] = useState("");

  const rpn = fmData.severity * fmData.occurrence * fmData.detection;
  const rpnLevel = rpn >= 300 ? "Critical" : rpn >= 200 ? "High" : rpn >= 100 ? "Medium" : "Low";
  const rpnColor = rpn >= 300 ? "text-red-600" : rpn >= 200 ? "text-orange-600" : rpn >= 100 ? "text-yellow-600" : "text-green-600";

  // Fetch actions linked to this threat/observation
  const { data: linkedActionsData } = useQuery({
    queryKey: queryKeys.actions.linked(threatId),
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

  const translateEnum = (value) => {
    if (!value) return value;
    const key = `enums.${value}`;
    const out = t(key);
    return out && out !== key ? out : value;
  };

  const getActionStatusLabel = (status) => {
    const cfg = ACTION_STATUS_CONFIG[status] || ACTION_STATUS_CONFIG.open;
    return translateEnum(cfg.label);
  };

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
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timeline(threatId) });
      toast.success(t("threatDetail.actionAddedToPlan"));
    },
    onError: (error) => {
      console.error("Failed to create action:", error);
      toast.error(t("threatDetail.actionCreateFailed"));
    },
  });

  // Validate action mutation
  const validateActionMutation = useMutation({
    mutationFn: ({ actionId, validatorName, validatorPosition }) =>
      actionsAPI.validate(actionId, validatorName, validatorPosition, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      toast.success(t("threatDetail.actionValidated"));
      setShowValidateDialog(false);
      setActionToValidate(null);
      setValidatorName("");
      setValidatorPosition("");
    },
    onError: (error) => {
      console.error("Failed to validate action:", error);
      toast.error(t("threatDetail.actionValidateFailed"));
    },
  });

  // Unvalidate action mutation
  const unvalidateActionMutation = useMutation({
    mutationFn: (actionId) => actionsAPI.unvalidate(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      toast.success(t("threatDetail.validationRemoved"));
    },
    onError: (error) => {
      console.error("Failed to remove validation:", error);
      toast.error(t("threatDetail.validationRemoveFailed"));
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
      toast.error(t("threatDetail.fillAllFields"));
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
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      toast.success(t("threatDetail.recommendedActionAdded"));
      setShowAddRecommendedDialog(false);
      setNewRecommendedAction({ action: "", action_type: "", discipline: "" });
    },
    onError: () => {
      toast.error(t("threatDetail.recommendedActionAddFailed"));
    },
  });

  // Edit recommended action mutation
  const editRecommendedActionMutation = useMutation({
    mutationFn: ({ index, updatedAction }) => {
      const currentActions = [...(threat?.recommended_actions || [])];
      currentActions[index] = updatedAction;
      return threatsAPI.update(threatId, { recommended_actions: currentActions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      toast.success(t("threatDetail.recommendedActionUpdated"));
      setShowEditRecommendedDialog(false);
      setEditingActionIndex(null);
      setEditRecommendedAction({ action: "", action_type: "", discipline: "" });
    },
    onError: () => {
      toast.error(t("threatDetail.recommendedActionUpdateFailed"));
    },
  });

  // Delete recommended action mutation
  const deleteRecommendedActionMutation = useMutation({
    mutationFn: (index) => {
      const currentActions = [...(threat?.recommended_actions || [])];
      currentActions.splice(index, 1);
      return threatsAPI.update(threatId, { recommended_actions: currentActions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      toast.success(t("threatDetail.recommendedActionDeleted"));
    },
    onError: () => {
      toast.error(t("threatDetail.recommendedActionDeleteFailed"));
    },
  });

  // Edit action plan item mutation
  const editActionMutation = useMutation({
    mutationFn: async ({ actionId, updates }) => {
      return actionsAPI.update(actionId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.linkedToThreat(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      toast.success(t("threatDetail.actionUpdated"));
      setShowEditActionDialog(false);
      setEditingAction(null);
    },
    onError: () => {
      toast.error(t("threatDetail.actionUpdateFailed"));
    },
  });

  // Delete action plan item mutation
  // Uses shared actionsAPI (axios) so the request travels with the active auth
  // mode (bearer OR cookie). Previously we used raw fetch + localStorage which
  // silently failed under cookie auth — the action stayed and the user thought
  // delete was broken.
  const deleteActionMutation = useMutation({
    mutationFn: (actionId) => actionsAPI.delete(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      toast.success(t("threatDetail.actionDeleted"));
    },
    onError: () => {
      toast.error(t("threatDetail.actionDeleteFailed"));
    },
  });

  // Create failure mode mutation
  const createFailureModeMutation = useMutation({
    mutationFn: async () => {
      // Create failure mode in FMEA library
      const response = await api.post("/failure-modes", {
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
        });
      const newFm = response.data;
      
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
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.failureModes.all() });
      toast.success(t("threatDetail.failureModeCreated"));
      setShowCreateFMDialog(false);
      setFmData({ severity: 5, occurrence: 5, detection: 5, recommended_actions: [] });
    },
    onError: () => {
      toast.error(t("threatDetail.failureModeCreateFailed"));
    },
  });

  const addFmAction = () => {
    if (newFmAction.trim()) {
      const minutes = newFmActionMinutes === "" ? null : parseInt(newFmActionMinutes, 10);
      setFmData(prev => ({
        ...prev,
        recommended_actions: [
          ...prev.recommended_actions,
          {
            description: newFmAction.trim(),
            estimated_minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null,
          },
        ]
      }));
      setNewFmAction("");
      setNewFmActionMinutes("");
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
      toast.error(t("threatDetail.enterActionDescription"));
      return;
    }
    addRecommendedActionMutation.mutate({
      ...newRecommendedAction,
      discipline: normalize(newRecommendedAction.discipline) || newRecommendedAction.discipline,
    });
  };

  // Open edit dialog with current action data
  const handleEditAction = (index, action) => {
    const isObj = typeof action === "object";
    setEditingActionIndex(index);
    setEditRecommendedAction({
      action: isObj ? (action.action || action.description || "") : action,
      action_type: isObj ? (action.action_type || "") : "",
      discipline: isObj ? normalize(action.discipline || "") || (action.discipline || "") : "",
    });
    setShowEditRecommendedDialog(true);
  };

  // Save edited action
  const handleSaveEditedAction = () => {
    if (!editRecommendedAction.action.trim()) {
      toast.error(t("threatDetail.enterActionDescription"));
      return;
    }
    editRecommendedActionMutation.mutate({
      index: editingActionIndex,
      updatedAction: {
        ...editRecommendedAction,
        discipline: normalize(editRecommendedAction.discipline) || editRecommendedAction.discipline,
      },
    });
  };

  // Delete action with confirmation
  const handleDeleteAction = (index) => {
    if (window.confirm(t("threatDetail.deleteRecommendedConfirm"))) {
      deleteRecommendedActionMutation.mutate(index);
    }
  };

  // Open edit dialog for action plan item
  const handleEditActionPlanItem = (action) => {
    setEditingAction(action);
    setEditActionForm({
      title: action.title || "",
      description: action.description || "",
      action_type: action.action_type || "",
      discipline: normalize(action.discipline || "") || action.discipline || "",
      priority: action.priority || "medium",
      status: action.status || "open",
    });
    setShowEditActionDialog(true);
  };

  // Save edited action plan item
  const handleSaveActionPlanItem = () => {
    if (!editActionForm.title.trim()) {
      toast.error(t("threatDetail.enterActionTitle"));
      return;
    }
    editActionMutation.mutate({
      actionId: editingAction.id,
      updates: {
        ...editActionForm,
        discipline: normalize(editActionForm.discipline) || editActionForm.discipline || null,
      },
    });
  };

  // Delete action plan item with confirmation
  const handleDeleteActionPlanItem = (actionId) => {
    if (window.confirm(t("threatDetail.deleteActionConfirm"))) {
      deleteActionMutation.mutate(actionId);
    }
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
          <h3 className="font-semibold text-slate-900 text-sm">{t("observations.recommendedActions")}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddRecommendedDialog(true)}
            className="text-green-600 border-green-200 hover:bg-green-50 h-7 text-xs px-2"
            data-testid="add-recommended-action-button"
          >
            <Plus className="w-3 h-3 mr-1" />
            {t("common.add")}
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
                    {t("threatDetail.newBadge")}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  {t("threatDetail.addFailureModeToLibrary").replace("{failureMode}", threat.failure_mode)}
                </p>
              </div>

              {/* Create Button */}
              <Button
                onClick={() => setShowCreateFMDialog(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2 h-7 text-xs"
                data-testid="create-failure-mode-button"
              >
                <Plus className="w-3 h-3 mr-1" />
                {t("common.create")}
              </Button>
            </div>
          )}
          
          {(threat.recommended_actions || []).map((action, idx) => {
            const isObj = typeof action === "object";
            const actionText = isObj ? action.action || action.description || "" : action;
            const actionType = isObj ? action.action_type : null;
            const discipline = isObj ? action.discipline : null;
            const typeStyle = actionType ? typeStyles[actionType] || { bg: "bg-slate-500", text: "text-white", label: actionType } : null;

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
                        {getLabel(discipline)}
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
                      <span className="text-[10px] font-medium">{t("threatDetail.inActionPlan")}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Edit Button - Always visible on hover */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditAction(idx, action)}
                    className="opacity-0 group-hover:opacity-100 transition-all text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md p-1 h-7 w-7"
                    title={t("threatDetail.editAction")}
                    data-testid={`edit-action-${idx}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  
                  {/* Delete Button - Always visible on hover */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAction(idx)}
                    disabled={deleteRecommendedActionMutation.isPending}
                    className="opacity-0 group-hover:opacity-100 transition-all text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md p-1 h-7 w-7"
                    title={t("threatDetail.deleteAction")}
                    data-testid={`delete-action-${idx}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  
                  {/* Act Button - Show only if not already acted */}
                  {isAlreadyActed ? (
                    <Badge 
                      variant="outline" 
                      className="bg-green-100 text-green-700 border-green-300 text-[10px] px-2 py-1 ml-1"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {t("common.added")}
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => promoteToActionMutation.mutate({
                        text: actionText,
                        action_type: actionType,
                        discipline: normalize(discipline) || discipline,
                      })}
                      disabled={promoteToActionMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition-all text-blue-600 hover:text-white hover:bg-blue-600 rounded-md px-2 py-1 h-7 text-xs"
                      title={t("observations.addToActionPlan")}
                      data-testid={`promote-action-${idx}`}
                    >
                      <ClipboardList className="w-3 h-3 mr-1" />
                      {t("observations.act")}
                    </Button>
                  )}
                </div>
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
              <h3 className="font-semibold text-slate-900 text-sm">{t("threatDetail.actionPlan")}</h3>
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
              {t("threatDetail.viewAllActions")}
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {linkedActions.map((action, index) => {
              const statusCfg = ACTION_STATUS_CONFIG[action.status] || ACTION_STATUS_CONFIG.open;
              const StatusIcon = statusCfg.icon;
              const typeStyle = action.action_type ? typeStyles[action.action_type] : null;
              const actionNumber = index + 1;
              
              return (
                <div
                  key={action.id}
                  className={`group flex flex-col gap-2 p-3 rounded-lg border transition-all sm:flex-row sm:items-start sm:gap-3 ${
                    action.is_validated 
                      ? "bg-green-50 border-green-200" 
                      : `${statusCfg.bg} border-slate-200 hover:shadow-sm`
                  }`}
                  data-testid={`action-plan-item-${action.id}`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                  {/* Action Number & Type Badge */}
                  <div className="flex-shrink-0">
                    {typeStyle ? (
                      <div className={`w-8 h-8 rounded-md ${typeStyle.bg} ${typeStyle.text} flex flex-col items-center justify-center shadow-sm relative`}>
                        <span className="text-[10px] font-bold">{typeStyle.label}</span>
                        <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center shadow">
                          {actionNumber}
                        </span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm">
                        {actionNumber}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/actions/${action.id}`, { state: { breadcrumbOrigin: location.pathname } })}>
                    <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {/* Action ID */}
                      {action.action_number && (
                        <span className="shrink-0 text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {action.action_number}
                        </span>
                      )}
                      {/* Status Badge */}
                      <div className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 ${statusCfg.bg}`}>
                        <StatusIcon className={`w-3 h-3 ${statusCfg.color}`} />
                        <span className={`text-[10px] font-medium ${statusCfg.color}`}>{getActionStatusLabel(action.status)}</span>
                      </div>
                      {action.discipline && (
                        <span className="shrink-0 text-[10px] text-slate-400">{getLabel(action.discipline)}</span>
                      )}
                      {/* Validation Badge */}
                      {action.is_validated && (
                        <Badge className="shrink-0 bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5">
                          <ShieldCheck className="w-3 h-3 mr-0.5" />
                          {t("threatDetail.validated")}
                        </Badge>
                      )}
                      {action.priority && (
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${
                            action.priority === "high"
                              ? "border-red-300 text-red-600"
                              : action.priority === "medium"
                                ? "border-amber-300 text-amber-600"
                                : "border-slate-300 text-slate-600"
                          }`}
                        >
                          {action.priority}
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
                      <p className="text-[10px] text-slate-400 mt-1">{t("threatDetail.ownerLabel").replace("{name}", action.owner)}</p>
                    )}
                  </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2 pl-11 sm:w-auto sm:flex-shrink-0 sm:flex-col sm:items-end sm:gap-1 sm:border-t-0 sm:pt-0 sm:pl-0">
                    {action.due_date && (
                      <p className="shrink-0 text-[10px] text-slate-500">
                        {t("threatDetail.dueLabel").replace("{date}", formatDate(action.due_date))}
                      </p>
                    )}

                    {/* Edit & Delete Buttons */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditActionPlanItem(action);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-all h-6 w-6 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title={t("threatDetail.editAction")}
                        data-testid={`edit-action-plan-${action.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteActionPlanItem(action.id);
                        }}
                        disabled={deleteActionMutation.isPending}
                        className="opacity-0 group-hover:opacity-100 transition-all h-6 w-6 p-0 text-slate-500 hover:text-red-600 hover:bg-red-50"
                        title={t("threatDetail.deleteAction")}
                        data-testid={`delete-action-plan-${action.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    
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
                        {t("threatDetail.validateAction")}
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
                        title={t("threatDetail.removeValidation")}
                        data-testid={`unvalidate-action-${action.id}`}
                      >
                        {t("common.remove")}
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
              {t("threatDetail.addRecommendedAction")}
            </DialogTitle>
            <DialogDescription>
              {t("threatDetail.addRecommendedActionDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rec-action-text">{t("threatDetail.actionDescriptionRequired")}</Label>
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
                <Label htmlFor="rec-action-type">{t("threatDetail.actionTypeRequired")}</Label>
                <Select
                  value={newRecommendedAction.action_type}
                  onValueChange={(v) => setNewRecommendedAction({ ...newRecommendedAction, action_type: v })}
                >
                  <SelectTrigger data-testid="rec-action-type-select">
                    <SelectValue placeholder={t("threatDetail.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypes.map((type) => (
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
                <Label htmlFor="rec-action-discipline">{t("threatDetail.disciplineRequired")}</Label>
                <SearchableSelect
                  options={selectOptions}
                  value={newRecommendedAction.discipline}
                  onValueChange={(v) => setNewRecommendedAction({ ...newRecommendedAction, discipline: v })}
                  placeholder={t("observations.selectDiscipline")}
                  searchPlaceholder={t("threatDetail.searchDisciplines")}
                  data-testid="rec-action-discipline-select"
                />
              </div>
            </div>
            {/* Preview */}
            {newRecommendedAction.action && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">{t("threatDetail.preview")}</div>
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
                        {getLabel(newRecommendedAction.discipline)}
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
              {t("common.cancel")}
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
              {t("threatDetail.addRecommendedAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Recommended Action Dialog */}
      <Dialog open={showEditRecommendedDialog} onOpenChange={setShowEditRecommendedDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              {t("threatDetail.editRecommendedAction")}
            </DialogTitle>
            <DialogDescription>
              {t("threatDetail.addRecommendedActionDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-rec-action-text">{t("threatDetail.actionDescriptionRequired")}</Label>
              <Textarea
                id="edit-rec-action-text"
                value={editRecommendedAction.action}
                onChange={(e) => setEditRecommendedAction({ ...editRecommendedAction, action: e.target.value })}
                placeholder="e.g., Replace worn seals and inspect shaft alignment"
                rows={3}
                data-testid="edit-rec-action-text-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rec-action-type">{t("threatDetail.actionTypeRequired")}</Label>
                <Select
                  value={editRecommendedAction.action_type}
                  onValueChange={(v) => setEditRecommendedAction({ ...editRecommendedAction, action_type: v })}
                >
                  <SelectTrigger data-testid="edit-rec-action-type-select">
                    <SelectValue placeholder={t("threatDetail.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypes.map((type) => (
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
                <Label htmlFor="edit-rec-action-discipline">{t("threatDetail.disciplineRequired")}</Label>
                <SearchableSelect
                  options={selectOptions}
                  value={editRecommendedAction.discipline}
                  onValueChange={(v) => setEditRecommendedAction({ ...editRecommendedAction, discipline: v })}
                  placeholder={t("observations.selectDiscipline")}
                  searchPlaceholder={t("threatDetail.searchDisciplines")}
                  data-testid="edit-rec-action-discipline-select"
                />
              </div>
            </div>
            {/* Preview */}
            {editRecommendedAction.action && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">{t("threatDetail.preview")}</div>
                <div className="flex items-start gap-3">
                  {editRecommendedAction.action_type && (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                      editRecommendedAction.action_type === "CM" ? "bg-amber-500" :
                      editRecommendedAction.action_type === "PM" ? "bg-blue-500" :
                      editRecommendedAction.action_type === "PDM" ? "bg-purple-500" : "bg-slate-500"
                    }`}>
                      {editRecommendedAction.action_type}
                    </div>
                  )}
                  <div className="flex-1">
                    {editRecommendedAction.discipline && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium mb-1">
                        {getLabel(editRecommendedAction.discipline)}
                      </span>
                    )}
                    <p className="text-sm text-slate-700">{editRecommendedAction.action}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditRecommendedDialog(false);
                setEditingActionIndex(null);
                setEditRecommendedAction({ action: "", action_type: "", discipline: "" });
              }}
              data-testid="cancel-edit-rec-action-button"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveEditedAction}
              disabled={
                editRecommendedActionMutation.isPending ||
                !editRecommendedAction.action.trim()
              }
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-edit-rec-action-button"
            >
              {editRecommendedActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Pencil className="w-4 h-4 mr-2" />
              )}
              {t("common.saveChanges")}
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
              {t("threatDetail.createFailureModeInLibrary")}
            </DialogTitle>
            <DialogDescription>
              {t("threatDetail.addFailureModeToLibrary").replace("{failureMode}", threat.failure_mode)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Failure Mode Info */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">{t("common.name")}:</span>
                  <span className="ml-2 font-medium">{threat.failure_mode}</span>
                </div>
                <div>
                  <span className="text-slate-500">{t("observations.equipment")}:</span>
                  <span className="ml-2 font-medium">{threat.equipment_type}</span>
                </div>
              </div>
            </div>

            {/* RPN Scoring */}
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                <div>
                  <div className="text-sm font-medium text-slate-600">{t("maintenance.riskPriorityNumberShort")}</div>
                  <div className="text-xs text-slate-500">{t("maintenance.severity")} × {t("maintenance.occurrence")} × {t("maintenance.detectability")}</div>
                </div>
                <div className={`text-4xl font-bold ${rpnColor}`}>
                  {rpn}
                </div>
              </div>

              {/* Severity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t("threatDetail.severityLabel")}</Label>
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
                  <Label className="text-sm font-medium">{t("threatDetail.occurrenceLabel")}</Label>
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
                  <Label className="text-sm font-medium">{t("threatDetail.detectionLabel")}</Label>
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
              <Label className="text-sm font-medium">{t("threatDetail.recommendedActions")}</Label>
              <div className="flex gap-2 flex-wrap">
                <Input
                  value={newFmAction}
                  onChange={(e) => setNewFmAction(e.target.value)}
                  placeholder="Add a recommended action..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFmAction())}
                />
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500 whitespace-nowrap">Est. time (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={newFmActionMinutes}
                    onChange={(e) => setNewFmActionMinutes(e.target.value)}
                    className="w-24"
                    placeholder="—"
                    data-testid="quick-add-fm-action-est-minutes"
                  />
                </div>
                <Button variant="outline" onClick={addFmAction} disabled={!newFmAction.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {fmData.recommended_actions.length > 0 && (
                <div className="space-y-2">
                  {fmData.recommended_actions.map((action, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">
                          {typeof action === "object" ? (action.description || action.action || "") : String(action)}
                        </span>
                        {typeof action === "object" && Number.isFinite(action.estimated_minutes) && action.estimated_minutes !== null && (
                          <Badge variant="secondary" className="text-[10px]">
                            {action.estimated_minutes} min
                          </Badge>
                        )}
                      </div>
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
              {t("common.cancel")}
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
              {t("threatDetail.createFailureModeInLibrary")}
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
              {t("threatDetail.validateActionTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("threatDetail.validateActionDesc")}
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
              <Label htmlFor="validator-name">{t("threatDetail.validatorNameLabel")}</Label>
              <Input
                id="validator-name"
                value={validatorName}
                onChange={(e) => setValidatorName(e.target.value)}
                placeholder="e.g., John Smith"
                data-testid="validator-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validator-position">{t("threatDetail.validatorPositionLabel")}</Label>
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
              {t("common.cancel")}
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
              {t("threatDetail.confirmValidation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Plan Item Dialog */}
      <Dialog open={showEditActionDialog} onOpenChange={setShowEditActionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              {t("threatDetail.editActionPlanItem")}
            </DialogTitle>
            <DialogDescription>
              {t("threatDetail.editActionPlanDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-action-title">{t("threatDetail.actionTitleRequired")}</Label>
              <Input
                id="edit-action-title"
                value={editActionForm.title}
                onChange={(e) => setEditActionForm({ ...editActionForm, title: e.target.value })}
                placeholder="e.g., Replace worn seals"
                data-testid="edit-action-title-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-action-description">{t("threatDetail.actionDescription")}</Label>
              <Textarea
                id="edit-action-description"
                value={editActionForm.description}
                onChange={(e) => setEditActionForm({ ...editActionForm, description: e.target.value })}
                placeholder="Additional details about the action..."
                rows={3}
                data-testid="edit-action-description-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-action-type">{t("threatDetail.actionTypeRequired").replace(" *", "")}</Label>
                <Select
                  value={editActionForm.action_type}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, action_type: v })}
                >
                  <SelectTrigger data-testid="edit-action-type-select">
                    <SelectValue placeholder={t("threatDetail.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypes.map((type) => (
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
                <Label htmlFor="edit-action-discipline">Discipline</Label>
                <SearchableSelect
                  options={selectOptions}
                  value={editActionForm.discipline}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, discipline: v })}
                  placeholder="Select discipline..."
                  searchPlaceholder="Search disciplines..."
                  data-testid="edit-action-discipline-select"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-action-priority">Priority</Label>
                <Select
                  value={editActionForm.priority}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, priority: v })}
                >
                  <SelectTrigger data-testid="edit-action-priority-select">
                    <SelectValue placeholder="Select priority..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Low
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        Medium
                      </div>
                    </SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        High
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-action-status">Status</Label>
                <Select
                  value={editActionForm.status}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, status: v })}
                >
                  <SelectTrigger data-testid="edit-action-status-select">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-blue-500" />
                        Open
                      </div>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <div className="flex items-center gap-2">
                        <Settings className="w-3 h-3 text-amber-500" />
                        In Progress
                      </div>
                    </SelectItem>
                    <SelectItem value="completed">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Completed
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditActionDialog(false);
                setEditingAction(null);
              }}
              data-testid="cancel-edit-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveActionPlanItem}
              disabled={editActionMutation.isPending || !editActionForm.title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-edit-action-button"
            >
              {editActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Pencil className="w-4 h-4 mr-2" />
              )}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecommendedActionsSection;
