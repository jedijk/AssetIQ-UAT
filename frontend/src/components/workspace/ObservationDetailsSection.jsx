/**
 * ObservationDetailsSection
 *
 * Brings every classic ThreatDetailPage feature (edit mode, link equipment/failure mode,
 * attachments, field notes, probable cause, info grid, risk score calc popup,
 * delete, share, status select) into the new Reliability Intelligence Workspace —
 * without changing the Workspace's overall layout.
 *
 * Plug in via:  <ObservationDetailsSection threatId={id} />
 *
 * It fetches its own threat data and renders all editable sections in flow.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Activity,
  Calculator,
  ChevronDown,
  Clock,
  Cog,
  Copy,
  Edit,
  Eye,
  Leaf,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageSquare,
  MoreVertical,
  Save,
  Search,
  Share2,
  Shield,
  Star,
  Target,
  Trash2,
  Unlink,
  User,
  X,
} from "lucide-react";
import {
  threatsAPI,
  equipmentHierarchyAPI,
  failureModesAPI,
  usersAPI,
} from "../../lib/api";
import { useLanguage } from "../../contexts/LanguageContext";
import { useUndo } from "../../contexts/UndoContext";
import {
  useEquipmentNodeNameMap,
  useEquipmentTypeNameMap,
  useFailureModeNameMap,
} from "../../hooks/useTranslatedEntities";
import { formatDateTime } from "../../lib/dateUtils";
import { computeCriticalityScore } from "../../lib/criticalityScore";
import { DISCIPLINES } from "../../constants/disciplines";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import SearchableCombobox from "../SearchableCombobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import AIInsightsPanel from "../AIInsightsPanel";
import CausalIntelligencePanel from "../CausalIntelligencePanel";
import AttachmentsPanel from "../attachments/AttachmentsPanel";

const LIKELIHOOD_OPTIONS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const DETECTABILITY_OPTIONS = ["Easy", "Moderate", "Difficult", "Very Difficult", "Almost Impossible"];
const FREQUENCY_OPTIONS = ["Once", "Rarely", "Occasionally", "Frequently", "Constantly"];
const IMPACT_OPTIONS = ["Minor", "Moderate", "Significant", "Major", "Catastrophic"];
// Work-process stages (match Process Journey at the bottom of the workspace).
// Source: /app/backend/routes/observation_workspace.py get_process_journey().
const STATUS_OPTIONS = ["Observation", "Assessment", "Planning", "Investigation", "Action", "Mitigated", "Learning"];

const ObservationDetailsSection = ({ threatId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const nodeNameMap = useEquipmentNodeNameMap();
  const typeNameMap = useEquipmentTypeNameMap();
  const fmNameMap = useFailureModeNameMap();

  const translateEquipmentTypeName = (n) => {
    if (!n) return n;
    const k = String(n).trim().toLowerCase();
    return nodeNameMap[k] || typeNameMap[k] || n;
  };
  const translateFailureModeName = (n) => {
    if (!n) return n;
    return fmNameMap[String(n).trim().toLowerCase()] || n;
  };
  const translateEnum = (v) => {
    if (!v) return v;
    const k = `enums.${v}`;
    const out = t(k);
    return out && out !== k ? out : v;
  };

  // --- Data fetches ---------------------------------------------------------
  const { data: threat } = useQuery({
    queryKey: ["threat", threatId],
    queryFn: () => threatsAPI.getById(threatId),
    enabled: !!threatId,
    staleTime: 30 * 1000,
  });

  const { data: equipmentNodesData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentNodes = useMemo(() => equipmentNodesData?.nodes ?? [], [equipmentNodesData]);

  const { data: equipmentTypesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentTypes = useMemo(() => equipmentTypesData?.equipment_types ?? [], [equipmentTypesData]);

  const { data: failureModesData } = useQuery({
    queryKey: ["failure-modes-all"],
    queryFn: () => failureModesAPI.getAll({}),
    staleTime: 5 * 60 * 1000,
  });
  const failureModes = useMemo(() => failureModesData?.failure_modes ?? [], [failureModesData]);

  const { data: usersData } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const usersList = usersData?.users || [];

  // --- Local UI state -------------------------------------------------------
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [scoreCalcPopup, setScoreCalcPopup] = useState({ show: false, x: 0, y: 0 });
  const scorePopupRef = useRef(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [showLinkEquipmentDialog, setShowLinkEquipmentDialog] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [showLinkFailureModeDialog, setShowLinkFailureModeDialog] = useState(false);
  const [selectedFailureModeId, setSelectedFailureModeId] = useState(null);
  const [failureModeSearch, setFailureModeSearch] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // --- Mutations ------------------------------------------------------------
  const updateMutation = useMutation({
    mutationFn: (data) => threatsAPI.update(threatId, data),
    onSuccess: (_resp, variables) => {
      const oldData = { ...threat };
      pushUndo({
        type: "UPDATE_THREAT",
        label: `Edit threat "${threat?.title || ""}"`,
        data: { oldData, newData: variables },
        undo: async () => {
          await threatsAPI.update(threatId, oldData);
          queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
          queryClient.invalidateQueries({ queryKey: ["observation-workspace", threatId] });
          queryClient.invalidateQueries({ queryKey: ["threats"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
        },
      });
      queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
      queryClient.invalidateQueries({ queryKey: ["observation-workspace", threatId] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline", threatId] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Observation updated");
      setIsEditing(false);
    },
    onError: () => toast.error("Failed to update observation"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => threatsAPI.delete(threatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Observation deleted");
      navigate("/threats");
    },
    onError: () => toast.error("Failed to delete observation"),
  });

  const linkEquipmentMutation = useMutation({
    mutationFn: ({ equipmentNodeId }) => threatsAPI.linkToEquipment(threatId, equipmentNodeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
      queryClient.invalidateQueries({ queryKey: ["observation-workspace", threatId] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      toast.success(
        `Linked to ${data.threat.asset}. Score: ${data.score_calculation.final_score} (${data.score_calculation.risk_level})`
      );
      setShowLinkEquipmentDialog(false);
    },
    onError: () => toast.error("Failed to link equipment"),
  });

  const linkFailureModeMutation = useMutation({
    mutationFn: ({ failureModeId }) => threatsAPI.linkToFailureMode(threatId, failureModeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
      queryClient.invalidateQueries({ queryKey: ["observation-workspace", threatId] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      toast.success(
        `Linked to ${data.threat.failure_mode}. Score: ${data.score_calculation.final_score} (${data.score_calculation.risk_level})`
      );
      setShowLinkFailureModeDialog(false);
      setSelectedFailureModeId(null);
      setFailureModeSearch("");
    },
    onError: () => toast.error("Failed to link failure mode"),
  });

  // --- Derived data ---------------------------------------------------------
  const linkedFmData = useMemo(() => {
    if (threat?.failure_mode_data) return threat.failure_mode_data;
    if (!threat?.failure_mode) return null;
    return failureModes.find((m) => m.failure_mode.toLowerCase() === threat.failure_mode.toLowerCase()) || null;
  }, [threat?.failure_mode, threat?.failure_mode_data, failureModes]);

  const linkedCriticalityData = useMemo(() => {
    if (!threat) return null;
    const targetId = threat.linked_equipment_id;
    const targetName = threat.asset;
    if (threat.equipment_criticality_data) return threat.equipment_criticality_data;
    const findFirst = (nodes, predicate) => {
      for (const node of nodes) {
        if (predicate(node)) return node;
        if (node.children) {
          const found = findFirst(node.children, predicate);
          if (found) return found;
        }
      }
      return null;
    };
    if (targetId) {
      return findFirst(equipmentNodes, (n) => n.id === targetId)?.criticality || null;
    }
    if (targetName) {
      return findFirst(equipmentNodes, (n) => n.name === targetName)?.criticality || null;
    }
    return null;
  }, [threat, equipmentNodes]);

  const rpnValue = linkedFmData?.rpn || threat?.fmea_rpn || threat?.rpn || null;

  const equipmentTypeOptions = useMemo(
    () => equipmentTypes.map((type) => ({ value: type.name, label: type.name, description: type.category || type.discipline })),
    [equipmentTypes]
  );
  const failureModeOptions = useMemo(
    () => failureModes.map((m) => ({ value: m.failure_mode, label: m.failure_mode, description: m.equipment || m.category })),
    [failureModes]
  );

  const flatEquipmentList = useMemo(() => {
    const result = [];
    const eqTypeNameById = {};
    for (const et of equipmentTypes) eqTypeNameById[et.id] = et.name;
    const flatten = (nodes, parentPath = "") => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath} > ${node.name}` : node.name;
        result.push({
          id: node.id,
          name: node.name,
          path,
          level: node.level,
          discipline: node.discipline,
          equipmentTypeName: node.equipment_type_id ? eqTypeNameById[node.equipment_type_id] : null,
          hasCriticality: !!node.criticality,
          criticalityLevel: node.criticality?.level,
        });
        if (node.children) flatten(node.children, path);
      }
    };
    flatten(equipmentNodes);
    return result;
  }, [equipmentNodes, equipmentTypes]);

  const filteredEquipmentList = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return flatEquipmentList;
    return flatEquipmentList.filter(
      (eq) =>
        (eq.name || "").toLowerCase().includes(q) ||
        (eq.path || "").toLowerCase().includes(q) ||
        (eq.level || "").toLowerCase().includes(q) ||
        (eq.discipline || "").toLowerCase().includes(q) ||
        (eq.equipmentTypeName || "").toLowerCase().includes(q) ||
        (eq.criticalityLevel || "").toLowerCase().includes(q)
    );
  }, [flatEquipmentList, equipmentSearch]);

  const filteredFailureModes = useMemo(() => {
    if (!failureModeSearch.trim()) return failureModes;
    const q = failureModeSearch.toLowerCase();
    return failureModes.filter(
      (fm) =>
        fm.failure_mode.toLowerCase().includes(q) ||
        fm.category.toLowerCase().includes(q) ||
        fm.equipment.toLowerCase().includes(q) ||
        (fm.keywords && fm.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  }, [failureModes, failureModeSearch]);

  // Close score popup on outside click
  useEffect(() => {
    const onMouseDown = (e) => {
      if (scorePopupRef.current && !scorePopupRef.current.contains(e.target)) {
        setScoreCalcPopup({ show: false, x: 0, y: 0 });
      }
    };
    if (scoreCalcPopup.show) {
      document.addEventListener("mousedown", onMouseDown);
      return () => document.removeEventListener("mousedown", onMouseDown);
    }
  }, [scoreCalcPopup.show]);

  // The action bar (status + edit + share + ••• + RPN + tag + datetime) is rendered
  // into the page hero via portal, so it appears inside the workspace header.
  const [heroSlot, setHeroSlot] = useState(null);
  useEffect(() => {
    setHeroSlot(document.getElementById("workspace-hero-slot"));
  }, [threat]);

  if (!threat) return null;

  // --- Helpers --------------------------------------------------------------
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
      owner_id: threat.owner_id || "",
      owner_name: threat.owner_name || "",
      discipline: threat.discipline || "",
      attachments: threat.attachments || [],
    });
    setIsEditing(true);
  };
  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
  };
  const saveChanges = () => updateMutation.mutate(editForm);

  const shareableLink = `${window.location.origin}/threats/${threatId}/workspace`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success("Link copied to clipboard");
    } catch {
      toast.success("Link ready to copy");
    }
  };
  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Observation: ${threat.title || ""}`,
          text: `${threat.threat_number || ""} - ${threat.title || ""}`,
          url: shareableLink,
        });
      } catch (err) {
        if (err.name !== "AbortError") copyLink();
      }
    } else {
      setShareDialogOpen(true);
    }
  };

  const infoItems = [
    { label: t("observations.equipmentType"), value: translateEquipmentTypeName(threat.equipment_type), icon: Target, field: "equipment_type", type: "searchable", options: equipmentTypeOptions },
    { label: t("observations.failureMode"), value: translateFailureModeName(threat.failure_mode), icon: AlertTriangle, field: "failure_mode", type: "searchable", options: failureModeOptions },
    { label: t("observations.impact"), value: translateEnum(threat.impact), icon: Activity, field: "impact", type: "select", options: IMPACT_OPTIONS },
    { label: t("observations.frequency"), value: translateEnum(threat.frequency), icon: Clock, field: "frequency", type: "select", options: FREQUENCY_OPTIONS },
    { label: t("observations.likelihood"), value: translateEnum(threat.likelihood), icon: Activity, field: "likelihood", type: "select", options: LIKELIHOOD_OPTIONS },
    { label: t("observations.detectability"), value: translateEnum(threat.detectability), icon: Eye, field: "detectability", type: "select", options: DETECTABILITY_OPTIONS },
    { label: t("observations.location"), value: threat.location || translateEnum("Not specified"), icon: MapPin, field: "location", type: "text" },
    { label: translateEnum("Owner"), value: threat.owner_name || translateEnum("Not assigned"), icon: User, field: "owner_id", type: "user-select" },
  ];

  // --- Render ---------------------------------------------------------------
  const actionBar = (
    <div className="flex items-center justify-between flex-wrap gap-3 w-full" data-testid="workspace-actions-bar">
      <div className="flex items-center gap-2 flex-wrap">
        {threat.equipment_tag && (
          <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded">
            {threat.equipment_tag}
          </span>
        )}
        {threat.created_at && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            {formatDateTime(threat.created_at)}
          </span>
        )}
        {/* Risk Score badge */}
        {(threat.risk_score !== undefined && threat.risk_score !== null) && (
          <span
            className={`text-xs font-semibold px-2 py-1 rounded ${
              threat.risk_level === "Critical" ? "bg-red-100 text-red-700"
              : threat.risk_level === "High" ? "bg-orange-100 text-orange-700"
              : threat.risk_level === "Medium" ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
            }`}
            title="Risk Score (right-click the card below for calculation details)"
            data-testid="hero-risk-score"
          >
            Risk {threat.risk_score}
          </span>
        )}
        {rpnValue && (
          <span
            className={`text-xs font-semibold px-2 py-1 rounded ${
              rpnValue >= 300 ? "bg-red-100 text-red-700"
              : rpnValue >= 200 ? "bg-orange-100 text-orange-700"
              : rpnValue >= 100 ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
            }`}
            title="Risk Priority Number"
          >
            RPN {rpnValue}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <Button size="sm" variant="outline" onClick={cancelEditing} data-testid="cancel-edit-btn">
              <X className="w-3 h-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700" data-testid="save-edit-btn">
              {updateMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
          </>
        ) : (
          <>
            <Select
              value={threat.status}
              onValueChange={(v) => updateMutation.mutate({ status: v })}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="h-8 min-w-[8.5rem] text-xs" data-testid="workspace-status-select">
                <SelectValue>{translateEnum(threat.status)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{translateEnum(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={shareLink} title="Share" data-testid="workspace-share-btn">
              <Share2 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={startEditing} data-testid="workspace-edit-btn">
              <Edit className="w-3 h-3 mr-1" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" data-testid="workspace-more-menu">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowLinkEquipmentDialog(true)} data-testid="menu-link-equipment">
                  <LinkIcon className="w-4 h-4 mr-2" /> Link Equipment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowLinkFailureModeDialog(true)} data-testid="menu-link-failure-mode">
                  <AlertTriangle className="w-4 h-4 mr-2" /> Link Failure Mode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/threats/${threatId}`)}>
                  Open Classic View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Action bar — rendered into the page hero via portal when the slot exists; falls back to inline if no slot found. */}
      {heroSlot ? createPortal(actionBar, heroSlot) : (
        <div className="bg-white rounded-xl border border-slate-200 p-4">{actionBar}</div>
      )}

      {/* Risk Score + Equipment Criticality (right-click on score → calc popup) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white rounded-xl border border-l-4 p-4 ${
          threat.risk_level === "Critical" ? "border-l-red-500"
          : threat.risk_level === "High" ? "border-l-orange-500"
          : threat.risk_level === "Medium" ? "border-l-yellow-500"
          : "border-l-green-500"
        }`}
        onContextMenu={(e) => {
          e.preventDefault();
          setScoreCalcPopup({ show: true, x: e.clientX, y: e.clientY });
        }}
        data-testid="workspace-risk-score-card"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6 sm:gap-10">
            <div>
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
                Risk Score
                <span className="text-[10px] text-slate-400 hidden sm:inline">(right-click for details)</span>
              </div>
              <div className="text-3xl font-bold text-slate-900">{threat.risk_score}</div>
            </div>
            {rpnValue && (
              <div className="border-l border-slate-200 pl-6">
                <div className="text-xs font-medium text-slate-500">RPN</div>
                <div
                  className={`text-3xl font-bold ${
                    rpnValue >= 300 ? "text-red-600"
                    : rpnValue >= 200 ? "text-orange-600"
                    : rpnValue >= 100 ? "text-yellow-600"
                    : "text-green-600"
                  }`}
                >
                  {rpnValue}
                </div>
              </div>
            )}
            {linkedCriticalityData && (
              <div className="hidden md:flex items-center gap-1 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-0.5 px-1.5">
                  <Shield className="w-3 h-3 text-red-500" />
                  <span className="text-sm font-bold text-red-600">{linkedCriticalityData.safety_impact || 0}</span>
                </div>
                <div className="flex items-center gap-0.5 px-1.5 border-l border-slate-200">
                  <Cog className="w-3 h-3 text-orange-500" />
                  <span className="text-sm font-bold text-orange-600">{linkedCriticalityData.production_impact || 0}</span>
                </div>
                <div className="flex items-center gap-0.5 px-1.5 border-l border-slate-200">
                  <Leaf className="w-3 h-3 text-green-500" />
                  <span className="text-sm font-bold text-green-600">{linkedCriticalityData.environmental_impact || 0}</span>
                </div>
                <div className="flex items-center gap-0.5 px-1.5 border-l border-slate-200">
                  <Star className="w-3 h-3 text-purple-500" />
                  <span className="text-sm font-bold text-purple-600">{linkedCriticalityData.reputation_impact || 0}</span>
                </div>
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant={linkedCriticalityData ? "outline" : "default"}
            onClick={() => setShowLinkEquipmentDialog(true)}
            className={linkedCriticalityData ? "" : "bg-purple-600 hover:bg-purple-700"}
            data-testid={linkedCriticalityData ? "change-equipment-link-btn" : "link-equipment-btn"}
          >
            {linkedCriticalityData ? <LinkIcon className="w-3 h-3 mr-1" /> : <Unlink className="w-3 h-3 mr-1" />}
            {linkedCriticalityData ? "Change Link" : "Link Equipment"}
          </Button>
        </div>

        {scoreCalcPopup.show && (() => {
          const fmBaseScore = linkedFmData
            ? Math.round((linkedFmData.severity * linkedFmData.occurrence * linkedFmData.detectability) / 10)
            : (threat.fmea_score || threat.base_risk_score || 50);
          const criticalityScore = computeCriticalityScore(linkedCriticalityData) ?? threat.criticality_score ?? 0;
          return (
            <div
              ref={scorePopupRef}
              className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 z-50 w-80"
              style={{
                left: Math.min(Math.max(scoreCalcPopup.x, 16), window.innerWidth - 340),
                top: Math.min(Math.max(scoreCalcPopup.y, 16), window.innerHeight - 100),
              }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-sm">Score Calculation</h3>
                </div>
                <button onClick={() => setScoreCalcPopup({ show: false, x: 0, y: 0 })} className="p-1 hover:bg-slate-100 rounded">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-3">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 mb-3 border border-blue-100">
                  <div className="font-mono text-sm text-center">
                    <span className="text-purple-600 font-semibold">{criticalityScore}</span>
                    <span className="text-slate-400 mx-1">×</span>
                    <span className="text-purple-400 text-xs">{threat.risk_settings_used?.criticality_weight || 0.75}</span>
                    <span className="text-slate-400 mx-2">+</span>
                    <span className="text-blue-600 font-semibold">{fmBaseScore}</span>
                    <span className="text-slate-400 mx-1">×</span>
                    <span className="text-blue-400 text-xs">{threat.risk_settings_used?.fmea_weight || 0.25}</span>
                    <span className="text-slate-400 mx-2">=</span>
                    <span className="text-xl font-bold">{threat.risk_score}</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded p-2 mb-2">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs font-medium">FMEA</span>
                    <button onClick={() => setShowLinkFailureModeDialog(true)} className="text-[9px] text-blue-600 hover:underline">
                      {linkedFmData ? "Relink" : "Link"}
                    </button>
                  </div>
                  {linkedFmData ? (
                    <div className="flex gap-1">
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-red-600">{linkedFmData.severity}</div><div className="text-[8px] text-slate-400">S</div></div>
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-amber-600">{linkedFmData.occurrence}</div><div className="text-[8px] text-slate-400">O</div></div>
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-blue-600">{linkedFmData.detectability}</div><div className="text-[8px] text-slate-400">D</div></div>
                      <div className="bg-blue-50 rounded p-1 text-center flex-1 border border-blue-200 font-bold text-blue-700 text-sm flex items-center justify-center">{fmBaseScore}</div>
                    </div>
                  ) : <div className="text-xs text-slate-400 italic">Not linked: <b>{fmBaseScore}</b></div>}
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs font-medium mb-1.5">Criticality</div>
                  {linkedCriticalityData ? (
                    <div className="flex gap-1">
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-red-600">{linkedCriticalityData.safety_impact || 0}</div><div className="text-[8px] text-slate-400">S</div></div>
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-orange-600">{linkedCriticalityData.production_impact || 0}</div><div className="text-[8px] text-slate-400">P</div></div>
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-green-600">{linkedCriticalityData.environmental_impact || 0}</div><div className="text-[8px] text-slate-400">E</div></div>
                      <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-purple-600">{linkedCriticalityData.reputation_impact || 0}</div><div className="text-[8px] text-slate-400">R</div></div>
                      <div className="bg-purple-50 rounded p-1 text-center flex-1 border border-purple-200 font-bold text-purple-700 text-sm flex items-center justify-center">{criticalityScore}</div>
                    </div>
                  ) : <div className="text-xs text-slate-400 italic">Not linked: <b>0</b></div>}
                </div>
              </div>
            </div>
          );
        })()}
      </motion.div>

      {/* Info Grid — 8 attributes (editable) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        data-testid="workspace-info-grid"
      >
        {infoItems.map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
              <item.icon className="w-3 h-3" />
              <span className="truncate">{item.label}</span>
            </div>
            {isEditing ? (
              item.type === "searchable" ? (
                <SearchableCombobox
                  options={item.options}
                  value={editForm[item.field] || ""}
                  onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}
                  placeholder={`Select ${item.label}...`}
                  searchPlaceholder={`Search ${item.label.toLowerCase()}...`}
                  emptyText="No results"
                  allowCustom
                />
              ) : item.type === "select" ? (
                <Select value={editForm[item.field] || ""} onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {item.options.map((o) => <SelectItem key={o} value={o}>{translateEnum(o)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : item.type === "user-select" ? (
                <Select
                  value={editForm.owner_id || "_none"}
                  onValueChange={(v) => {
                    if (v === "_none") setEditForm({ ...editForm, owner_id: "", owner_name: "" });
                    else {
                      const u = usersList.find((x) => x.id === v);
                      setEditForm({ ...editForm, owner_id: v, owner_name: u?.name || "" });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not assigned</SelectItem>
                    {usersList.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editForm[item.field] || ""}
                  onChange={(e) => setEditForm({ ...editForm, [item.field]: e.target.value })}
                  className="h-8 text-xs"
                />
              )
            ) : (
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-900 text-sm truncate">{item.value}</span>
                {item.field === "failure_mode" && threat.is_new_failure_mode && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">NEW</span>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Discipline (extra editable field, full row on its own line) */}
        {isEditing && (
          <div className="bg-white rounded-xl border border-slate-200 p-3 col-span-2 md:col-span-2">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
              <Cog className="w-3 h-3" />
              <span>Discipline</span>
            </div>
            <Select
              value={editForm.discipline || "_none"}
              onValueChange={(v) => setEditForm({ ...editForm, discipline: v === "_none" ? "" : v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select discipline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Not specified</SelectItem>
                {DISCIPLINES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </motion.div>

      {/* AI Insights + Causal Intelligence */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AIInsightsPanel threatId={threatId} threatData={threat} />
        <CausalIntelligencePanel threatId={threatId} threatData={threat} />
      </motion.div>

      {/* Attachments */}
      {(isEditing || (threat.attachments && threat.attachments.length > 0)) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <AttachmentsPanel
            title="Attachments"
            items={isEditing ? editForm.attachments : (threat.attachments || [])}
            editable={isEditing}
            isUploading={uploadingPhoto}
            getKey={(a) => a?.id}
            getName={(a) => a?.name || a?.filename || "Attachment"}
            getUrl={(a) => a?.data}
            getContentType={(a) => a?.mime || a?.content_type || a?.type}
            onAddFiles={async (files) => {
              for (const file of files) {
                await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror = () => reject(new Error("Failed to read file"));
                  reader.readAsDataURL(file);
                }).then((dataUrl) => {
                  const isImage = (file.type || "").startsWith("image/");
                  const ext = file.name?.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
                  const newAttachment = {
                    id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    type: isImage ? "image" : "file",
                    name: file.name,
                    mime: file.type || "application/octet-stream",
                    size: file.size,
                    ext,
                    data: dataUrl,
                    created_at: new Date().toISOString(),
                  };
                  setEditForm((prev) => ({ ...prev, attachments: [...(prev.attachments || []), newAttachment] }));
                });
              }
            }}
            onRemove={(_raw, idToRemove) => {
              setEditForm((prev) => ({
                ...prev,
                attachments: (prev.attachments || []).filter((a) => a?.id !== idToRemove),
              }));
            }}
          />
        </div>
      )}

      {/* Field Notes / user_context */}
      {threat.user_context && (
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="workspace-field-notes">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Field Notes</h3>
            {threat.context_added_at && (
              <span className="text-xs text-slate-400">added {formatDateTime(threat.context_added_at)}</span>
            )}
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-slate-700 whitespace-pre-wrap text-sm">{threat.user_context}</p>
          </div>
        </div>
      )}

      {/* Probable Cause */}
      <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="workspace-cause">
        <h3 className="font-semibold text-slate-900 text-sm mb-2">Probable Cause</h3>
        {isEditing ? (
          <Textarea
            value={editForm.cause || ""}
            onChange={(e) => setEditForm({ ...editForm, cause: e.target.value })}
            placeholder="Enter probable cause…"
            rows={3}
          />
        ) : (
          <p className="text-slate-600 text-sm whitespace-pre-wrap">{threat.cause || translateEnum("Not specified")}</p>
        )}
      </div>

      {/* Delete */}
      <div className="pt-4 mt-2 border-t border-slate-200">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" data-testid="workspace-delete-btn">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Observation
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Observation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-btn">
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              Share Observation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Anyone with the link can view this observation.</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-slate-100 rounded-lg border text-sm font-mono text-slate-600 truncate">
                {shareableLink}
              </div>
              <Button size="sm" onClick={() => { copyLink(); setShareDialogOpen(false); }}>
                <Copy className="w-4 h-4 mr-1" /> Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Equipment Dialog */}
      <Dialog open={showLinkEquipmentDialog} onOpenChange={(o) => { setShowLinkEquipmentDialog(o); if (!o) setEquipmentSearch(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-purple-600" />
              Link to Equipment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search equipment by tag, name, level…"
                value={equipmentSearch}
                onChange={(e) => setEquipmentSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
              {filteredEquipmentList.map((eq) => (
                <button
                  key={eq.id}
                  onClick={() => setSelectedEquipmentId(eq.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    selectedEquipmentId === eq.id ? "bg-purple-100 border-purple-300 border" : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <div className="font-medium text-slate-800">{eq.name}</div>
                  <div className="text-xs text-slate-500 truncate">{eq.path}</div>
                </button>
              ))}
              {filteredEquipmentList.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-sm">No equipment found</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkEquipmentDialog(false)}>Cancel</Button>
            <Button
              onClick={() => linkEquipmentMutation.mutate({ equipmentNodeId: selectedEquipmentId })}
              disabled={!selectedEquipmentId || linkEquipmentMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {linkEquipmentMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />}
              Link & Recalculate
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
              Link to Failure Mode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search failure modes…"
                value={failureModeSearch}
                onChange={(e) => setFailureModeSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 border rounded-lg p-2">
              {filteredFailureModes.map((fm) => (
                <button
                  key={fm.id}
                  onClick={() => setSelectedFailureModeId(fm.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    selectedFailureModeId === fm.id ? "bg-amber-100 border-amber-300 border" : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800">{fm.failure_mode}</div>
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      fm.rpn >= 300 ? "bg-red-100 text-red-700"
                      : fm.rpn >= 200 ? "bg-orange-100 text-orange-700"
                      : fm.rpn >= 100 ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                    }`}>RPN: {fm.rpn}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{fm.category} • {fm.equipment}</div>
                </button>
              ))}
              {filteredFailureModes.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-sm">No failure modes found</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkFailureModeDialog(false); setSelectedFailureModeId(null); setFailureModeSearch(""); }}>Cancel</Button>
            <Button
              onClick={() => linkFailureModeMutation.mutate({ failureModeId: selectedFailureModeId })}
              disabled={!selectedFailureModeId || linkFailureModeMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {linkFailureModeMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />}
              Link & Recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObservationDetailsSection;
