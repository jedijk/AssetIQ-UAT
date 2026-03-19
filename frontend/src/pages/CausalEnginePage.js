import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { investigationAPI, actionsAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Search, Plus, FileText, Clock, AlertTriangle, GitBranch, CheckSquare,
  ChevronRight, Trash2, Calendar, User, MapPin,
  Target, Loader2, ClipboardList,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { CauseTree, CAUSE_CATEGORIES } from "../components/CauseNodeItem";

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
  const { pushUndo } = useUndo();
  
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
  const [eventForm, setEventForm] = useState({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "" });
  const [failureForm, setFailureForm] = useState({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "" });
  const [causeForm, setCauseForm] = useState({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "" });
  const [actionForm, setActionForm] = useState({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null });

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
  const failureIdentifications = investigationData?.failure_identifications || [];
  const causeNodes = investigationData?.cause_nodes || [];
  const actionItems = investigationData?.action_items || [];

  const filteredInvestigations = useMemo(() => {
    if (!searchQuery) return investigations;
    const q = searchQuery.toLowerCase();
    return investigations.filter(inv => inv.title.toLowerCase().includes(q) || inv.case_number.toLowerCase().includes(q) || inv.asset_name?.toLowerCase().includes(q));
  }, [investigations, searchQuery]);

  const stats = useMemo(() => ({
    totalEvents: timelineEvents.length,
    totalFailures: failureIdentifications.length,
    totalCauses: causeNodes.length,
    rootCauses: causeNodes.filter(c => c.is_root_cause).length,
    totalActions: actionItems.length,
    openActions: actionItems.filter(a => a.status === "open" || a.status === "in_progress").length,
  }), [timelineEvents, failureIdentifications, causeNodes, actionItems]);

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
      setSelectedInvId(null);
      toast.success("Deleted");
    },
  });
  
  const createEventMutation = useMutation({
    mutationFn: (data) => investigationAPI.createEvent(selectedInvId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowEventDialog(false);
      setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "" });
      toast.success("Event added");
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
      setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "" });
      toast.success("Failure added");
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
      setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "" });
      toast.success("Cause added");
    },
  });
  
  const updateCauseMutation = useMutation({
    mutationFn: ({ causeId, data }) => investigationAPI.updateCause(selectedInvId, causeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] });
      setShowCauseDialog(false);
      setEditingItem(null);
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
      setShowActionDialog(false);
      setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null });
      toast.success("Action added");
    },
  });
  
  const updateActionMutation = useMutation({
    mutationFn: ({ actionId, data }) => investigationAPI.updateAction(selectedInvId, actionId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] }),
  });
  
  const deleteActionMutation = useMutation({
    mutationFn: (actionId) => investigationAPI.deleteAction(selectedInvId, actionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investigation", selectedInvId] }),
  });

  // Promote investigation action to centralized action
  const promoteToCentralActionMutation = useMutation({
    mutationFn: (action) => actionsAPI.create({
      title: action.description.substring(0, 100),
      description: action.description,
      source_type: "investigation",
      source_id: selectedInvId,
      source_name: selectedInv?.title || "Unknown Investigation",
      priority: action.priority || "medium",
      assignee: action.owner || "",
      due_date: action.due_date || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action promoted! View it in the Actions tab.");
    },
    onError: () => {
      toast.error("Failed to promote action");
    },
  });

  const handleEditCause = useCallback((node) => {
    setEditingItem({ type: "cause", data: node });
    setCauseForm({ description: node.description, category: node.category, parent_id: node.parent_id, is_root_cause: node.is_root_cause, evidence: node.evidence || "" });
    setShowCauseDialog(true);
  }, []);

  const handleDeleteCause = useCallback((causeId) => deleteCauseMutation.mutate(causeId), [deleteCauseMutation]);
  const handleAddChildCause = useCallback((parentId) => { setCauseForm({ description: "", category: "technical_cause", parent_id: parentId, is_root_cause: false, evidence: "" }); setShowCauseDialog(true); }, []);
  const handleToggleRootCause = useCallback((node) => updateCauseMutation.mutate({ causeId: node.id, data: { is_root_cause: !node.is_root_cause } }), [updateCauseMutation]);

  const tabs = [
    { id: "overview", label: "Overview", icon: FileText },
    { id: "timeline", label: "Timeline", icon: Clock, count: stats.totalEvents },
    { id: "failures", label: "Failures", icon: AlertTriangle, count: stats.totalFailures },
    { id: "causes", label: "Causal Tree", icon: GitBranch, count: stats.rootCauses },
    { id: "actions", label: "Actions", icon: CheckSquare, count: stats.openActions },
  ];

  return (
    <div className="h-[calc(100vh-64px)] flex" data-testid="causal-engine-page">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 h-full flex flex-col bg-white border-r border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Investigations</h2>
            <Button size="sm" onClick={() => setShowNewInvDialog(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="new-investigation-btn"><Plus className="w-4 h-4 mr-1" />New</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" data-testid="search-investigations" />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loadingInvestigations ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filteredInvestigations.length === 0 ? (
            <div className="text-center py-8 px-4"><FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">No investigations</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredInvestigations.map((inv) => (
                <button key={inv.id} onClick={() => setSelectedInvId(inv.id)} className={`w-full text-left p-4 hover:bg-slate-50 ${selectedInvId === inv.id ? "bg-blue-50 border-l-2 border-l-blue-600" : ""}`} data-testid={`investigation-item-${inv.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-500">{inv.case_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{inv.status}</span>
                  </div>
                  <h3 className="font-medium text-slate-900 text-sm line-clamp-2 mb-1">{inv.title}</h3>
                  {inv.asset_name && <div className="flex items-center gap-1 text-xs text-slate-500"><Target className="w-3 h-3" />{inv.asset_name}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Main content */}
      {!selectedInvId ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Select an Investigation</h2>
            <p className="text-slate-500 mb-4">Choose from the list or create a new one</p>
            <Button onClick={() => setShowNewInvDialog(true)}><Plus className="w-4 h-4 mr-2" />New Investigation</Button>
          </div>
        </div>
      ) : loadingInvestigation ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : investigation ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-slate-200">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === tab.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`} data-testid={`tab-${tab.id}`}>
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                  {tab.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.id ? "bg-blue-200" : "bg-slate-200"}`}>{tab.count}</span>}
                </button>
              );
            })}
          </div>
          
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-slate-500">{investigation.case_number}</span>
                      <Select value={investigation.status} onValueChange={(v) => updateInvMutation.mutate({ id: selectedInvId, data: { status: v } })}>
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{INVESTIGATION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">{investigation.title}</h1>
                    <p className="text-slate-600">{investigation.description}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete Investigation</AlertDialogTitle><AlertDialogDescription>This will delete all data.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteInvMutation.mutate(selectedInvId)} className="bg-red-600">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {investigation.asset_name && <div className="bg-slate-50 rounded-lg p-4"><div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Target className="w-4 h-4" />Asset</div><p className="font-medium">{investigation.asset_name}</p></div>}
                  {investigation.location && <div className="bg-slate-50 rounded-lg p-4"><div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><MapPin className="w-4 h-4" />Location</div><p className="font-medium">{investigation.location}</p></div>}
                  {investigation.incident_date && <div className="bg-slate-50 rounded-lg p-4"><div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Calendar className="w-4 h-4" />Date</div><p className="font-medium">{new Date(investigation.incident_date).toLocaleDateString()}</p></div>}
                  {investigation.investigation_leader && <div className="bg-slate-50 rounded-lg p-4"><div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><User className="w-4 h-4" />Lead</div><p className="font-medium">{investigation.investigation_leader}</p></div>}
                </div>
                
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                  <div className="bg-white border rounded-lg p-4 text-center"><div className="text-2xl font-bold">{stats.totalEvents}</div><div className="text-xs text-slate-500">Events</div></div>
                  <div className="bg-white border rounded-lg p-4 text-center"><div className="text-2xl font-bold">{stats.totalFailures}</div><div className="text-xs text-slate-500">Failures</div></div>
                  <div className="bg-white border rounded-lg p-4 text-center"><div className="text-2xl font-bold">{stats.totalCauses}</div><div className="text-xs text-slate-500">Causes</div></div>
                  <div className="bg-white border rounded-lg p-4 text-center"><div className="text-2xl font-bold text-red-600">{stats.rootCauses}</div><div className="text-xs text-slate-500">Root Causes</div></div>
                  <div className="bg-white border rounded-lg p-4 text-center"><div className="text-2xl font-bold">{stats.totalActions}</div><div className="text-xs text-slate-500">Actions</div></div>
                  <div className="bg-white border rounded-lg p-4 text-center"><div className="text-2xl font-bold text-orange-600">{stats.openActions}</div><div className="text-xs text-slate-500">Open</div></div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button onClick={() => setActiveTab("timeline")} className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100"><Clock className="w-6 h-6 text-blue-600" /><div className="text-left"><div className="font-medium">Timeline</div><div className="text-xs text-slate-500">Build sequence</div></div></button>
                  <button onClick={() => setActiveTab("failures")} className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100"><AlertTriangle className="w-6 h-6 text-orange-600" /><div className="text-left"><div className="font-medium">Failures</div><div className="text-xs text-slate-500">Identify what failed</div></div></button>
                  <button onClick={() => setActiveTab("causes")} className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100"><GitBranch className="w-6 h-6 text-purple-600" /><div className="text-left"><div className="font-medium">Causes</div><div className="text-xs text-slate-500">Build causal tree</div></div></button>
                  <button onClick={() => setActiveTab("actions")} className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100"><CheckSquare className="w-6 h-6 text-green-600" /><div className="text-left"><div className="font-medium">Actions</div><div className="text-xs text-slate-500">Track corrections</div></div></button>
                </div>
              </div>
            )}
            
            {activeTab === "timeline" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div><h2 className="text-lg font-semibold">Sequence of Events</h2><p className="text-sm text-slate-500">Reconstruct the timeline</p></div>
                  <Button onClick={() => { setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "" }); setShowEventDialog(true); }} data-testid="add-event-btn"><Plus className="w-4 h-4 mr-2" />Add Event</Button>
                </div>
                
                {timelineEvents.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border"><Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="font-medium mb-1">No events recorded</h3><p className="text-sm text-slate-500">Start by adding the first event</p></div>
                ) : (
                  <div className="relative pl-8 space-y-4">
                    <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200" />
                    {timelineEvents.map((event, idx) => {
                      const category = EVENT_CATEGORIES.find(c => c.value === event.category);
                      return (
                        <motion.div key={event.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} className="relative bg-white border rounded-lg p-4" data-testid={`timeline-event-${event.id}`}>
                          <div className={`absolute -left-5 top-4 w-4 h-4 rounded-full ${category?.dotClass || "bg-slate-500"} border-2 border-white shadow`} />
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono text-slate-500">{event.event_time}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${category?.bgClass || "bg-slate-100 text-slate-700"}`}>{category?.label || event.category}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${event.confidence === "high" ? "bg-green-100 text-green-700" : event.confidence === "low" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{event.confidence}</span>
                              </div>
                              <p className="text-slate-900">{event.description}</p>
                              {event.evidence_source && <p className="text-sm text-slate-500 mt-2">Source: {event.evidence_source}</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteEventMutation.mutate(event.id)}><Trash2 className="w-4 h-4" /></Button>
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
                <div className="flex items-center justify-between mb-6">
                  <div><h2 className="text-lg font-semibold">Failure Identification</h2><p className="text-sm text-slate-500">Define what technically failed</p></div>
                  <Button onClick={() => { setFailureForm({ asset_name: "", subsystem: "", component: "", failure_mode: "", degradation_mechanism: "", evidence: "" }); setShowFailureDialog(true); }} data-testid="add-failure-btn"><Plus className="w-4 h-4 mr-2" />Add Failure</Button>
                </div>
                
                {failureIdentifications.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border"><AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="font-medium mb-1">No failures identified</h3><p className="text-sm text-slate-500">Document what failed</p></div>
                ) : (
                  <div className="grid gap-4">
                    {failureIdentifications.map((failure, idx) => (
                      <motion.div key={failure.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white border rounded-lg p-4" data-testid={`failure-item-${failure.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold">{failure.asset_name}</span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                              {failure.subsystem && <span className="text-slate-600">{failure.subsystem}</span>}
                              {failure.subsystem && <ChevronRight className="w-4 h-4 text-slate-400" />}
                              <span className="text-slate-600">{failure.component}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <div><span className="text-slate-500">Failure Mode:</span><span className="ml-2 font-medium text-red-600">{failure.failure_mode}</span></div>
                              {failure.degradation_mechanism && <div><span className="text-slate-500">Mechanism:</span><span className="ml-2">{failure.degradation_mechanism}</span></div>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteFailureMutation.mutate(failure.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "causes" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div><h2 className="text-lg font-semibold">Causal Tree</h2><p className="text-sm text-slate-500">Build cause-and-effect relationships</p></div>
                  <Button onClick={() => { setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "" }); setShowCauseDialog(true); }} data-testid="add-cause-btn"><Plus className="w-4 h-4 mr-2" />Add Cause</Button>
                </div>
                
                {causeNodes.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border"><GitBranch className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="font-medium mb-1">No causes identified</h3><p className="text-sm text-slate-500">Start building the causal tree</p></div>
                ) : (
                  <CauseTree causes={causeNodes} onEdit={handleEditCause} onDelete={handleDeleteCause} onAddChild={handleAddChildCause} onToggleRoot={handleToggleRootCause} />
                )}
              </div>
            )}
            
            {activeTab === "actions" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div><h2 className="text-lg font-semibold">Corrective Actions</h2><p className="text-sm text-slate-500">Track actions to prevent recurrence</p></div>
                  <Button onClick={() => { setActionForm({ description: "", owner: "", priority: "medium", due_date: "", linked_cause_id: null }); setShowActionDialog(true); }} data-testid="add-action-btn"><Plus className="w-4 h-4 mr-2" />Add Action</Button>
                </div>
                
                {actionItems.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border"><CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="font-medium mb-1">No actions defined</h3><p className="text-sm text-slate-500">Add corrective actions</p></div>
                ) : (
                  <div className="space-y-4">
                    {actionItems.map((action, idx) => {
                      const priority = ACTION_PRIORITIES.find(p => p.value === action.priority);
                      return (
                        <motion.div key={action.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white border rounded-lg p-4" data-testid={`action-item-${action.id}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono text-slate-500">{action.action_number}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${priority?.bgClass || "bg-slate-100 text-slate-700"}`}>{priority?.label || action.priority}</span>
                                <Select value={action.status} onValueChange={(v) => updateActionMutation.mutate({ actionId: action.id, data: { status: v } })}>
                                  <SelectTrigger className="h-6 w-28 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{ACTION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <p>{action.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                                {action.owner && <div className="flex items-center gap-1"><User className="w-3 h-3" />{action.owner}</div>}
                                {action.due_date && <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(action.due_date).toLocaleDateString()}</div>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" 
                                onClick={() => promoteToCentralActionMutation.mutate(action)}
                                disabled={promoteToCentralActionMutation.isPending}
                                title="Promote to central action tracker"
                                data-testid={`promote-action-${action.id}`}
                              >
                                <ClipboardList className="w-4 h-4 mr-1" />Promote
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteActionMutation.mutate(action.id)}><Trash2 className="w-4 h-4" /></Button>
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
      <Dialog open={showNewInvDialog} onOpenChange={setShowNewInvDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Investigation</DialogTitle><DialogDescription>Create a new causal investigation</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium">Title *</label><Input value={newInvForm.title} onChange={(e) => setNewInvForm({ ...newInvForm, title: e.target.value })} placeholder="Investigation title" data-testid="new-inv-title" /></div>
            <div><label className="text-sm font-medium">Description *</label><Textarea value={newInvForm.description} onChange={(e) => setNewInvForm({ ...newInvForm, description: e.target.value })} placeholder="Describe..." rows={3} data-testid="new-inv-description" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Asset</label><Input value={newInvForm.asset_name} onChange={(e) => setNewInvForm({ ...newInvForm, asset_name: e.target.value })} placeholder="Equipment" /></div>
              <div><label className="text-sm font-medium">Location</label><Input value={newInvForm.location} onChange={(e) => setNewInvForm({ ...newInvForm, location: e.target.value })} placeholder="Area" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Incident Date</label><Input type="date" value={newInvForm.incident_date} onChange={(e) => setNewInvForm({ ...newInvForm, incident_date: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Lead</label><Input value={newInvForm.investigation_leader} onChange={(e) => setNewInvForm({ ...newInvForm, investigation_leader: e.target.value })} placeholder="Name" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewInvDialog(false)}>Cancel</Button>
            <Button onClick={() => createInvMutation.mutate(newInvForm)} disabled={!newInvForm.title || !newInvForm.description || createInvMutation.isPending} data-testid="create-inv-btn">{createInvMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium">Time *</label><Input value={eventForm.event_time} onChange={(e) => setEventForm({ ...eventForm, event_time: e.target.value })} placeholder="2024-03-15 14:30" /></div>
            <div><label className="text-sm font-medium">Description *</label><Textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="What happened?" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Category</label><Select value={eventForm.category} onValueChange={(v) => setEventForm({ ...eventForm, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium">Confidence</label><Select value={eventForm.confidence} onValueChange={(v) => setEventForm({ ...eventForm, confidence: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="uncertain">Uncertain</SelectItem></SelectContent></Select></div>
            </div>
            <div><label className="text-sm font-medium">Evidence Source</label><Input value={eventForm.evidence_source} onChange={(e) => setEventForm({ ...eventForm, evidence_source: e.target.value })} placeholder="Log file, witness..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEventDialog(false)}>Cancel</Button><Button onClick={() => createEventMutation.mutate(eventForm)} disabled={!eventForm.event_time || !eventForm.description}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showFailureDialog} onOpenChange={setShowFailureDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Failure</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium">Asset *</label><Input value={failureForm.asset_name} onChange={(e) => setFailureForm({ ...failureForm, asset_name: e.target.value })} placeholder="Equipment" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Subsystem</label><Input value={failureForm.subsystem} onChange={(e) => setFailureForm({ ...failureForm, subsystem: e.target.value })} placeholder="e.g., Sealing" /></div>
              <div><label className="text-sm font-medium">Component *</label><Input value={failureForm.component} onChange={(e) => setFailureForm({ ...failureForm, component: e.target.value })} placeholder="e.g., Seal" /></div>
            </div>
            <div><label className="text-sm font-medium">Failure Mode *</label><Input value={failureForm.failure_mode} onChange={(e) => setFailureForm({ ...failureForm, failure_mode: e.target.value })} placeholder="e.g., Leakage" /></div>
            <div><label className="text-sm font-medium">Mechanism</label><Input value={failureForm.degradation_mechanism} onChange={(e) => setFailureForm({ ...failureForm, degradation_mechanism: e.target.value })} placeholder="e.g., Fatigue" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowFailureDialog(false)}>Cancel</Button><Button onClick={() => createFailureMutation.mutate(failureForm)} disabled={!failureForm.asset_name || !failureForm.component || !failureForm.failure_mode}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showCauseDialog} onOpenChange={(open) => { setShowCauseDialog(open); if (!open) setEditingItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem?.type === "cause" ? "Edit Cause" : "Add Cause"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium">Description *</label><Textarea value={causeForm.description} onChange={(e) => setCauseForm({ ...causeForm, description: e.target.value })} placeholder="Describe..." rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Category</label><Select value={causeForm.category} onValueChange={(v) => setCauseForm({ ...causeForm, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CAUSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium">Parent</label><Select value={causeForm.parent_id || "none"} onValueChange={(v) => setCauseForm({ ...causeForm, parent_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None (root)</SelectItem>{causeNodes.filter(c => c.id !== editingItem?.data?.id).map(c => <SelectItem key={c.id} value={c.id}>{c.description.substring(0, 30)}...</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex items-center gap-2"><input type="checkbox" id="root" checked={causeForm.is_root_cause} onChange={(e) => setCauseForm({ ...causeForm, is_root_cause: e.target.checked })} className="rounded" /><label htmlFor="root" className="text-sm font-medium">Mark as Root Cause</label></div>
            <div><label className="text-sm font-medium">Evidence</label><Textarea value={causeForm.evidence} onChange={(e) => setCauseForm({ ...causeForm, evidence: e.target.value })} placeholder="Supporting evidence..." rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setShowCauseDialog(false); setEditingItem(null); }}>Cancel</Button><Button onClick={() => { if (editingItem?.type === "cause") updateCauseMutation.mutate({ causeId: editingItem.data.id, data: causeForm }); else createCauseMutation.mutate(causeForm); }} disabled={!causeForm.description}>{editingItem?.type === "cause" ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Action</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium">Description *</label><Textarea value={actionForm.description} onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })} placeholder="What to do?" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Owner</label><Input value={actionForm.owner} onChange={(e) => setActionForm({ ...actionForm, owner: e.target.value })} placeholder="Person" /></div>
              <div><label className="text-sm font-medium">Priority</label><Select value={actionForm.priority} onValueChange={(v) => setActionForm({ ...actionForm, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTION_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Due Date</label><Input type="date" value={actionForm.due_date} onChange={(e) => setActionForm({ ...actionForm, due_date: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Linked Root Cause</label><Select value={actionForm.linked_cause_id || "none"} onValueChange={(v) => setActionForm({ ...actionForm, linked_cause_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{causeNodes.filter(c => c.is_root_cause).map(c => <SelectItem key={c.id} value={c.id}>{c.description.substring(0, 30)}...</SelectItem>)}</SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowActionDialog(false)}>Cancel</Button><Button onClick={() => createActionMutation.mutate(actionForm)} disabled={!actionForm.description}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
