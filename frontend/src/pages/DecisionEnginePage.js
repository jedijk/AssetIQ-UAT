import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import {
  Brain,
  Lightbulb,
  Settings,
  CheckCircle2,
  XCircle,
  Clock,
  PlayCircle,
  AlertTriangle,
  TrendingUp,
  Activity,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Zap,
  Target,
  Sliders,
  ToggleLeft,
  MoreVertical,
  ArrowRight,
  FileText,
  Wrench,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

// Get base URL without /api suffix
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// API functions
const decisionAPI = {
  getDashboard: async () => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/dashboard`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch dashboard");
    return response.json();
  },
  getRules: async (enabledOnly = false) => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/rules?enabled_only=${enabledOnly}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch rules");
    const data = await response.json();
    return data.rules || [];
  },
  updateRule: async ({ ruleId, data }) => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/rules/${ruleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Failed to update rule");
    return response.json();
  },
  evaluateRules: async () => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/evaluate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to evaluate rules");
    return response.json();
  },
  getSuggestions: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append("status", params.status);
    if (params.priority) queryParams.append("priority", params.priority);
    if (params.rule_id) queryParams.append("rule_id", params.rule_id);
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/suggestions?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch suggestions");
    return response.json();
  },
  approveSuggestion: async ({ id, notes }) => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/suggestions/${id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ notes })
    });
    if (!response.ok) throw new Error("Failed to approve suggestion");
    return response.json();
  },
  rejectSuggestion: async ({ id, reason }) => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/suggestions/${id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ reason })
    });
    if (!response.ok) throw new Error("Failed to reject suggestion");
    return response.json();
  },
  executeSuggestion: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/decision-engine/suggestions/${id}/execute`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to execute suggestion");
    return response.json();
  },
};

// Status badge component
const StatusBadge = ({ status }) => {
  const config = {
    pending: { color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock, label: "Pending" },
    approved: { color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle2, label: "Approved" },
    rejected: { color: "bg-slate-100 text-slate-800 border-slate-200", icon: XCircle, label: "Rejected" },
    executed: { color: "bg-green-100 text-green-800 border-green-200", icon: PlayCircle, label: "Executed" },
  };
  const c = config[status] || config.pending;
  return (
    <Badge className={c.color}>
      <c.icon className="w-3 h-3 mr-1" />
      {c.label}
    </Badge>
  );
};

// Priority badge component
const PriorityBadge = ({ priority }) => {
  const config = {
    high: { color: "bg-red-100 text-red-800 border-red-200", label: "High" },
    medium: { color: "bg-amber-100 text-amber-800 border-amber-200", label: "Medium" },
    low: { color: "bg-slate-100 text-slate-800 border-slate-200", label: "Low" },
  };
  const c = config[priority] || config.medium;
  return <Badge className={c.color}>{c.label}</Badge>;
};

// Category icon component
const CategoryIcon = ({ category }) => {
  const icons = {
    task_optimization: Wrench,
    task_creation: Target,
    risk_update: TrendingUp,
    library_enhancement: FileText,
  };
  const Icon = icons[category] || Settings;
  return <Icon className="w-4 h-4" />;
};

// Rule Card Component
const RuleCard = ({ rule, onToggle, onConfigure }) => {
  return (
    <Card className={`transition-all ${rule.is_enabled ? "border-blue-200 bg-blue-50/30" : "opacity-75"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              rule.is_enabled 
                ? "bg-gradient-to-br from-blue-500 to-indigo-600" 
                : "bg-slate-200"
            }`}>
              <CategoryIcon category={rule.category} />
              {rule.is_enabled && <div className="absolute text-white"><CategoryIcon category={rule.category} /></div>}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {rule.name}
                {rule.auto_execute && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                          <Zap className="w-3 h-3 mr-1" /> Auto
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("decisionEngine.autoExecuteNote")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {rule.description}
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={rule.is_enabled}
            onCheckedChange={(enabled) => onToggle(rule.rule_id, enabled)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Badge variant="outline" className="capitalize">
              {rule.category?.replace("_", " ")}
            </Badge>
            <Badge variant="outline">
              {rule.trigger_type?.replace("_", " ")}
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onConfigure(rule)}
            className="text-xs"
          >
            <Settings className="w-3.5 h-3.5 mr-1" /> Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Suggestion Card Component
const SuggestionCard = ({ suggestion, onApprove, onReject, onExecute }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Card className="overflow-hidden">
      <div 
        className="flex items-start gap-4 p-4 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(!expanded)}
      >
        <Button variant="ghost" size="icon" className="h-6 w-6 mt-1 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="font-medium text-sm text-slate-900">{suggestion.title}</h4>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{suggestion.description}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={suggestion.status} />
              <PriorityBadge priority={suggestion.priority} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(suggestion.created_at).toLocaleDateString()}
            </span>
            <Badge variant="outline" className="text-xs capitalize">
              {suggestion.rule_id?.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="border-t bg-slate-50 p-4 space-y-4">
          <div>
            <h5 className="text-xs font-medium text-slate-700 mb-2">Recommended Action</h5>
            <div className="bg-white rounded-lg border p-3">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap">
                {JSON.stringify(suggestion.recommended_action, null, 2)}
              </pre>
            </div>
          </div>
          
          {suggestion.status === "pending" && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(suggestion);
                }}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(suggestion);
                }}
              >
                <XCircle className="w-4 h-4 mr-1" /> Reject
              </Button>
            </div>
          )}
          
          {suggestion.status === "approved" && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onExecute(suggestion);
                }}
              >
                <PlayCircle className="w-4 h-4 mr-1" /> Execute
              </Button>
            </div>
          )}
          
          {suggestion.status === "rejected" && suggestion.rejection_reason && (
            <div className="text-sm">
              <span className="text-slate-500">Rejection reason: </span>
              <span>{suggestion.rejection_reason}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const DecisionEnginePage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("suggestions");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedRule, setSelectedRule] = useState(null);
  const [showApproveDialog, setShowApproveDialog] = useState(null);
  const [showRejectDialog, setShowRejectDialog] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch dashboard stats
  const { data: dashboard, isLoading: loadingDashboard } = useQuery({
    queryKey: ["decision-dashboard"],
    queryFn: decisionAPI.getDashboard,
    refetchInterval: 30000,
  });

  // Fetch rules
  const { data: rulesData, isLoading: loadingRules } = useQuery({
    queryKey: ["decision-rules"],
    queryFn: () => decisionAPI.getRules(),
  });

  // Fetch suggestions
  const { data: suggestionsData, isLoading: loadingSuggestions } = useQuery({
    queryKey: ["decision-suggestions", statusFilter, priorityFilter],
    queryFn: () => decisionAPI.getSuggestions({
      status: statusFilter !== "all" ? statusFilter : undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
    }),
    enabled: activeTab === "suggestions",
  });

  // Update rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: decisionAPI.updateRule,
    onSuccess: () => {
      toast.success("Rule updated");
      queryClient.invalidateQueries({ queryKey: ["decision-rules"] });
      setSelectedRule(null);
    },
    onError: (error) => {
      toast.error("Failed to update rule: " + error.message);
    },
  });

  // Evaluate rules mutation
  const evaluateMutation = useMutation({
    mutationFn: decisionAPI.evaluateRules,
    onSuccess: (data) => {
      toast.success(`Evaluated ${data.rules_evaluated} rules, generated ${data.suggestions_generated} suggestions`);
      queryClient.invalidateQueries({ queryKey: ["decision-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["decision-dashboard"] });
    },
    onError: (error) => {
      toast.error("Failed to evaluate rules: " + error.message);
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: decisionAPI.approveSuggestion,
    onSuccess: () => {
      toast.success("Suggestion approved");
      queryClient.invalidateQueries({ queryKey: ["decision-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["decision-dashboard"] });
      setShowApproveDialog(null);
      setApprovalNotes("");
    },
    onError: (error) => {
      toast.error("Failed to approve: " + error.message);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: decisionAPI.rejectSuggestion,
    onSuccess: () => {
      toast.success("Suggestion rejected");
      queryClient.invalidateQueries({ queryKey: ["decision-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["decision-dashboard"] });
      setShowRejectDialog(null);
      setRejectionReason("");
    },
    onError: (error) => {
      toast.error("Failed to reject: " + error.message);
    },
  });

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: decisionAPI.executeSuggestion,
    onSuccess: () => {
      toast.success("Suggestion executed");
      queryClient.invalidateQueries({ queryKey: ["decision-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["decision-dashboard"] });
    },
    onError: (error) => {
      toast.error("Failed to execute: " + error.message);
    },
  });

  const handleToggleRule = (ruleId, enabled) => {
    updateRuleMutation.mutate({ ruleId, data: { is_enabled: enabled } });
  };

  const rules = rulesData || [];
  const suggestions = suggestionsData?.suggestions || [];
  const stats = dashboard?.suggestions || {};
  const ruleStats = dashboard?.rules || {};

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="decision-engine-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Decision Engine</h1>
            <p className="text-sm text-slate-500">Automated learning rules & suggestions</p>
          </div>
        </div>
        <Button 
          onClick={() => evaluateMutation.mutate()}
          disabled={evaluateMutation.isPending}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
          data-testid="evaluate-rules-btn"
        >
          {evaluateMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-2" />
          )}
          Evaluate Rules
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{stats.pending || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Approved</p>
                <p className="text-2xl font-bold text-blue-600">{stats.approved || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Executed</p>
                <p className="text-2xl font-bold text-green-600">{stats.executed || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <PlayCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">High Priority</p>
                <p className="text-2xl font-bold text-red-600">{stats.high_priority || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Rules Active</p>
                <p className="text-2xl font-bold text-violet-600">{ruleStats.enabled || 0}/{ruleStats.total || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Settings className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="suggestions" data-testid="suggestions-tab">
              <Lightbulb className="w-4 h-4 mr-2" /> Suggestions
              {stats.pending > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white">{stats.pending}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rules" data-testid="rules-tab">
              <Settings className="w-4 h-4 mr-2" /> Rules
            </TabsTrigger>
          </TabsList>
          
          {activeTab === "suggestions" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("decisionEngine.allStatus")}</SelectItem>
                  <SelectItem value="pending">{t("decisionEngine.pending")}</SelectItem>
                  <SelectItem value="approved">{t("decisionEngine.approved")}</SelectItem>
                  <SelectItem value="rejected">{t("decisionEngine.rejected")}</SelectItem>
                  <SelectItem value="executed">{t("decisionEngine.executed")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("decisionEngine.allPriority")}</SelectItem>
                  <SelectItem value="high">{t("common.high")}</SelectItem>
                  <SelectItem value="medium">{t("common.medium")}</SelectItem>
                  <SelectItem value="low">{t("common.low")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="mt-4">
          {loadingSuggestions ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full" />
            </div>
          ) : suggestions.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Lightbulb className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No suggestions yet</h3>
                <p className="text-sm text-slate-500 mb-4">Click "Evaluate Rules" to generate suggestions based on your data</p>
                <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
                  <Zap className="w-4 h-4 mr-2" /> Evaluate Rules
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApprove={(s) => setShowApproveDialog(s)}
                  onReject={(s) => setShowRejectDialog(s)}
                  onExecute={(s) => executeMutation.mutate(s.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules" className="mt-4">
          {loadingRules ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full" />
            </div>
          ) : rules.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Settings className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No rules configured</h3>
                <p className="text-sm text-slate-500">Rules will appear here once initialized</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.rule_id}
                  rule={rule}
                  onToggle={handleToggleRule}
                  onConfigure={setSelectedRule}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Configure Rule Dialog */}
      <Dialog open={!!selectedRule} onOpenChange={() => setSelectedRule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-violet-600" />
              Configure Rule
            </DialogTitle>
            <DialogDescription>
              {selectedRule?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">{selectedRule?.description}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Enabled</Label>
                  <p className="text-xs text-slate-500">Rule will generate suggestions when enabled</p>
                </div>
                <Switch
                  checked={selectedRule?.is_enabled}
                  onCheckedChange={(enabled) => {
                    if (selectedRule) {
                      updateRuleMutation.mutate({ 
                        ruleId: selectedRule.rule_id, 
                        data: { is_enabled: enabled } 
                      });
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Auto-Execute</Label>
                  <p className="text-xs text-slate-500">Execute suggestions automatically without approval</p>
                </div>
                <Switch
                  checked={selectedRule?.auto_execute}
                  onCheckedChange={(autoExecute) => {
                    if (selectedRule) {
                      updateRuleMutation.mutate({ 
                        ruleId: selectedRule.rule_id, 
                        data: { auto_execute: autoExecute } 
                      });
                    }
                  }}
                />
              </div>
            </div>

            {selectedRule?.config && (
              <div className="space-y-2">
                <Label className="font-medium">Configuration</Label>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  {Object.entries(selectedRule.config).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 capitalize">{key.replace(/_/g, " ")}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRule(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={!!showApproveDialog} onOpenChange={() => setShowApproveDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" /> Approve Suggestion
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="font-medium text-sm">{showApproveDialog?.title}</p>
              <p className="text-sm text-slate-500 mt-1">{showApproveDialog?.description}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("decisionEngine.notesOptional")}</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add any notes about this approval..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(null)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => approveMutation.mutate({ id: showApproveDialog.id, notes: approvalNotes })}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!showRejectDialog} onOpenChange={() => setShowRejectDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" /> Reject Suggestion
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="font-medium text-sm">{showRejectDialog?.title}</p>
              <p className="text-sm text-slate-500 mt-1">{showRejectDialog?.description}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("decisionEngine.reasonOptional")}</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why are you rejecting this suggestion?"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: showRejectDialog.id, reason: rejectionReason })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DecisionEnginePage;
