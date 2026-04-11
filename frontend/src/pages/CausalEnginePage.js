import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { investigationAPI, actionsAPI, usersAPI, equipmentHierarchyAPI, failureModesAPI } from "../lib/api";
import { compressImage, formatFileSize, getCompressionPercent } from "../lib/imageCompression";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, formatDateTime } from "../lib/dateUtils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Search, Plus, FileText, Clock, AlertTriangle, GitBranch, CheckSquare,
  ChevronRight, Trash2, Calendar, User, MapPin,
  Target, Loader2, ClipboardList, Edit, MessageSquare, Upload, File, Image, X, Download, Save, Lock, ShieldCheck, UserCheck, CheckCircle, ExternalLink, FileDown, Presentation, Sparkles, Brain,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SearchableSelect } from "../components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { CauseTree, CAUSE_CATEGORIES } from "../components/CauseNodeItem";
import BackButton from "../components/BackButton";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import { NewInvestigationDialog, EventDialog, FailureDialog, CauseDialog, ActionDialog } from "../components/causal-engine/InvestigationDialogs";
import EquipmentTimeline from "../components/EquipmentTimeline";

const EVENT_CATEGORIES = [
  { value: "operational_event", label: "Operational Event", bgClass: "bg-blue-100 text-blue-700", dotClass: "bg-blue-500" },
  { value: "alarm", label: "Alarm", bgClass: "bg-red-100 text-red-700", dotClass: "bg-red-500" },
  { value: "maintenance_action", label: "Maintenance Action", bgClass: "bg-orange-100 text-orange-700", dotClass: "bg-orange-500" },
  { value: "human_decision", label: "Human Decision", bgClass: "bg-purple-100 text-purple-700", dotClass: "bg-purple-500" },
  { value: "system_response", label: "System Response", bgClass: "bg-cyan-100 text-cyan-700", dotClass: "bg-cyan-500" },
  { value: "environmental_condition", label: "Environmental", bgClass: "bg-green-100 text-green-700", dotClass: "bg-green-500" },
];

const ACTION_PRIORITIES = [
  { value: "critical", label: "Critical", bgClass: "bg-red-100 text-red-700" },
  { value: "high", label: "High", bgClass: "bg-orange-100 text-orange-700" },
  { value: "medium", label: "Medium", bgClass: "bg-yellow-100 text-yellow-700" },
  { value: "low", label: "Low", bgClass: "bg-green-100 text-green-700" },
];

const ACTION_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

const INVESTIGATION_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Under Review" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

export default function CausalEnginePage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const { user } = useAuth();
  
  // Check for mobile viewport
  const [isMobile, setIsMobile] = useState(false);
  
  const [selectedInvId, setSelectedInvId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showNewInvDialog, setShowNewInvDialog] = useState(false);
  const [isEditingInvestigation, setIsEditingInvestigation] = useState(false); // Inline editing mode
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showFailureDialog, setShowFailureDialog] = useState(false);
  const [showCauseDialog, setShowCauseDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false); // Completion confirmation
  const [editingItem, setEditingItem] = useState(null);
  const [deleteInvOptions, setDeleteInvOptions] = useState({ deleteCentralActions: false }); // Delete options
  
  // Validation dialog state
  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [actionToValidate, setActionToValidate] = useState(null);
  const [validatorName, setValidatorName] = useState("");
  const [validatorPosition, setValidatorPosition] = useState("");
  
  // Edit action dialog state
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
  
  const [newInvForm, setNewInvForm] = useState({ title: "", description: "", asset_name: "", location: "", incident_date: "", investigation_leader: "" });
  const [editInvForm, setEditInvForm] = useState({ title: "", description: "", asset_name: "", location: "", incident_date: "", investigation_leader: "", status: "draft" });
  const [eventForm, setEventForm] = useState({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" });
  const [failureForm, setFailureForm] = useState({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" });
  const [causeForm, setCauseForm] = useState({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" });
  const [actionForm, setActionForm] = useState({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" });
  const [localNotes, setLocalNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showAISummaryDialog, setShowAISummaryDialog] = useState(false);
  const [aiSummary, setAISummary] = useState(null);
  const [isGeneratingAISummary, setIsGeneratingAISummary] = useState(false);
  const [closureSuggestion, setClosureSuggestion] = useState(null); // Investigation closure suggestion
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle inv query parameter - auto-select investigation from URL
  useEffect(() => {
    const invId = searchParams.get('inv');
    if (invId && invId !== selectedInvId) {
      setSelectedInvId(invId);
      // Clear the URL parameter after using it
      searchParams.delete('inv');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, selectedInvId]);

  const { data: investigationsData, isLoading: loadingInvestigations, error: investigationsError } = useQuery({
    queryKey: ["investigations"],
    queryFn: () => investigationAPI.getAll(),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 2,
  });
  
  const investigations = investigationsData?.investigations || [];
  
  // Fetch users for lead selection
  const { data: usersData } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: () => usersAPI.getAll(),
    staleTime: 60000, // Cache for 1 minute
  });
  const users = usersData?.users || [];
  
  // Fetch equipment nodes for equipment dropdown
  const { data: equipmentNodesData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: () => equipmentHierarchyAPI.getNodes(),
    staleTime: 60000, // Cache for 1 minute
  });
  const equipmentNodes = equipmentNodesData?.nodes || [];
  
  // Fetch failure modes for failure mode dropdown
  const { data: failureModesData } = useQuery({
    queryKey: ["failure-modes-list"],
    queryFn: () => failureModesAPI.getAll(),
    staleTime: 60000, // Cache for 1 minute
  });
  const failureModesList = failureModesData?.failure_modes || [];
  
  // Fetch central actions linked to this investigation (for Action Plan section)
  const { data: centralActionsData } = useQuery({
    queryKey: ["central-actions", "investigation", selectedInvId],
    queryFn: async () => {
      const response = await actionsAPI.getAll();
      const allActions = response?.actions || response || [];
      // Filter actions linked to this investigation
      return allActions.filter(
        action => action.source_type === "investigation" && action.source_id === selectedInvId
      );
    },
    enabled: !!selectedInvId,
    staleTime: 30000,
  });
  const centralActions = centralActionsData || [];
  
  // Log error for debugging
  useEffect(() => {
    if (investigationsError) {
      console.error("Failed to load investigations:", investigationsError);
    }
  }, [investigationsError]);
  
  const { data: investigationData, isLoading: loadingInvestigation } = useQuery({
    queryKey: ["investigation", selectedInvId],
    queryFn: () => investigationAPI.getById(selectedInvId),
    enabled: !!selectedInvId,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 2,
  });
  
  const investigation = investigationData?.investigation;
  
  // Check if investigation is completed/locked
  const isInvestigationLocked = investigation?.status === "completed" || investigation?.status === "closed";
  
  const timelineEvents = investigationData?.timeline_events || [];
  // Sort timeline events chronologically by event_time
  const sortedTimelineEvents = useMemo(() => {
    return [...timelineEvents].sort((a, b) => {
      if (!a.event_time && !b.event_time) return 0;
      if (!a.event_time) return 1;
      if (!b.event_time) return -1;
      return new Date(a.event_time) - new Date(b.event_time);
    });
  }, [timelineEvents]);
  const failureIdentifications = investigationData?.failure_identifications || [];
  const causeNodes = investigationData?.cause_nodes || [];
  const actionItems = investigationData?.action_items || [];
  const evidenceItems = investigationData?.evidence || [];

  const filteredInvestigations = useMemo(() => {
    if (!searchQuery) return investigations;
    const q = searchQuery.toLowerCase();
    return investigations.filter(inv => inv.title.toLowerCase().includes(q) || inv.case_number.toLowerCase().includes(q) || inv.asset_name?.toLowerCase().includes(q));
  }, [investigations, searchQuery]);

  const stats = useMemo(() => ({
    totalEvents: sortedTimelineEvents.length,
    totalFailures: failureIdentifications.length,
    totalCauses: causeNodes.length,
    rootCauses: causeNodes.filter(c => c.is_root_cause).length,
    totalActions: actionItems.length,
    openActions: actionItems.filter(a => a.status === "open" || a.status === "in_progress").length,
  }), [sortedTimelineEvents, failureIdentifications, causeNodes, actionItems]);

  // Build flat cause list is handled by CauseTree component

  // Mutations
  const createInvMutation = useMutation({
    mutationFn: investigationAPI.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["investigations"] });
      setSelectedInvId(data.id);
      setShowNewInvDialog(false);
      setNewInvForm({ title: "", description: "", asset_name: "", location: "", incident_date: "", investigation_leader: "" });
      toast.success("Investigation created");
    },
    onError: () => toast.error("Failed to create investigation"),
  });
  
  const updateInvMutation = useMutation({
    mutationFn: ({ id, data }) => investigationAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigations"] });
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      // Close inline edit mode if it was open
      if (isEditingInvestigation) {
        setIsEditingInvestigation(false);
        toast.success(t("causal.investigationUpdated") || "Investigation updated");
      }
    },
  });

  // Handle enabling inline edit mode
  const handleEditInvestigation = () => {
    if (investigation) {
      setEditInvForm({
        title: investigation.title || "",
        description: investigation.description || "",
        asset_name: investigation.asset_name || "",
        location: investigation.location || "",
        incident_date: investigation.incident_date || "",
        investigation_leader: investigation.investigation_leader || "",
        status: investigation.status || "draft",
      });
      setIsEditingInvestigation(true);
    }
  };

  // Handle save edit investigation
  const handleSaveInvestigation = () => {
    if (selectedInvId) {
      updateInvMutation.mutate({ id: selectedInvId, data: editInvForm });
      setIsEditingInvestigation(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditingInvestigation(false);
    // Reset form to original values
    if (investigation) {
      setEditInvForm({
        title: investigation.title || "",
        description: investigation.description || "",
        asset_name: investigation.asset_name || "",
        location: investigation.location || "",
        incident_date: investigation.incident_date || "",
        investigation_leader: investigation.investigation_leader || "",
        status: investigation.status || "draft",
      });
    }
  };

  // Handle status change with confirmation for completion
  const handleStatusChange = (newStatus) => {
    if (newStatus === "completed" && investigation?.status !== "completed") {
      // Show confirmation dialog before completing
      setShowCompleteConfirm(true);
    } else {
      // Direct status change for other statuses
      updateInvMutation.mutate({ id: selectedInvId, data: { status: newStatus } });
    }
  };

  // Confirm and complete investigation
  const handleConfirmComplete = () => {
    updateInvMutation.mutate({ id: selectedInvId, data: { status: "completed" } });
    setShowCompleteConfirm(false);
    toast.success("Investigation marked as completed. All fields are now locked.");
  };

  // Sync localNotes with investigation data when investigation changes
  useEffect(() => {
    if (investigationData) {
      setLocalNotes(investigationData.notes || "");
    }
  }, [investigationData]);

  // Debounced save for notes
  useEffect(() => {
    if (!selectedInvId || localNotes === (investigationData?.notes || "")) return;
    const timer = setTimeout(() => {
      updateInvMutation.mutate({ id: selectedInvId, data: { notes: localNotes } });
    }, 1000);
    return () => clearTimeout(timer);
  }, [localNotes, selectedInvId, investigationData, updateInvMutation]);

  // File upload handler
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedInvId) return;
    
    setIsUploading(true);
    try {
      for (const file of files) {
        let processedFile = file;
        
        // Compress images before upload
        if (file.type.startsWith('image/')) {
          try {
            const result = await compressImage(file, {
              maxWidth: 1920,
              maxHeight: 1920,
              quality: 0.8,
              maxSizeMB: 1,
            });
            processedFile = result.file;
            if (result.wasCompressed) {
              const savedPercent = getCompressionPercent(result.originalSize, result.compressedSize);
              toast.success(`${file.name} compressed (${savedPercent}% smaller)`);
            }
          } catch (err) {
            console.error('Image compression failed:', err);
          }
        }
        
        await investigationAPI.uploadFile(selectedInvId, processedFile);
      }
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      toast.success(t("causal.filesUploaded") || `${files.length} file(s) uploaded successfully`);
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error(t("causal.uploadFailed") || "Failed to upload file(s)");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // File download handler
  const handleFileDownload = async (evidence) => {
    try {
      const blob = await investigationAPI.downloadFile(evidence.storage_path);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = evidence.original_filename || evidence.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error(t("causal.downloadFailed") || "Failed to download file");
    }
  };

  // Delete evidence mutation
  const deleteEvidenceMutation = useMutation({
    mutationFn: ({ invId, evidenceId }) => investigationAPI.deleteEvidence(invId, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      toast.success(t("causal.fileDeleted") || "File deleted");
    },
  });
  
  const deleteInvMutation = useMutation({
    mutationFn: async ({ id, options }) => {
      // Get the investigation to delete before actually deleting
      const invToDelete = investigations.find(inv => inv.id === id);
      const result = await investigationAPI.delete(id, options);
      return { result, deletedInv: invToDelete };
    },
    onSuccess: ({ result, deletedInv }) => {
      if (deletedInv) {
        pushUndo({
          type: "DELETE_INVESTIGATION",
          label: `Delete investigation "${deletedInv.title}"`,
          data: deletedInv,
          undo: async () => {
            await investigationAPI.create({
              title: deletedInv.title,
              description: deletedInv.description,
              asset_name: deletedInv.asset_name,
              location: deletedInv.location,
              incident_date: deletedInv.incident_date,
              investigation_leader: deletedInv.investigation_leader
            });
            queryClient.invalidateQueries({ queryKey: ["investigations"] });
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["investigations"] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      queryClient.invalidateQueries({ queryKey: ["actions"] }); // Refresh actions list
      setSelectedInvId(null);
      setDeleteInvOptions({ deleteCentralActions: false }); // Reset options
      const actionsDeleted = result?.deleted_central_actions || 0;
      toast.success(`Investigation deleted${actionsDeleted > 0 ? ` (${actionsDeleted} actions also removed)` : ''}`);
    },
  });
  
  const createEventMutation = useMutation({
    mutationFn: (data) => investigationAPI.createEvent(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowEventDialog(false);
      setEditingItem(null);
      setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" });
      toast.success("Event added");
    },
  });
  
  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, data }) => investigationAPI.updateEvent(selectedInvId, eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowEventDialog(false);
      setEditingItem(null);
      setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" });
      toast.success("Event updated");
    },
  });
  
  const deleteEventMutation = useMutation({
    mutationFn: (eventId) => investigationAPI.deleteEvent(selectedInvId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] }),
  });
  
  const createFailureMutation = useMutation({
    mutationFn: (data) => investigationAPI.createFailure(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowFailureDialog(false);
      setEditingItem(null);
      setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" });
      toast.success("Failure added");
    },
  });
  
  const updateFailureMutation = useMutation({
    mutationFn: ({ failureId, data }) => investigationAPI.updateFailure(selectedInvId, failureId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowFailureDialog(false);
      setEditingItem(null);
      setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" });
      toast.success("Failure updated");
    },
  });
  
  const deleteFailureMutation = useMutation({
    mutationFn: (failureId) => investigationAPI.deleteFailure(selectedInvId, failureId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] }),
  });
  
  const createCauseMutation = useMutation({
    mutationFn: (data) => investigationAPI.createCause(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowCauseDialog(false);
      setEditingItem(null);
      setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" });
      toast.success("Cause added");
    },
  });
  
  const updateCauseMutation = useMutation({
    mutationFn: ({ causeId, data }) => investigationAPI.updateCause(selectedInvId, causeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowCauseDialog(false);
      setEditingItem(null);
      setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" });
      toast.success("Cause updated");
    },
  });
  
  const deleteCauseMutation = useMutation({
    mutationFn: (causeId) => investigationAPI.deleteCause(selectedInvId, causeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] }),
  });
  
  const createActionMutation = useMutation({
    mutationFn: (data) => investigationAPI.createAction(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      setShowActionDialog(false);
      setEditingItem(null);
      setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" });
      toast.success("Action added");
    },
  });
  
  const updateActionMutation = useMutation({
    mutationFn: ({ actionId, data }) => investigationAPI.updateAction(selectedInvId, actionId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      setShowActionDialog(false);
      setEditingItem(null);
      setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" });
      toast.success("Action updated");
      
      // Check if all actions for the investigation are now completed
      if (result?.completion_notification) {
        setClosureSuggestion(result.completion_notification);
      }
    },
  });
  
  const deleteActionMutation = useMutation({
    mutationFn: (actionId) => investigationAPI.deleteAction(selectedInvId, actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
    },
  });

  // Promote investigation action to centralized action
  const promoteToCentralActionMutation = useMutation({
    mutationFn: (action) => actionsAPI.create({
      title: action.description.substring(0, 100),
      description: action.description,
      source_type: "investigation",
      source_id: selectedInvId,
      source_name: investigation?.title || "Unknown Investigation",
      priority: action.priority || "medium",
      assignee: action.owner || "",
      action_type: action.action_type || "",
      discipline: action.discipline || "",
      due_date: action.due_date || null,
      // Pass threat_id to inherit RPN and risk from original observation
      threat_id: investigation?.threat_id || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["central-actions", "investigation", selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      toast.success(t("causal.actionPromoted") || "Action added to Action Plan!");
    },
    onError: (error) => {
      console.error("Failed to promote action:", error);
      toast.error(t("causal.actionPromoteFailed") || "Failed to add to Action Plan");
    },
  });

  // Validate action in central action plan
  const validateActionMutation = useMutation({
    mutationFn: ({ actionId, validatorName, validatorPosition }) =>
      actionsAPI.validate(actionId, validatorName, validatorPosition, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["central-actions", "investigation", selectedInvId] });
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

  // Unvalidate action
  const unvalidateActionMutation = useMutation({
    mutationFn: (actionId) => actionsAPI.unvalidate(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["central-actions", "investigation", selectedInvId] });
      toast.success("Validation removed");
    },
    onError: (error) => {
      console.error("Failed to remove validation:", error);
      toast.error("Failed to remove validation");
    },
  });

  // Edit action mutation
  const editActionMutation = useMutation({
    mutationFn: ({ actionId, updates }) => actionsAPI.update(actionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["central-actions", "investigation", selectedInvId] });
      toast.success("Action updated!");
      setShowEditActionDialog(false);
      setEditingAction(null);
    },
    onError: (error) => {
      console.error("Failed to update action:", error);
      toast.error("Failed to update action");
    },
  });

  // Delete central action mutation
  const deleteCentralActionMutation = useMutation({
    mutationFn: (actionId) => actionsAPI.delete(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["central-actions", "investigation", selectedInvId] });
      toast.success("Action deleted!");
    },
    onError: (error) => {
      console.error("Failed to delete action:", error);
      toast.error("Failed to delete action");
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

  // Open edit action dialog
  const handleEditActionPlanItem = (action) => {
    setEditingAction(action);
    setEditActionForm({
      title: action.title || "",
      description: action.description || "",
      action_type: action.action_type || "",
      discipline: action.discipline || "",
      priority: action.priority || "medium",
      status: action.status || "open",
    });
    setShowEditActionDialog(true);
  };

  // Save edited action
  const handleSaveEditedAction = () => {
    if (!editActionForm.title.trim()) {
      toast.error("Please enter an action title");
      return;
    }
    editActionMutation.mutate({
      actionId: editingAction.id,
      updates: editActionForm,
    });
  };

  // Delete action with confirmation
  const handleDeleteActionPlanItem = (actionId) => {
    if (window.confirm("Are you sure you want to delete this action? This cannot be undone.")) {
      deleteCentralActionMutation.mutate(actionId);
    }
  };

  // Check if an investigation action is already in the central action plan
  const isActionInPlan = useCallback((action) => {
    return centralActions.some(ca => 
      ca.title?.toLowerCase().trim() === action.description?.substring(0, 100).toLowerCase().trim() ||
      ca.description?.toLowerCase().trim() === action.description?.toLowerCase().trim()
    );
  }, [centralActions]);

  // Report download functions
  const handleDownloadPPTX = async () => {
    if (!selectedInvId) return;
    setIsGeneratingReport(true);
    try {
      const blob = await investigationAPI.downloadReportPPTX(selectedInvId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Investigation_${investigation?.case_number || selectedInvId}.pptx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PowerPoint report downloaded!");
    } catch (error) {
      console.error("Failed to download PPTX:", error);
      toast.error("Failed to generate PowerPoint report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!selectedInvId) return;
    setIsGeneratingReport(true);
    try {
      const blob = await investigationAPI.downloadReportPDF(selectedInvId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Investigation_${investigation?.case_number || selectedInvId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF report downloaded!");
    } catch (error) {
      console.error("Failed to download PDF:", error);
      toast.error("Failed to generate PDF report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleGenerateAISummary = async () => {
    if (!selectedInvId) return;
    setIsGeneratingAISummary(true);
    setShowAISummaryDialog(true);
    setAISummary(null);
    try {
      const summary = await investigationAPI.getAISummary(selectedInvId);
      setAISummary(summary);
    } catch (error) {
      console.error("Failed to generate AI summary:", error);
      toast.error("Failed to generate AI summary");
      setShowAISummaryDialog(false);
    } finally {
      setIsGeneratingAISummary(false);
    }
  };

  const handleEditCause = useCallback((node) => {
    setEditingItem({ type: "cause", data: node });
    setCauseForm({ description: node.description, category: node.category, parent_id: node.parent_id, is_root_cause: node.is_root_cause, evidence: node.evidence || "", comment: node.comment || "" });
    setShowCauseDialog(true);
  }, []);

  const handleDeleteCause = useCallback((causeId) => deleteCauseMutation.mutate(causeId), [deleteCauseMutation]);
  const handleAddChildCause = useCallback((parentId) => { setEditingItem(null); setCauseForm({ description: "", category: "technical_cause", parent_id: parentId, is_root_cause: false, evidence: "", comment: "" }); setShowCauseDialog(true); }, []);
  const handleToggleRootCause = useCallback((node) => updateCauseMutation.mutate({ causeId: node.id, data: { is_root_cause: !node.is_root_cause } }), [updateCauseMutation]);

  const tabs = [
    { id: "overview", label: t("causal.overview"), icon: FileText },
    { id: "timeline", label: t("causal.timeline"), icon: Clock, count: stats.totalEvents },
    { id: "failures", label: t("causal.failures"), icon: AlertTriangle, count: stats.totalFailures },
    { id: "causes", label: t("causal.causalTree"), icon: GitBranch, count: stats.rootCauses },
    { id: "actions", label: t("causal.correctiveActions"), icon: CheckSquare, count: stats.openActions },
  ];

  // Show mobile-not-supported message
  if (isMobile) {
    return (
      <DesktopOnlyMessage 
        title="Causal Engine" 
        icon={GitBranch}
        description="The Causal Engine requires a larger screen for the best experience. Please use a tablet or desktop device."
      />
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" data-testid="causal-engine-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="px-4 py-2 bg-white border-b border-slate-200">
          <BackButton />
        </div>
      )}
      
      <div className="flex-1 flex overflow-hidden">
      {/* Sidebar - Investigation List */}
      <div className="w-80 flex-shrink-0 h-full flex flex-col bg-slate-50 border-r border-slate-200">
        <div className="p-4 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("causal.investigations")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{filteredInvestigations.length} investigation{filteredInvestigations.length !== 1 ? 's' : ''}</p>
            </div>
            <Button size="sm" onClick={() => setShowNewInvDialog(true)} className="h-9 bg-blue-600 hover:bg-blue-700" data-testid="new-investigation-btn"><Plus className="w-4 h-4 mr-1" />{t("common.add")}</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder={t("causal.searchInvestigations")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white" data-testid="search-investigations" />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loadingInvestigations ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filteredInvestigations.length === 0 ? (
            <div className="empty-state py-12 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3 mx-auto">
                <FileText className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 text-center">{t("causal.noInvestigations")}</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredInvestigations.map((inv) => {
                const statusColors = {
                  draft: "bg-slate-100 text-slate-600",
                  in_progress: "bg-amber-100 text-amber-700",
                  completed: "bg-green-100 text-green-700",
                  closed: "bg-blue-100 text-blue-700",
                };
                const statusColor = statusColors[inv.status] || statusColors.draft;
                
                return (
                  <button 
                    key={inv.id} 
                    onClick={() => setSelectedInvId(inv.id)} 
                    className={`w-full text-left p-4 rounded-xl transition-all duration-200 border ${
                      selectedInvId === inv.id 
                        ? "bg-blue-50 border-blue-300 shadow-sm ring-1 ring-blue-200" 
                        : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                    }`} 
                    data-testid={`investigation-item-${inv.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">{inv.case_number}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor}`}>
                        {inv.status?.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm line-clamp-2 mb-2 leading-snug">{inv.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {inv.asset_name && (
                        <div className="flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[120px]">
                            {inv.asset_name}
                            {inv.equipment_tag && <span className="text-slate-400 ml-1">({inv.equipment_tag})</span>}
                          </span>
                        </div>
                      )}
                      {inv.incident_date && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(inv.incident_date)}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Main content */}
      {!selectedInvId ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <ClipboardList className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">{t("causal.noInvestigations")}</h2>
            <p className="text-slate-500 mb-4">{t("causal.noInvestigationsDesc")}</p>
            <Button onClick={() => setShowNewInvDialog(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" />{t("causal.newInvestigation")}</Button>
          </div>
        </div>
      ) : loadingInvestigation ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : investigation ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs - same style as other pages */}
          <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-slate-200">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`} data-testid={`tab-${tab.id}`}>
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                  {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.id ? "bg-blue-200" : "bg-slate-200"}`}>{tab.count}</span>}
                </button>
              );
            })}
          </div>
          
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Inline Edit Mode */}
                {isEditingInvestigation ? (
                  <div className="bg-white rounded-xl border p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-lg font-semibold text-slate-900">Edit Investigation</h2>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                          <X className="w-4 h-4 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveInvestigation} disabled={updateInvMutation.isPending}>
                          <Save className="w-4 h-4 mr-1" /> {updateInvMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label htmlFor="edit-title">Title</Label>
                        <Input
                          id="edit-title"
                          value={editInvForm.title}
                          onChange={(e) => setEditInvForm({ ...editInvForm, title: e.target.value })}
                          placeholder="Investigation title"
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <Label htmlFor="edit-description">Description</Label>
                        <Textarea
                          id="edit-description"
                          value={editInvForm.description}
                          onChange={(e) => setEditInvForm({ ...editInvForm, description: e.target.value })}
                          placeholder="Investigation description"
                          className="mt-1 min-h-[80px]"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="edit-equipment">Equipment</Label>
                        {equipmentNodes.length > 0 ? (
                          <Select
                            value={editInvForm.asset_name}
                            onValueChange={(v) => setEditInvForm({ ...editInvForm, asset_name: v })}
                          >
                            <SelectTrigger className="mt-1" id="edit-equipment">
                              <SelectValue placeholder="Select equipment" />
                            </SelectTrigger>
                            <SelectContent>
                              {equipmentNodes.map((node) => (
                                <SelectItem key={node.id} value={node.name}>
                                  {node.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id="edit-equipment"
                            value={editInvForm.asset_name}
                            onChange={(e) => setEditInvForm({ ...editInvForm, asset_name: e.target.value })}
                            placeholder="Enter equipment name"
                            className="mt-1"
                          />
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="edit-location">Location</Label>
                        <Input
                          id="edit-location"
                          value={editInvForm.location}
                          onChange={(e) => setEditInvForm({ ...editInvForm, location: e.target.value })}
                          placeholder="Location"
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="edit-date">Incident Date</Label>
                        <Input
                          id="edit-date"
                          type="date"
                          value={editInvForm.incident_date}
                          onChange={(e) => setEditInvForm({ ...editInvForm, incident_date: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="edit-lead">Investigation Lead</Label>
                        <Select
                          value={editInvForm.investigation_leader}
                          onValueChange={(v) => setEditInvForm({ ...editInvForm, investigation_leader: v })}
                        >
                          <SelectTrigger className="mt-1" id="edit-lead">
                            <SelectValue placeholder="Select lead" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.name || user.email}>
                                {user.name || user.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="edit-status">Status</Label>
                        <Select
                          value={editInvForm.status}
                          onValueChange={(v) => setEditInvForm({ ...editInvForm, status: v })}
                        >
                          <SelectTrigger className="mt-1" id="edit-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {INVESTIGATION_STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-mono text-slate-500">{investigation.case_number}</span>
                          {isInvestigationLocked ? (
                            <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-green-100 text-green-700 text-xs font-medium">
                              <Lock className="w-3 h-3" />
                              {investigation.status === "completed" ? "Completed" : "Closed"}
                            </div>
                          ) : (
                            <Select value={investigation.status} onValueChange={handleStatusChange}>
                              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{INVESTIGATION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 mb-1">{investigation.title}</h1>
                        <p className="text-sm text-slate-600">{investigation.description}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* AI Summary Button */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-purple-600 border-purple-200 hover:bg-purple-50 h-8"
                          onClick={handleGenerateAISummary}
                          disabled={isGeneratingAISummary}
                          data-testid="ai-summary-btn"
                        >
                          {isGeneratingAISummary ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Brain className="w-4 h-4 mr-1" />
                          )}
                          AI Summary
                        </Button>
                        
                        {/* Export Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-slate-600 h-8"
                              disabled={isGeneratingReport}
                              data-testid="export-report-btn"
                            >
                              {isGeneratingReport ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <FileDown className="w-4 h-4 mr-1" />
                              )}
                              Export
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleDownloadPPTX} disabled={isGeneratingReport}>
                              <Presentation className="w-4 h-4 mr-2 text-orange-500" />
                              PowerPoint (.pptx)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDownloadPDF} disabled={isGeneratingReport}>
                              <FileText className="w-4 h-4 mr-2 text-red-500" />
                              PDF Report (.pdf)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        {!isInvestigationLocked && (
                          <Button variant="ghost" size="icon" onClick={handleEditInvestigation} className="text-slate-500 hover:text-blue-600" data-testid="edit-investigation-btn">
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {!isInvestigationLocked && (
                          <AlertDialog onOpenChange={(open) => { if (!open) setDeleteInvOptions({ deleteCentralActions: false }); }}>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500" data-testid="delete-investigation-btn"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Investigation</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete this investigation and all its internal data (timeline events, failure identifications, causes, evidence).
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <div className="py-4 space-y-3">
                                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={deleteInvOptions.deleteCentralActions}
                                    onChange={(e) => setDeleteInvOptions(prev => ({ ...prev, deleteCentralActions: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                  />
                                  <div>
                                    <div className="font-medium text-slate-900">Also delete linked Actions</div>
                                    <div className="text-sm text-slate-500">Remove all Central Actions created from this investigation</div>
                                  </div>
                                </label>
                              </div>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteInvMutation.mutate({ id: selectedInvId, options: deleteInvOptions })} 
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete Investigation
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                    
                    {/* Compact Stats Row - Same as Threats */}
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                        <div className="p-1.5 rounded-md bg-blue-50"><Clock className="w-4 h-4 text-blue-600" /></div>
                        <div><span className="text-lg font-bold text-slate-900">{stats.totalEvents}</span><span className="text-xs text-slate-500 ml-1">Events</span></div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                        <div className="p-1.5 rounded-md bg-orange-50"><AlertTriangle className="w-4 h-4 text-orange-600" /></div>
                        <div><span className="text-lg font-bold text-slate-900">{stats.totalFailures}</span><span className="text-xs text-slate-500 ml-1">Failures</span></div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                        <div className="p-1.5 rounded-md bg-purple-50"><GitBranch className="w-4 h-4 text-purple-600" /></div>
                        <div><span className="text-lg font-bold text-slate-900">{stats.totalCauses}</span><span className="text-xs text-slate-500 ml-1">Causes</span></div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                        <div className="p-1.5 rounded-md bg-red-50"><Target className="w-4 h-4 text-red-600" /></div>
                        <div><span className="text-lg font-bold text-red-600">{stats.rootCauses}</span><span className="text-xs text-slate-500 ml-1">Root Causes</span></div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                        <div className="p-1.5 rounded-md bg-green-50"><CheckSquare className="w-4 h-4 text-green-600" /></div>
                        <div><span className="text-lg font-bold text-slate-900">{stats.totalActions}</span><span className="text-xs text-slate-500 ml-1">Actions</span></div>
                      </div>
                    </div>

                    {/* Info cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {investigation.asset_name && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Target className="w-3 h-3" />Equipment</div><p className="font-medium text-sm">{investigation.asset_name}{investigation.equipment_tag && <span className="text-slate-400 ml-1">({investigation.equipment_tag})</span>}</p></div>}
                      {investigation.location && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><MapPin className="w-3 h-3" />Location</div><p className="font-medium text-sm">{investigation.location}</p></div>}
                      {investigation.incident_date && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Calendar className="w-3 h-3" />Date</div><p className="font-medium text-sm">{formatDate(investigation.incident_date)}</p></div>}
                      {investigation.investigation_leader && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><User className="w-3 h-3" />Lead</div><p className="font-medium text-sm">{investigation.investigation_leader}</p></div>}
                    </div>
                  </>
                )}
                
                {/* Quick Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button onClick={() => setActiveTab("timeline")} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"><Clock className="w-5 h-5 text-blue-600" /><div className="text-left"><div className="font-medium text-sm">Timeline</div><div className="text-xs text-slate-500">Build sequence</div></div></button>
                  <button onClick={() => setActiveTab("failures")} className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"><AlertTriangle className="w-5 h-5 text-orange-600" /><div className="text-left"><div className="font-medium text-sm">Failures</div><div className="text-xs text-slate-500">Identify what failed</div></div></button>
                  <button onClick={() => setActiveTab("causes")} className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"><GitBranch className="w-5 h-5 text-purple-600" /><div className="text-left"><div className="font-medium text-sm">Causes</div><div className="text-xs text-slate-500">Build causal tree</div></div></button>
                  <button onClick={() => setActiveTab("actions")} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"><CheckSquare className="w-5 h-5 text-green-600" /><div className="text-left"><div className="font-medium text-sm">Actions</div><div className="text-xs text-slate-500">Track corrections</div></div></button>
                </div>

                {/* Investigation Notes */}
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-slate-700 mb-3">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium text-sm">{t("causal.investigationNotes") || "Investigation Notes"}</span>
                  </div>
                  <Textarea
                    value={localNotes}
                    onChange={(e) => setLocalNotes(e.target.value)}
                    placeholder={t("causal.notesPlaceholder") || "Add notes, observations, or important details about this investigation..."}
                    className="min-h-[120px] resize-y text-sm"
                    data-testid="investigation-notes"
                  />
                </div>

                {/* Equipment History Timeline - shows related observations and actions from the linked threat */}
                {investigation.threat_id && (
                  <EquipmentTimeline 
                    threatId={investigation.threat_id}
                    equipmentId={null}
                    equipmentName={investigation.asset_name}
                  />
                )}

                {/* Attached Files */}
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Upload className="w-4 h-4" />
                      <span className="font-medium text-sm">{t("causal.attachedFiles") || "Attached Files"}</span>
                      {evidenceItems.length > 0 && (
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{evidenceItems.length}</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="h-8"
                      data-testid="upload-file-btn"
                    >
                      {isUploading ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />{t("common.uploading") || "Uploading..."}</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5 mr-2" />{t("causal.addFile") || "Add File"}</>
                      )}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
                    />
                  </div>
                  
                  {evidenceItems.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg bg-slate-50">
                      <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">{t("causal.noFilesYet") || "No files attached yet"}</p>
                      <p className="text-xs text-slate-400 mt-1">{t("causal.dropFilesHint") || "Click 'Add File' to upload documents, images, or reports"}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {evidenceItems.map((evidence) => {
                        const isImage = evidence.evidence_type === "photo" || evidence.content_type?.startsWith("image/");
                        const FileIcon = isImage ? Image : File;
                        const fileSize = evidence.file_size ? (evidence.file_size / 1024).toFixed(1) + " KB" : "";
                        
                        return (
                          <div 
                            key={evidence.id}
                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg group hover:bg-slate-100 transition-colors"
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isImage ? "bg-purple-100" : "bg-blue-100"}`}>
                              <FileIcon className={`w-5 h-5 ${isImage ? "text-purple-600" : "text-blue-600"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{evidence.original_filename || evidence.name}</p>
                              <p className="text-xs text-slate-500">
                                {evidence.evidence_type} {fileSize && `• ${fileSize}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleFileDownload(evidence)}
                                className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                                data-testid={`download-file-${evidence.id}`}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteEvidenceMutation.mutate({ invId: selectedInvId, evidenceId: evidence.id })}
                                className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                                data-testid={`delete-file-${evidence.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {activeTab === "timeline" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Sequence of Events</h2><p className="text-sm text-slate-500">Reconstruct the timeline</p></div>
                  <Button onClick={() => { setEditingItem(null); setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" }); setShowEventDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-event-btn" disabled={isInvestigationLocked}><Plus className="w-4 h-4 mr-2" />Add Event</Button>
                </div>
                
                {sortedTimelineEvents.length === 0 ? (
                  <div className="empty-state py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <Clock className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No events recorded</h3>
                    <p className="text-sm text-slate-500">Start by adding the first event</p>
                  </div>
                ) : (
                  <div className="priority-list">
                    {sortedTimelineEvents.map((event, idx) => {
                      const category = EVENT_CATEGORIES.find(c => c.value === event.category);
                      // Format the timestamp to be more readable using user preferences
                      const formatEventTime = (timeStr) => {
                        if (!timeStr) return `#${idx + 1}`;
                        try {
                          return formatDateTime(timeStr);
                        } catch {
                          return timeStr.substring(0, 16).replace('T', ' ');
                        }
                      };
                      return (
                        <motion.div key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="priority-item group" data-testid={`timeline-event-${event.id}`}>
                          <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${category?.bgClass?.split(' ')[0] || 'bg-slate-100'}`}>
                            <Clock className={`w-5 h-5 sm:w-6 sm:h-6 ${category?.bgClass?.split(' ')[1] || 'text-slate-600'}`} />
                          </div>
                          <div className="flex-1 min-w-0 ml-3">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-medium text-slate-500">{formatEventTime(event.event_time)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${category?.bgClass || "bg-slate-100 text-slate-700"}`}>{category?.label || event.category}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${event.confidence === "high" ? "bg-green-100 text-green-700" : event.confidence === "low" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{event.confidence}</span>
                              {event.comment && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1"><MessageSquare className="w-3 h-3" />Has comment</span>}
                            </div>
                            <p className="text-sm text-slate-900 line-clamp-2">{event.description}</p>
                            {event.evidence_source && <p className="text-xs text-slate-500 mt-1">Source: {event.evidence_source}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingItem({ type: "event", data: event }); setEventForm({ event_time: event.event_time || "", description: event.description, category: event.category, evidence_source: event.evidence_source || "", confidence: event.confidence, notes: event.notes || "", comment: event.comment || "" }); setShowEventDialog(true); }}><Edit className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteEventMutation.mutate(event.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "failures" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Failure Identification</h2><p className="text-sm text-slate-500">Define what technically failed</p></div>
                  <Button onClick={() => { setEditingItem(null); setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" }); setShowFailureDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-failure-btn" disabled={isInvestigationLocked}><Plus className="w-4 h-4 mr-2" />Add Failure</Button>
                </div>
                
                {failureIdentifications.length === 0 ? (
                  <div className="empty-state py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No failures identified</h3>
                    <p className="text-sm text-slate-500">Document what failed</p>
                  </div>
                ) : (
                  <div className="priority-list">
                    {failureIdentifications.map((failure, idx) => (
                      <motion.div key={failure.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="priority-item group" data-testid={`failure-item-${failure.id}`}>
                        <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-red-50">
                          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                        </div>
                        <div className="priority-rank text-sm">#{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-sm">{failure.asset_name}</span>
                            {failure.subsystem && <><ChevronRight className="w-3 h-3 text-slate-400" /><span className="text-sm text-slate-600">{failure.subsystem}</span></>}
                            {failure.component && <><ChevronRight className="w-3 h-3 text-slate-400" /><span className="text-sm text-slate-600">{failure.component}</span></>}
                            {failure.comment && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1"><MessageSquare className="w-3 h-3" />Has comment</span>}
                          </div>
                          <div className="text-xs sm:text-sm text-slate-500">
                            <span className="text-red-600 font-medium">{failure.failure_mode}</span>
                            {failure.degradation_mechanism && <span className="ml-2">• {failure.degradation_mechanism}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingItem({ type: "failure", data: failure }); setFailureForm({ asset_name: failure.asset_name, subsystem: failure.subsystem || "", component: failure.component, failure_mode: failure.failure_mode, degradation_mechanism: failure.degradation_mechanism || "", evidence: failure.evidence || "", comment: failure.comment || "" }); setShowFailureDialog(true); }}><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteFailureMutation.mutate(failure.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "causes" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Causal Tree</h2><p className="text-sm text-slate-500">Build cause-and-effect relationships</p></div>
                  <Button onClick={() => { setEditingItem(null); setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" }); setShowCauseDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-cause-btn" disabled={isInvestigationLocked}><Plus className="w-4 h-4 mr-2" />Add Cause</Button>
                </div>
                
                {causeNodes.length === 0 ? (
                  <div className="empty-state py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <GitBranch className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No causes identified</h3>
                    <p className="text-sm text-slate-500">Start building the causal tree</p>
                  </div>
                ) : (
                  <CauseTree causes={causeNodes} onEdit={handleEditCause} onDelete={handleDeleteCause} onAddChild={handleAddChildCause} onToggleRoot={handleToggleRootCause} isLocked={isInvestigationLocked} />
                )}
              </div>
            )}
            
            {activeTab === "actions" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Corrective Actions</h2><p className="text-sm text-slate-500">Track actions to prevent recurrence</p></div>
                  <Button onClick={() => { setEditingItem(null); setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" }); setShowActionDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-action-btn" disabled={isInvestigationLocked}><Plus className="w-4 h-4 mr-2" />Add Action</Button>
                </div>
                
                {actionItems.length === 0 ? (
                  <div className="empty-state py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <CheckSquare className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No actions defined</h3>
                    <p className="text-sm text-slate-500">Add corrective actions</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actionItems.map((action, idx) => {
                      const priority = ACTION_PRIORITIES.find(p => p.value === action.priority);
                      const statusInfo = ACTION_STATUSES.find(s => s.value === action.status);
                      const isOverdue = action.due_date && new Date(action.due_date) < new Date() && action.status !== "completed";
                      const alreadyInPlan = isActionInPlan(action);
                      
                      return (
                        <motion.div 
                          key={action.id} 
                          initial={{ opacity: 0, y: 10 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          transition={{ delay: idx * 0.03 }} 
                          className={`rounded-xl border p-4 group hover:shadow-md transition-all ${
                            alreadyInPlan ? 'bg-green-50 border-green-200' :
                            isOverdue ? 'border-red-200 bg-red-50/30' : 
                            'bg-white border-slate-200'
                          }`}
                          data-testid={`action-item-${action.id}`}
                        >
                          <div className="flex items-start gap-4">
                            {/* Action Number & Priority Icon */}
                            <div className="flex flex-col items-center gap-1">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${priority?.bgClass?.split(' ')[0] || 'bg-slate-100'}`}>
                                <CheckSquare className={`w-6 h-6 ${priority?.bgClass?.split(' ')[1] || 'text-slate-600'}`} />
                              </div>
                              <span className="text-xs font-medium text-slate-500">{action.action_number}</span>
                            </div>
                            
                            {/* Main Content */}
                            <div className="flex-1 min-w-0">
                              {/* Description */}
                              <p className="text-sm font-medium text-slate-900 mb-2 leading-relaxed">{action.description}</p>
                              
                              {/* Meta Row */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${priority?.bgClass || "bg-slate-100 text-slate-700"}`}>
                                  {priority?.label || action.priority}
                                </span>
                                {action.action_type && (
                                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold text-white ${
                                    action.action_type === 'CM' ? 'bg-amber-500' :
                                    action.action_type === 'PM' ? 'bg-blue-500' :
                                    action.action_type === 'PDM' ? 'bg-purple-500' :
                                    'bg-slate-500'
                                  }`}>
                                    {action.action_type}
                                  </span>
                                )}
                                {action.discipline && (
                                  <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-700">
                                    {action.discipline}
                                  </span>
                                )}
                                <Select value={action.status} onValueChange={(v) => updateActionMutation.mutate({ actionId: action.id, data: { status: v } })}>
                                  <SelectTrigger className={`h-7 w-28 text-xs border-0 ${
                                    action.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    action.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>{ACTION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                                </Select>
                                {isOverdue && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Overdue</span>
                                )}
                                {/* In Action Plan indicator */}
                                {alreadyInPlan && (
                                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                                    <CheckCircle className="w-3 h-3" />
                                    In Action Plan
                                  </span>
                                )}
                              </div>
                              
                              {/* Details Row */}
                              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                {action.owner && (
                                  <span className="flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" />
                                    <span className="font-medium text-slate-700">{action.owner}</span>
                                  </span>
                                )}
                                {action.due_date && (
                                  <span className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-600' : ''}`}>
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className={isOverdue ? 'font-medium' : ''}>{formatDate(action.due_date)}</span>
                                  </span>
                                )}
                                {action.comment && (
                                  <span className="flex items-center gap-1.5 text-slate-400">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Comment
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {alreadyInPlan ? (
                                <Badge className="bg-green-100 text-green-700 border-green-300 text-xs px-2 py-1">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Added
                                </Badge>
                              ) : (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" 
                                  onClick={() => promoteToCentralActionMutation.mutate(action)} 
                                  disabled={promoteToCentralActionMutation.isPending} 
                                  title="Add to action plan" 
                                  data-testid={`promote-action-${action.id}`}
                                >
                                  <ClipboardList className="w-4 h-4 mr-1" />Act
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-500 hover:text-slate-700" 
                                onClick={() => { 
                                  setEditingItem({ type: "action", data: action }); 
                                  setActionForm({ 
                                    description: action.description || "", 
                                    owner: action.owner || "", 
                                    priority: action.priority || "medium", 
                                    due_date: action.due_date || "", 
                                    linked_cause_id: action.linked_cause_id || null, 
                                    action_type: action.action_type || "", 
                                    discipline: action.discipline || "", 
                                    comment: action.comment || "" 
                                  }); 
                                  setShowActionDialog(true); 
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" 
                                onClick={() => deleteActionMutation.mutate(action.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
                
                {/* Action Plan Section - Central actions linked to this investigation */}
                {centralActions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-6 bg-white rounded-xl border border-slate-200 p-4"
                    data-testid="investigation-action-plan-section"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-slate-900">Action Plan</h3>
                        <Badge variant="secondary" className="text-xs">{centralActions.length}</Badge>
                        {centralActions.filter(a => a.is_validated).length > 0 && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            {centralActions.filter(a => a.is_validated).length} validated
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.location.href = "/actions"}
                        className="text-blue-600 hover:text-blue-700 h-7 text-xs px-2"
                      >
                        View All
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {centralActions.map((action, index) => {
                        const statusCfg = {
                          open: { bg: "bg-slate-50", color: "text-slate-600", label: "Open" },
                          in_progress: { bg: "bg-blue-50", color: "text-blue-600", label: "In Progress" },
                          completed: { bg: "bg-green-50", color: "text-green-600", label: "Completed" },
                          closed: { bg: "bg-slate-100", color: "text-slate-500", label: "Closed" },
                        }[action.status] || { bg: "bg-slate-50", color: "text-slate-600", label: action.status };
                        const actionNumber = index + 1;
                        
                        return (
                          <div
                            key={action.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                              action.is_validated 
                                ? "bg-green-50 border-green-200" 
                                : `${statusCfg.bg} border-slate-200 hover:shadow-sm`
                            }`}
                            data-testid={`inv-action-plan-item-${action.id}`}
                          >
                            {/* Action Number & Type Badge */}
                            <div className="flex-shrink-0">
                              {action.action_type ? (
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs relative ${
                                  action.action_type === 'CM' ? 'bg-amber-500' :
                                  action.action_type === 'PM' ? 'bg-blue-500' :
                                  action.action_type === 'PDM' ? 'bg-purple-500' :
                                  'bg-slate-500'
                                }`}>
                                  {action.action_type}
                                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center shadow">
                                    {actionNumber}
                                  </span>
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm">
                                  {actionNumber}
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => window.location.href = `/actions/${action.id}`}>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {/* Action ID */}
                                {action.action_number && (
                                  <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {action.action_number}
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                                  {statusCfg.label}
                                </span>
                                {action.discipline && (
                                  <span className="text-[10px] text-slate-400">{action.discipline}</span>
                                )}
                                {action.is_validated && (
                                  <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5">
                                    <ShieldCheck className="w-3 h-3 mr-0.5" />
                                    Validated
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-slate-700 leading-snug line-clamp-2">{action.title}</p>
                              {action.is_validated && action.validated_by_name && (
                                <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                                  <UserCheck className="w-3 h-3" />
                                  {action.validated_by_name} ({action.validated_by_position})
                                </p>
                              )}
                              {action.assignee && !action.is_validated && (
                                <p className="text-[10px] text-slate-400 mt-1">Owner: {action.assignee}</p>
                              )}
                            </div>

                            {/* Actions Column */}
                            <div className="flex-shrink-0 flex flex-col items-end gap-1">
                              {action.due_date && (
                                <p className="text-[10px] text-slate-500">
                                  Due: {formatDate(action.due_date)}
                                </p>
                              )}
                              {action.priority && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-[10px] ${
                                    action.priority === 'high' || action.priority === 'critical' ? 'border-red-300 text-red-600' :
                                    action.priority === 'medium' ? 'border-amber-300 text-amber-600' :
                                    'border-slate-300 text-slate-600'
                                  }`}
                                >
                                  {action.priority}
                                </Badge>
                              )}
                              
                              {/* Edit & Delete Buttons */}
                              <div className="flex items-center gap-1 mt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditActionPlanItem(action);
                                  }}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  title="Edit action"
                                  data-testid={`inv-edit-action-${action.id}`}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteActionPlanItem(action.id);
                                  }}
                                  disabled={deleteCentralActionMutation.isPending}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  title="Delete action"
                                  data-testid={`inv-delete-action-${action.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                              
                              {!action.is_validated ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenValidateDialog(action);
                                  }}
                                  className="h-6 text-[10px] px-2 text-green-600 border-green-200 hover:bg-green-50 mt-1"
                                  data-testid={`inv-validate-action-${action.id}`}
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
              </div>
            )}
          </div>
        </div>
      ) : <div className="flex-1 flex items-center justify-center"><p>Not found</p></div>}
      
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
              <Label htmlFor="inv-validator-name">Validator Name *</Label>
              <Input
                id="inv-validator-name"
                value={validatorName}
                onChange={(e) => setValidatorName(e.target.value)}
                placeholder="e.g., John Smith"
                data-testid="inv-validator-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-validator-position">Position / Role *</Label>
              <Input
                id="inv-validator-position"
                value={validatorPosition}
                onChange={(e) => setValidatorPosition(e.target.value)}
                placeholder="e.g., Reliability Engineer"
                data-testid="inv-validator-position-input"
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
              data-testid="inv-confirm-validate-button"
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
      
      {/* Dialogs */}
      <NewInvestigationDialog
        open={showNewInvDialog}
        onOpenChange={setShowNewInvDialog}
        form={newInvForm}
        setForm={setNewInvForm}
        onSubmit={() => createInvMutation.mutate(newInvForm)}
        isPending={createInvMutation.isPending}
        users={users}
      />
      
      <EventDialog
        open={showEventDialog}
        onOpenChange={(open) => { setShowEventDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={eventForm}
        setForm={setEventForm}
        onSubmit={() => { if (editingItem?.type === "event") updateEventMutation.mutate({ eventId: editingItem.data.id, data: eventForm }); else createEventMutation.mutate(eventForm); }}
      />
      
      <FailureDialog
        open={showFailureDialog}
        onOpenChange={(open) => { setShowFailureDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={failureForm}
        setForm={setFailureForm}
        onSubmit={() => { if (editingItem?.type === "failure") updateFailureMutation.mutate({ failureId: editingItem.data.id, data: failureForm }); else createFailureMutation.mutate(failureForm); }}
        equipmentNodes={equipmentNodes}
        failureModes={failureModesList}
      />
      
      <CauseDialog
        open={showCauseDialog}
        onOpenChange={(open) => { setShowCauseDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={causeForm}
        setForm={setCauseForm}
        onSubmit={() => { if (editingItem?.type === "cause") updateCauseMutation.mutate({ causeId: editingItem.data.id, data: causeForm }); else createCauseMutation.mutate(causeForm); }}
        causeNodes={causeNodes}
      />
      
      <ActionDialog
        open={showActionDialog}
        onOpenChange={(open) => { setShowActionDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={actionForm}
        setForm={setActionForm}
        onSubmit={() => { if (editingItem?.type === "action") updateActionMutation.mutate({ actionId: editingItem.data.id, data: actionForm }); else createActionMutation.mutate(actionForm); }}
        causeNodes={causeNodes}
        users={users}
      />
      
      {/* Complete Investigation Confirmation Dialog */}
      <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Complete Investigation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Marking this investigation as <strong>Completed</strong> will lock all fields. 
              You will no longer be able to edit the investigation details, add events, failures, causes, or actions.
              <br /><br />
              Are you sure you want to complete this investigation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmComplete} className="bg-green-600 hover:bg-green-700">
              Yes, Complete Investigation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* AI Summary Dialog */}
      <Dialog open={showAISummaryDialog} onOpenChange={setShowAISummaryDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              AI Investigation Summary
            </DialogTitle>
            <DialogDescription>
              AI-generated analysis and recommendations for this investigation
            </DialogDescription>
          </DialogHeader>
          
          {isGeneratingAISummary ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-purple-600 animate-pulse" />
                </div>
                <Loader2 className="absolute -top-1 -right-1 w-6 h-6 text-purple-600 animate-spin" />
              </div>
              <p className="text-slate-600 text-sm">Analyzing investigation data...</p>
              <p className="text-slate-400 text-xs">This may take a few moments</p>
            </div>
          ) : aiSummary ? (
            <div className="space-y-6 py-4">
              {/* Executive Summary */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  Executive Summary
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-lg">
                  {aiSummary.summary}
                </p>
              </div>
              
              {/* Key Findings */}
              {aiSummary.key_findings?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-600" />
                    Key Findings
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.key_findings.map((finding, idx) => (
                      <li key={`finding-${idx}-${finding.slice(0,20)}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-medium mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Next Steps */}
              {aiSummary.next_steps?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                    Recommended Next Steps
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.next_steps.map((step, idx) => (
                      <li key={`step-${idx}-${step.slice(0,20)}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Recommendations */}
              {aiSummary.recommendations?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-green-600" />
                    Strategic Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.recommendations.map((rec, idx) => (
                      <li key={`rec-${idx}-${rec.slice(0,20)}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-medium mt-0.5">
                          ✓
                        </span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAISummaryDialog(false)}>
              Close
            </Button>
            {aiSummary && (
              <Button 
                onClick={handleGenerateAISummary} 
                disabled={isGeneratingAISummary}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Brain className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Investigation Closure Suggestion Dialog */}
      <Dialog open={!!closureSuggestion} onOpenChange={() => setClosureSuggestion(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 text-green-500" />
              All Actions Completed!
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-800">
                  {closureSuggestion?.total_actions} action{closureSuggestion?.total_actions !== 1 ? 's' : ''} completed
                </p>
                <p className="text-sm text-green-600">
                  {closureSuggestion?.source_name}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {closureSuggestion?.message || "All corrective actions for this investigation have been completed. Consider closing this investigation."}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClosureSuggestion(null)}>
              Later
            </Button>
            <Button 
              onClick={() => {
                setClosureSuggestion(null);
                // Show the completion confirmation dialog
                setShowCompleteConfirm(true);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Investigation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={showEditActionDialog} onOpenChange={setShowEditActionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Edit Action
            </DialogTitle>
            <DialogDescription>
              Update the action details. Changes will be saved to the action plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inv-edit-action-title">Action Title *</Label>
              <Input
                id="inv-edit-action-title"
                value={editActionForm.title}
                onChange={(e) => setEditActionForm({ ...editActionForm, title: e.target.value })}
                placeholder="e.g., Replace worn seals"
                data-testid="inv-edit-action-title-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-edit-action-description">Description</Label>
              <Textarea
                id="inv-edit-action-description"
                value={editActionForm.description}
                onChange={(e) => setEditActionForm({ ...editActionForm, description: e.target.value })}
                placeholder="Additional details about the action..."
                rows={3}
                data-testid="inv-edit-action-description-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-type">Action Type</Label>
                <Select
                  value={editActionForm.action_type}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, action_type: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-type-select">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CM">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Corrective (CM)
                      </div>
                    </SelectItem>
                    <SelectItem value="PM">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Preventive (PM)
                      </div>
                    </SelectItem>
                    <SelectItem value="PDM">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Predictive (PDM)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-discipline">Discipline</Label>
                <Select
                  value={editActionForm.discipline}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, discipline: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-discipline-select">
                    <SelectValue placeholder="Select discipline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["Mechanical", "Electrical", "Instrumentation", "Process", "Operations", "Safety", "Civil", "Rotating Equipment", "HVAC", "IT/OT", "General"].map((disc) => (
                      <SelectItem key={disc} value={disc}>{disc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-priority">Priority</Label>
                <Select
                  value={editActionForm.priority}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, priority: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-priority-select">
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
                <Label htmlFor="inv-edit-action-status">Status</Label>
                <Select
                  value={editActionForm.status}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, status: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-status-select">
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
                        <Clock className="w-3 h-3 text-amber-500" />
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
              data-testid="cancel-inv-edit-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditedAction}
              disabled={editActionMutation.isPending || !editActionForm.title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-inv-edit-action-button"
            >
              {editActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
