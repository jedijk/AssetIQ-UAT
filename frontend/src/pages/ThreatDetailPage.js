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
  Link,
  Unlink,
  Search,
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

  // Fetch threat - refetch on mount to get latest criticality
  const { data: threat, isLoading, error, refetch: refetchThreat } = useQuery({
    queryKey: ["threat", id],
    queryFn: () => threatsAPI.getById(id),
    refetchOnMount: "always", // Always refetch when component mounts
    staleTime: 0, // Consider data always stale
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
    // First priority: use stored failure_mode_data from the threat itself (from DB link)
    if (threat?.failure_mode_data) {
      return threat.failure_mode_data;
    }
    
    // Second priority: look up from failure modes list by name match
    if (!threat?.failure_mode) return null;
    const fm = failureModes.find(m => m.failure_mode.toLowerCase() === threat.failure_mode.toLowerCase());
    return fm || null;
  }, [threat?.failure_mode, threat?.failure_mode_data, failureModes]);

  // Get criticality data for the linked asset
  // First check if threat has stored criticality data, otherwise look up from equipment nodes
  const linkedCriticalityData = useMemo(() => {
    // First priority: use stored criticality data from the threat itself
    if (threat?.equipment_criticality_data) {
      return threat.equipment_criticality_data;
    }
    
    // Second priority: look up from equipment nodes by linked_equipment_id
    if (threat?.linked_equipment_id) {
      const findById = (nodes) => {
        for (const node of nodes) {
          if (node.id === threat.linked_equipment_id) return node;
          if (node.children) {
            const found = findById(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      const node = findById(equipmentNodes);
      return node?.criticality || null;
    }
    
    // Third priority: look up from equipment nodes by asset name
    if (threat?.asset) {
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
    }
    
    return null;
  }, [threat?.equipment_criticality_data, threat?.linked_equipment_id, threat?.asset, equipmentNodes]);

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

  // Link equipment mutation
  const linkEquipmentMutation = useMutation({
    mutationFn: ({ threatId, equipmentNodeId }) => threatsAPI.linkToEquipment(threatId, equipmentNodeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threat", id] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      toast.success(`Linked to ${data.threat.asset}. Score recalculated: ${data.score_calculation.final_score} (${data.score_calculation.risk_level})`);
      setShowLinkEquipmentDialog(false);
    },
    onError: () => {
      toast.error("Failed to link equipment");
    },
  });

  // State for link equipment dialog
  const [showLinkEquipmentDialog, setShowLinkEquipmentDialog] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");

  // State for link failure mode dialog
  const [showLinkFailureModeDialog, setShowLinkFailureModeDialog] = useState(false);
  const [selectedFailureModeId, setSelectedFailureModeId] = useState(null);
  const [failureModeSearch, setFailureModeSearch] = useState("");

  // Link failure mode mutation
  const linkFailureModeMutation = useMutation({
    mutationFn: ({ threatId, failureModeId }) => threatsAPI.linkToFailureMode(threatId, failureModeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threat", id] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      toast.success(`Linked to ${data.threat.failure_mode}. Score: ${data.score_calculation.final_score} (${data.score_calculation.risk_level})`);
      setShowLinkFailureModeDialog(false);
      setSelectedFailureModeId(null);
      setFailureModeSearch("");
    },
    onError: () => {
      toast.error("Failed to link failure mode");
    },
  });

  // Filter failure modes based on search
  const filteredFailureModes = useMemo(() => {
    if (!failureModeSearch.trim()) return failureModes;
    const search = failureModeSearch.toLowerCase();
    return failureModes.filter(fm => 
      fm.failure_mode.toLowerCase().includes(search) ||
      fm.category.toLowerCase().includes(search) ||
      fm.equipment.toLowerCase().includes(search) ||
      (fm.keywords && fm.keywords.some(k => k.toLowerCase().includes(search)))
    );
  }, [failureModes, failureModeSearch]);

  // Build flat list of equipment nodes for selection
  const flatEquipmentList = useMemo(() => {
    const result = [];
    const flatten = (nodes, parentPath = "") => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath} > ${node.name}` : node.name;
        result.push({
          id: node.id,
          name: node.name,
          path: path,
          level: node.level,
          hasCriticality: !!node.criticality,
          criticalityLevel: node.criticality?.level
        });
        if (node.children) {
          flatten(node.children, path);
        }
      }
    };
    flatten(equipmentNodes);
    return result;
  }, [equipmentNodes]);

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
        {scoreCalcPopup.show && (() => {
          // Calculate the actual values using NEW METHODOLOGY
          // Likelihood Score = (S × O × D) / 10
          const fmBaseScore = linkedFmData 
            ? Math.round((linkedFmData.severity * linkedFmData.occurrence * linkedFmData.detectability) / 10)
            : (threat.fmea_score || threat.base_risk_score || 50);
          
          // Criticality Score = (Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5
          const criticalityScore = linkedCriticalityData
            ? Math.round((
                (linkedCriticalityData.safety_impact || 0) * 25 +
                (linkedCriticalityData.production_impact || 0) * 20 +
                (linkedCriticalityData.environmental_impact || 0) * 15 +
                (linkedCriticalityData.reputation_impact || 0) * 10
              ) / 3.5)
            : (threat.criticality_score || 0);
          
          // Final Score = (Criticality × 0.75) + (Likelihood × 0.25)
          const calculatedScore = Math.round((criticalityScore * 0.75) + (fmBaseScore * 0.25));
          
          return (
            <div 
              ref={scorePopupRef}
              className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-50 w-96"
              style={{ 
                left: Math.min(scoreCalcPopup.x, window.innerWidth - 420), 
                top: Math.min(scoreCalcPopup.y, window.innerHeight - 580) 
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

              {/* Exact Calculation Box - WEIGHTED METHODOLOGY */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 mb-4 border border-blue-100">
                <div className="text-xs text-blue-600 font-medium mb-2">{t("threats.exactCalculation")}</div>
                <div className="font-mono text-lg text-slate-800 text-center py-2">
                  <span className="text-slate-500">(</span>
                  <span className="text-purple-600">{criticalityScore}</span>
                  <span className="text-slate-400 mx-1">×</span>
                  <span className="text-purple-400">0.7</span>
                  <span className="text-slate-500">)</span>
                  <span className="text-slate-400 mx-1">+</span>
                  <span className="text-slate-500">(</span>
                  <span className="text-blue-600">{fmBaseScore}</span>
                  <span className="text-slate-400 mx-1">×</span>
                  <span className="text-blue-400">0.3</span>
                  <span className="text-slate-500">)</span>
                </div>
                <div className="text-center text-[10px] text-slate-500 mt-1">
                  ({t("threats.criticalityScoreLabel")} × 75%) + ({t("threats.fmeaScoreLabel")} × 25%)
                </div>
                <div className="text-center mt-2 pt-2 border-t border-blue-200">
                  <span className="text-slate-500 text-sm">=</span>
                  <span className={`text-3xl font-bold ml-2 ${
                    threat.risk_level === "Critical" ? "text-red-600" :
                    threat.risk_level === "High" ? "text-orange-600" :
                    threat.risk_level === "Medium" ? "text-yellow-600" : "text-green-600"
                  }`}>{threat.risk_score}</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                    threat.risk_level === "Critical" ? "bg-red-100 text-red-700" :
                    threat.risk_level === "High" ? "bg-orange-100 text-orange-700" :
                    threat.risk_level === "Medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                  }`}>{threat.risk_level}</span>
                </div>
              </div>

              {/* Step-by-Step Breakdown */}
              <div className="space-y-3">
                {/* Step 1: FMEA */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</div>
                      <span className="text-xs font-medium text-slate-700">{t("threats.fmeaScores")}</span>
                    </div>
                    <button
                      onClick={() => setShowLinkFailureModeDialog(true)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      data-testid="link-failure-mode-btn"
                    >
                      <Link className="w-3 h-3" />
                      {linkedFmData ? t("threats.relink") : t("threats.linkFailureMode")}
                    </button>
                  </div>
                  {linkedFmData ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="bg-white rounded p-2 text-center border border-red-200">
                          <div className="text-xl font-bold text-red-600">{linkedFmData.severity}</div>
                          <div className="text-[10px] text-red-500">{t("library.severity")}</div>
                        </div>
                        <div className="bg-white rounded p-2 text-center border border-amber-200">
                          <div className="text-xl font-bold text-amber-600">{linkedFmData.occurrence}</div>
                          <div className="text-[10px] text-amber-500">{t("library.occurrence")}</div>
                        </div>
                        <div className="bg-white rounded p-2 text-center border border-blue-200">
                          <div className="text-xl font-bold text-blue-600">{linkedFmData.detectability}</div>
                          <div className="text-[10px] text-blue-500">{t("library.detectability")}</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 bg-white rounded px-2 py-1.5 font-mono">
                        ({linkedFmData.severity} × {linkedFmData.occurrence} × {linkedFmData.detectability}) ÷ 10 = <span className="font-bold text-blue-600">{fmBaseScore}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{t("threats.linkedTo")}: {threat.failure_mode}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400 italic bg-white rounded px-3 py-2">
                      {t("threats.noFmeaLinked")} — {t("threats.fmeaScoreLabel")}: <span className="font-bold text-slate-600">{fmBaseScore}</span>
                    </div>
                  )}
                </div>

                {/* Step 2: Criticality */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</div>
                    <span className="text-xs font-medium text-slate-700">{t("threats.equipmentCriticality")}</span>
                  </div>
                  {linkedCriticalityData ? (
                    <>
                      <div className="grid grid-cols-4 gap-1 mb-2">
                        <div className="text-center bg-white rounded p-1.5 border border-slate-200">
                          <Shield className="w-3 h-3 text-red-500 mx-auto mb-0.5" />
                          <div className="text-sm font-bold text-red-600">{linkedCriticalityData.safety_impact || 0}</div>
                          <div className="text-[8px] text-slate-400">{t("equipment.safetyImpact")}</div>
                        </div>
                        <div className="text-center bg-white rounded p-1.5 border border-slate-200">
                          <Cog className="w-3 h-3 text-orange-500 mx-auto mb-0.5" />
                          <div className="text-sm font-bold text-orange-600">{linkedCriticalityData.production_impact || 0}</div>
                          <div className="text-[8px] text-slate-400">{t("equipment.productionImpact")}</div>
                        </div>
                        <div className="text-center bg-white rounded p-1.5 border border-slate-200">
                          <Leaf className="w-3 h-3 text-green-500 mx-auto mb-0.5" />
                          <div className="text-sm font-bold text-green-600">{linkedCriticalityData.environmental_impact || 0}</div>
                          <div className="text-[8px] text-slate-400">{t("equipment.environmentalImpact")}</div>
                        </div>
                        <div className="text-center bg-white rounded p-1.5 border border-slate-200">
                          <Star className="w-3 h-3 text-purple-500 mx-auto mb-0.5" />
                          <div className="text-sm font-bold text-purple-600">{linkedCriticalityData.reputation_impact || 0}</div>
                          <div className="text-[8px] text-slate-400">{t("equipment.reputationImpact")}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-white rounded px-2 py-1.5">
                        <span className="text-xs text-slate-500">{t("threats.criticalityScoreLabel")}:</span>
                        <span className="text-lg font-bold text-purple-600">{criticalityScore}</span>
                      </div>
                      <div className="text-xs text-slate-600 bg-white rounded px-2 py-1.5 font-mono mt-2">
                        ({linkedCriticalityData.safety_impact || 0}×25 + {linkedCriticalityData.production_impact || 0}×20 + {linkedCriticalityData.environmental_impact || 0}×15 + {linkedCriticalityData.reputation_impact || 0}×10) ÷ 3.5 = <span className="font-bold text-purple-600">{criticalityScore}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{t("threats.linkedTo")}: {threat.asset}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400 italic bg-white rounded px-3 py-2">
                      {t("threats.noCriticalityLinked")} — {t("threats.criticalityScoreLabel")}: <span className="font-bold text-slate-600">0</span>
                    </div>
                  )}
                </div>

                {/* Step 3: Final Result */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</div>
                    <span className="text-xs font-medium text-slate-700">{t("threats.finalCalculation")}</span>
                  </div>
                  <div className="bg-white rounded px-3 py-2 font-mono text-sm">
                    <span className="text-slate-500">(</span>
                    <span className="text-purple-600">{criticalityScore}</span>
                    <span className="text-slate-400">×0.75</span>
                    <span className="text-slate-500">)</span>
                    <span className="text-slate-400 mx-1">+</span>
                    <span className="text-slate-500">(</span>
                    <span className="text-blue-600">{fmBaseScore}</span>
                    <span className="text-slate-400">×0.25</span>
                    <span className="text-slate-500">)</span>
                    <span className="text-slate-400 mx-1">=</span>
                    <span className={`font-bold ${
                      threat.risk_level === "Critical" ? "text-red-600" :
                      threat.risk_level === "High" ? "text-orange-600" :
                      threat.risk_level === "Medium" ? "text-yellow-600" : "text-green-600"
                    }`}>{calculatedScore}</span>
                    {calculatedScore !== threat.risk_score && (
                      <span className="text-slate-400 text-xs ml-1">(stored: {threat.risk_score})</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Risk Level Legend */}
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-[10px] text-slate-400 mb-1">{t("threats.riskLevelThresholds")}:</div>
                <div className="flex gap-2 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600">≥70 Critical</span>
                  <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">50-69 High</span>
                  <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-600">30-49 Medium</span>
                  <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-600">&lt;30 Low</span>
                </div>
              </div>
            </div>
          );
        })()}
      </motion.div>

      {/* Equipment Criticality Linkage Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="card p-4 mb-6"
        data-testid="equipment-criticality-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              linkedCriticalityData ? 'bg-purple-50' : 'bg-slate-100'
            }`}>
              {linkedCriticalityData ? (
                <Link className="w-5 h-5 text-purple-600" />
              ) : (
                <Unlink className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900">
                {t("threats.equipmentCriticality")}
              </div>
              {linkedCriticalityData ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-slate-600">{threat.asset}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-400 italic">{t("threats.noCriticalityLinked")}</div>
              )}
            </div>
          </div>
          
          {/* 4-Dimension Display or Link Button */}
          {linkedCriticalityData ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className="flex flex-col items-center px-2">
                  <Shield className="w-3 h-3 text-red-500 mb-0.5" />
                  <span className="text-sm font-bold text-red-600">{linkedCriticalityData.safety_impact || 0}</span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <Cog className="w-3 h-3 text-orange-500 mb-0.5" />
                  <span className="text-sm font-bold text-orange-600">{linkedCriticalityData.production_impact || 0}</span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <Leaf className="w-3 h-3 text-green-500 mb-0.5" />
                  <span className="text-sm font-bold text-green-600">{linkedCriticalityData.environmental_impact || 0}</span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <Star className="w-3 h-3 text-purple-500 mb-0.5" />
                  <span className="text-sm font-bold text-purple-600">{linkedCriticalityData.reputation_impact || 0}</span>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowLinkEquipmentDialog(true)}
                data-testid="change-equipment-link-btn"
              >
                {t("threats.changeLink")}
              </Button>
            </div>
          ) : (
            <Button 
              size="sm" 
              onClick={() => setShowLinkEquipmentDialog(true)}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="link-equipment-btn"
            >
              <Link className="w-4 h-4 mr-1" />
              {t("threats.linkEquipment")}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Link Equipment Dialog */}
      <Dialog open={showLinkEquipmentDialog} onOpenChange={setShowLinkEquipmentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-purple-600" />
              {t("threats.linkToEquipment")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">{t("threats.linkEquipmentDesc")}</p>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
              {flatEquipmentList.map((eq) => (
                <button
                  key={eq.id}
                  onClick={() => setSelectedEquipmentId(eq.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedEquipmentId === eq.id 
                      ? 'bg-purple-100 border-purple-300 border' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="font-medium text-slate-800">{eq.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{eq.path}</div>
                </button>
              ))}
              {flatEquipmentList.length === 0 && (
                <div className="text-center py-4 text-slate-400">{t("threats.noEquipmentFound")}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkEquipmentDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={() => linkEquipmentMutation.mutate({ threatId: id, equipmentNodeId: selectedEquipmentId })}
              disabled={!selectedEquipmentId || linkEquipmentMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {linkEquipmentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Link className="w-4 h-4 mr-1" />
              )}
              {t("threats.linkAndRecalculate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Failure Mode Dialog */}
      <Dialog open={showLinkFailureModeDialog} onOpenChange={setShowLinkFailureModeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {t("threats.linkToFailureMode")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">{t("threats.linkFailureModeDesc")}</p>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("threats.searchFailureModes")}
                value={failureModeSearch}
                onChange={(e) => setFailureModeSearch(e.target.value)}
                className="pl-9"
                data-testid="failure-mode-search"
              />
            </div>
            
            {/* Failure Modes List */}
            <div className="max-h-72 overflow-y-auto space-y-1 border rounded-lg p-2">
              {filteredFailureModes.map((fm) => (
                <button
                  key={fm.id}
                  onClick={() => setSelectedFailureModeId(fm.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedFailureModeId === fm.id 
                      ? 'bg-amber-100 border-amber-300 border' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                  data-testid={`failure-mode-option-${fm.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800">{fm.failure_mode}</div>
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      fm.rpn >= 300 ? "bg-red-100 text-red-700" :
                      fm.rpn >= 200 ? "bg-orange-100 text-orange-700" :
                      fm.rpn >= 100 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                    }`}>
                      RPN: {fm.rpn}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {fm.category} • {fm.equipment}
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                    <span>S: {fm.severity}</span>
                    <span>O: {fm.occurrence}</span>
                    <span>D: {fm.detectability}</span>
                  </div>
                </button>
              ))}
              {filteredFailureModes.length === 0 && (
                <div className="text-center py-4 text-slate-400">{t("threats.noFailureModesFound")}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowLinkFailureModeDialog(false);
              setSelectedFailureModeId(null);
              setFailureModeSearch("");
            }}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={() => linkFailureModeMutation.mutate({ threatId: id, failureModeId: selectedFailureModeId })}
              disabled={!selectedFailureModeId || linkFailureModeMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {linkFailureModeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Link className="w-4 h-4 mr-1" />
              )}
              {t("threats.linkAndRecalculate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
