import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../../contexts/LanguageContext";
import { pmImportAPI } from "../../lib/apis/pmImport";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Image,
  X,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Loader2,
  Sparkles,
  Zap,
  FileCheck,
  Brain,
  Library,
  ClipboardCheck,
  Download,
  Check,
  XCircle,
  Edit2,
  Info,
  AlertCircle,
  HelpCircle,
  Clock,
  Wrench,
  ExternalLink,
  Search,
  Repeat,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { PMImportHelpModal } from "./PMImportHelpModal";
import { failureModesAPI } from "../../lib/apis/failureModes";

// Task type colors
const TASK_TYPE_COLORS = {
  Inspection: "bg-blue-100 text-blue-700",
  Lubrication: "bg-amber-100 text-amber-700",
  Calibration: "bg-purple-100 text-purple-700",
  Replacement: "bg-red-100 text-red-700",
  Cleaning: "bg-cyan-100 text-cyan-700",
  Adjustment: "bg-indigo-100 text-indigo-700",
  Monitoring: "bg-green-100 text-green-700",
  Unknown: "bg-slate-100 text-slate-600",
};

// Action type colors (PM/PDM/CM)
const ACTION_TYPE_COLORS = {
  PM: "bg-blue-100 text-blue-700 border-blue-200",
  PDM: "bg-purple-100 text-purple-700 border-purple-200",
  CM: "bg-amber-100 text-amber-700 border-amber-200",
};

// Discipline colors
const DISCIPLINE_COLORS = {
  Mechanical: "bg-slate-100 text-slate-700",
  Electrical: "bg-yellow-100 text-yellow-700",
  Instrumentation: "bg-purple-100 text-purple-700",
  Process: "bg-cyan-100 text-cyan-700",
  Inspection: "bg-blue-100 text-blue-700",
  Operations: "bg-emerald-100 text-emerald-700",
  Maintenance: "bg-orange-100 text-orange-700",
  Reliability: "bg-pink-100 text-pink-700",
  "Multi-discipline": "bg-pink-100 text-pink-700",
  "Rotating Equipment": "bg-indigo-100 text-indigo-700",
  "Static Equipment": "bg-stone-100 text-stone-700",
};

// Small badge for action type
const ActionTypeBadge = ({ value }) => {
  if (!value) return null;
  const cls = ACTION_TYPE_COLORS[value] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {value}
    </span>
  );
};

// Small badge for discipline
const DisciplineBadge = ({ value }) => {
  if (!value) return null;
  const cls = DISCIPLINE_COLORS[value] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      <Wrench className="w-2.5 h-2.5" />
      {value}
    </span>
  );
};

// Small badge for estimated time
const EstimatedTimeBadge = ({ value }) => {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
      <Clock className="w-2.5 h-2.5" />
      {value}
    </span>
  );
};

// Confidence badge
const ConfidenceBadge = ({ score }) => {
  let color = "bg-red-100 text-red-700 border-red-200";
  let label = "Low";
  
  if (score >= 90) {
    color = "bg-green-100 text-green-700 border-green-200";
    label = "High";
  } else if (score >= 70) {
    color = "bg-yellow-100 text-yellow-700 border-yellow-200";
    label = "Medium";
  }
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-sm font-medium ${color}`}>
      <span className="text-lg">{score}%</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
};

// Library match badge
const LibraryMatchBadge = ({ match }) => {
  const status = match?.status || "pending";
  
  const configs = {
    existing_match: { color: "bg-green-100 text-green-700", label: "Existing Match", icon: CheckCircle },
    new_proposed: { color: "bg-blue-100 text-blue-700", label: "New Proposed", icon: Sparkles },
    multiple_possible: { color: "bg-amber-100 text-amber-700", label: "Review Required", icon: AlertCircle },
    weak_match: { color: "bg-slate-100 text-slate-600", label: "Weak Match", icon: Info },
    pending: { color: "bg-slate-100 text-slate-500", label: "Pending", icon: Loader2 },
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </div>
  );
};

// Processing step indicator
const ProcessingStep = ({ step, currentStep, label }) => {
  const isActive = step === currentStep;
  const isComplete = step < currentStep;
  
  return (
    <div className={`flex items-center gap-2 ${isActive ? "text-blue-600" : isComplete ? "text-green-600" : "text-slate-400"}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
        isComplete ? "bg-green-100" : isActive ? "bg-blue-100" : "bg-slate-100"
      }`}>
        {isComplete ? (
          <Check className="w-4 h-4" />
        ) : isActive ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <span className="text-xs">{step}</span>
        )}
      </div>
      <span className={`text-sm ${isActive ? "font-medium" : ""}`}>{label}</span>
    </div>
  );
};

// KPI Card
const KPICard = ({ label, value, icon: Icon, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-50 text-slate-600",
  };
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
};

// Picker dialog: search & select any existing failure mode, OR create a new one
const ChangeFailureModePicker = ({ isOpen, onClose, onSelect, onCreateNew, currentFmId, defaultNewFM }) => {
  const [mode, setMode] = useState("pick"); // "pick" | "create"
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newFM, setNewFM] = useState({
    failure_mode: "",
    equipment: "",
    category: "",
  });
  const [creating, setCreating] = useState(false);

  // Debounce the query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Reset when reopened
  useEffect(() => {
    if (isOpen) {
      setMode("pick");
      setQuery("");
      setDebounced("");
      setNewFM({
        failure_mode: defaultNewFM?.failure_mode || "",
        equipment: defaultNewFM?.equipment || "",
        category: defaultNewFM?.category || "",
      });
    }
  }, [isOpen, defaultNewFM]);

  // Fetch failure modes
  useEffect(() => {
    if (!isOpen || mode !== "pick") return;
    let cancelled = false;
    setLoading(true);
    failureModesAPI
      .getAll(debounced ? { search: debounced } : {})
      .then((data) => {
        if (cancelled) return;
        setResults((data?.failure_modes || []).slice(0, 50));
      })
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [isOpen, debounced, mode]);

  const handleCreate = async () => {
    if (!newFM.failure_mode.trim() || !onCreateNew) return;
    setCreating(true);
    try {
      await onCreateNew(newFM);
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-blue-600" />
            Assign Failure Mode
          </DialogTitle>
          <DialogDescription>
            Pick an existing failure mode from the library, or create a brand-new one for this PM task.
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setMode("pick")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === "pick"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            data-testid="picker-tab-pick"
          >
            <Search className="w-4 h-4 inline mr-1" />
            Pick Existing
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === "create"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            data-testid="picker-tab-create"
          >
            <Sparkles className="w-4 h-4 inline mr-1" />
            Create New
          </button>
        </div>

        {mode === "pick" && (
          <>
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                autoFocus
                placeholder="Search by name, equipment, keyword…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                data-testid="change-fm-search-input"
              />
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto -mx-2 px-2">
              {loading && (
                <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <p>No failure modes found{query ? ` for "${query}"` : ""}.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMode("create");
                      if (query) setNewFM(prev => ({ ...prev, failure_mode: query }));
                    }}
                    className="mt-3 border-purple-300 text-purple-700 hover:bg-purple-50"
                    data-testid="picker-empty-create-btn"
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Create "{query || "new failure mode"}" instead
                  </Button>
                </div>
              )}
              {!loading && results.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {results.map((fm) => {
                    const isCurrent = fm.id === currentFmId;
                    return (
                      <li key={fm.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(fm)}
                          disabled={isCurrent}
                          className={`w-full text-left p-3 rounded transition-colors ${
                            isCurrent
                              ? "bg-blue-50 cursor-default"
                              : "hover:bg-slate-50"
                          }`}
                          data-testid={`pick-fm-${fm.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {fm.failure_mode}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {fm.equipment} • {fm.category}
                                {fm.failure_mode_type === "customer_specific" && (
                                  <span className="ml-2 inline-flex items-center gap-1 text-purple-600">
                                    <Sparkles className="w-3 h-3" /> Customer Specific
                                  </span>
                                )}
                              </p>
                            </div>
                            {isCurrent ? (
                              <Badge className="bg-blue-100 text-blue-700 text-[10px] flex-shrink-0">
                                Current
                              </Badge>
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {mode === "create" && (
          <div className="flex-1 overflow-y-auto space-y-3">
            <div className="p-3 bg-purple-50 border border-purple-100 rounded text-xs text-purple-700">
              <Sparkles className="w-3 h-3 inline mr-1" />
              A new failure mode will be created and linked to this PM task. It will be marked as <strong>Customer Specific</strong>.
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Failure Mode Name *</label>
              <input
                autoFocus
                type="text"
                value={newFM.failure_mode}
                onChange={(e) => setNewFM({ ...newFM, failure_mode: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                placeholder="e.g., Bearing Lubrication Starvation"
                data-testid="picker-new-fm-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Equipment / Component</label>
              <input
                type="text"
                value={newFM.equipment}
                onChange={(e) => setNewFM({ ...newFM, equipment: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                placeholder="e.g., Feed Roller Bearing"
                data-testid="picker-new-fm-equipment"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Category</label>
              <select
                value={newFM.category}
                onChange={(e) => setNewFM({ ...newFM, category: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                data-testid="picker-new-fm-category"
              >
                <option value="">Select category…</option>
                <option value="Rotating">Rotating</option>
                <option value="Static">Static</option>
                <option value="Instrumentation">Instrumentation</option>
                <option value="Electrical">Electrical</option>
                <option value="Process">Process</option>
                <option value="Piping">Piping</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {mode === "create" && (
            <Button
              disabled={!newFM.failure_mode.trim() || creating}
              onClick={handleCreate}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="picker-create-confirm-btn"
            >
              {creating ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1" /> Create & Link</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};


// Task row component with scenario handling
const TaskRow = ({ task, onAccept, onReject, onSelectMatch, onApproveNewFM, onSelect, isSelected, sessionId }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(task.selected_match_id || "");
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [overrideFm, setOverrideFm] = useState(null); // {id, name} when user manually changes
  const [newFMData, setNewFMData] = useState({
    failure_mode: task.suggested_failure_modes?.[0] || "",
    equipment: task.component || "",
    category: "",
  });
  
  const statusColors = {
    pending: "border-l-slate-300",
    accepted: "border-l-green-500",
    rejected: "border-l-red-400",
    edited: "border-l-blue-500",
  };
  
  const matchStatus = task.library_match?.status || "pending";
  
  // Determine scenario
  const isScenarioA = matchStatus === "existing_match"; // Auto-link
  const isScenarioB = matchStatus === "multiple_possible" || matchStatus === "weak_match"; // User selects
  const isScenarioC = matchStatus === "new_proposed"; // User approves new
  
  // Compute the currently-assigned failure mode id and name (if any)
  const assignedFmId = task.selected_match_id || (isScenarioA ? task.library_match?.matched_id : null);
  const assignedFmName = overrideFm?.name
    || (task.selected_match_id && task.library_match?.all_matches?.find(m => m.id === task.selected_match_id)?.name)
    || (task.selected_match_id && task.library_match?.matches?.find(m => m.id === task.selected_match_id)?.name)
    || (isScenarioA ? task.library_match?.matched_name : null);
  
  const handleSelectMatch = async () => {
    if (selectedMatchId && onSelectMatch) {
      await onSelectMatch(task.task_id, selectedMatchId);
    }
  };
  
  const handlePickerSelect = async (fm) => {
    setShowPicker(false);
    setOverrideFm({ id: fm.id, name: fm.failure_mode });
    setSelectedMatchId(fm.id);
    if (onSelectMatch) {
      await onSelectMatch(task.task_id, fm.id, fm.failure_mode);
    }
  };
  
  const handlePickerCreateNew = async (fmData) => {
    if (!onApproveNewFM) return;
    await onApproveNewFM(task.task_id, fmData);
    setShowPicker(false);
    setOverrideFm(null); // creation flow uses approved_new_fm path
  };
  
  const handleApproveNew = async () => {
    if (newFMData.failure_mode && onApproveNewFM) {
      await onApproveNewFM(task.task_id, newFMData);
      setShowApproveForm(false);
    }
  };
  
  return (
    <div 
      className={`bg-white rounded-lg border transition-all ${
        isSelected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
      } ${statusColors[task.review_status] || statusColors.pending} border-l-4`}
    >
      <div 
        className="p-4 cursor-pointer"
        onClick={() => onSelect(task)}
      >
        <div className="flex items-start gap-4">
          {/* Task info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-900 line-clamp-2 mb-2">{task.original_task}</p>
            <div className="flex flex-wrap gap-2 items-center">
              {task.component && (
                <Badge variant="outline" className="text-xs">
                  {task.component}
                </Badge>
              )}
              {Array.isArray(task.equipment_matches) && task.equipment_matches.length > 0 && (
                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                  Affects: {task.equipment_matches.slice(0, 2).map((m) => m.tag || m.name).filter(Boolean).join(", ")}
                  {task.equipment_matches.length > 2 ? ` +${task.equipment_matches.length - 2}` : ""}
                </Badge>
              )}
              {Array.isArray(task.equipment_unmatched_tags) && task.equipment_unmatched_tags.length > 0 && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  Unmatched: {task.equipment_unmatched_tags.slice(0, 2).join(", ")}
                  {task.equipment_unmatched_tags.length > 2 ? ` +${task.equipment_unmatched_tags.length - 2}` : ""}
                </Badge>
              )}
              {task.import_impact?.action === "link_existing" && task.import_impact?.target_failure_mode?.failure_mode && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Will update: {task.import_impact.target_failure_mode.failure_mode}
                </Badge>
              )}
              {task.import_impact?.action === "create_new" && task.import_impact?.target_failure_mode?.failure_mode && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  Will create: {task.import_impact.target_failure_mode.failure_mode}
                </Badge>
              )}
              {task.import_impact?.action === "skip" && task.import_impact?.reason && (
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
                  No change: {task.import_impact.reason}
                </Badge>
              )}
              <Badge className={`text-xs ${TASK_TYPE_COLORS[task.task_type] || TASK_TYPE_COLORS.Unknown}`}>
                {task.task_type}
              </Badge>
              <ActionTypeBadge value={task.action_type} />
              <DisciplineBadge value={task.discipline} />
              {task.frequency && (
                <Badge variant="outline" className="text-xs bg-slate-50">
                  {task.frequency}
                </Badge>
              )}
              <EstimatedTimeBadge value={task.estimated_time} />
            </div>
          </div>
          
          {/* Metrics */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <ConfidenceBadge score={task.confidence_score} />
            <LibraryMatchBadge match={task.library_match} />
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {task.review_status === "pending" && isScenarioA && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-green-600 hover:bg-green-50"
                  onClick={(e) => { e.stopPropagation(); onAccept(task.task_id); }}
                  title="Accept - Link to existing failure mode"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:bg-red-50"
                  onClick={(e) => { e.stopPropagation(); onReject(task.task_id); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
            {task.review_status === "pending" && (isScenarioB || isScenarioC) && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Action Required
              </Badge>
            )}
            {task.review_status === "accepted" && (
              <Badge className="bg-green-100 text-green-700">
                <Check className="w-3 h-3 mr-1" />
                {task.selected_match_id ? "Match Selected" : task.approved_new_fm ? "New Approved" : "Accepted"}
              </Badge>
            )}
            {task.review_status === "rejected" && (
              <Badge className="bg-red-100 text-red-700">
                <X className="w-3 h-3 mr-1" />
                Rejected
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="p-4 bg-slate-50 space-y-3">
              {/* Suggested Failure Modes */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Suggested Failure Modes</p>
                <div className="flex flex-wrap gap-1">
                  {(task.suggested_failure_modes || []).map((fm, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-white">
                      {typeof fm === "string" ? fm : fm.name}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* AI Reasoning */}
              {task.ai_reasoning && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-start gap-2">
                    <Brain className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-blue-700 mb-1">AI Reasoning</p>
                      <p className="text-sm text-blue-800">{task.ai_reasoning}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* SCENARIO A: Existing Match (with override support) */}
              {isScenarioA && task.library_match?.matched_name && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <p className="text-sm font-medium text-green-800 truncate">
                        Will link to: {overrideFm?.name || task.library_match.matched_name}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                      className="text-xs h-7 flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                      data-testid={`change-fm-btn-${task.task_id}`}
                    >
                      <Repeat className="w-3 h-3 mr-1" />
                      Change
                    </Button>
                  </div>
                  <p className="text-xs text-green-600 ml-6">
                    {overrideFm
                      ? "Manually overridden • Click Accept to confirm"
                      : `Match Score: ${task.library_match.match_score}% • Click Accept to confirm`}
                  </p>
                </div>
              )}
              
              {/* SCENARIO B: Multiple Matches - User Selects */}
              {isScenarioB && task.review_status === "pending" && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-amber-800">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      Multiple possible matches - please select one:
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                      className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-100"
                      data-testid={`pick-other-fm-btn-${task.task_id}`}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      Pick Other…
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(task.library_match?.matches || task.library_match?.all_matches || []).map((match) => (
                      <label key={match.id} className="flex items-center gap-2 cursor-pointer p-2 bg-white rounded border hover:border-amber-300">
                        <input
                          type="radio"
                          name={`match-${task.task_id}`}
                          value={match.id}
                          checked={selectedMatchId === match.id}
                          onChange={() => setSelectedMatchId(match.id)}
                          className="text-amber-600"
                        />
                        <span className="text-sm flex-1">{match.name}</span>
                        <Badge variant="outline" className="text-xs">{match.score || match.match_score}%</Badge>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      disabled={!selectedMatchId}
                      onClick={(e) => { e.stopPropagation(); handleSelectMatch(); }}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      Confirm Selection
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); onReject(task.task_id); }}
                    >
                      Skip Task
                    </Button>
                  </div>
                </div>
              )}
              
              {/* SCENARIO C: New Proposed - User Approves */}
              {isScenarioC && task.review_status === "pending" && (
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <p className="text-sm font-medium text-purple-800 mb-2">
                    <Sparkles className="w-4 h-4 inline mr-1" />
                    No existing match found. Review and approve new failure mode:
                  </p>
                  
                  {!showApproveForm ? (
                    <div className="space-y-2">
                      <div className="bg-white rounded p-2 border">
                        <p className="text-xs text-slate-500">Proposed Failure Mode:</p>
                        <p className="font-medium">{task.suggested_failure_modes?.[0] || "N/A"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setShowApproveForm(true); }}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          Review & Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                          className="border-purple-300 text-purple-700 hover:bg-purple-100"
                          data-testid={`link-existing-fm-btn-${task.task_id}`}
                        >
                          <Search className="w-3 h-3 mr-1" />
                          Link to Existing Instead
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); onReject(task.task_id); }}
                        >
                          Skip Task
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-white rounded p-3 border">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Failure Mode Name *</label>
                        <input
                          type="text"
                          value={newFMData.failure_mode}
                          onChange={(e) => setNewFMData({...newFMData, failure_mode: e.target.value})}
                          className="w-full mt-1 px-2 py-1 border rounded text-sm"
                          placeholder="e.g., Bearing Lubrication Starvation"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Equipment / Component</label>
                        <input
                          type="text"
                          value={newFMData.equipment}
                          onChange={(e) => setNewFMData({...newFMData, equipment: e.target.value})}
                          className="w-full mt-1 px-2 py-1 border rounded text-sm"
                          placeholder="e.g., Feed Roller Bearing"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Category</label>
                        <select
                          value={newFMData.category}
                          onChange={(e) => setNewFMData({...newFMData, category: e.target.value})}
                          className="w-full mt-1 px-2 py-1 border rounded text-sm"
                        >
                          <option value="">Select category...</option>
                          <option value="Rotating">Rotating</option>
                          <option value="Static">Static</option>
                          <option value="Instrumentation">Instrumentation</option>
                          <option value="Electrical">Electrical</option>
                          <option value="Process">Process</option>
                          <option value="Piping">Piping</option>
                        </select>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          disabled={!newFMData.failure_mode}
                          onClick={(e) => { e.stopPropagation(); handleApproveNew(); }}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          Create & Link
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setShowApproveForm(false); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Show confirmed match/approval for accepted tasks */}
              {task.review_status === "accepted" && task.selected_match_id && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-green-800 min-w-0 truncate">
                      <CheckCircle className="w-4 h-4 inline mr-1" />
                      Will link to: {assignedFmName || "selected failure mode"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                      className="text-xs h-7 flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                      data-testid={`change-accepted-fm-btn-${task.task_id}`}
                    >
                      <Repeat className="w-3 h-3 mr-1" />
                      Change
                    </Button>
                  </div>
                </div>
              )}
              
              {task.review_status === "accepted" && task.approved_new_fm && (
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-purple-800 min-w-0 truncate">
                      <Sparkles className="w-4 h-4 inline mr-1" />
                      Will create: <strong>{task.approved_new_fm.failure_mode}</strong>
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                      className="text-xs h-7 flex-shrink-0 border-purple-300 text-purple-700 hover:bg-purple-100"
                      data-testid={`change-approved-fm-btn-${task.task_id}`}
                    >
                      <Repeat className="w-3 h-3 mr-1" />
                      Link Existing Instead
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Failure Mode picker (search any existing FM and assign, or create new) */}
      <ChangeFailureModePicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handlePickerSelect}
        onCreateNew={handlePickerCreateNew}
        currentFmId={assignedFmId}
        defaultNewFM={{
          failure_mode: task.suggested_failure_modes?.[0] || "",
          equipment: task.component || "",
          category: "",
        }}
      />
    </div>
  );
};

// Main PM Import Wizard Component
export const PMImportWizard = ({ isOpen, onClose, onImportComplete }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1: Upload, 2: Processing, 3: Review, 4: Import Summary
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [processingStep, setProcessingStep] = useState(1);
  const [selectedTask, setSelectedTask] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);
  
  // Supported file types
  const supportedTypes = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  
  const supportedExtensions = [".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".webp"];
  
  // Reset state on close
  const handleClose = () => {
    setStep(1);
    setSelectedFile(null);
    setSessionId(null);
    setSession(null);
    setProcessingStep(1);
    setSelectedTask(null);
    setImportResult(null);
    setShowHelp(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    onClose();
  };
  
  // File drop handling
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (file) validateAndSetFile(file);
  };
  
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };
  
  const validateAndSetFile = (file) => {
    const extension = "." + file.name.split(".").pop().toLowerCase();
    if (!supportedExtensions.includes(extension)) {
      toast.error(t("library.pmImportUnsupportedFileType"));
      return;
    }
    
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("library.pmImportFileTooLarge20mb"));
      return;
    }
    
    setSelectedFile(file);
  };
  
  // Upload and start processing
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setStep(2);
    setProcessingStep(1);
    
    try {
      const result = await pmImportAPI.upload(selectedFile);
      setSessionId(result.session_id);
      
      // Poll for results
      pollSession(result.session_id);
      
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.detail || t("library.pmImportUploadFailed"));
      setStep(1);
    }
  };
  
  // Poll session status
  const pollSession = async (sid) => {
    const poll = async () => {
      try {
        const sess = await pmImportAPI.getSession(sid);
        setSession(sess);
        
        // Update processing step based on progress
        if (sess.progress < 30) setProcessingStep(1);
        else if (sess.progress < 50) setProcessingStep(2);
        else if (sess.progress < 80) setProcessingStep(3);
        else if (sess.progress < 95) setProcessingStep(4);
        else setProcessingStep(5);
        
        // Check if done
        if (sess.status === "ready_for_review") {
          clearInterval(pollingRef.current);
          const taskCount = sess.stats?.total_tasks || sess.tasks_extracted?.length || 0;
          toast.success(`${taskCount} tasks imported. Review them in the PM Import tab.`);
          if (onClose) {
            onClose();
          } else {
            setStep(1);
          }
          if (queryClient) {
            queryClient.invalidateQueries({ queryKey: ["pm-import-tasks"] });
          }
        } else if (sess.status === "error") {
          clearInterval(pollingRef.current);
          toast.error(sess.error_message || "Processing failed");
          setStep(1);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    
    // Initial call
    await poll();
    
    // Set up polling
    pollingRef.current = setInterval(poll, 2000);
  };
  
  // Task actions
  const handleAcceptTask = async (taskId) => {
    try {
      const result = await pmImportAPI.acceptTask(sessionId, taskId);
      setSession(prev => ({
        ...prev,
        tasks_extracted: prev.tasks_extracted.map(t => 
          t.task_id === taskId ? { ...t, review_status: "accepted" } : t
        ),
        stats: result.stats,
      }));
    } catch (error) {
      toast.error(t("library.pmImportAcceptTaskFailed"));
    }
  };
  
  const handleRejectTask = async (taskId) => {
    try {
      const result = await pmImportAPI.rejectTask(sessionId, taskId);
      setSession(prev => ({
        ...prev,
        tasks_extracted: prev.tasks_extracted.map(t => 
          t.task_id === taskId ? { ...t, review_status: "rejected" } : t
        ),
        stats: result.stats,
      }));
    } catch (error) {
      toast.error(t("library.pmImportRejectTaskFailed"));
    }
  };
  
  const handleAcceptAllHighConfidence = async () => {
    try {
      const result = await pmImportAPI.acceptAllHighConfidence(sessionId);
      toast.success(`${t("library.pmImportAccepted")} ${result.accepted_count} ${t("library.pmImportHighConfidenceTasks")}`);
      
      // Refresh session
      const sess = await pmImportAPI.getSession(sessionId);
      setSession(sess);
    } catch (error) {
      toast.error(t("library.pmImportAcceptTasksFailed"));
    }
  };
  
  // Scenario B / manual override: User picks a specific failure mode
  const handleSelectMatch = async (taskId, matchId, matchName) => {
    try {
      const result = await pmImportAPI.selectMatch(sessionId, taskId, matchId);
      setSession(prev => ({
        ...prev,
        tasks_extracted: prev.tasks_extracted.map(t => {
          if (t.task_id !== taskId) return t;
          // Inject the selected match into all_matches so name shows in UI
          const all = t.library_match?.all_matches || t.library_match?.matches || [];
          const existsInList = all.some(m => m.id === matchId);
          const updatedMatches = existsInList || !matchName
            ? all
            : [...all, { id: matchId, name: matchName, score: 100, match_type: "manual" }];
          return {
            ...t,
            review_status: "accepted",
            selected_match_id: matchId,
            approved_new_fm: null, // clear any prior approval since user re-assigned
            library_match: {
              ...(t.library_match || {}),
              all_matches: updatedMatches,
            },
          };
        }),
        stats: result.stats,
      }));
      toast.success(matchName ? `${t("library.pmImportLinkedTo")} \"${matchName}\"` : t("library.pmImportMatchSelected"));
    } catch (error) {
      toast.error(t("library.pmImportSelectMatchFailed"));
    }
  };
  
  // Scenario C / manual override: User approves new failure mode
  const handleApproveNewFM = async (taskId, fmData) => {
    try {
      const result = await pmImportAPI.approveNewFailureMode(sessionId, taskId, fmData);
      setSession(prev => ({
        ...prev,
        tasks_extracted: prev.tasks_extracted.map(t => 
          t.task_id === taskId
            ? { ...t, review_status: "accepted", approved_new_fm: fmData, selected_match_id: null }
            : t
        ),
        stats: result.stats,
      }));
      toast.success(`${t("library.pmImportNewFailureModeApproved")}: \"${fmData.failure_mode}\"`);
    } catch (error) {
      toast.error(t("library.pmImportApproveNewFailureModeFailed"));
    }
  };
  
  // Final import
  const handleImport = async () => {
    setImporting(true);
    
    try {
      const result = await pmImportAPI.importToLibrary(sessionId, true);
      setImportResult(result);
      setStep(4);
      toast.success(t("library.pmImportImportComplete"));
      
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error(error.response?.data?.detail || t("library.pmImportImportFailed"));
    } finally {
      setImporting(false);
    }
  };
  
  // Navigate to a failure mode detail in the Library page
  const handleViewFailureMode = (fmId) => {
    if (!fmId) return;
    handleClose();
    navigate(`/library?fm_id=${fmId}`);
  };
  
  // Export review
  const handleExport = async () => {
    try {
      const blob = await pmImportAPI.exportReview(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pm_import_review_${sessionId.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success(t("library.pmImportReviewExported"));
    } catch (error) {
      toast.error(t("library.pmImportExportFailed"));
    }
  };
  
  // Get file icon
  const getFileIcon = (file) => {
    if (!file) return FileText;
    const ext = file.name.split(".").pop().toLowerCase();
    if (["xlsx", "xls"].includes(ext)) return FileSpreadsheet;
    if (ext === "pdf") return FileText;
    return Image;
  };
  
  const FileIcon = getFileIcon(selectedFile);
  
  // Calculate accepted count
  const acceptedCount = session?.tasks_extracted?.filter(t => 
    t.review_status === "accepted" || t.review_status === "edited"
  ).length || 0;
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Import Maintenance Plan
            </DialogTitle>
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors mr-8"
            >
              <HelpCircle className="w-4 h-4" />
              <span>How does this work?</span>
            </button>
          </div>
          <DialogDescription>
            Upload an existing maintenance plan and AssetIQ will extract, translate, and match maintenance tasks to your equipment hierarchy.
          </DialogDescription>
        </DialogHeader>
        
        {/* Help Modal */}
        <PMImportHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
        
        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="p-6 space-y-6">
              {/* Drop zone */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-12 transition-all ${
                  dragActive 
                    ? "border-blue-500 bg-blue-50" 
                    : selectedFile 
                      ? "border-green-300 bg-green-50" 
                      : "border-slate-300 hover:border-slate-400"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={supportedExtensions.join(",")}
                  onChange={handleFileSelect}
                />
                
                <div className="text-center">
                  {selectedFile ? (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-xl flex items-center justify-center">
                        <FileIcon className="w-8 h-8 text-green-600" />
                      </div>
                      <p className="text-lg font-medium text-slate-900 mb-1">{selectedFile.name}</p>
                      <p className="text-sm text-slate-500 mb-4">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                      >
                        Choose Different File
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Upload className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-lg font-medium text-slate-700 mb-1">
                        Drag and drop your maintenance plan
                      </p>
                      <p className="text-sm text-slate-500 mb-4">
                        or click to browse
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse Files
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Supported formats */}
              <div className="flex items-center justify-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel (.xlsx, .xls)
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  PDF
                </div>
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Images (.png, .jpg)
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  disabled={!selectedFile}
                  onClick={handleUpload}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Step 2: Processing */}
          {step === 2 && (
            <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
              {/* Animated loader */}
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Brain className="w-10 h-10 text-blue-600" />
                </div>
              </div>
              
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Analyzing Maintenance Plan
              </h3>
              <p className="text-slate-500 mb-8">
                {session?.progress_message || "Processing your file..."}
              </p>
              
              {/* Progress bar */}
              <div className="w-full max-w-md mb-8">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>Progress</span>
                  <span>{session?.progress || 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${session?.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              
              {/* Processing steps */}
              <div className="space-y-3">
                <ProcessingStep step={1} currentStep={processingStep} label="Reading maintenance plan" />
                <ProcessingStep step={2} currentStep={processingStep} label="Extracting maintenance tasks" />
                <ProcessingStep step={3} currentStep={processingStep} label="AI enrichment (translate, classify, estimate)" />
                <ProcessingStep step={4} currentStep={processingStep} label="Matching equipment to hierarchy" />
                <ProcessingStep step={5} currentStep={processingStep} label="Finalizing for review" />
              </div>
            </div>
          )}
          
          {/* Step 3: Review */}
          {step === 3 && session && (
            <div className="flex flex-col h-full max-h-[70vh]">
              {/* KPI Cards */}
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="grid grid-cols-6 gap-3">
                  <KPICard 
                    label="Tasks Extracted" 
                    value={session.stats?.total_tasks || 0} 
                    icon={ClipboardCheck} 
                    color="blue" 
                  />
                  <KPICard 
                    label="Failure Modes" 
                    value={session.stats?.failure_modes_identified || 0} 
                    icon={Zap} 
                    color="purple" 
                  />
                  <KPICard 
                    label="Existing Matches" 
                    value={session.stats?.existing_matches || 0} 
                    icon={Library} 
                    color="green" 
                  />
                  <KPICard 
                    label="New Proposed" 
                    value={session.stats?.new_proposed || 0} 
                    icon={Sparkles} 
                    color="blue" 
                  />
                  <KPICard 
                    label="Low Confidence" 
                    value={session.stats?.low_confidence_items || 0} 
                    icon={AlertTriangle} 
                    color="amber" 
                  />
                  <KPICard 
                    label="Manual Review" 
                    value={session.stats?.manual_review_required || 0} 
                    icon={Edit2} 
                    color="red" 
                  />
                </div>
              </div>
              
              {/* Bulk actions */}
              <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAcceptAllHighConfidence}
                    className="text-green-600 border-green-200 hover:bg-green-50"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Accept All High Confidence
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export Review
                  </Button>
                </div>
                <div className="text-sm text-slate-500">
                  <span className="font-medium text-green-600">{acceptedCount}</span> of {session.tasks_extracted?.length || 0} tasks accepted
                </div>
              </div>
              
              {/* Task list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {session.tasks_extracted?.map((task) => (
                  <TaskRow
                    key={task.task_id}
                    task={task}
                    sessionId={sessionId}
                    onAccept={handleAcceptTask}
                    onReject={handleRejectTask}
                    onSelectMatch={handleSelectMatch}
                    onApproveNewFM={handleApproveNewFM}
                    onSelect={setSelectedTask}
                    isSelected={selectedTask?.task_id === task.task_id}
                  />
                ))}
              </div>
              
              {/* Footer actions */}
              <div className="p-4 border-t border-slate-200 bg-white flex justify-between">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    disabled={acceptedCount === 0 || importing}
                    onClick={handleImport}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        Import to Library
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Step 4: Import Summary */}
          {step === 4 && importResult && (
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                
                <h3 className="text-xl font-semibold text-slate-900 mb-1">
                  Import Complete!
                </h3>
                <p className="text-slate-500 text-sm">
                  Your maintenance plan has been converted to failure mode intelligence.
                </p>
              </div>
              
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{importResult.total_imported}</p>
                  <p className="text-xs text-slate-500">Total Imported</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{importResult.linked_to_existing}</p>
                  <p className="text-xs text-slate-500">Linked to Existing</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-600">{importResult.new_created}</p>
                  <p className="text-xs text-slate-500">New Created</p>
                </div>
                <div className="p-3 bg-slate-100 rounded-lg text-center">
                  <p className="text-2xl font-bold text-slate-400">{importResult.skipped}</p>
                  <p className="text-xs text-slate-500">Skipped</p>
                </div>
              </div>
              
              {importResult.low_confidence_imported > 0 && (
                <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  {importResult.low_confidence_imported} low confidence items were imported with warnings
                </div>
              )}
              
              {/* Linked to Existing Failure Modes */}
              {importResult.linked_details && importResult.linked_details.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Library className="w-4 h-4 text-green-600" />
                    Tasks Linked to Existing Failure Modes ({importResult.linked_details.length})
                  </h4>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {importResult.linked_details.map((item, idx) => (
                      <div key={idx} className="bg-green-50 border border-green-100 rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 mb-1">{item.task}</p>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {item.task_type && (
                                <Badge className="text-xs bg-slate-100 text-slate-600">{item.task_type}</Badge>
                              )}
                              <ActionTypeBadge value={item.action_type} />
                              <DisciplineBadge value={item.discipline} />
                              {item.component && (
                                <Badge variant="outline" className="text-xs">{item.component}</Badge>
                              )}
                              {item.frequency && (
                                <Badge variant="outline" className="text-xs bg-white">{item.frequency}</Badge>
                              )}
                              <EstimatedTimeBadge value={item.estimated_time} />
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-green-500 flex-shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-1 flex-wrap">
                              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                              <button
                                type="button"
                                onClick={() => handleViewFailureMode(item.failure_mode_id)}
                                className="text-sm font-medium text-green-800 hover:text-green-600 underline-offset-2 hover:underline inline-flex items-center gap-1"
                                data-testid={`view-failure-mode-${item.failure_mode_id}`}
                                title="Open this failure mode in the Library"
                              >
                                {item.failure_mode_name}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-500">{item.equipment} • {item.category}</p>
                            {item.marked_customer_specific && (
                              <p className="text-xs text-purple-600 mt-1">
                                <Sparkles className="w-3 h-3 inline mr-0.5" />
                                Marked as Customer Specific
                              </p>
                            )}
                            {item.action_added && (
                              <p className="text-xs text-green-600 mt-1">
                                + Added action: "{item.action_added}..."
                              </p>
                            )}
                            {item.already_existed && (
                              <p className="text-xs text-slate-400 mt-1">
                                (Action already existed)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* New Failure Modes Created */}
              {importResult.created_details && importResult.created_details.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    New Failure Modes Created ({importResult.created_details.length} tasks → {importResult.new_created} failure modes)
                  </h4>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {importResult.created_details.map((item, idx) => (
                      <div key={idx} className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                        <div className="mb-2">
                          <p className="text-sm text-slate-700 mb-1">{item.task}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.task_type && (
                              <Badge className="text-xs bg-slate-100 text-slate-600">{item.task_type}</Badge>
                            )}
                            <ActionTypeBadge value={item.action_type} />
                            <DisciplineBadge value={item.discipline} />
                            {item.component && (
                              <Badge variant="outline" className="text-xs">{item.component}</Badge>
                            )}
                            {item.frequency && (
                              <Badge variant="outline" className="text-xs bg-white">{item.frequency}</Badge>
                            )}
                            <EstimatedTimeBadge value={item.estimated_time} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          <span className="text-xs font-medium text-purple-700">Created:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.failure_modes_created.map((fm, fmIdx) => (
                            fm.failure_mode_id ? (
                              <button
                                key={fmIdx}
                                type="button"
                                onClick={() => handleViewFailureMode(fm.failure_mode_id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                                data-testid={`view-failure-mode-${fm.failure_mode_id}`}
                                title="Open this failure mode in the Library"
                              >
                                {fm.failure_mode_name}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            ) : (
                              <Badge key={fmIdx} className="text-xs bg-purple-100 text-purple-700">
                                {fm.failure_mode_name}
                              </Badge>
                            )
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Skipped Tasks */}
              {importResult.skipped_details && importResult.skipped_details.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-slate-400" />
                    Skipped Tasks ({importResult.skipped_details.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {importResult.skipped_details.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 rounded p-2 text-sm text-slate-500">
                        <span className="line-through">{item.task}</span>
                        <span className="text-xs ml-2">({item.reason})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-center pt-4 border-t">
                <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700">
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PMImportWizard;
