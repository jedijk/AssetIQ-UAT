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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Activity,
  Calculator,
  Camera,
  ChevronDown,
  Clock,
  Cog,
  Copy,
  Edit,
  Eye,
  FileText,
  Leaf,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Save,
  Search,
  Share2,
  Shield,
  Sparkles,
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
  refreshObservationWorkspace,
} from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { useLanguage } from "../../contexts/LanguageContext";
import { useUndo } from "../../contexts/UndoContext";
import {
  useEquipmentNodeIdMap,
  useEquipmentNodeNameMap,
  useEquipmentTypeNameMap,
  useFailureModeNameMap,
  useTranslatedFailureModes,
} from "../../hooks/useTranslatedEntities";
import { formatDateTime } from "../../lib/dateUtils";
import { computeCriticalityScore } from "../../lib/criticalityScore";
import { useDisciplines } from "../../hooks/useDisciplines";
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
} from "../ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const LIKELIHOOD_OPTIONS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const DETECTABILITY_OPTIONS = ["Easy", "Moderate", "Difficult", "Very Difficult", "Almost Impossible"];
const FREQUENCY_OPTIONS = ["Once", "Rarely", "Occasionally", "Frequently", "Constantly"];
const IMPACT_OPTIONS = ["Minor", "Moderate", "Significant", "Major", "Catastrophic"];
// Work-process stages (match Process Journey at the bottom of the workspace).
// Source: /app/backend/routes/observation_workspace.py get_process_journey().
const STATUS_OPTIONS = ["Observation", "Assessment", "Planning", "Investigation", "Action", "Mitigated", "Learning"];

const ObservationDetailsSection = ({ threatId, workspaceObservation }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const { t, language } = useLanguage();
  const { disciplines, getLabel, normalize: normalizeDiscipline } = useDisciplines();
  const nodeNameMap = useEquipmentNodeNameMap();
  const nodeIdMap = useEquipmentNodeIdMap();
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
  const { data: threatData } = useQuery({
    queryKey: [...queryKeys.threats.legacyDetail(threatId), language],
    queryFn: () => threatsAPI.getById(threatId, { language }),
    enabled: !!threatId && !!workspaceObservation,
    staleTime: 60 * 1000,
  });

  // Merge workspace observation (translated) with full threat data.
  // Render immediately from workspaceObservation while the detail GET completes.
  const threat = useMemo(() => {
    if (threatData && workspaceObservation) {
      return {
        ...threatData,
        title: workspaceObservation.title || threatData.title,
        description: workspaceObservation.description || threatData.description,
        user_context: workspaceObservation.user_context || threatData.user_context,
      };
    }
    if (workspaceObservation) {
      return workspaceObservation;
    }
    return threatData || null;
  }, [threatData, workspaceObservation]);

  const { data: equipmentNodesData } = useQuery({
    queryKey: queryKeys.equipment.nodes(),
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentNodes = useMemo(() => equipmentNodesData?.nodes ?? [], [equipmentNodesData]);

  const { data: equipmentTypesData } = useQuery({
    queryKey: queryKeys.equipment.types(),
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentTypes = useMemo(() => equipmentTypesData?.equipment_types ?? [], [equipmentTypesData]);

  const { data: failureModesData } = useQuery({
    queryKey: queryKeys.failureModes.allForLookup(),
    queryFn: () => failureModesAPI.getAll({}),
    staleTime: 5 * 60 * 1000,
  });
  const failureModes = useMemo(() => failureModesData?.failure_modes ?? [], [failureModesData]);
  const { failureModes: translatedFailureModes } = useTranslatedFailureModes(failureModes);

  const resolveNodeDisplayName = useCallback(
    (node) => {
      if (!node) return "";
      const byId = nodeIdMap[node.id]?.name;
      if (byId) return byId;
      const key = String(node.name || "").trim().toLowerCase();
      return nodeNameMap[key] || node.name || "";
    },
    [nodeIdMap, nodeNameMap]
  );

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.rbac(),
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const attachmentInputRef = useRef(null);
  const [showAttList, setShowAttList] = useState(false);
  const [previewAtt, setPreviewAtt] = useState(null);
  const [aiImprovingDesc, setAiImprovingDesc] = useState(false);

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
          queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(threatId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
        },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timeline(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
      toast.success(t("observations.observationUpdated"));
      setIsEditing(false);
    },
    onError: () => toast.error(t("observations.observationUpdateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => threatsAPI.delete(threatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
      toast.success(t("observations.observationDeleted"));
      navigate("/threats");
    },
    onError: () => toast.error(t("observations.observationDeleteFailed")),
  });

  const linkEquipmentMutation = useMutation({
    mutationFn: ({ equipmentNodeId }) => threatsAPI.linkToEquipment(threatId, equipmentNodeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(threatId) });
      toast.success(
        t("observations.linkedEquipmentToast", {
          asset: translateEquipmentTypeName(data.threat.asset) || data.threat.asset,
          score: data.score_calculation.final_score,
          level: translateEnum(data.score_calculation.risk_level),
        })
      );
      setShowLinkEquipmentDialog(false);
    },
    onError: () => toast.error(t("observations.linkEquipmentFailed")),
  });

  const linkFailureModeMutation = useMutation({
    mutationFn: ({ failureModeId }) => threatsAPI.linkToFailureMode(threatId, failureModeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.legacyDetail(threatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(threatId) });
      toast.success(
        t("observations.linkedFailureModeToast", {
          failureMode: translateFailureModeName(data.threat.failure_mode) || data.threat.failure_mode,
          score: data.score_calculation.final_score,
          level: translateEnum(data.score_calculation.risk_level),
        })
      );
      setShowLinkFailureModeDialog(false);
      setSelectedFailureModeId(null);
      setFailureModeSearch("");
    },
    onError: () => toast.error(t("observations.linkFailureModeFailed")),
  });

  // AI improve description mutation
  const improveDescriptionMutation = useMutation({
    mutationFn: () => threatsAPI.improveDescription(threatId, { language }),
    onSuccess: async () => {
      await refreshObservationWorkspace(queryClient, threatId);
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      await queryClient.refetchQueries({
        queryKey: [...queryKeys.threats.legacyDetail(threatId), language],
        type: "active",
      });
      toast.success(t("observationWorkspace.descriptionImproved") || "Description improved with AI");
      setAiImprovingDesc(false);
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || "Failed to improve description");
      setAiImprovingDesc(false);
    },
  });

  const handleImproveDescription = () => {
    const currentDesc = threat?.user_context || threat?.description || "";
    if (!currentDesc.trim()) {
      toast.error("No description to improve");
      return;
    }
    setAiImprovingDesc(true);
    improveDescriptionMutation.mutate();
  };

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
    () =>
      translatedFailureModes.map((m) => ({
        value: m._originalName || m.failure_mode,
        label: m.failure_mode,
        description: translateEquipmentTypeName(m.equipment) || m.equipment || m.category,
      })),
    [translatedFailureModes, translateEquipmentTypeName]
  );

  const flatEquipmentList = useMemo(() => {
    const result = [];
    const eqTypeNameById = {};
    for (const et of equipmentTypes) {
      eqTypeNameById[et.id] = translateEquipmentTypeName(et.name) || et.name;
    }
    const flatten = (nodes, parentPath = "") => {
      for (const node of nodes) {
        const displayName = resolveNodeDisplayName(node);
        const path = parentPath ? `${parentPath} > ${displayName}` : displayName;
        const rawTypeName = node.equipment_type_id ? eqTypeNameById[node.equipment_type_id] : null;
        result.push({
          id: node.id,
          name: displayName,
          originalName: node.name,
          path,
          level: node.level,
          discipline: node.discipline ? getLabel(normalizeDiscipline(node.discipline)) : null,
          equipmentTypeName: rawTypeName,
          hasCriticality: !!node.criticality,
          criticalityLevel: node.criticality?.level,
        });
        if (node.children) flatten(node.children, path);
      }
    };
    flatten(equipmentNodes);
    return result;
  }, [equipmentNodes, equipmentTypes, resolveNodeDisplayName, translateEquipmentTypeName, getLabel, normalizeDiscipline]);

  const filteredEquipmentList = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return flatEquipmentList;
    return flatEquipmentList.filter(
      (eq) =>
        (eq.name || "").toLowerCase().includes(q) ||
        (eq.originalName || "").toLowerCase().includes(q) ||
        (eq.path || "").toLowerCase().includes(q) ||
        (eq.level || "").toLowerCase().includes(q) ||
        (eq.discipline || "").toLowerCase().includes(q) ||
        (eq.equipmentTypeName || "").toLowerCase().includes(q) ||
        (eq.criticalityLevel || "").toLowerCase().includes(q)
    );
  }, [flatEquipmentList, equipmentSearch]);

  const filteredFailureModes = useMemo(() => {
    if (!failureModeSearch.trim()) return translatedFailureModes;
    const q = failureModeSearch.toLowerCase();
    return translatedFailureModes.filter((fm) => {
      const modeNames = [fm.failure_mode, fm._originalName].filter(Boolean);
      const equipmentNames = [
        fm.equipment,
        translateEquipmentTypeName(fm.equipment),
      ].filter(Boolean);
      return (
        modeNames.some((n) => n.toLowerCase().includes(q)) ||
        (fm.category || "").toLowerCase().includes(q) ||
        equipmentNames.some((n) => n.toLowerCase().includes(q)) ||
        (fm.keywords && fm.keywords.some((k) => k.toLowerCase().includes(q)))
      );
    });
  }, [translatedFailureModes, failureModeSearch, translateEquipmentTypeName]);

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

  // Allow external triggers (e.g. right-click on the Risk KPI card in Row 1)
  // to open the score-calc popup. The triggering component dispatches a
  // `workspace:show-score-calc` CustomEvent with detail = { x, y }.
  useEffect(() => {
    const handler = (e) => {
      const { x = window.innerWidth / 2, y = 120 } = e.detail || {};
      setScoreCalcPopup({ show: true, x, y });
    };
    window.addEventListener("workspace:show-score-calc", handler);
    return () => window.removeEventListener("workspace:show-score-calc", handler);
  }, []);

  // The action bar (status + edit + share + ••• + RPN + tag + datetime) is rendered
  // into the page hero via portal so it appears inside the workspace header.
  // On mobile, we also expose a compact ⋯-only portal target so the menu can
  // anchor to the top-right of the hero title row.
  const [heroSlot, setHeroSlot] = useState(null);
  const [heroSlotMobile, setHeroSlotMobile] = useState(null);
  useEffect(() => {
    setHeroSlot(document.getElementById("workspace-hero-slot"));
    setHeroSlotMobile(document.getElementById("workspace-hero-slot-mobile"));
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
      discipline: normalizeDiscipline(threat.discipline || "") || "",
      description: threat.description || "",
      user_context: threat.user_context || "",
      attachments: threat.attachments || [],
    });
    setIsEditing(true);
  };
  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
  };
  const saveChanges = () => {
    const payload = { ...editForm };
    if ("discipline" in payload) {
      payload.discipline = normalizeDiscipline(payload.discipline) || payload.discipline || null;
    }
    updateMutation.mutate(payload);
  };

  const shareableLink = `${window.location.origin}/threats/${threatId}/workspace`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success(t("observations.linkCopied"));
    } catch {
      toast.success(t("observations.linkReadyToCopy"));
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

  const disciplineDisplay = threat.discipline
    ? getLabel(threat.discipline)
    : translateEnum("Not specified");

  const infoItems = [
    { label: t("observations.equipmentType"), value: translateEquipmentTypeName(threat.equipment_type), icon: Target, field: "equipment_type", type: "searchable", options: equipmentTypeOptions },
    { label: t("observations.failureMode"), value: translateFailureModeName(threat.failure_mode), icon: AlertTriangle, field: "failure_mode", type: "searchable", options: failureModeOptions },
    { label: t("observations.frequency"), value: translateEnum(threat.frequency), icon: Clock, field: "frequency", type: "select", options: FREQUENCY_OPTIONS },
    { label: t("observations.discipline"), value: disciplineDisplay, icon: Cog, field: "discipline", type: "discipline-select" },
  ];

  const attachmentCount = ((isEditing ? editForm.attachments : threat.attachments) || []).length;

  // --- Render ---------------------------------------------------------------
  
  // Handler to search for tag in hierarchy
  const handleTagClick = (tag) => {
    // Dispatch single event with search query - Layout will open hierarchy and pass query
    window.dispatchEvent(new CustomEvent('open-hierarchy-with-search', { detail: { query: tag } }));
  };
  
  const actionBar = (
    <div className="flex items-center justify-between flex-wrap gap-1.5 sm:gap-3 w-full" data-testid="workspace-actions-bar">
      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
        {threat.equipment_tag && (
          <button
            onClick={() => handleTagClick(threat.equipment_tag)}
            className="text-[10px] sm:text-xs text-slate-600 font-mono bg-slate-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer flex items-center gap-1"
            title={t("observationWorkspace.clickToFindInHierarchy")}
          >
            <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {threat.equipment_tag}
          </button>
        )}
        {threat.created_at && (
          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500">
            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {formatDateTime(threat.created_at)}
          </span>
        )}
        {/* Risk Score badge — desktop-only (Row 1 KPI card already shows it on mobile) */}
        {(threat.risk_score !== undefined && threat.risk_score !== null) && (
          <span
            className={`hidden lg:inline-flex text-xs font-semibold px-2 py-1 rounded ${
              threat.risk_level === "Critical" ? "bg-red-100 text-red-700"
              : threat.risk_level === "High" ? "bg-orange-100 text-orange-700"
              : threat.risk_level === "Medium" ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
            }`}
            title={t("observationWorkspace.riskScoreTooltip")}
            data-testid="hero-risk-score"
          >
            Risk {threat.risk_score}
          </span>
        )}
        {rpnValue && (
          <span
            className={`hidden lg:inline-flex text-xs font-semibold px-2 py-1 rounded ${
              rpnValue >= 300 ? "bg-red-100 text-red-700"
              : rpnValue >= 200 ? "bg-orange-100 text-orange-700"
              : rpnValue >= 100 ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
            }`}
            title={t("observationWorkspace.rpnTooltip")}
          >
            RPN {rpnValue}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {isEditing ? (
          <>
            <Button size="sm" variant="outline" onClick={cancelEditing} data-testid="cancel-edit-btn">
              <X className="w-3 h-3 mr-1" /> {t("observationWorkspace.cancel")}
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700" data-testid="save-edit-btn">
              {updateMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              {t("observationWorkspace.save")}
            </Button>
          </>
        ) : (
          <>
            {/* Status selector — desktop only. Status auto-syncs with the
                process journey, so a mobile editor isn't needed. */}
            <Select
              value={threat.status}
              onValueChange={(v) => updateMutation.mutate({ status: v })}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger
                className="hidden sm:inline-flex h-8 min-w-[8.5rem] text-xs"
                data-testid="workspace-status-select"
              >
                <SelectValue>{translateEnum(threat.status)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{translateEnum(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Share / Edit / Delete — desktop only (sm and up). On mobile,
                these collapse into the ⋯ menu so the hero stays tidy. */}
            <Button size="sm" variant="ghost" onClick={shareLink} title={t("tooltips.share")} data-testid="workspace-share-btn" className="hidden sm:inline-flex h-8 w-8 p-0">
              <Share2 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={startEditing}
              data-testid="workspace-edit-btn"
              title={t("tooltips.edit")}
              className="hidden sm:inline-flex h-8 sm:w-auto p-0 sm:px-3"
            >
              <Edit className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("observationWorkspace.edit")}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDeleteDialog(true)}
              title={t("tooltips.deleteObservation")}
              data-testid="workspace-delete-btn"
              className="hidden sm:inline-flex h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" data-testid="workspace-more-menu">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Mobile-only quick actions */}
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    shareLink();
                  }}
                  data-testid="menu-share"
                >
                  <Share2 className="w-4 h-4 mr-2" /> {t("observations.shareLink")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    startEditing();
                  }}
                  data-testid="menu-edit"
                >
                  <Edit className="w-4 h-4 mr-2" /> {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    setShowLinkEquipmentDialog(true);
                  }}
                  data-testid="menu-link-equipment"
                >
                  <LinkIcon className="w-4 h-4 mr-2" /> {t("observations.linkEquipment")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    setShowLinkFailureModeDialog(true);
                  }}
                  data-testid="menu-link-failure-mode"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" /> {t("observations.linkFailureMode")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden text-red-600 focus:text-red-700 focus:bg-red-50"
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    setShowDeleteDialog(true);
                  }}
                  data-testid="menu-delete-observation"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );

  // Compact mobile menu — just the ⋯ dropdown with all actions.
  const mobileMenu = (
    <DropdownMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 -mr-1" data-testid="workspace-mobile-more-menu">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setMobileMoreMenuOpen(false);
            shareLink();
          }}
        >
          <Share2 className="w-4 h-4 mr-2" /> {t("observations.shareLink")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setMobileMoreMenuOpen(false);
            startEditing();
          }}
        >
          <Edit className="w-4 h-4 mr-2" /> {t("common.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setMobileMoreMenuOpen(false);
            setShowLinkEquipmentDialog(true);
          }}
        >
          <LinkIcon className="w-4 h-4 mr-2" /> {t("observations.linkEquipment")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setMobileMoreMenuOpen(false);
            setShowLinkFailureModeDialog(true);
          }}
        >
          <AlertTriangle className="w-4 h-4 mr-2" /> {t("observations.linkFailureMode")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setMobileMoreMenuOpen(false);
            setShowDeleteDialog(true);
          }}
          className="text-red-600 focus:text-red-700 focus:bg-red-50"
        >
          <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-3">
      {/* Action bar — desktop hero portal. Falls back to inline if no slot found. */}
      {heroSlot ? createPortal(actionBar, heroSlot) : (
        <div className="hidden lg:block bg-white rounded-xl border border-slate-200 p-4">{actionBar}</div>
      )}
      {/* Mobile ⋯ menu — anchored top-right of the hero title row. */}
      {heroSlotMobile && createPortal(mobileMenu, heroSlotMobile)}

      {/* Score calculation popup — triggered by right-clicking the Risk KPI card (Row 1) via window event. */}
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
                <h3 className="font-semibold text-sm">{t("observations.scoreCalculation")}</h3>
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
                  <span className="text-xs font-medium">{t("observationWorkspace.fmea")}</span>
                  <button onClick={() => setShowLinkFailureModeDialog(true)} className="text-[9px] text-blue-600 hover:underline">
                    {linkedFmData ? t("observationWorkspace.relink") : t("observationWorkspace.link")}
                  </button>
                </div>
                {linkedFmData ? (
                  <div className="flex gap-1">
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-red-600">{linkedFmData.severity}</div><div className="text-[8px] text-slate-400">S</div></div>
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-amber-600">{linkedFmData.occurrence}</div><div className="text-[8px] text-slate-400">O</div></div>
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-blue-600">{linkedFmData.detectability}</div><div className="text-[8px] text-slate-400">D</div></div>
                    <div className="bg-blue-50 rounded p-1 text-center flex-1 border border-blue-200 font-bold text-blue-700 text-sm flex items-center justify-center">{fmBaseScore}</div>
                  </div>
                ) : <div className="text-xs text-slate-400 italic">{t("observationWorkspace.notLinked")}: <b>{fmBaseScore}</b></div>}
              </div>
              <div className="bg-slate-50 rounded p-2">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-medium">{t("observationWorkspace.criticality")}</span>
                  <button onClick={() => setShowLinkEquipmentDialog(true)} className="text-[9px] text-blue-600 hover:underline">
                    {linkedCriticalityData ? t("observationWorkspace.relink") : t("observationWorkspace.link")}
                  </button>
                </div>
                {linkedCriticalityData ? (
                  <div className="flex gap-1">
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-red-600">{linkedCriticalityData.safety_impact || 0}</div><div className="text-[8px] text-slate-400">S</div></div>
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-orange-600">{linkedCriticalityData.production_impact || 0}</div><div className="text-[8px] text-slate-400">P</div></div>
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-green-600">{linkedCriticalityData.environmental_impact || 0}</div><div className="text-[8px] text-slate-400">E</div></div>
                    <div className="bg-white rounded p-1 text-center flex-1 border"><div className="text-sm font-bold text-purple-600">{linkedCriticalityData.reputation_impact || 0}</div><div className="text-[8px] text-slate-400">R</div></div>
                    <div className="bg-purple-50 rounded p-1 text-center flex-1 border border-purple-200 font-bold text-purple-700 text-sm flex items-center justify-center">{criticalityScore}</div>
                  </div>
                ) : <div className="text-xs text-slate-400 italic">{t("observationWorkspace.notLinked")}: <b>0</b></div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Info Grid — 4 attributes (compact, editable) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-2"
        data-testid="workspace-info-grid"
      >
        {infoItems.map((item) => (
          <div
            key={item.label}
            className="bg-white rounded-lg border border-slate-200 px-2 sm:px-3 py-1.5 sm:py-2 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 min-h-[36px] sm:min-h-[44px] text-center"
            data-testid={
              item.field === "failure_mode"
                ? "workspace-failure-mode-field"
                : item.field === "equipment_type"
                ? "workspace-equipment-type-field"
                : undefined
            }
          >
            <div className="flex items-center gap-1 sm:gap-2 min-w-0 justify-center">
              <item.icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-slate-500 truncate flex-shrink-0">{item.label}</span>
            </div>
            <div className="min-w-0 text-center flex items-center justify-center">
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
                  data-testid={
                    item.field === "failure_mode"
                      ? "workspace-failure-mode-edit"
                      : item.field === "equipment_type"
                      ? "workspace-equipment-type-edit"
                      : undefined
                  }
                />
              ) : item.type === "select" ? (
                <Select value={editForm[item.field] || ""} onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not assigned</SelectItem>
                    {usersList.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : item.type === "discipline-select" ? (
                <Select
                  value={normalizeDiscipline(editForm.discipline) || editForm.discipline || "_none"}
                  onValueChange={(v) => setEditForm({ ...editForm, discipline: v === "_none" ? "" : v })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder={t("observations.selectDiscipline")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{translateEnum("Not specified")}</SelectItem>
                    {disciplines.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editForm[item.field] || ""}
                  onChange={(e) => setEditForm({ ...editForm, [item.field]: e.target.value })}
                  className="h-7 text-xs"
                />
              )
            ) : (
              <div className="flex items-center gap-1 justify-center min-w-0">
                {item.field === "failure_mode" && item.value ? (
                  <button
                    onClick={() => {
                      // Navigate to library with fm_id to select the specific failure mode
                      const fmId = linkedFmData?.id;
                      if (fmId) {
                        navigate(`/library?fm_id=${fmId}`);
                      } else {
                        // Fallback to search if no ID available
                        navigate(`/library?search=${encodeURIComponent(threat.failure_mode)}`);
                      }
                    }}
                    style={{ minHeight: 0, minWidth: 0 }}
                    className="appearance-none p-0 m-0 border-0 bg-transparent font-semibold text-slate-900 text-xs sm:text-sm leading-tight truncate text-center block max-w-full hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                    title={t("tooltips.viewInFailureModesLibrary")}
                  >
                    {item.value}
                  </button>
                ) : (
                  <span className="font-semibold text-slate-900 text-xs sm:text-sm leading-tight truncate text-center block max-w-full">{item.value}</span>
                )}
                {item.field === "failure_mode" && threat.is_new_failure_mode && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">NEW</span>
                )}
              </div>
            )}
            </div>
          </div>
        ))}
      </motion.div>

      {/* AI Insights and Causal Intelligence are now rendered inside the
          Reliability Intelligence column (Row 3, Column 1) of the workspace. */}

      {/* Description — populated from what the user typed/dictated during the chat recording (user_context).
          Now also hosts inline attachment management via a paperclip icon in the header. */}
      <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="workspace-description">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-green-600" />
          <h3 className="font-semibold text-slate-900 text-sm">{t("observationWorkspace.description")}</h3>
          {threat.context_added_at && !isEditing && (
            <span className="text-xs text-slate-400">{t("observationWorkspace.addedAtPrefix")} {formatDateTime(threat.context_added_at)}</span>
          )}
          {/* Paperclip badge — shows attachment count; click to expand list. */}
          <div className="ml-auto flex items-center gap-1">
            {/* AI Improve Description Button */}
            <div className="relative group">
              <button
                type="button"
                onClick={handleImproveDescription}
                disabled={aiImprovingDesc || !threat?.user_context && !threat?.description}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                  aiImprovingDesc 
                    ? "text-purple-600 bg-purple-50" 
                    : "text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={t("observationWorkspace.aiImproveTooltip")}
                data-testid="description-ai-improve-btn"
              >
                {aiImprovingDesc ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </button>
              {/* Tooltip */}
              <div className="absolute right-0 top-full mt-1 w-48 p-2 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="font-semibold flex items-center gap-1 mb-1">
                  <Sparkles className="w-3 h-3 text-purple-300" /> {t("observationWorkspace.aiImprove")}
                </div>
                <p className="text-slate-300">{t("observationWorkspace.aiImproveDesc")}</p>
                <div className="absolute -top-1 right-4 w-2 h-2 bg-slate-900 rotate-45"></div>
              </div>
            </div>
            {/* Attach button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAttList((s) => !s)}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 text-xs px-2 py-1 rounded-md hover:bg-slate-50 transition-colors relative"
                title={attachmentCount ? t("observationWorkspace.attachmentsCountPlural", { count: attachmentCount }) : t("observationWorkspace.attachFiles")}
                data-testid="description-attach-btn"
              >
              <Paperclip className="w-3.5 h-3.5" />
              {attachmentCount > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-blue-600 text-white">
                  {attachmentCount}
                </span>
              ) : (
                <span>{t("observationWorkspace.attach")}</span>
              )}
            </button>
            {/* List of attachment titles */}
            {showAttList && attachmentCount > 0 && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto py-1">
                  {((isEditing ? editForm.attachments : threat.attachments) || []).map((a, idx) => (
                    <div
                      key={a.id || `att-${idx}`}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 text-xs group"
                    >
                      <button
                        type="button"
                        onClick={() => { setPreviewAtt(a); setShowAttList(false); }}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left text-slate-700 hover:text-blue-600"
                      >
                        <Paperclip className="w-3 h-3 flex-shrink-0 opacity-60" />
                        <span className="truncate">{a.name || a.filename || t("observationWorkspace.attachmentFallback")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const filtered = ((isEditing ? editForm.attachments : threat.attachments) || []).filter((x) => x.id !== a.id);
                          if (isEditing) {
                            setEditForm((prev) => ({ ...prev, attachments: filtered }));
                          } else {
                            updateMutation.mutate({ attachments: filtered });
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                        title={t("observationWorkspace.remove")}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { attachmentInputRef.current?.click(); setShowAttList(false); }}
                  className="w-full px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 border-t border-slate-100 flex items-center gap-1"
                >
                  <Paperclip className="w-3 h-3" /> {t("observationWorkspace.attachMoreFiles")}
                </button>
              </div>
            )}
            </div>
          </div>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              const newAtts = await Promise.all(files.map((file) => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({
                  id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                  type: (file.type || "").startsWith("image/") ? "image" : "file",
                  name: file.name,
                  mime: file.type || "application/octet-stream",
                  size: file.size,
                  ext: file.name?.includes(".") ? file.name.split(".").pop().toLowerCase() : "",
                  data: reader.result,
                  created_at: new Date().toISOString(),
                });
                reader.readAsDataURL(file);
              })));
              if (isEditing) {
                setEditForm((prev) => ({ ...prev, attachments: [...(prev.attachments || []), ...newAtts] }));
              } else {
                updateMutation.mutate({ attachments: [...(threat.attachments || []), ...newAtts] });
              }
              e.target.value = "";
            }}
          />
        </div>
        {isEditing ? (
          <Textarea
            value={editForm.description || ""}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            placeholder={t("observationWorkspace.descriptionPlaceholder")}
            rows={4}
            className="text-sm"
          />
        ) : threat.description ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-slate-700 whitespace-pre-wrap text-sm">{threat.description}</p>
          </div>
        ) : (
          <p className="text-slate-400 text-sm italic">{t("observationWorkspace.noDescriptionRecorded")}</p>
        )}
        {/* Attachments are now shown only as a count badge on the paperclip; clicking
            a file title opens a preview dialog. No mini-thumbnails. */}
      </div>

      {/* User Context — shows what the user originally typed/dictated if different from the description */}
      {threat.user_context && threat.user_context !== threat.description && (
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="workspace-user-context">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-slate-900 text-sm">{t("observationWorkspace.additionalContext") || "Additional Context"}</h3>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-slate-700 whitespace-pre-wrap text-sm">{threat.user_context}</p>
          </div>
        </div>
      )}

      {/* AI Photo Analysis — shows findings from image analysis if available */}
      {threat.image_analysis && (
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="workspace-ai-photo-analysis">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-slate-900 text-sm">{t("observationWorkspace.aiPhotoAnalysis") || "AI Photo Analysis"}</h3>
            {threat.image_analysis.severity && (
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                threat.image_analysis.severity === "critical" ? "bg-red-100 text-red-700" :
                threat.image_analysis.severity === "high" ? "bg-orange-100 text-orange-700" :
                threat.image_analysis.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                "bg-green-100 text-green-700"
              }`}>
                {t(`severity.${threat.image_analysis.severity}`) || threat.image_analysis.severity}
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            {/* Image Description */}
            {threat.image_analysis.image_description && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-slate-700 text-sm">{threat.image_analysis.image_description}</p>
              </div>
            )}
            
            {/* Visible Damage */}
            {threat.image_analysis.visible_damage && threat.image_analysis.visible_damage.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-slate-600 mb-1.5">{t("observationWorkspace.visibleDamage") || "Visible Damage"}</h4>
                <ul className="space-y-1">
                  {threat.image_analysis.visible_damage.map((damage, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-orange-500 mt-0.5">•</span>
                      <span>{damage}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Safety Concerns */}
            {threat.image_analysis.safety_concerns && threat.image_analysis.safety_concerns.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-red-600 mb-1.5">{t("observationWorkspace.safetyConcerns") || "Safety Concerns"}</h4>
                <ul className="space-y-1">
                  {threat.image_analysis.safety_concerns.map((concern, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{concern}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          {threat.image_analysis_at && (
            <div className="mt-3 pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                {t("observationWorkspace.analyzedAt") || "Analyzed"} {formatDateTime(threat.image_analysis_at)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Attachment preview dialog */}
      {previewAtt && (
        <Dialog open={!!previewAtt} onOpenChange={(o) => !o && setPreviewAtt(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-blue-600" />
                <span className="truncate">{previewAtt.name || previewAtt.filename || t("observationWorkspace.attachmentFallback")}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto flex flex-col items-center justify-center bg-slate-50 rounded-lg p-4">
              {(() => {
                const ct = previewAtt.mime || previewAtt.content_type || previewAtt.type || "";
                let url = previewAtt.data;
                if (!url) return <div className="text-sm text-slate-400 p-8">{t("observationWorkspace.noPreviewAvailable")}</div>;
                
                // Check if this is an image - handle both "image/jpeg" format and simple "image" type from chat
                const isImage = ct.startsWith("image/") || ct === "image";
                
                // If it's a base64 string without the data URL prefix, add it
                if (isImage && url && !url.startsWith("data:") && !url.startsWith("http")) {
                  url = `data:image/jpeg;base64,${url}`;
                }
                
                // Download handler for base64 data
                const handleDownload = () => {
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = previewAtt.name || previewAtt.filename || (isImage ? 'image.jpg' : 'attachment');
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                };
                
                if (isImage) {
                  return (
                    <>
                      <img src={url} alt={previewAtt.name} className="max-w-full max-h-[60vh] object-contain" />
                      <button
                        onClick={handleDownload}
                        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        {t("observationWorkspace.download")}
                      </button>
                    </>
                  );
                }
                if (ct.includes("pdf")) {
                  return <iframe src={url} title={previewAtt.name} className="w-full h-[70vh] bg-white" />;
                }
                if (ct.startsWith("video/")) {
                  return <video src={url} controls className="max-w-full max-h-[70vh]" />;
                }
                if (ct.startsWith("audio/")) {
                  return <audio src={url} controls className="w-full" />;
                }
                return (
                  <div className="text-center p-8 text-sm text-slate-500">
                    <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <div>{t("observationWorkspace.previewNotAvailable")}</div>
                    <button
                      onClick={handleDownload}
                      className="inline-block mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700"
                    >
                      {t("observationWorkspace.download")}
                    </button>
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Probable Cause section removed per user request. The `cause` field is still
          editable via the Edit form (kept in editForm.cause for backwards compatibility). */}

      {/* Delete confirmation — opened from the hero ••• menu */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("observations.deleteObservation")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("observations.deleteConfirmShort")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-btn">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              {t("observations.shareObservation")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{t("observations.anyoneWithLinkCanView")}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-slate-100 rounded-lg border text-sm font-mono text-slate-600 truncate">
                {shareableLink}
              </div>
              <Button size="sm" onClick={() => { copyLink(); setShareDialogOpen(false); }}>
                <Copy className="w-4 h-4 mr-1" /> {t("observations.copy")}
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
              {t("observations.linkToEquipment")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">{t("observations.linkEquipmentDesc")}</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("observations.searchEquipmentPlaceholder")}
                value={equipmentSearch}
                onChange={(e) => setEquipmentSearch(e.target.value)}
                className="pl-9"
                autoFocus
                data-testid="equipment-search-input"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2" data-testid="equipment-list">
              {filteredEquipmentList.map((eq) => (
                <button
                  key={eq.id}
                  onClick={() => setSelectedEquipmentId(eq.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    selectedEquipmentId === eq.id ? "bg-purple-100 border-purple-300 border" : "hover:bg-slate-50 border border-transparent"
                  }`}
                  data-testid={`equipment-option-${eq.id}`}
                >
                  <div className="font-medium text-slate-800">{eq.name}</div>
                  <div className="text-xs text-slate-500 truncate">{eq.path}</div>
                  {(eq.level || eq.equipmentTypeName || eq.discipline || eq.criticalityLevel) && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {eq.level && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {String(eq.level).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      )}
                      {eq.equipmentTypeName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                          {eq.equipmentTypeName}
                        </span>
                      )}
                      {eq.discipline && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                          {eq.discipline}
                        </span>
                      )}
                      {eq.criticalityLevel && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          eq.criticalityLevel === "critical" ? "bg-red-50 text-red-700 border-red-200"
                          : eq.criticalityLevel === "high" ? "bg-orange-50 text-orange-700 border-orange-200"
                          : eq.criticalityLevel === "medium" ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                          : "bg-green-50 text-green-700 border-green-200"
                        }`}>
                          {translateEnum(String(eq.criticalityLevel).charAt(0).toUpperCase() + String(eq.criticalityLevel).slice(1))}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
              {filteredEquipmentList.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-sm">{t("observations.noEquipmentFound")}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkEquipmentDialog(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => linkEquipmentMutation.mutate({ equipmentNodeId: selectedEquipmentId })}
              disabled={!selectedEquipmentId || linkEquipmentMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {linkEquipmentMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />}
              {t("observations.linkAndRecalculate")}
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
              {t("observations.linkToFailureMode")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">{t("observations.linkFailureModeDesc")}</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("observations.searchFailureModes")}
                value={failureModeSearch}
                onChange={(e) => setFailureModeSearch(e.target.value)}
                className="pl-9"
                data-testid="failure-mode-search"
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
                  data-testid={`failure-mode-option-${fm.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800">{fm.failure_mode}</div>
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      fm.rpn >= 300 ? "bg-red-100 text-red-700"
                      : fm.rpn >= 200 ? "bg-orange-100 text-orange-700"
                      : fm.rpn >= 100 ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                    }`}>
                      {t("observations.rpn")}: {fm.rpn}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {fm.category} • {translateEquipmentTypeName(fm.equipment) || fm.equipment}
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                    <span>S: {fm.severity}</span>
                    <span>O: {fm.occurrence}</span>
                    <span>D: {fm.detectability}</span>
                  </div>
                </button>
              ))}
              {filteredFailureModes.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-sm">{t("observations.noFailureModesFound")}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkFailureModeDialog(false); setSelectedFailureModeId(null); setFailureModeSearch(""); }}>{t("common.cancel")}</Button>
            <Button
              onClick={() => linkFailureModeMutation.mutate({ failureModeId: selectedFailureModeId })}
              disabled={!selectedFailureModeId || linkFailureModeMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {linkFailureModeMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />}
              {t("observations.linkAndRecalculate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObservationDetailsSection;
