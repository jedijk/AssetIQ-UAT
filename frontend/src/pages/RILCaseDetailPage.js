/**
 * RIL Case Detail Page
 * View and manage a single reliability case.
 */

import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  Gauge,
  Link2,
  Loader2,
  MessageSquare,
  Save,
  Shield,
  User,
  X,
  Zap,
} from "lucide-react";
import { rilCasesAPI } from "../lib/apis/rilAPI";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import RILCopilot from "../components/ril/RILCopilot";

// Priority badge colors
const priorityColors = {
  P1: "bg-red-500 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-black",
  P4: "bg-blue-500 text-white",
};

// Status badge colors
const statusColors = {
  open: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  under_investigation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  awaiting_parts: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  scheduled: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

const statusOptions = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "under_investigation", label: "Under Investigation" },
  { value: "awaiting_parts", label: "Awaiting Parts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function RILCaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolution, setResolution] = useState({
    resolution_summary: "",
    root_cause: "",
  });

  // Fetch case details
  const { data, isLoading, error } = useQuery({
    queryKey: ["ril-case", id],
    queryFn: () => rilCasesAPI.get(id),
    enabled: !!id,
  });

  // Update case mutation
  const updateMutation = useMutation({
    mutationFn: (data) => rilCasesAPI.update(id, data),
    onSuccess: () => {
      toast.success("Case updated successfully");
      setIsEditing(false);
      queryClient.invalidateQueries(["ril-case", id]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update case");
    },
  });

  const caseData = data?.case;
  const observations = data?.observations || [];
  const alerts = data?.alerts || [];
  const equipment = data?.equipment;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Case not found</h2>
          <p className="text-zinc-500 mb-4">The case you're looking for doesn't exist.</p>
          <Button onClick={() => navigate("/reliability/cases")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Cases
          </Button>
        </div>
      </div>
    );
  }

  const handleStartEdit = () => {
    setEditForm({
      title: caseData.title,
      description: caseData.description,
      status: caseData.status,
      priority: caseData.priority,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateMutation.mutate(editForm);
  };

  const handleResolve = () => {
    updateMutation.mutate({
      status: "resolved",
      ...resolution,
    });
    setResolveDialogOpen(false);
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === "resolved") {
      setResolveDialogOpen(true);
    } else {
      updateMutation.mutate({ status: newStatus });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/reliability/cases")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-zinc-500">{caseData.case_number}</span>
                <Badge className={`${priorityColors[caseData.priority] || priorityColors.P3}`}>
                  {caseData.priority}
                </Badge>
                <Badge variant="secondary" className={statusColors[caseData.status] || ""}>
                  {caseData.status?.replace(/_/g, " ")}
                </Badge>
              </div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
                {caseData.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setCopilotOpen(true)}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Ask Copilot
            </Button>
            {!isEditing ? (
              <Button size="sm" onClick={handleStartEdit}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Case Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Case Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={editForm.title || ""}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select
                          value={editForm.priority}
                          onValueChange={(v) => setEditForm({ ...editForm, priority: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="P1">P1 - Critical</SelectItem>
                            <SelectItem value="P2">P2 - High</SelectItem>
                            <SelectItem value="P3">P3 - Medium</SelectItem>
                            <SelectItem value="P4">P4 - Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-zinc-700 dark:text-zinc-300">
                      {caseData.description || "No description provided."}
                    </p>
                    {equipment && (
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Gauge className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="font-medium">{equipment.name}</p>
                            <p className="text-sm text-zinc-500">
                              {equipment.tag || "—"} • {equipment.equipment_type || "Equipment"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Linked Items */}
            <Tabs defaultValue="observations">
              <TabsList>
                <TabsTrigger value="observations">
                  Observations ({observations.length})
                </TabsTrigger>
                <TabsTrigger value="alerts">
                  Alerts ({alerts.length})
                </TabsTrigger>
                <TabsTrigger value="history">
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="observations" className="mt-4">
                {observations.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-zinc-500">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p>No observations linked to this case</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {observations.map((obs) => (
                      <Card key={obs.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Zap className="w-5 h-5 text-orange-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium">{obs.title}</p>
                              <p className="text-sm text-zinc-500 mt-1">{obs.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                                <span>Source: {obs.source}</span>
                                <span>Severity: {obs.severity}</span>
                                <span>{new Date(obs.observed_at).toLocaleString()}</span>
                              </div>
                            </div>
                            <Badge variant="outline">{obs.severity}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="alerts" className="mt-4">
                {alerts.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-zinc-500">
                      <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p>No alerts linked to this case</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <Card key={alert.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium">{alert.title}</p>
                              <p className="text-sm text-zinc-500 mt-1">{alert.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                                <span>Type: {alert.alert_type}</span>
                                <span>Priority: {alert.triage_result?.priority || "—"}</span>
                                <span>{new Date(alert.alert_time).toLocaleString()}</span>
                              </div>
                            </div>
                            {alert.triage_result?.priority && (
                              <Badge className={priorityColors[alert.triage_result.priority]}>
                                {alert.triage_result.priority}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    {caseData.status_history && caseData.status_history.length > 0 ? (
                      <div className="space-y-4">
                        {caseData.status_history.map((entry, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                            <div>
                              <p className="font-medium">
                                Status changed to {entry.status?.replace(/_/g, " ")}
                              </p>
                              <p className="text-sm text-zinc-500">
                                {new Date(entry.changed_at).toLocaleString()}
                              </p>
                              {entry.notes && (
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                  {entry.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-zinc-500 py-4">No status history</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Resolution (if resolved) */}
            {caseData.status === "resolved" || caseData.status === "closed" ? (
              <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    Resolution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {caseData.resolution_summary && (
                    <div>
                      <Label className="text-green-700 dark:text-green-400">Summary</Label>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-1">
                        {caseData.resolution_summary}
                      </p>
                    </div>
                  )}
                  {caseData.root_cause && (
                    <div>
                      <Label className="text-green-700 dark:text-green-400">Root Cause</Label>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-1">
                        {caseData.root_cause}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select value={caseData.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Change Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {caseData.status !== "resolved" && caseData.status !== "closed" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setResolveDialogOpen(true)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Resolve Case
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Risk Assessment */}
            {caseData.risk_assessment && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div
                      className={`text-4xl font-bold ${
                        caseData.risk_assessment.risk_score > 500
                          ? "text-red-500"
                          : caseData.risk_assessment.risk_score > 200
                          ? "text-orange-500"
                          : "text-green-500"
                      }`}
                    >
                      {Math.round(caseData.risk_assessment.risk_score)}
                    </div>
                    <p className="text-sm text-zinc-500">Risk Score</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-zinc-500">Safety</p>
                      <p className="font-semibold">
                        {caseData.risk_assessment.safety_impact}/5
                      </p>
                    </div>
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-zinc-500">Production</p>
                      <p className="font-semibold">
                        {caseData.risk_assessment.production_impact}/5
                      </p>
                    </div>
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-zinc-500">Environmental</p>
                      <p className="font-semibold">
                        {caseData.risk_assessment.environmental_impact}/5
                      </p>
                    </div>
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                      <p className="text-zinc-500">Probability</p>
                      <p className="font-semibold">
                        {(caseData.risk_assessment.probability * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Created</span>
                  <span>{new Date(caseData.created_at).toLocaleDateString()}</span>
                </div>
                {caseData.updated_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Updated</span>
                    <span>{new Date(caseData.updated_at).toLocaleDateString()}</span>
                  </div>
                )}
                {caseData.resolved_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Resolved</span>
                    <span>{new Date(caseData.resolved_at).toLocaleDateString()}</span>
                  </div>
                )}
                {caseData.assigned_to_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Assigned To</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {caseData.assigned_to_name}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Linked Items</span>
                  <span>
                    {caseData.observation_ids?.length || 0} obs, {caseData.alert_ids?.length || 0} alerts
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Case</DialogTitle>
            <DialogDescription>
              Provide resolution details for this reliability case.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Resolution Summary *</Label>
              <Textarea
                placeholder="Describe how the issue was resolved..."
                value={resolution.resolution_summary}
                onChange={(e) =>
                  setResolution({ ...resolution, resolution_summary: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Root Cause</Label>
              <Textarea
                placeholder="What was the root cause of the issue?"
                value={resolution.root_cause}
                onChange={(e) => setResolution({ ...resolution, root_cause: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleResolve}
              disabled={!resolution.resolution_summary || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Resolve Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copilot */}
      <RILCopilot
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        equipmentId={caseData.equipment_id}
      />
    </div>
  );
}
