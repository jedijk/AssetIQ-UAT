import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { threatsAPI, actionsAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
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

const LIKELIHOOD_OPTIONS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const DETECTABILITY_OPTIONS = ["Easy", "Moderate", "Difficult", "Very Difficult", "Almost Impossible"];
const FREQUENCY_OPTIONS = ["Once", "Rarely", "Occasionally", "Frequently", "Constantly"];
const IMPACT_OPTIONS = ["Minor", "Moderate", "Significant", "Major", "Catastrophic"];
const STATUS_OPTIONS = ["Open", "In Progress", "Mitigated", "Closed"];
const PRIORITY_OPTIONS = ["critical", "high", "medium", "low"];

const ThreatDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showAddActionDialog, setShowAddActionDialog] = useState(false);
  const [newActionForm, setNewActionForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    due_date: "",
  });

  // Fetch threat
  const { data: threat, isLoading, error } = useQuery({
    queryKey: ["threat", id],
    queryFn: () => threatsAPI.getById(id),
  });

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

  // Promote to action mutation
  const promoteToActionMutation = useMutation({
    mutationFn: (actionText) => actionsAPI.create({
      title: actionText.substring(0, 100),
      description: actionText,
      source_type: "threat",
      source_id: id,
      source_name: threat?.title || "Unknown Threat",
      priority: threat?.risk_level === "Critical" ? "critical" : 
               threat?.risk_level === "High" ? "high" : "medium",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action created! View it in the Actions tab.");
    },
    onError: () => {
      toast.error("Failed to create action");
    },
  });

  // Create custom action mutation
  const createActionMutation = useMutation({
    mutationFn: (actionData) => actionsAPI.create({
      title: actionData.title,
      description: actionData.description,
      source_type: "threat",
      source_id: id,
      source_name: threat?.title || "Unknown Threat",
      priority: actionData.priority,
      assignee: actionData.assignee || null,
      due_date: actionData.due_date || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["threat-actions", id] });
      toast.success("Action created successfully!");
      setShowAddActionDialog(false);
      setNewActionForm({
        title: "",
        description: "",
        priority: "medium",
        assignee: "",
        due_date: "",
      });
    },
    onError: () => {
      toast.error("Failed to create action");
    },
  });

  const handleCreateAction = () => {
    if (!newActionForm.title.trim()) {
      toast.error("Please enter an action title");
      return;
    }
    createActionMutation.mutate(newActionForm);
  };

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
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl" data-testid="threat-not-found">
        <div className="text-center py-16">
          <XCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Threat not found</h2>
          <Button onClick={() => navigate("/threats")} variant="outline">
            Back to Threats
          </Button>
        </div>
      </div>
    );
  }

  const infoItems = [
    { label: "Asset", value: threat.asset, icon: Wrench, field: "asset", type: "text" },
    { label: "Equipment Type", value: threat.equipment_type, icon: Target, field: "equipment_type", type: "text" },
    { label: "Failure Mode", value: threat.failure_mode, icon: AlertTriangle, field: "failure_mode", type: "text" },
    { label: "Impact", value: threat.impact, icon: Activity, field: "impact", type: "select", options: IMPACT_OPTIONS },
    { label: "Frequency", value: threat.frequency, icon: Clock, field: "frequency", type: "select", options: FREQUENCY_OPTIONS },
    { label: "Likelihood", value: threat.likelihood, icon: Activity, field: "likelihood", type: "select", options: LIKELIHOOD_OPTIONS },
    { label: "Detectability", value: threat.detectability, icon: Eye, field: "detectability", type: "select", options: DETECTABILITY_OPTIONS },
    { label: "Location", value: threat.location || "Not specified", icon: MapPin, field: "location", type: "text" },
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

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl" data-testid="threat-detail-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Button
          variant="ghost"
          onClick={() => navigate("/threats")}
          className="mb-4 -ml-2 text-slate-500 hover:text-slate-700"
          data-testid="back-to-threats-button"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Threats
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <RiskBadge level={threat.risk_level} size="lg" />
              <span className="text-slate-500 font-mono text-sm" data-testid="threat-rank-display">
                Rank #{threat.rank} of {threat.total_threats}
              </span>
            </div>
            {isEditing ? (
              <Input
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="text-2xl font-bold h-12"
                data-testid="edit-threat-title"
              />
            ) : (
              <h1 className="text-2xl font-bold text-slate-900" data-testid="threat-title">
                {threat.title}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={cancelEditing}
                  data-testid="cancel-edit-button"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={saveChanges}
                  disabled={updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="save-edit-button"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={startEditing}
                  data-testid="edit-threat-button"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                
                <Select
                  value={threat.status}
                  onValueChange={(value) => updateMutation.mutate({ status: value })}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="w-36" data-testid="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" data-testid="delete-threat-button">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Threat</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this threat? This action cannot be undone.
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
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Risk Score Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`card p-6 mb-6 border-l-4 ${
          threat.risk_level === "Critical" ? "border-l-red-500" :
          threat.risk_level === "High" ? "border-l-orange-500" :
          threat.risk_level === "Medium" ? "border-l-yellow-500" :
          "border-l-green-500"
        }`}
        data-testid="risk-score-card"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-500 mb-1">Risk Score</div>
            <div className="text-4xl font-bold text-slate-900">{threat.risk_score}</div>
          </div>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
            threat.risk_level === "Critical" ? "bg-red-50" :
            threat.risk_level === "High" ? "bg-orange-50" :
            threat.risk_level === "Medium" ? "bg-yellow-50" :
            "bg-green-50"
          }`}>
            <AlertTriangle className={`w-8 h-8 ${
              threat.risk_level === "Critical" ? "text-red-500" :
              threat.risk_level === "High" ? "text-orange-500" :
              threat.risk_level === "Medium" ? "text-yellow-500" :
              "text-green-500"
            }`} />
          </div>
        </div>
      </motion.div>

      {/* AI Intelligence Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"
      >
        {/* AI Risk Analysis Panel */}
        <AIInsightsPanel threatId={id} />
        
        {/* Causal Intelligence Panel */}
        <CausalIntelligencePanel threatId={id} threatData={threat} />
      </motion.div>

      {/* Info Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        data-testid="threat-info-grid"
      >
        {infoItems.map((item) => (
          <div key={item.label} className="card p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <item.icon className="w-4 h-4" />
              {item.label}
            </div>
            {isEditing ? (
              item.type === "select" ? (
                <Select
                  value={editForm[item.field] || ""}
                  onValueChange={(v) => setEditForm({ ...editForm, [item.field]: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {item.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editForm[item.field] || ""}
                  onChange={(e) => setEditForm({ ...editForm, [item.field]: e.target.value })}
                  className="h-9"
                />
              )
            ) : (
              <div className="font-semibold text-slate-900">{item.value}</div>
            )}
          </div>
        ))}
      </motion.div>

      {/* Cause */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card p-6 mb-6"
        data-testid="threat-cause-section"
      >
        <h3 className="font-semibold text-slate-900 mb-2">Root Cause</h3>
        {isEditing ? (
          <Textarea
            value={editForm.cause || ""}
            onChange={(e) => setEditForm({ ...editForm, cause: e.target.value })}
            placeholder="Enter root cause analysis..."
            rows={3}
          />
        ) : (
          <p className="text-slate-600">{threat.cause || "Not specified"}</p>
        )}
      </motion.div>

      {/* Recommended Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card p-6"
        data-testid="recommended-actions-section"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Recommended Actions</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddActionDialog(true)}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
            data-testid="add-action-button"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Action
          </Button>
        </div>
        <div className="space-y-3">
          {threat.recommended_actions.map((action, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg group"
              data-testid={`action-item-${idx}`}
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                {idx + 1}
              </div>
              <p className="text-slate-700 flex-1">{action}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => promoteToActionMutation.mutate(action)}
                disabled={promoteToActionMutation.isPending}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Add to action tracker"
                data-testid={`promote-action-${idx}`}
              >
                <ClipboardList className="w-4 h-4 mr-1" />
                Act
              </Button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Add Action Dialog */}
      <Dialog open={showAddActionDialog} onOpenChange={setShowAddActionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Action</DialogTitle>
            <DialogDescription>
              Create a new action for this threat. It will be tracked in the Actions tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="action-title">Title *</Label>
              <Input
                id="action-title"
                value={newActionForm.title}
                onChange={(e) => setNewActionForm({ ...newActionForm, title: e.target.value })}
                placeholder="e.g., Replace pump bearings"
                data-testid="action-title-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-description">Description</Label>
              <Textarea
                id="action-description"
                value={newActionForm.description}
                onChange={(e) => setNewActionForm({ ...newActionForm, description: e.target.value })}
                placeholder="Detailed description of the action..."
                rows={3}
                data-testid="action-description-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="action-priority">Priority</Label>
                <Select
                  value={newActionForm.priority}
                  onValueChange={(v) => setNewActionForm({ ...newActionForm, priority: v })}
                >
                  <SelectTrigger data-testid="action-priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="action-assignee">Assignee</Label>
                <Input
                  id="action-assignee"
                  value={newActionForm.assignee}
                  onChange={(e) => setNewActionForm({ ...newActionForm, assignee: e.target.value })}
                  placeholder="Name"
                  data-testid="action-assignee-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-due-date">Due Date</Label>
              <Input
                id="action-due-date"
                type="date"
                value={newActionForm.due_date}
                onChange={(e) => setNewActionForm({ ...newActionForm, due_date: e.target.value })}
                data-testid="action-due-date-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddActionDialog(false)}
              data-testid="cancel-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAction}
              disabled={createActionMutation.isPending || !newActionForm.title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-action-button"
            >
              {createActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  );
};

export default ThreatDetailPage;
