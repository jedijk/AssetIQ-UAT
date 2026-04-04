import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { threatsAPI, actionsAPI, equipmentHierarchyAPI, failureModesAPI, usersAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import SearchableCombobox from "../components/SearchableCombobox";
import EquipmentTimeline from "../components/EquipmentTimeline";
import { DISCIPLINES } from "../constants/disciplines";
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
  Image,
  FileImage,
  Maximize2,
  User,
  Share2,
  Copy,
  ChevronDown,
  MoreVertical,
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
import { SearchableSelect } from "../components/ui/searchable-select";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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

// Extracted components
import { ThreatHeader, RiskScoreCard, RecommendedActionsSection } from "../components/threat-detail";

const LIKELIHOOD_OPTIONS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const DETECTABILITY_OPTIONS = ["Easy", "Moderate", "Difficult", "Very Difficult", "Almost Impossible"];
const FREQUENCY_OPTIONS = ["Once", "Rarely", "Occasionally", "Frequently", "Constantly"];
const IMPACT_OPTIONS = ["Minor", "Moderate", "Significant", "Major", "Catastrophic"];
const STATUS_OPTIONS = ["Open", "In Progress", "Parked", "Mitigated", "Closed", "Canceled"];
const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"];

const ThreatDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [scoreCalcPopup, setScoreCalcPopup] = useState({ show: false, x: 0, y: 0 });
  const scorePopupRef = useRef(null);

  // Image viewer state
  const [selectedImage, setSelectedImage] = useState(null);

  // Sticky header visibility state (must be before any early returns)
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const headerRef = useRef(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Generate shareable link
  const shareableLink = `${window.location.origin}/threats/${id}`;
  
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success("Link copied to clipboard");
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareableLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Link copied to clipboard");
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Observation: ${threat?.title || "Observation Details"}`,
          text: `${threat?.threat_number} - ${threat?.title}`,
          url: shareableLink,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          copyLink(); // Fallback to copy
        }
      }
    } else {
      setShareDialogOpen(true);
    }
  };

  // Sticky header scroll effect (must be before any early returns)
  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        const headerBottom = headerRef.current.getBoundingClientRect().bottom;
        setShowStickyHeader(headerBottom < 0);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch threat - refetch on mount to get latest criticality
  const { data: threat, isLoading, error, refetch: refetchThreat } = useQuery({
    queryKey: ["threat", id],
    queryFn: () => threatsAPI.getById(id),
    refetchOnMount: "always", // Always refetch when component mounts
    staleTime: 0, // Consider data always stale
    retry: 3, // Retry up to 3 times on failure (handles 503 errors)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
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
  
  // Fetch users for Owner dropdown
  const { data: usersData } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const usersList = usersData?.users || [];

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
    let errorMessage = "Observation not found";
    if (error?.response?.status === 503) {
      errorMessage = "Server temporarily unavailable. Please try again.";
    } else if (error?.response?.status === 504) {
      errorMessage = "Request timed out. Please try again.";
    } else if (error?.code === 'ERR_NETWORK') {
      errorMessage = "Network error. Please check your connection.";
    } else if (error?.response?.data?.detail) {
      errorMessage = error.response.data.detail;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl" data-testid="observation-not-found">
        <div className="text-center py-16">
          <XCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">{errorMessage}</h2>
          <p className="text-sm text-slate-500 mb-4">ID: {id}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => refetchThreat()} variant="outline">
              Try Again
            </Button>
            <Button onClick={() => navigate("/threats")} variant="outline">
              Back to Observations
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const infoItems = [
    { label: t("observations.equipmentType"), value: threat.equipment_type, icon: Target, field: "equipment_type", type: "searchable", options: equipmentTypeOptions },
    { label: t("observations.failureMode"), value: threat.failure_mode, icon: AlertTriangle, field: "failure_mode", type: "searchable", options: failureModeOptions },
    { label: t("observations.impact"), value: threat.impact, icon: Activity, field: "impact", type: "select", options: IMPACT_OPTIONS },
    { label: t("observations.frequency"), value: threat.frequency, icon: Clock, field: "frequency", type: "select", options: FREQUENCY_OPTIONS },
    { label: t("observations.likelihood"), value: threat.likelihood, icon: Activity, field: "likelihood", type: "select", options: LIKELIHOOD_OPTIONS },
    { label: t("observations.detectability"), value: threat.detectability, icon: Eye, field: "detectability", type: "select", options: DETECTABILITY_OPTIONS },
    { label: t("observations.location"), value: threat.location || "Not specified", icon: MapPin, field: "location", type: "text" },
    { label: "Owner", value: threat.owner_name || "Not assigned", icon: User, field: "owner_id", type: "user-select" },
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
      owner_id: threat.owner_id || "",
      owner_name: threat.owner_name || "",
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

  // Calculate RPN from linked failure mode
  const rpnValue = linkedFmData?.rpn || threat.fmea_rpn || threat.rpn || null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20" data-testid="threat-detail-page">
      {/* Fixed Header - Below main app header */}
      <div className="sticky top-12 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 max-w-4xl">
          {/* Mobile Header - Two rows for better readability */}
          <div className="sm:hidden py-2">
            {/* Row 1: Back + Title */}
            <div className="flex items-center gap-2 mb-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/threats")}
                className="p-1 -ml-1 flex-shrink-0"
                data-testid="back-to-threats-button"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="font-semibold text-sm text-slate-900 line-clamp-2 leading-tight flex-1">
                {threat.title}
              </h1>
            </div>
            {/* Row 2: Scores + Status + Menu */}
            <div className="flex items-center justify-between pl-7">
              <div className="flex items-center gap-2">
                <RiskBadge level={threat.risk_level} size="sm" />
                <span className="text-[10px] font-medium text-slate-500">
                  {threat.risk_score}
                </span>
                {rpnValue && (
                  <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${
                    rpnValue >= 300 ? "bg-red-100 text-red-700" :
                    rpnValue >= 200 ? "bg-orange-100 text-orange-700" :
                    rpnValue >= 100 ? "bg-yellow-100 text-yellow-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    RPN {rpnValue}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-7 w-7 p-0">
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={saveChanges} disabled={updateMutation.isPending} className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700">
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  </>
                ) : (
                  <>
                    <Select
                      value={threat.status}
                      onValueChange={(value) => updateMutation.mutate({ status: value })}
                      disabled={updateMutation.isPending}
                    >
                      <SelectTrigger className="h-7 w-auto px-2 text-[10px] gap-0.5">
                        <span className={`${
                          threat.status === "Open" ? "text-blue-600" :
                          threat.status === "In Progress" ? "text-amber-600" :
                          threat.status === "Mitigated" ? "text-green-600" :
                          "text-slate-600"
                        }`}>
                          {threat.status === "In Progress" ? "In Prog." : threat.status}
                        </span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={startEditing}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={shareLink}>
                          <Share2 className="w-4 h-4 mr-2" />
                          Share Link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Desktop Header - Single row */}
          <div className="hidden sm:flex items-center gap-2 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/threats")}
              className="p-2 -ml-1"
              data-testid="back-to-threats-button-desktop"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <RiskBadge level={threat.risk_level} size="sm" />
                <span className="text-slate-400 font-mono text-xs">
                  #{threat.rank}/{threat.total_threats}
                </span>
              </div>
              <h1 className="font-semibold text-base text-slate-900 truncate">
                {threat.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1 text-xs">
                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium text-slate-700">
                  {threat.risk_score}
                </span>
                {rpnValue && (
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    rpnValue >= 300 ? "bg-red-100 text-red-700" :
                    rpnValue >= 200 ? "bg-orange-100 text-orange-700" :
                    rpnValue >= 100 ? "bg-yellow-100 text-yellow-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {rpnValue}
                  </span>
                )}
              </div>
              
              {isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={cancelEditing} className="h-7 px-2 text-xs">
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveChanges} disabled={updateMutation.isPending} className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700">
                    {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={shareLink} className="h-7 px-2 text-slate-500 hover:text-slate-700" title="Share link">
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={startEditing} className="h-7 px-2 text-xs">
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Select
                    value={threat.status}
                    onValueChange={(value) => updateMutation.mutate({ status: value })}
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger className="h-7 w-24 text-xs px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="container mx-auto px-3 sm:px-4 py-4 max-w-4xl" ref={headerRef}>
        {/* Risk Score Card - Right-click for calculation details */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`card p-4 sm:p-6 mb-4 sm:mb-6 border-l-4 cursor-context-menu relative ${
            threat.risk_level === "Critical" ? "border-l-red-500" :
            threat.risk_level === "High" ? "border-l-orange-500" :
            threat.risk_level === "Medium" ? "border-l-yellow-500" :
            "border-l-green-500"
          }`}
          data-testid="risk-score-card"
          onContextMenu={handleScoreContextMenu}
        >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            {/* Risk Score */}
            <div>
              <div className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 sm:mb-1 flex items-center gap-1 sm:gap-2">
                {t("observations.riskScore")}
                <span className="text-[10px] sm:text-xs text-slate-400 font-normal hidden sm:inline">({t("observations.rightClickForDetails")})</span>
              </div>
              <div className="text-2xl sm:text-4xl font-bold text-slate-900">{threat.risk_score}</div>
            </div>
            
            {/* RPN Display */}
            {rpnValue && (
              <div className="border-l border-slate-200 pl-4 sm:pl-8">
                <div className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 sm:mb-1 flex items-center gap-1 sm:gap-2">
                  RPN
                  <span className="text-[10px] sm:text-xs text-slate-400 font-normal hidden sm:inline">(Risk Priority Number)</span>
                </div>
                <div className={`text-2xl sm:text-4xl font-bold ${
                  rpnValue >= 300 ? "text-red-600" :
                  rpnValue >= 200 ? "text-orange-600" :
                  rpnValue >= 100 ? "text-yellow-600" :
                  "text-green-600"
                }`}>
                  {rpnValue}
                </div>
              </div>
            )}
          </div>
          <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center ${
            threat.risk_level === "Critical" ? "bg-red-50" :
            threat.risk_level === "High" ? "bg-orange-50" :
            threat.risk_level === "Medium" ? "bg-yellow-50" :
            "bg-green-50"
          }`}>
            <AlertTriangle className={`w-5 h-5 sm:w-8 sm:h-8 ${
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
              className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 z-50 w-96 max-h-[85vh] flex flex-col"
              style={{ 
                left: Math.min(Math.max(scoreCalcPopup.x, 16), window.innerWidth - 420), 
                top: Math.min(Math.max(scoreCalcPopup.y, 16), window.innerHeight - 100)
              }}
            >
              {/* Header - Fixed */}
              <div className="flex items-center justify-between p-4 pb-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-slate-900">{t("observations.scoreCalculation")}</h3>
                </div>
                <button 
                  onClick={() => setScoreCalcPopup({ show: false, x: 0, y: 0 })}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              
              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 p-4 pt-3">
              {/* Exact Calculation Box - WEIGHTED METHODOLOGY */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 mb-4 border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-blue-600 font-medium">{t("observations.exactCalculation")}</div>
                  {threat.risk_settings_used && (
                    <div className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border">
                      Weights: {Math.round((threat.risk_settings_used.criticality_weight || 0.75) * 100)}% / {Math.round((threat.risk_settings_used.fmea_weight || 0.25) * 100)}%
                    </div>
                  )}
                </div>
                <div className="font-mono text-lg text-slate-800 text-center py-2">
                  <span className="text-slate-500">(</span>
                  <span className="text-purple-600">{criticalityScore}</span>
                  <span className="text-slate-400 mx-1">×</span>
                  <span className="text-purple-400">{threat.risk_settings_used?.criticality_weight || 0.75}</span>
                  <span className="text-slate-500">)</span>
                  <span className="text-slate-400 mx-1">+</span>
                  <span className="text-slate-500">(</span>
                  <span className="text-blue-600">{fmBaseScore}</span>
                  <span className="text-slate-400 mx-1">×</span>
                  <span className="text-blue-400">{threat.risk_settings_used?.fmea_weight || 0.25}</span>
                  <span className="text-slate-500">)</span>
                </div>
                <div className="text-center text-[10px] text-slate-500 mt-1">
                  ({t("observations.criticalityScoreLabel")} × {Math.round((threat.risk_settings_used?.criticality_weight || 0.75) * 100)}%) + ({t("observations.fmeaScoreLabel")} × {Math.round((threat.risk_settings_used?.fmea_weight || 0.25) * 100)}%)
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
                      <span className="text-xs font-medium text-slate-700">{t("observations.fmeaScores")}</span>
                    </div>
                    <button
                      onClick={() => setShowLinkFailureModeDialog(true)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      data-testid="link-failure-mode-btn"
                    >
                      <Link className="w-3 h-3" />
                      {linkedFmData ? t("observations.relink") : t("observations.linkFailureMode")}
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
                      <div className="text-[10px] text-slate-400 mt-1">{t("observations.linkedTo")}: {threat.failure_mode}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400 italic bg-white rounded px-3 py-2">
                      {t("observations.noFmeaLinked")} — {t("observations.fmeaScoreLabel")}: <span className="font-bold text-slate-600">{fmBaseScore}</span>
                    </div>
                  )}
                </div>

                {/* Step 2: Criticality */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</div>
                    <span className="text-xs font-medium text-slate-700">{t("observations.equipmentCriticality")}</span>
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
                        <span className="text-xs text-slate-500">{t("observations.criticalityScoreLabel")}:</span>
                        <span className="text-lg font-bold text-purple-600">{criticalityScore}</span>
                      </div>
                      <div className="text-xs text-slate-600 bg-white rounded px-2 py-1.5 font-mono mt-2">
                        ({linkedCriticalityData.safety_impact || 0}×25 + {linkedCriticalityData.production_impact || 0}×20 + {linkedCriticalityData.environmental_impact || 0}×15 + {linkedCriticalityData.reputation_impact || 0}×10) ÷ 3.5 = <span className="font-bold text-purple-600">{criticalityScore}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{t("observations.linkedTo")}: {threat.asset}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400 italic bg-white rounded px-3 py-2">
                      {t("observations.noCriticalityLinked")} — {t("observations.criticalityScoreLabel")}: <span className="font-bold text-slate-600">0</span>
                    </div>
                  )}
                </div>

                {/* Step 3: Final Result */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</div>
                    <span className="text-xs font-medium text-slate-700">{t("observations.finalCalculation")}</span>
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
                <div className="text-[10px] text-slate-400 mb-1">{t("observations.riskLevelThresholds")}:</div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600">≥70 Critical</span>
                  <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">50-69 High</span>
                  <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-600">30-49 Medium</span>
                  <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-600">&lt;30 Low</span>
                </div>
              </div>
              </div> {/* End scrollable content */}
            </div>
          );
        })()}
      </motion.div>

      {/* Equipment & Criticality Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="card p-3 sm:p-4 mb-4 sm:mb-6"
        data-testid="equipment-criticality-card"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Equipment Name & Link Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              linkedCriticalityData ? 'bg-purple-50' : 'bg-slate-100'
            }`}>
              {linkedCriticalityData ? (
                <Link className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
              ) : (
                <Unlink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                {threat.asset || t("observations.noEquipmentLinked")}
              </div>
              {linkedCriticalityData ? (
                <span className="text-[10px] sm:text-xs text-green-600">{t("observations.criticalityLinked")}</span>
              ) : (
                <span className="text-[10px] sm:text-xs text-amber-600">{t("observations.noCriticalityLinked")}</span>
              )}
            </div>
          </div>
          
          {/* 4-Dimension Criticality Display + Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {linkedCriticalityData && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
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
            
            <Button 
              size="sm" 
              variant={linkedCriticalityData ? "outline" : "default"}
              onClick={() => setShowLinkEquipmentDialog(true)}
              className={`h-8 ${linkedCriticalityData ? "" : "bg-purple-600 hover:bg-purple-700"}`}
              data-testid={linkedCriticalityData ? "change-equipment-link-btn" : "link-equipment-btn"}
            >
              <Link className="w-3.5 h-3.5 mr-1" />
              {linkedCriticalityData ? t("observations.changeLink") : t("observations.linkEquipment")}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Link Equipment Dialog */}
      <Dialog open={showLinkEquipmentDialog} onOpenChange={setShowLinkEquipmentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-purple-600" />
              {t("observations.linkToEquipment")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">{t("observations.linkEquipmentDesc")}</p>
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
                <div className="text-center py-4 text-slate-400">{t("observations.noEquipmentFound")}</div>
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
            
            {/* Search Input */}
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
                <div className="text-center py-4 text-slate-400">{t("observations.noFailureModesFound")}</div>
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
              {t("observations.linkAndRecalculate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Grid - Moved above AI sections */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6"
        data-testid="threat-info-grid"
      >
        {infoItems.map((item) => (
          <div key={item.label} className="card p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 text-slate-500 text-[10px] sm:text-sm mb-0.5 sm:mb-1">
              <item.icon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
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
                  emptyText={`No ${item.label.toLowerCase()} found.`}
                  allowCustom={true}
                  data-testid={`edit-${item.field}`}
                />
              ) : item.type === "select" ? (
                <Select
                  value={editForm[item.field] || ""}
                  onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}
                >
                  <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {item.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : item.type === "user-select" ? (
                <Select
                  value={editForm.owner_id || "_none"}
                  onValueChange={(v) => {
                    if (v === "_none") {
                      setEditForm({ ...editForm, owner_id: "", owner_name: "" });
                    } else {
                      const selectedUser = usersList.find(u => u.id === v);
                      setEditForm({ 
                        ...editForm, 
                        owner_id: v,
                        owner_name: selectedUser?.name || ""
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                    <SelectValue placeholder="Select owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not assigned</SelectItem>
                    {usersList.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : item.type === "discipline-select" ? (
                <Select
                  value={editForm.discipline || "_none"}
                  onValueChange={(v) => setEditForm({ ...editForm, discipline: v === "_none" ? "" : v })}
                >
                  <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                    <SelectValue placeholder="Select discipline..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not specified</SelectItem>
                    {DISCIPLINES.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editForm[item.field] || ""}
                  onChange={(e) => setEditForm({ ...editForm, [item.field]: e.target.value })}
                  className="h-8 sm:h-9 text-xs sm:text-sm"
                />
              )
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="font-semibold text-slate-900 text-xs sm:text-base truncate">{item.value}</span>
                {item.field === "failure_mode" && threat.is_new_failure_mode && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] sm:text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0">
                    NEW
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </motion.div>

      {/* AI Intelligence Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"
      >
        {/* AI Risk Analysis Panel */}
        <AIInsightsPanel threatId={id} threatData={threat} />
        
        {/* Causal Intelligence Panel */}
        <CausalIntelligencePanel threatId={id} threatData={threat} />
      </motion.div>

      {/* Attachments / Images - Moved right after scoring grid */}
      {threat.attachments && threat.attachments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card p-6 mb-6"
          data-testid="threat-attachments-section"
        >
          <div className="flex items-center gap-2 mb-4">
            <FileImage className="w-5 h-5 text-slate-500" />
            <h3 className="font-semibold text-slate-900">Attachments</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {threat.attachments.length} {threat.attachments.length === 1 ? 'image' : 'images'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {threat.attachments.map((attachment, idx) => (
              <div
                key={attachment.id || attachment.url || `attachment-${idx}-${attachment.created_at || ''}`}
                className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
                onClick={() => setSelectedImage(attachment.data)}
                data-testid={`attachment-${idx}`}
              >
                {attachment.type === 'image' && attachment.data ? (
                  <>
                    <img
                      src={attachment.data.startsWith('data:') ? attachment.data : `data:image/jpeg;base64,${attachment.data}`}
                      alt={`Attachment ${idx + 1}`}
                      className="w-full h-24 sm:h-32 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {attachment.created_at && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                        <span className="text-[10px] text-white/80">
                          {new Date(attachment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-24 sm:h-32 bg-slate-100 flex items-center justify-center">
                    <Image className="w-8 h-8 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Cause */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card p-6 mb-6"
        data-testid="threat-cause-section"
      >
        <h3 className="font-semibold text-slate-900 mb-2">Probable Cause</h3>
        {isEditing ? (
          <Textarea
            value={editForm.cause || ""}
            onChange={(e) => setEditForm({ ...editForm, cause: e.target.value })}
            placeholder="Enter probable cause analysis..."
            rows={3}
          />
        ) : (
          <p className="text-slate-600">{threat.cause || "Not specified"}</p>
        )}
      </motion.div>

      {/* Related Activity Timeline - shows actions and tasks related to this observation */}
      <EquipmentTimeline 
        threatId={id}
        equipmentId={threat.linked_equipment_id}
        equipmentName={threat.asset}
      />

      {/* Recommended Actions - Extracted Component */}
      <RecommendedActionsSection threat={threat} threatId={id} />

      {/* Delete Section */}
      <div className="pt-4 mt-4 border-t border-slate-200">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
              data-testid="delete-threat-button"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Observation
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
      </div>

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

      {/* Image Viewer Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
          data-testid="image-viewer-modal"
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={() => setSelectedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedImage.startsWith('data:') ? selectedImage : `data:image/jpeg;base64,${selectedImage}`}
            alt="Full size attachment"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Share Link Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              Share Observation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Share this observation with others using the link below
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-slate-100 rounded-lg border text-sm font-mono text-slate-600 truncate">
                {shareableLink}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  copyLink();
                  setShareDialogOpen(false);
                }}
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
            </div>
            <div className="text-xs text-slate-500">
              Anyone with this link and access to the application can view this observation.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ThreatDetailPage;
