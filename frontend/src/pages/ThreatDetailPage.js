import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { threatsAPI, actionsAPI, equipmentHierarchyAPI, failureModesAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import SearchableCombobox from "../components/SearchableCombobox";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  Wrench,
  MapPin,
  Activity,
  Target,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Edit,
  Save,
  X,
  ClipboardList,
  Brain,
  Plus,
  Calculator,
  Shield,
  Cog,
  Leaf,
  Star,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
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
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import RiskBadge from "../components/RiskBadge";
import AIInsightsPanel from "../components/AIInsightsPanel";
import CausalIntelligencePanel from "../components/CausalIntelligencePanel";

const LIKELIHOOD_OPTIONS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const DETECTABILITY_OPTIONS = ["Easy", "Moderate", "Difficult", "Very Difficult", "Almost Impossible"];
const FREQUENCY_OPTIONS = ["Once", "Rarely", "Occasionally", "Frequently", "Constantly"];
const IMPACT_OPTIONS = ["Minor", "Moderate", "Significant", "Major", "Catastrophic"];
const STATUS_OPTIONS = ["Open", "In Progress", "Mitigated", "Closed"];
const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"];

const ThreatDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showAddActionDialog, setShowAddActionDialog] = useState(false);
  const [scoreCalcPopup, setScoreCalcPopup] = useState({ show: false, x: 0, y: 0 });
  const scorePopupRef = useRef(null);
  const [newActionForm, setNewActionForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    due_date: "",
  });

  // Fetch threat
  const { data: threat, isLoading, error } = useQuery({
    queryKey: ["threat", id],
    queryFn: () => threatsAPI.getById(id),
  });

  // Fetch equipment hierarchy nodes for Asset dropdown
  const { data: equipmentNodesData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  const equipmentNodes = equipmentNodesData?.nodes || [];

  // Fetch equipment types for Equipment Type dropdown
  const { data: equipmentTypesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentTypes = equipmentTypesData?.equipment_types || [];

  // Fetch failure modes for Failure Mode dropdown
  const { data: failureModesData } = useQuery({
    queryKey: ["failure-modes-all"],
    queryFn: () => failureModesAPI.getAll({}),
    staleTime: 5 * 60 * 1000,
  });
  const failureModes = failureModesData?.failure_modes || [];

  // Transform data for searchable comboboxes
  const assetOptions = useMemo(() => {
    // Flatten hierarchy nodes into a flat list with path info
    const flattenNodes = (nodes, parentPath = "") => {
      const result = [];
      nodes.forEach((node) => {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
        result.push({
          value: node.name,
          label: node.name,
          description: node.tag_number ? `${node.tag_number} - ${node.level}` : node.level,
        });
        if (node.children && node.children.length > 0) {
          result.push(...flattenNodes(node.children, currentPath));
        }
      });
      return result;
    };
    return flattenNodes(equipmentNodes);
  }, [equipmentNodes]);

  const equipmentTypeOptions = useMemo(() => {
    return equipmentTypes.map((type) => ({
      value: type.name,
      label: type.name,
      description: type.category || type.discipline,
    }));
  }, [equipmentTypes]);

  const failureModeOptions = useMemo(() => {
    return failureModes.map((mode) => ({
      value: mode.failure_mode,
      label: mode.failure_mode,
      description: mode.equipment || mode.category,
    }));
  }, [failureModes]);

  // Close score calculation popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (scorePopupRef.current && !scorePopupRef.current.contains(e.target)) {
        setScoreCalcPopup({ show: false, x: 0, y: 0 });
      }
    };
    if (scoreCalcPopup.show) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [scoreCalcPopup.show]);

  // Handle right-click on score to show calculation
  const handleScoreContextMenu = (e) => {
    e.preventDefault();
    setScoreCalcPopup({ show: true, x: e.clientX, y: e.clientY });
  };

  // Get FMEA data for the linked failure mode
  const linkedFmData = useMemo(() => {
    if (!threat?.failure_mode) return null;
    const fm = failureModes.find(m => m.failure_mode.toLowerCase() === threat.failure_mode.toLowerCase());
    return fm || null;
  }, [threat?.failure_mode, failureModes]);

  // Get criticality data for the linked asset
  const linkedCriticalityData = useMemo(() => {
    if (!threat?.asset) return null;
    const findNode = (nodes) => {
      for (const node of nodes) {
        if (node.name === threat.asset) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    const node = findNode(equipmentNodes);
    return node?.criticality || null;
  }, [threat?.asset, equipmentNodes]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => threatsAPI.update(id, data),
    onSuccess: (updatedThreat, variables) => {
      // Store old data for undo
      const oldData = { ...threat };
      pushUndo({
        type: "UPDATE_THREAT",
        label: `Edit threat "${threat.title}"`,
        data: { oldData, newData: variables },
        undo: async () => {
          await threatsAPI.update(id, oldData);
          queryClient.invalidateQueries({ queryKey: ["threat", id] });
          queryClient.invalidateQueries({ queryKey: ["threats"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
        },
      });
      queryClient.invalidateQueries({ queryKey: ["threat", id] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Threat updated");
      setIsEditing(false);
    },
    onError: () => {
      toast.error("Failed to update threat");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => threatsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Threat deleted");
      navigate("/threats");
    },
    onError: () => {
      toast.error("Failed to delete threat");
    },
  });

  // Promote to action mutation
  const promoteToActionMutation = useMutation({
    mutationFn: (actionText) => actionsAPI.create({
      title: actionText.substring(0, 100),
      description: actionText,
      source_type: "threat",
      source_id: id,
      source_name: threat?.title || "Unknown Threat",
      priority: threat?.risk_level === "Critical" ? "critical" : 
               threat?.risk_level === "High" ? "high" : "medium",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action created! View it in the Actions tab.");
    },
    onError: () => {
      toast.error("Failed to create action");
    },
  });

  // Create custom action mutation
  const createActionMutation = useMutation({
    mutationFn: (actionData) => actionsAPI.create({
      title: actionData.title,
      description: actionData.description,
      source_type: "threat",
      source_id: id,
      source_name: threat?.title || "Unknown Threat",
      priority: actionData.priority,
      assignee: actionData.assignee || null,
      due_date: actionData.due_date || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["threat-actions", id] });
      toast.success("Action created successfully!");
      setShowAddActionDialog(false);
      setNewActionForm({
        title: "",
        description: "",
        priority: "medium",
        assignee: "",
        due_date: "",
      });
    },
    onError: () => {
      toast.error("Failed to create action");
    },
  });

  const handleCreateAction = () => {
    if (!newActionForm.title.trim()) {
      toast.error("Please enter an action title");
      return;
    }
    createActionMutation.mutate(newActionForm);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  if (error || !threat) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl" data-testid="threat-not-found">
        <div className="text-center py-16">
          <XCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Threat not found</h2>
          <Button onClick={() => navigate("/threats")} variant="outline">
            Back to Threats
          </Button>
        </div>
      </div>
    );
  }

  const infoItems = [
    { label: "Asset", value: threat.asset, icon: Wrench, field: "asset", type: "searchable", options: assetOptions },
    { label: "Equipment Type", value: threat.equipment_type, icon: Target, field: "equipment_type", type: "searchable", options: equipmentTypeOptions },
    { label: "Failure Mode", value: threat.failure_mode, icon: AlertTriangle, field: "failure_mode", type: "searchable", options: failureModeOptions },
    { label: "Impact", value: threat.impact, icon: Activity, field: "impact", type: "select", options: IMPACT_OPTIONS },
    { label: "Frequency", value: threat.frequency, icon: Clock, field: "frequency", type: "select", options: FREQUENCY_OPTIONS },
    { label: "Likelihood", value: threat.likelihood, icon: Activity, field: "likelihood", type: "select", options: LIKELIHOOD_OPTIONS },
    { label: "Detectability", value: threat.detectability, icon: Eye, field: "detectability", type: "select", options: DETECTABILITY_OPTIONS },
    { label: "Location", value: threat.location || "Not specified", icon: MapPin, field: "location", type: "text" },
  ];

  const startEditing = () => {
    setEditForm({
      title: threat.title,
      asset: threat.asset,
      equipment_type: threat.equipment_type,
      failure_mode: threat.failure_mode,
      cause: threat.cause || "",
      impact: threat.impact,
      frequency: threat.frequency,
      likelihood: threat.likelihood,
      detectability: threat.detectability,
      location: threat.location || "",
      status: threat.status,
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const saveChanges = () => {
    updateMutation.mutate(editForm);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl" data-testid="threat-detail-page">
      {/* Header */}
      <motion.div
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
                    {STATUS_OPTIONS.map(s => (
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

      {/* Risk Score Card - Right-click for calculation details */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`card p-6 mb-6 border-l-4 cursor-context-menu relative ${
          threat.risk_level === "Critical" ? "border-l-red-500" :
          threat.risk_level === "High" ? "border-l-orange-500" :
          threat.risk_level === "Medium" ? "border-l-yellow-500" :
          "border-l-green-500"
        }`}
        data-testid="risk-score-card"
        onContextMenu={handleScoreContextMenu}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
              {t("threats.riskScore")}
              <span className="text-xs text-slate-400 font-normal">({t("threats.rightClickForDetails")})</span>
            </div>
            <div className="text-4xl font-bold text-slate-900">{threat.risk_score}</div>
          </div>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
            threat.risk_level === "Critical" ? "bg-red-50" :
            threat.risk_level === "High" ? "bg-orange-50" :
            threat.risk_level === "Medium" ? "bg-yellow-50" :
            "bg-green-50"
          }`}>
            <AlertTriangle className={`w-8 h-8 ${
              threat.risk_level === "Critical" ? "text-red-500" :
              threat.risk_level === "High" ? "text-orange-500" :
              threat.risk_level === "Medium" ? "text-yellow-500" :
              "text-green-500"
            }`} />
          </div>
        </div>

        {/* Score Calculation Popup */}
        {scoreCalcPopup.show && (
          <div 
            ref={scorePopupRef}
            className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-50 w-80"
            style={{ 
              left: Math.min(scoreCalcPopup.x, window.innerWidth - 340), 
              top: Math.min(scoreCalcPopup.y, window.innerHeight - 500) 
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-900">{t("threats.scoreCalculation")}</h3>
              </div>
              <button 
                onClick={() => setScoreCalcPopup({ show: false, x: 0, y: 0 })}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Formula */}
            <div className="bg-slate-50 rounded-lg p-3 mb-4">
              <div className="text-xs text-slate-500 mb-1">{t("threats.formula")}</div>
              <div className="text-sm font-mono text-slate-700">
                {t("threats.baseScore")} × {t("threats.criticalityMultiplier")}
              </div>
            </div>

            {/* FMEA Section */}
            <div className="mb-4">
              <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {t("threats.fmeaScores")} ({threat.failure_mode || t("common.notLinked")})
              </div>
              {linkedFmData ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-red-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-red-700">{linkedFmData.severity}</div>
                    <div className="text-[10px] text-red-600">{t("library.severity")}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-amber-700">{linkedFmData.occurrence}</div>
                    <div className="text-[10px] text-amber-600">{t("library.occurrence")}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-blue-700">{linkedFmData.detectability}</div>
                    <div className="text-[10px] text-blue-600">{t("library.detectability")}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 italic">{t("threats.noFmeaLinked")}</div>
              )}
              {linkedFmData && (
                <div className="mt-2 text-xs text-slate-500">
                  {t("threats.baseScore")}: ({linkedFmData.severity} × {linkedFmData.occurrence} × {linkedFmData.detectability}) / 10 = <span className="font-semibold text-slate-700">{Math.round((linkedFmData.severity * linkedFmData.occurrence * linkedFmData.detectability) / 10)}</span>
                </div>
              )}
            </div>

            {/* Criticality Section */}
            <div className="mb-4">
              <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {t("threats.equipmentCriticality")} ({threat.asset || t("common.notLinked")})
              </div>
              {linkedCriticalityData ? (
                <>
                  <div className="grid grid-cols-4 gap-1 mb-2">
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Shield className="w-3 h-3 text-red-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-2.5 rounded-sm ${i <= (linkedCriticalityData.safety_impact || 0) ? 'bg-red-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-500">{linkedCriticalityData.safety_impact || 0}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Cog className="w-3 h-3 text-orange-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-2.5 rounded-sm ${i <= (linkedCriticalityData.production_impact || 0) ? 'bg-orange-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-500">{linkedCriticalityData.production_impact || 0}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Leaf className="w-3 h-3 text-green-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-2.5 rounded-sm ${i <= (linkedCriticalityData.environmental_impact || 0) ? 'bg-green-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-500">{linkedCriticalityData.environmental_impact || 0}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Star className="w-3 h-3 text-purple-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-2.5 rounded-sm ${i <= (linkedCriticalityData.reputation_impact || 0) ? 'bg-purple-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-500">{linkedCriticalityData.reputation_impact || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("threats.criticalityMultiplier")}: <span className="font-semibold text-slate-700">
                      {linkedCriticalityData.level === "safety_critical" ? "×1.5" :
                       linkedCriticalityData.level === "production_critical" ? "×1.4" :
                       linkedCriticalityData.level === "medium" ? "×1.2" : "×1.0"}
                    </span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                      linkedCriticalityData.level === "safety_critical" ? "bg-red-100 text-red-700" :
                      linkedCriticalityData.level === "production_critical" ? "bg-orange-100 text-orange-700" :
                      linkedCriticalityData.level === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                    }`}>
                      {linkedCriticalityData.level?.replace("_", " ") || "low"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400 italic">{t("threats.noCriticalityLinked")}</div>
              )}
            </div>

            {/* Final Calculation */}
            <div className="border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t("threats.finalScore")}</span>
                <span className={`text-2xl font-bold ${
                  threat.risk_level === "Critical" ? "text-red-600" :
                  threat.risk_level === "High" ? "text-orange-600" :
                  threat.risk_level === "Medium" ? "text-yellow-600" : "text-green-600"
                }`}>{threat.risk_score}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {threat.risk_level === "Critical" && "≥70 = Critical"}
                {threat.risk_level === "High" && "50-69 = High"}
                {threat.risk_level === "Medium" && "30-49 = Medium"}
                {threat.risk_level === "Low" && "<30 = Low"}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* AI Intelligence Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"
      >
        {/* AI Risk Analysis Panel */}
        <AIInsightsPanel threatId={id} threatData={threat} />
        
        {/* Causal Intelligence Panel */}
        <CausalIntelligencePanel threatId={id} threatData={threat} />
      </motion.div>

      {/* Info Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        data-testid="threat-info-grid"
      >
        {infoItems.map((item) => (
          <div key={item.label} className="card p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <item.icon className="w-4 h-4" />
              {item.label}
            </div>
            {isEditing ? (
              item.type === "searchable" ? (
                <SearchableCombobox
                  options={item.options}
                  value={editForm[item.field] || ""}
                  onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}
                  placeholder={`Select ${item.label}...`}
                  searchPlaceholder={`Search ${item.label.toLowerCase()}...`}
                  emptyText={`No ${item.label.toLowerCase()} found.`}
                  allowCustom={true}
                  data-testid={`edit-${item.field}`}
                />
              ) : item.type === "select" ? (
                <Select
                  value={editForm[item.field] || ""}
                  onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {item.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editForm[item.field] || ""}
                  onChange={(e) => setEditForm({ ...editForm, [item.field]: e.target.value })}
                  className="h-9"
                />
              )
            ) : (
              <div className="font-semibold text-slate-900">{item.value}</div>
            )}
          </div>
        ))}
      </motion.div>

      {/* Cause */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card p-6 mb-6"
        data-testid="threat-cause-section"
      >
        <h3 className="font-semibold text-slate-900 mb-2">Root Cause</h3>
        {isEditing ? (
          <Textarea
            value={editForm.cause || ""}
            onChange={(e) => setEditForm({ ...editForm, cause: e.target.value })}
            placeholder="Enter root cause analysis..."
            rows={3}
          />
        ) : (
          <p className="text-slate-600">{threat.cause || "Not specified"}</p>
        )}
      </motion.div>

      {/* Recommended Actions */}
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
            onClick={() => setShowAddActionDialog(true)}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
            data-testid="add-action-button"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Action
          </Button>
        </div>
        <div className="space-y-3">
          {threat.recommended_actions.map((action, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg group"
              data-testid={`action-item-${idx}`}
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                {idx + 1}
              </div>
              <p className="text-slate-700 flex-1">{action}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => promoteToActionMutation.mutate(action)}
                disabled={promoteToActionMutation.isPending}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Add to action tracker"
                data-testid={`promote-action-${idx}`}
              >
                <ClipboardList className="w-4 h-4 mr-1" />
                Act
              </Button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Add Action Dialog */}
      <Dialog open={showAddActionDialog} onOpenChange={setShowAddActionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Action</DialogTitle>
            <DialogDescription>
              Create a new action for this threat. It will be tracked in the Actions tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="action-title">Title *</Label>
              <Input
                id="action-title"
                value={newActionForm.title}
                onChange={(e) => setNewActionForm({ ...newActionForm, title: e.target.value })}
                placeholder="e.g., Replace pump bearings"
                data-testid="action-title-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-description">Description</Label>
              <Textarea
                id="action-description"
                value={newActionForm.description}
                onChange={(e) => setNewActionForm({ ...newActionForm, description: e.target.value })}
                placeholder="Detailed description of the action..."
                rows={3}
                data-testid="action-description-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="action-priority">Priority</Label>
                <Select
                  value={newActionForm.priority}
                  onValueChange={(v) => setNewActionForm({ ...newActionForm, priority: v })}
                >
                  <SelectTrigger data-testid="action-priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="action-assignee">Assignee</Label>
                <Input
                  id="action-assignee"
                  value={newActionForm.assignee}
                  onChange={(e) => setNewActionForm({ ...newActionForm, assignee: e.target.value })}
                  placeholder="Name"
                  data-testid="action-assignee-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-due-date">Due Date</Label>
              <Input
                id="action-due-date"
                type="date"
                value={newActionForm.due_date}
                onChange={(e) => setNewActionForm({ ...newActionForm, due_date: e.target.value })}
                data-testid="action-due-date-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddActionDialog(false)}
              data-testid="cancel-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAction}
              disabled={createActionMutation.isPending || !newActionForm.title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-action-button"
            >
              {createActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metadata */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-center text-sm text-slate-400"
        data-testid="threat-metadata"
      >
        Created {new Date(threat.created_at).toLocaleDateString()} at{" "}
        {new Date(threat.created_at).toLocaleTimeString()}
      </motion.div>
    </div>
  );
};

export default ThreatDetailPage;
