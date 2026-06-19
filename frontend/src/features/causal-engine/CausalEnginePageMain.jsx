import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { investigationAPI, actionsAPI, usersAPI, equipmentHierarchyAPI, failureModesAPI } from "../../lib/api";
import { compressImage, formatFileSize, getCompressionPercent } from "../../lib/imageCompression";
import { useUndo } from "../../contexts/UndoContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { useEquipmentNodeNameMap, useEquipmentTypeNameMap } from "../../hooks/useTranslatedEntities";
import { formatDate, formatDateTime } from "../../lib/dateUtils";
import { useCausalEngineData } from "../../hooks/investigations/useCausalEngineData";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { getBackendUrl } from "../../lib/apiConfig";
import AIProblemCheckModal from "../../components/causal-engine/AIProblemCheckModal";
import {
  Plus, FileText, Clock, AlertTriangle, GitBranch, CheckSquare,
  Target, Loader2, ClipboardList, Edit, MessageSquare, Upload, File, Image, X, Download, Lock, ShieldCheck, UserCheck, CheckCircle, ExternalLink, Sparkles, Brain,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { CAUSE_CATEGORIES } from "../../components/CauseNodeItem";
import BackButton from "../../components/BackButton";
import DesktopOnlyMessage from "../../components/DesktopOnlyMessage";
import { NewInvestigationDialog, EventDialog, FailureDialog, CauseDialog, ActionDialog } from "../../components/causal-engine/InvestigationDialogs";
import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  EVENT_CATEGORIES,
} from "../../components/causal-engine/constants";
import { InvestigationTimelineTab } from "./InvestigationTimelineTab";
import { InvestigationFailuresTab } from "./InvestigationFailuresTab";
import { InvestigationCausesTab } from "./InvestigationCausesTab";
import { InvestigationActionsTab } from "./InvestigationActionsTab";
import { InvestigationOverviewTab } from "./InvestigationOverviewTab";
import { InvestigationListSidebar } from "./InvestigationListSidebar";
import { queryKeys } from "../../lib/queryKeys";

export default function CausalEnginePageMain() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const nodeNameMap = useEquipmentNodeNameMap();
  const typeNameMap = useEquipmentTypeNameMap();
  const translateAssetName = (n) => {
    if (!n) return n;
    const k = String(n).trim().toLowerCase();
    return nodeNameMap[k] || typeNameMap[k] || n;
  };
  const { user } = useAuth();
  
  const isMobile = useIsMobile();
  
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
  const [showAIProblemCheck, setShowAIProblemCheck] = useState(false); // AI Problem Check modal
  const fileInputRef = useRef(null);
  const API_BASE_URL = getBackendUrl();
  
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

  const {
    investigations,
    loadingInvestigations,
    investigationsError,
    users,
    equipmentNodes,
    failureModesList,
    centralActions,
    investigationData,
    investigation,
    loadingInvestigation,
  } = useCausalEngineData({
    selectedInvId,
    investigationAPI,
    actionsAPI,
    usersAPI,
    equipmentHierarchyAPI,
    failureModesAPI,
  });
  
  // Log error for debugging
  useEffect(() => {
    if (investigationsError) {
      console.error("Failed to load investigations:", investigationsError);
    }
  }, [investigationsError]);
  
  // Check if investigation is completed/locked
  const isInvestigationLocked = investigation?.status === "completed" || investigation?.status === "closed";
  
  const timelineEvents = useMemo(() => investigationData?.timeline_events ?? [], [investigationData]);
  const failureIdentifications = useMemo(
    () => investigationData?.failure_identifications ?? [],
    [investigationData]
  );
  const causeNodes = useMemo(() => investigationData?.cause_nodes ?? [], [investigationData]);
  const actionItems = useMemo(() => investigationData?.action_items ?? [], [investigationData]);
  const evidenceItems = useMemo(() => investigationData?.evidence ?? [], [investigationData]);

  // Sort timeline events chronologically by event_time
  const sortedTimelineEvents = useMemo(() => {
    return [...timelineEvents].sort((a, b) => {
      if (!a.event_time && !b.event_time) return 0;
      if (!a.event_time) return 1;
      if (!b.event_time) return -1;
      return new Date(a.event_time) - new Date(b.event_time);
    });
  }, [timelineEvents]);

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
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
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
  // Use a ref to track if user is actively editing to prevent overwrites
  const isUserEditingNotes = useRef(false);
  const notesInitialized = useRef(false);
  
  useEffect(() => {
    // Only sync from server when:
    // 1. Investigation data loads for the first time (or changes to different investigation)
    // 2. User is not actively editing
    if (investigationData && !isUserEditingNotes.current) {
      const serverNotes = investigationData.notes || "";
      // Only update if this is initial load or investigation changed
      if (!notesInitialized.current || localNotes === "") {
        setLocalNotes(serverNotes);
        notesInitialized.current = true;
      }
    }
  }, [investigationData?.id]); // Only trigger on investigation ID change, not every data refresh

  // Reset initialization flag when switching investigations
  useEffect(() => {
    notesInitialized.current = false;
    isUserEditingNotes.current = false;
  }, [selectedInvId]);

  const updateInvestigation = useCallback(
    (payload) => updateInvMutation.mutate(payload),
    [updateInvMutation]
  );

  // Handle notes change with user editing flag
  const handleNotesChange = useCallback((e) => {
    isUserEditingNotes.current = true;
    setLocalNotes(e.target.value);
    
    // Reset editing flag after a delay (user stopped typing)
    setTimeout(() => {
      isUserEditingNotes.current = false;
    }, 2000);
  }, []);

  // Debounced save for notes
  useEffect(() => {
    if (!selectedInvId || localNotes === (investigationData?.notes || "")) return;
    const timer = setTimeout(() => {
      updateInvestigation({ id: selectedInvId, data: { notes: localNotes } });
    }, 1500); // Increased delay to 1.5s
    return () => clearTimeout(timer);
  }, [localNotes, selectedInvId, investigationData?.notes, updateInvestigation]);

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
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      toast.success(t("causal.fileDeleted") || "File deleted");
    },
  });

  const handleUploadEvidence = useCallback(
    async (files) => {
      if (!selectedInvId) return;
      setIsUploading(true);
      try {
        for (const file of files) {
          let processedFile = file;
          if (file.type.startsWith("image/")) {
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
              console.error("Image compression failed:", err);
            }
          }
          await investigationAPI.uploadFile(selectedInvId, processedFile);
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
        toast.success(t("causal.filesUploaded") || `${files.length} file(s) uploaded successfully`);
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error(t("causal.uploadFailed") || "Failed to upload file(s)");
      } finally {
        setIsUploading(false);
      }
    },
    [selectedInvId, queryClient, t]
  );

  const handleRemoveEvidence = useCallback(
    (raw) => {
      if (!selectedInvId || !raw?.id) return;
      deleteEvidenceMutation.mutate({ invId: selectedInvId, evidenceId: raw.id });
    },
    [selectedInvId, deleteEvidenceMutation]
  );
  
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
            queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all() });
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() }); // Refresh actions list
      setSelectedInvId(null);
      setDeleteInvOptions({ deleteCentralActions: false }); // Reset options
      const actionsDeleted = result?.deleted_central_actions || 0;
      toast.success(`Investigation deleted${actionsDeleted > 0 ? ` (${actionsDeleted} actions also removed)` : ''}`);
    },
  });
  
  const createEventMutation = useMutation({
    mutationFn: (data) => investigationAPI.createEvent(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      setShowEventDialog(false);
      setEditingItem(null);
      setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" });
      toast.success("Event added");
    },
  });
  
  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, data }) => investigationAPI.updateEvent(selectedInvId, eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      setShowEventDialog(false);
      setEditingItem(null);
      setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" });
      toast.success("Event updated");
    },
  });
  
  const deleteEventMutation = useMutation({
    mutationFn: (eventId) => investigationAPI.deleteEvent(selectedInvId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) }),
  });
  
  const createFailureMutation = useMutation({
    mutationFn: (data) => investigationAPI.createFailure(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      setShowFailureDialog(false);
      setEditingItem(null);
      setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" });
      toast.success("Failure added");
    },
  });
  
  const updateFailureMutation = useMutation({
    mutationFn: ({ failureId, data }) => investigationAPI.updateFailure(selectedInvId, failureId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      setShowFailureDialog(false);
      setEditingItem(null);
      setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" });
      toast.success("Failure updated");
    },
  });
  
  const deleteFailureMutation = useMutation({
    mutationFn: (failureId) => investigationAPI.deleteFailure(selectedInvId, failureId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) }),
  });
  
  const createCauseMutation = useMutation({
    mutationFn: (data) => investigationAPI.createCause(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      setShowCauseDialog(false);
      setEditingItem(null);
      setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" });
      toast.success("Cause added");
    },
  });
  
  const updateCauseMutation = useMutation({
    mutationFn: ({ causeId, data }) => investigationAPI.updateCause(selectedInvId, causeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      setShowCauseDialog(false);
      setEditingItem(null);
      setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" });
      toast.success("Cause updated");
    },
  });
  
  const deleteCauseMutation = useMutation({
    mutationFn: (causeId) => investigationAPI.deleteCause(selectedInvId, causeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) }),
  });
  
  const createActionMutation = useMutation({
    mutationFn: (data) => investigationAPI.createAction(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
      setShowActionDialog(false);
      setEditingItem(null);
      setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" });
      toast.success("Action added");
    },
  });
  
  const updateActionMutation = useMutation({
    mutationFn: ({ actionId, data }) => investigationAPI.updateAction(selectedInvId, actionId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(selectedInvId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.centralActions(selectedInvId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.centralActions(selectedInvId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.centralActions(selectedInvId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.centralActions(selectedInvId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.centralActions(selectedInvId) });
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
    <div className="app-page-shell" data-testid="causal-engine-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="px-4 py-2 bg-white border-b border-slate-200 hidden sm:block">
          <BackButton />
        </div>
      )}
      
      <div className="flex-1 min-h-0 flex overflow-hidden">
      <InvestigationListSidebar
        investigations={filteredInvestigations}
        loading={loadingInvestigations}
        selectedId={selectedInvId}
        onSelect={setSelectedInvId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewInvestigation={() => setShowNewInvDialog(true)}
        translateAssetName={translateAssetName}
        formatDate={formatDate}
        t={t}
      />
      
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
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
          <div className="app-page-scroll mobile-scroll-pane flex-1 min-h-0 p-4">
            {activeTab === "overview" && (
              <InvestigationOverviewTab
                isEditingInvestigation={isEditingInvestigation}
                onCancelEdit={handleCancelEdit}
                onSaveInvestigation={handleSaveInvestigation}
                savePending={updateInvMutation.isPending}
                editInvForm={editInvForm}
                setEditInvForm={setEditInvForm}
                equipmentNodes={equipmentNodes}
                users={users}
                investigation={investigation}
                isInvestigationLocked={isInvestigationLocked}
                onStatusChange={handleStatusChange}
                translateAssetName={translateAssetName}
                formatDate={formatDate}
                stats={stats}
                onGenerateAISummary={handleGenerateAISummary}
                isGeneratingAISummary={isGeneratingAISummary}
                onDownloadPPTX={handleDownloadPPTX}
                onDownloadPDF={handleDownloadPDF}
                isGeneratingReport={isGeneratingReport}
                onEditInvestigation={handleEditInvestigation}
                deleteInvOptions={deleteInvOptions}
                setDeleteInvOptions={setDeleteInvOptions}
                onDeleteInvestigation={() => deleteInvMutation.mutate({ id: selectedInvId, options: deleteInvOptions })}
                onNavigateTab={setActiveTab}
                onShowAIProblemCheck={() => setShowAIProblemCheck(true)}
                localNotes={localNotes}
                onNotesChange={handleNotesChange}
                evidenceItems={evidenceItems}
                isUploading={isUploading}
                onUploadFiles={handleUploadEvidence}
                onRemoveEvidence={handleRemoveEvidence}
                apiBaseUrl={API_BASE_URL}
                investigationAPI={investigationAPI}
                t={t}
              />
            )}
            
            {activeTab === "timeline" && (
              <InvestigationTimelineTab
                events={sortedTimelineEvents}
                isLocked={isInvestigationLocked}
                eventCategories={EVENT_CATEGORIES}
                formatDateTime={formatDateTime}
                onAddEvent={() => {
                  setEditingItem(null);
                  setEventForm({
                    event_time: "",
                    description: "",
                    category: "operational_event",
                    evidence_source: "",
                    confidence: "medium",
                    notes: "",
                    comment: "",
                  });
                  setShowEventDialog(true);
                }}
                onEditEvent={(event) => {
                  setEditingItem({ type: "event", data: event });
                  setEventForm({
                    event_time: event.event_time || "",
                    description: event.description,
                    category: event.category,
                    evidence_source: event.evidence_source || "",
                    confidence: event.confidence,
                    notes: event.notes || "",
                    comment: event.comment || "",
                  });
                  setShowEventDialog(true);
                }}
                onDeleteEvent={(id) => deleteEventMutation.mutate(id)}
              />
            )}

            {activeTab === "failures" && (
              <InvestigationFailuresTab
                failures={failureIdentifications}
                isLocked={isInvestigationLocked}
                onAddFailure={() => {
                  setEditingItem(null);
                  setFailureForm({
                    asset_name: "",
                    subsystem: "",
                    component: "",
                    failure_mode: "",
                    degradation_mechanism: "",
                    evidence: "",
                    comment: "",
                  });
                  setShowFailureDialog(true);
                }}
                onEditFailure={(failure) => {
                  setEditingItem({ type: "failure", data: failure });
                  setFailureForm({
                    asset_name: failure.asset_name,
                    subsystem: failure.subsystem || "",
                    component: failure.component,
                    failure_mode: failure.failure_mode,
                    degradation_mechanism: failure.degradation_mechanism || "",
                    evidence: failure.evidence || "",
                    comment: failure.comment || "",
                  });
                  setShowFailureDialog(true);
                }}
                onDeleteFailure={(id) => deleteFailureMutation.mutate(id)}
              />
            )}

            {activeTab === "causes" && (
              <InvestigationCausesTab
                causes={causeNodes}
                isLocked={isInvestigationLocked}
                onAddCause={() => {
                  setEditingItem(null);
                  setCauseForm({
                    description: "",
                    category: "technical_cause",
                    parent_id: null,
                    is_root_cause: false,
                    evidence: "",
                    comment: "",
                  });
                  setShowCauseDialog(true);
                }}
                onEditCause={handleEditCause}
                onDeleteCause={handleDeleteCause}
                onAddChildCause={handleAddChildCause}
                onToggleRootCause={handleToggleRootCause}
              />
            )}
            
            {activeTab === "actions" && (
              <InvestigationActionsTab
                actionItems={actionItems}
                centralActions={centralActions}
                isLocked={isInvestigationLocked}
                actionPriorities={ACTION_PRIORITIES}
                actionStatuses={ACTION_STATUSES}
                formatDate={formatDate}
                isActionInPlan={isActionInPlan}
                onAddAction={() => {
                  setEditingItem(null);
                  setActionForm({
                    description: "",
                    owner: "",
                    priority: "medium",
                    due_date: "",
                    linked_cause_id: null,
                    action_type: "",
                    discipline: "",
                    comment: "",
                  });
                  setShowActionDialog(true);
                }}
                onEditAction={(action) => {
                  setEditingItem({ type: "action", data: action });
                  setActionForm({
                    description: action.description || "",
                    owner: action.owner || "",
                    priority: action.priority || "medium",
                    due_date: action.due_date || "",
                    linked_cause_id: action.linked_cause_id || null,
                    action_type: action.action_type || "",
                    discipline: action.discipline || "",
                    comment: action.comment || "",
                  });
                  setShowActionDialog(true);
                }}
                onDeleteAction={(id) => deleteActionMutation.mutate(id)}
                onUpdateActionStatus={(actionId, status) =>
                  updateActionMutation.mutate({ actionId, data: { status } })
                }
                onPromoteToPlan={(action) => promoteToCentralActionMutation.mutate(action)}
                promotePending={promoteToCentralActionMutation.isPending}
                onEditPlanAction={handleEditActionPlanItem}
                onDeletePlanAction={handleDeleteActionPlanItem}
                onValidatePlanAction={handleOpenValidateDialog}
                onUnvalidatePlanAction={(id) => unvalidateActionMutation.mutate(id)}
                deletePlanPending={deleteCentralActionMutation.isPending}
              />
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

      {/* Defensive Reasoning Check Modal */}
      <AIProblemCheckModal
        open={showAIProblemCheck}
        onOpenChange={setShowAIProblemCheck}
        investigationId={selectedInvId}
        currentDescription={localNotes || ""}
        onAccept={(newText) => {
          // Update the local notes (Problem Statement)
          isUserEditingNotes.current = true; // Prevent server sync from overwriting
          setLocalNotes(newText);
          // Auto-save to backend using the existing update mutation
          updateInvMutation.mutate({ id: selectedInvId, data: { notes: newText } });
          // Reset editing flag after save completes
          setTimeout(() => {
            isUserEditingNotes.current = false;
          }, 2000);
        }}
        investigationAPI={investigationAPI}
      />
      </div>
    </div>
  );
}
