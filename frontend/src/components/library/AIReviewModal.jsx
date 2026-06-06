import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { pmImportAPI } from "../../lib/apis/pmImport";
import { toast } from "sonner";
import {
  X,
  Brain,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Merge,
  Plus,
  FileText,
  Tag,
  Wrench,
  Clock,
  Target,
  Sparkles,
  Check,
  ArrowRight,
  RefreshCw,
  Layers,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

// Action type icons and colors
const ACTION_CONFIG = {
  merge: {
    icon: Merge,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    label: "Merge with Existing",
    description: "Add task to existing failure mode's recommended actions",
  },
  new_failure_mode: {
    icon: Plus,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    label: "Create New Failure Mode",
    description: "Create a new failure mode in the library",
  },
  new_task: {
    icon: FileText,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    label: "Add as New Task",
    description: "Add as a new task under existing failure mode",
  },
  keep_custom: {
    icon: Tag,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    label: "Keep as Custom",
    description: "Keep as custom task (not in library)",
  },
};

// Suggestion card component
const SuggestionCard = ({ suggestion, onApply, onReject, isApplying }) => {
  const [expanded, setExpanded] = useState(false);
  const recommendation = suggestion.recommendation || {};
  const action = recommendation.action || "keep_custom";
  const aiReplaceIdx = typeof recommendation.replace_action_index === "number"
    ? recommendation.replace_action_index
    : null;
  const [selectedTaskToReplace, setSelectedTaskToReplace] = useState(aiReplaceIdx);
  const [mergeMode, setMergeMode] = useState(
    aiReplaceIdx !== null || recommendation.already_exists ? "replace" : "add"
  );
  
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.keep_custom;
  const ActionIcon = config.icon;
  
  const isApplied = suggestion.status === "applied";
  const equipmentMatch = suggestion.equipment_match;
  const similarFMs = suggestion.similar_failure_modes || [];
  
  // Get target failure mode's existing actions
  const targetFm = similarFMs.find(fm => fm.id === recommendation.target_failure_mode_id);
  const existingActions = targetFm?.recommended_actions || [];
  
  // Handle apply with replace/add mode
  const handleApplyClick = (e) => {
    e.stopPropagation();
    const replaceIndex = mergeMode === "replace" ? selectedTaskToReplace : null;
    onApply(suggestion.task_id, {
      ...recommendation,
      replace_action_index: replaceIndex ?? recommendation.replace_action_index ?? null,
    });
  };
  
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      isApplied ? "bg-green-50 border-green-200" : "bg-white border-slate-200"
    }`}>
      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          {/* Expand icon */}
          <button className="mt-1 text-slate-400">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {/* Task info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {suggestion.equipment_tag || "No Tag"}
              </Badge>
              <Badge className={`text-xs ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                <ActionIcon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
              {isApplied && (
                <Badge className="bg-green-100 text-green-700 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Applied
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-700 line-clamp-2">
              {suggestion.task_description}
            </p>
            
            {/* Show target failure mode name for merge/new_task actions */}
            {(action === "merge" || action === "new_task") && recommendation.target_failure_mode && (
              <div className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                <span>→ {recommendation.target_failure_mode.failure_mode}</span>
              </div>
            )}
            
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                {suggestion.discipline}
              </span>
              {(suggestion.task_type || suggestion.action_preview?.action_type) && (
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {suggestion.task_type || suggestion.action_preview?.action_type}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {suggestion.frequency}
              </span>
              {(suggestion.action_preview?.estimated_minutes != null
                || suggestion.action_preview?.estimated_time
                || suggestion.estimated_hours) && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {suggestion.action_preview?.estimated_minutes != null
                    ? `${suggestion.action_preview.estimated_minutes} min`
                    : suggestion.action_preview?.estimated_time
                      || `${suggestion.estimated_hours}h`}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                {recommendation.confidence || 0}% confidence
              </span>
            </div>
          </div>
          
          {/* Action buttons */}
          {!isApplied && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(suggestion.task_id);
                }}
                disabled={isApplying}
              >
                <XCircle className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleApplyClick}
                disabled={isApplying || (
                  mergeMode === "replace"
                  && selectedTaskToReplace === null
                  && recommendation.replace_action_index == null
                  && (action === "merge" || action === "new_task")
                  && existingActions.length > 0
                )}
              >
                {isApplying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Apply
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100"
          >
            <div className="p-4 bg-slate-50 space-y-4">
              {/* Equipment Match */}
              <div>
                <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Equipment Match
                </h4>
                {equipmentMatch?.matched ? (
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">{equipmentMatch.equipment_name}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Type: {equipmentMatch.equipment_type_name || "Not assigned"} | 
                      Level: {equipmentMatch.level || "Unknown"}
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-amber-700">No equipment match found</span>
                    </div>
                    {recommendation.suggested_equipment_type && (
                      <div className="text-xs text-amber-600 mt-1">
                        Suggested type: {recommendation.suggested_equipment_type}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* AI Reasoning */}
              <div>
                <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                  <Brain className="w-3 h-3" />
                  AI Reasoning
                </h4>
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <p className="text-sm text-slate-600">
                    {recommendation.reasoning || "No reasoning provided"}
                  </p>
                </div>
              </div>
              
              {/* Target Failure Mode (if merge/new_task) */}
              {(action === "merge" || action === "new_task") && recommendation.target_failure_mode && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {action === "merge" ? "Merge Into This Failure Mode" : "Add Task To This Failure Mode"}
                  </h4>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <div className="font-medium text-sm text-blue-700">
                      {recommendation.target_failure_mode.failure_mode}
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                      Equipment: {recommendation.target_failure_mode.equipment} | 
                      Category: {recommendation.target_failure_mode.category}
                    </div>
                    
                    {/* Show existing actions in the target failure mode */}
                    {(() => {
                      // Prefer the actions list captured at AI-review time (with the
                      // exact index the AI referenced). Falls back to live FM data.
                      const aiActions = recommendation.target_actions_list;
                      const fullFm = similarFMs.find(fm => fm.id === recommendation.target_failure_mode_id);
                      const actions = (aiActions && aiActions.length > 0)
                        ? aiActions
                        : (fullFm?.recommended_actions || []);
                      const replaceIdx = typeof recommendation.replace_action_index === "number"
                        ? recommendation.replace_action_index
                        : null;
                      if (actions.length > 0) {
                        return (
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <div className="text-xs font-medium text-blue-700 mb-2">
                              Existing Tasks/Actions ({actions.length})
                              {replaceIdx !== null && (
                                <span className="ml-2 text-amber-700">
                                  — AI will replace #{replaceIdx + 1}
                                </span>
                              )}
                            </div>
                            <ul className="space-y-1 text-xs text-blue-600 max-h-40 overflow-y-auto">
                              {actions.map((action, idx) => {
                                const isReplaceTarget = idx === replaceIdx;
                                const text = typeof action === 'string'
                                  ? action
                                  : action?.description || action?.action || JSON.stringify(action);
                                return (
                                  <li
                                    key={idx}
                                    className={`flex items-start gap-1 px-2 py-1 rounded ${
                                      isReplaceTarget
                                        ? "bg-amber-50 border border-amber-300 text-amber-800 line-through"
                                        : ""
                                    }`}
                                  >
                                    <span className={isReplaceTarget ? "text-amber-500 mt-0.5 no-underline" : "text-blue-400 mt-0.5"}>
                                      {isReplaceTarget ? "✕" : "•"}
                                    </span>
                                    <span className="line-clamp-2">{text}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* Show what will be added/replaced */}
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <div className="text-xs font-medium text-green-700 mb-1">
                        {recommendation.already_exists
                          ? "↻ Will reuse existing task (no duplicate):"
                          : typeof recommendation.replace_action_index === "number"
                            ? "↻ Will replace with this task:"
                            : "✓ Will add this task:"}
                      </div>
                      <div className="text-xs text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        {suggestion.task_description}
                        {suggestion.frequency && <span className="text-green-500"> (Frequency: {suggestion.frequency})</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Suggested New Failure Mode (if new_failure_mode) */}
              {action === "new_failure_mode" && recommendation.suggested_failure_mode_name && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    Suggested New Failure Mode
                  </h4>
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="font-medium text-sm text-green-700">
                      {recommendation.suggested_failure_mode_name}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Similar Failure Modes */}
              {similarFMs.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    Similar Failure Modes in Library ({similarFMs.length})
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {similarFMs.slice(0, 3).map((fm, idx) => (
                      <div 
                        key={fm.id || idx}
                        className="bg-white rounded p-2 border border-slate-200 text-xs"
                      >
                        <div className="font-medium text-slate-700">{fm.failure_mode}</div>
                        <div className="text-slate-500">
                          {fm.equipment} | Score: {fm.similarity_score || 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Main Modal Component
export const AIReviewModal = ({ isOpen, onClose, sessionId, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [applyingTaskId, setApplyingTaskId] = useState(null);
  const [stats, setStats] = useState({ total: 0, applied: 0, pending: 0 });
  
  // Load existing review results or start new review
  useEffect(() => {
    if (isOpen && sessionId) {
      loadReviewResults();
    }
  }, [isOpen, sessionId]);
  
  const loadReviewResults = async () => {
    setLoading(true);
    try {
      const result = await pmImportAPI.getAIReviewResults(sessionId);
      if (result.suggestions && result.suggestions.length > 0) {
        setSuggestions(result.suggestions);
        updateStats(result.suggestions);
      }
    } catch (error) {
      console.error("Failed to load review results:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const startReview = async () => {
    setReviewing(true);
    try {
      const result = await pmImportAPI.runAIReview(sessionId);
      setSuggestions(result.suggestions || []);
      updateStats(result.suggestions || []);
      toast.success(`AI review completed for ${result.total_reviewed} tasks`);
    } catch (error) {
      console.error("AI review failed:", error);
      const detail = error?.response?.data?.detail;
      toast.error(
        typeof detail === "string" && detail
          ? detail
          : "AI review failed. Please try again."
      );
    } finally {
      setReviewing(false);
    }
  };
  
  const updateStats = (suggs) => {
    const total = suggs.length;
    const applied = suggs.filter(s => s.status === "applied").length;
    const pending = total - applied;
    setStats({ total, applied, pending });
  };
  
  const handleApply = async (taskId, recommendation) => {
    setApplyingTaskId(taskId);
    try {
      const result = await pmImportAPI.applySuggestion(sessionId, taskId, {
        action: recommendation.action,
        target_failure_mode_id: recommendation.target_failure_mode_id,
        replace_action_index: typeof recommendation.replace_action_index === "number"
          ? recommendation.replace_action_index
          : null,
        new_failure_mode_data: recommendation.action === "new_failure_mode" ? {
          failure_mode: recommendation.suggested_failure_mode_name
        } : null
      });
      
      if (result.success) {
        const modeSuffix = result.mode === "replaced"
          ? " (replaced existing task)"
          : result.mode === "existing"
            ? " (reused existing task)"
            : result.mode === "added"
              ? " (added as new task)"
              : "";
        setSuggestions(prev => prev.map(s => 
          s.task_id === taskId ? { ...s, status: "applied", apply_mode: result.mode } : s
        ));
        updateStats(suggestions.map(s => 
          s.task_id === taskId ? { ...s, status: "applied" } : s
        ));
        toast.success((result.message || "Suggestion applied") + modeSuffix);
      } else {
        toast.error(result.message || "Failed to apply suggestion");
      }
    } catch (error) {
      console.error("Apply suggestion failed:", error);
      toast.error("Failed to apply suggestion");
    } finally {
      setApplyingTaskId(null);
    }
  };
  
  const handleReject = async (taskId) => {
    setApplyingTaskId(taskId);
    try {
      const result = await pmImportAPI.applySuggestion(sessionId, taskId, {
        action: "keep_custom"
      });
      
      if (result.success) {
        setSuggestions(prev => prev.map(s => 
          s.task_id === taskId ? { ...s, status: "applied", recommendation: { ...s.recommendation, action: "keep_custom" } } : s
        ));
        updateStats(suggestions.map(s => 
          s.task_id === taskId ? { ...s, status: "applied" } : s
        ));
        toast.success("Task kept as custom");
      }
    } catch (error) {
      console.error("Reject suggestion failed:", error);
      toast.error("Failed to reject suggestion");
    } finally {
      setApplyingTaskId(null);
    }
  };
  
  const handleApplyAll = async () => {
    setReviewing(true);
    try {
      const result = await pmImportAPI.applyAllSuggestions(sessionId);
      const breakdown = (result.replaced || result.added)
        ? ` (${result.replaced || 0} replaced, ${result.added || 0} added)`
        : "";
      toast.success(`Applied ${result.applied} suggestions${breakdown}, ${result.skipped} skipped`);
      await loadReviewResults();
    } catch (error) {
      console.error("Apply all failed:", error);
      toast.error("Failed to apply all suggestions");
    } finally {
      setReviewing(false);
    }
  };
  
  const handleClose = () => {
    if (onComplete && stats.applied > 0) {
      onComplete();
    }
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Brain className="w-5 h-5 text-purple-600" />
            </div>
            AI Review - Match to Failure Mode Library
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Stats bar */}
          <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg mb-4">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-slate-500">Total:</span>
                <span className="ml-1 font-semibold">{stats.total}</span>
              </div>
              <div>
                <span className="text-slate-500">Applied:</span>
                <span className="ml-1 font-semibold text-green-600">{stats.applied}</span>
              </div>
              <div>
                <span className="text-slate-500">Pending:</span>
                <span className="ml-1 font-semibold text-amber-600">{stats.pending}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {suggestions.length === 0 ? (
                <Button
                  onClick={startReview}
                  disabled={reviewing}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {reviewing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Review in progress...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Start AI Review
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startReview}
                    disabled={reviewing}
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${reviewing ? 'animate-spin' : ''}`} />
                    Re-analyze
                  </Button>
                  {stats.pending > 0 && (
                    <Button
                      size="sm"
                      onClick={handleApplyAll}
                      disabled={reviewing}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Apply All ({stats.pending})
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Content area */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
                <p className="text-slate-500">Loading review results...</p>
              </div>
            ) : reviewing ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
                <p className="text-slate-500">Review in progress...</p>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                  <Brain className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-700 mb-2">
                  AI Review Ready
                </h3>
                <p className="text-slate-500 max-w-md mb-6">
                  Click "Start AI Review" to analyze your accepted tasks and get suggestions 
                  for matching them to the failure mode library.
                </p>
                <div className="grid grid-cols-2 gap-4 text-left max-w-lg">
                  {Object.entries(ACTION_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <div key={key} className={`p-3 rounded-lg border ${config.borderColor} ${config.bgColor}`}>
                        <div className={`flex items-center gap-2 ${config.color} font-medium text-sm`}>
                          <Icon className="w-4 h-4" />
                          {config.label}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{config.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.task_id}
                  suggestion={suggestion}
                  onApply={handleApply}
                  onReject={handleReject}
                  isApplying={applyingTaskId === suggestion.task_id}
                />
              ))
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            {stats.applied > 0 ? "Done" : "Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIReviewModal;
