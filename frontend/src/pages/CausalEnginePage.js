import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { investigationAPI, actionsAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Search, Plus, FileText, Clock, AlertTriangle, GitBranch, CheckSquare,
  ChevronRight, Trash2, Calendar, User, MapPin,
  Target, Loader2, ClipboardList, Edit, MessageSquare, Upload, File, Image, X, Download,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { CauseTree, CAUSE_CATEGORIES } from "../components/CauseNodeItem";
import BackButton from "../components/BackButton";
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
  
  const [selectedInvId, setSelectedInvId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showNewInvDialog, setShowNewInvDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showFailureDialog, setShowFailureDialog] = useState(false);
  const [showCauseDialog, setShowCauseDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [newInvForm, setNewInvForm] = useState({ title: "", description: "", asset_name: "", location: "", incident_date: "", investigation_leader: "" });
  const [eventForm, setEventForm] = useState({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" });
  const [failureForm, setFailureForm] = useState({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" });
  const [causeForm, setCauseForm] = useState({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" });
  const [actionForm, setActionForm] = useState({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" });
  const [localNotes, setLocalNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

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

  const { data: investigationsData, isLoading: loadingInvestigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: () => investigationAPI.getAll(),
  });
  
  const investigations = investigationsData?.investigations || [];
  
  const { data: investigationData, isLoading: loadingInvestigation } = useQuery({
    queryKey: ["investigation", selectedInvId],
    queryFn: () => investigationAPI.getById(selectedInvId),
    enabled: !!selectedInvId,
  });
  
  const investigation = investigationData?.investigation;
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
    },
  });

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
        await investigationAPI.uploadFile(selectedInvId, file);
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
    mutationFn: async (id) => {
      // Get the investigation to delete before actually deleting
      const invToDelete = investigations.find(inv => inv.id === id);
      const result = await investigationAPI.delete(id);
      return { result, deletedInv: invToDelete };
    },
    onSuccess: ({ deletedInv }) => {
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
      setSelectedInvId(null);
      toast.success("Deleted");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      setShowActionDialog(false);
      setEditingItem(null);
      setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" });
      toast.success("Action updated");
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
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      toast.success(t("causal.actionPromoted") || "Action promoted! View it in the Actions tab.");
    },
    onError: (error) => {
      console.error("Failed to promote action:", error);
      toast.error(t("causal.actionPromoteFailed") || "Failed to promote action");
    },
  });

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
                          <span className="truncate max-w-[120px]">{inv.asset_name}</span>
                        </div>
                      )}
                      {inv.incident_date && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(inv.incident_date).toLocaleDateString()}</span>
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
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-slate-500">{investigation.case_number}</span>
                      <Select value={investigation.status} onValueChange={(v) => updateInvMutation.mutate({ id: selectedInvId, data: { status: v } })}>
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{INVESTIGATION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 mb-1">{investigation.title}</h1>
                    <p className="text-sm text-slate-600">{investigation.description}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete Investigation</AlertDialogTitle><AlertDialogDescription>This will delete all data.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteInvMutation.mutate(selectedInvId)} className="bg-red-600">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                  {investigation.asset_name && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Target className="w-3 h-3" />Asset</div><p className="font-medium text-sm">{investigation.asset_name}</p></div>}
                  {investigation.location && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><MapPin className="w-3 h-3" />Location</div><p className="font-medium text-sm">{investigation.location}</p></div>}
                  {investigation.incident_date && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Calendar className="w-3 h-3" />Date</div><p className="font-medium text-sm">{new Date(investigation.incident_date).toLocaleDateString()}</p></div>}
                  {investigation.investigation_leader && <div className="bg-white rounded-lg border p-3"><div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><User className="w-3 h-3" />Lead</div><p className="font-medium text-sm">{investigation.investigation_leader}</p></div>}
                </div>
                
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
                  <Button onClick={() => { setEditingItem(null); setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" }); setShowEventDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-event-btn"><Plus className="w-4 h-4 mr-2" />Add Event</Button>
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
                      // Format the timestamp to be more readable
                      const formatTime = (timeStr) => {
                        if (!timeStr) return `#${idx + 1}`;
                        try {
                          const date = new Date(timeStr);
                          return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + 
                            ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
                              <span className="text-xs font-medium text-slate-500">{formatTime(event.event_time)}</span>
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
                  <Button onClick={() => { setEditingItem(null); setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "", comment: "" }); setShowFailureDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-failure-btn"><Plus className="w-4 h-4 mr-2" />Add Failure</Button>
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
                  <Button onClick={() => { setEditingItem(null); setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" }); setShowCauseDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-cause-btn"><Plus className="w-4 h-4 mr-2" />Add Cause</Button>
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
                  <CauseTree causes={causeNodes} onEdit={handleEditCause} onDelete={handleDeleteCause} onAddChild={handleAddChildCause} onToggleRoot={handleToggleRootCause} />
                )}
              </div>
            )}
            
            {activeTab === "actions" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Corrective Actions</h2><p className="text-sm text-slate-500">Track actions to prevent recurrence</p></div>
                  <Button onClick={() => { setEditingItem(null); setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null, action_type: "", discipline: "", comment: "" }); setShowActionDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-action-btn"><Plus className="w-4 h-4 mr-2" />Add Action</Button>
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
                      return (
                        <motion.div 
                          key={action.id} 
                          initial={{ opacity: 0, y: 10 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          transition={{ delay: idx * 0.03 }} 
                          className={`bg-white rounded-xl border p-4 group hover:shadow-md transition-all ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}
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
                                    <span className={isOverdue ? 'font-medium' : ''}>{new Date(action.due_date).toLocaleDateString()}</span>
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
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" 
                                onClick={() => promoteToCentralActionMutation.mutate(action)} 
                                disabled={promoteToCentralActionMutation.isPending} 
                                title="Add to action tracker" 
                                data-testid={`promote-action-${action.id}`}
                              >
                                <ClipboardList className="w-4 h-4 mr-1" />Act
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-500 hover:text-slate-700" 
                                onClick={() => { 
                                  setEditingItem({ type: "action", data: action }); 
                                  setActionForm({ description: action.description, owner: action.owner || "", priority: action.priority, due_date: action.due_date || "", linked_cause_id: action.linked_cause_id || null, action_type: action.action_type || "", discipline: action.discipline || "", comment: action.comment || "" }); 
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
              </div>
            )}
          </div>
        </div>
      ) : <div className="flex-1 flex items-center justify-center"><p>Not found</p></div>}
      
      {/* Dialogs */}
      <NewInvestigationDialog
        open={showNewInvDialog}
        onOpenChange={setShowNewInvDialog}
        form={newInvForm}
        setForm={setNewInvForm}
        onSubmit={() => createInvMutation.mutate(newInvForm)}
        isPending={createInvMutation.isPending}
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
      />
      </div>
    </div>
  );
}
