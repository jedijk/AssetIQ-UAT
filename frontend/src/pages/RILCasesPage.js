/**
 * Reliability Cases Page
 * Manage reliability cases - the single container for reliability issues.
 * 
 * Features:
 * - Cases list with filters (status, priority, equipment)
 * - Create new case
 * - View case details
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { rilCasesAPI } from "../lib/apis/rilAPI";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

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
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-500",
};

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "under_investigation", label: "Under Investigation" },
  { value: "awaiting_parts", label: "Awaiting Parts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const priorityOptions = [
  { value: "all", label: "All Priorities" },
  { value: "P1", label: "P1 - Critical" },
  { value: "P2", label: "P2 - High" },
  { value: "P3", label: "P3 - Medium" },
  { value: "P4", label: "P4 - Low" },
];

export default function RILCasesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCase, setNewCase] = useState({
    title: "",
    description: "",
    priority: "P3",
  });

  // Fetch cases
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ril-cases", statusFilter, priorityFilter],
    queryFn: () =>
      rilCasesAPI.list({
        status: statusFilter !== "all" ? statusFilter : undefined,
        priority: priorityFilter !== "all" ? priorityFilter : undefined,
        limit: 100,
      }),
  });

  // Create case mutation
  const createMutation = useMutation({
    mutationFn: (data) => rilCasesAPI.create(data),
    onSuccess: (response) => {
      toast.success(`Case ${response.case.case_number} created successfully`);
      setCreateDialogOpen(false);
      setNewCase({ title: "", description: "", priority: "P3" });
      queryClient.invalidateQueries(["ril-cases"]);
      navigate(`/reliability/cases/${response.case.id}`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create case");
    },
  });

  const cases = data?.cases || [];
  const filteredCases = cases.filter((c) =>
    searchQuery
      ? c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.case_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.equipment_name?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const handleCreateCase = () => {
    if (!newCase.title.trim()) {
      toast.error("Please enter a title for the case");
      return;
    }
    createMutation.mutate(newCase);
  };

  // Group cases by status for summary
  const caseSummary = cases.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                Reliability Cases
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {data?.total || 0} total cases
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Case
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-sm text-zinc-500">Open</span>
            </div>
            <p className="text-2xl font-bold">{caseSummary.open || 0}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm text-zinc-500">In Progress</span>
            </div>
            <p className="text-2xl font-bold">{caseSummary.in_progress || 0}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-sm text-zinc-500">Under Investigation</span>
            </div>
            <p className="text-2xl font-bold">{caseSummary.under_investigation || 0}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-zinc-500">Resolved</span>
            </div>
            <p className="text-2xl font-bold">{caseSummary.resolved || 0}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Search cases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-600" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
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
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[180px]">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cases List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <FileText className="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-700" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
              No cases found
            </h3>
            <p className="text-zinc-500 mb-4">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first reliability case to get started"}
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Case
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredCases.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: i * 0.02 }}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/reliability/cases/${c.id}`)}
                >
                  <div className="flex items-start gap-4">
                    {/* Priority Badge */}
                    <div
                      className={`px-3 py-2 rounded-lg text-sm font-bold ${
                        priorityColors[c.priority] || priorityColors.P3
                      }`}
                    >
                      {c.priority}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-zinc-500">{c.case_number}</span>
                        <Badge variant="secondary" className={`text-xs ${statusColors[c.status] || ""}`}>
                          {c.status?.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-zinc-900 dark:text-white truncate">
                        {c.title}
                      </h3>
                      {c.equipment_name && (
                        <p className="text-sm text-zinc-500 mt-1 truncate">
                          Equipment: {c.equipment_name}
                          {c.equipment_tag && ` (${c.equipment_tag})`}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span>
                          Created: {new Date(c.created_at).toLocaleDateString()}
                        </span>
                        {c.assigned_to_name && (
                          <span>Assigned to: {c.assigned_to_name}</span>
                        )}
                        {(c.observation_ids?.length > 0 || c.alert_ids?.length > 0) && (
                          <span>
                            {c.observation_ids?.length || 0} obs, {c.alert_ids?.length || 0} alerts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Risk Score */}
                    {c.risk_assessment?.risk_score && (
                      <div className="text-right">
                        <div
                          className={`text-2xl font-bold ${
                            c.risk_assessment.risk_score > 500
                              ? "text-red-500"
                              : c.risk_assessment.risk_score > 200
                              ? "text-orange-500"
                              : "text-green-500"
                          }`}
                        >
                          {Math.round(c.risk_assessment.risk_score)}
                        </div>
                        <div className="text-xs text-zinc-500">Risk Score</div>
                      </div>
                    )}

                    <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-2" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create Case Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Reliability Case</DialogTitle>
            <DialogDescription>
              Create a new reliability case to track and manage equipment issues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Brief description of the issue"
                value={newCase.title}
                onChange={(e) => setNewCase({ ...newCase, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Detailed description of the reliability issue..."
                value={newCase.description}
                onChange={(e) => setNewCase({ ...newCase, description: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={newCase.priority}
                onValueChange={(value) => setNewCase({ ...newCase, priority: value })}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCase} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Case
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
