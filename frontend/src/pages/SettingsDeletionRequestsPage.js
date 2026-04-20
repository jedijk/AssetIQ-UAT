import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Trash2, 
  Check, 
  X, 
  Clock, 
  User, 
  Mail, 
  Calendar,
  AlertTriangle,
  Loader2,
  Filter,
  RefreshCw
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useAuth } from "../contexts/AuthContext";
import { gdprAPI } from "../lib/api";

export default function SettingsDeletionRequestsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Query deletion requests
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["deletion-requests", statusFilter],
    queryFn: () => gdprAPI.getDeletionRequests(statusFilter === "all" ? null : statusFilter),
    enabled: user?.role === "owner",
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (requestId) => gdprAPI.processDeletionRequest(requestId, "approve"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deletion-requests"] });
      toast.success("Account deletion approved and processed");
      setShowApproveDialog(false);
      setSelectedRequest(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to approve deletion");
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }) => gdprAPI.processDeletionRequest(requestId, "reject", reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deletion-requests"] });
      toast.success("Deletion request rejected");
      setShowRejectDialog(false);
      setSelectedRequest(null);
      setRejectionReason("");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to reject request");
    },
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><Check className="w-3 h-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><X className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (user?.role !== "owner") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <p>You don't have permission to view this page. Only owners can manage deletion requests.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Deletion Requests</h1>
            <p className="text-slate-500">Review and process account deletion requests (GDPR)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Requests</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-2xl font-bold text-amber-600">
                  {data?.requests?.filter(r => r.status === "pending").length || 0}
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Approved</p>
                <p className="text-2xl font-bold text-green-600">
                  {data?.requests?.filter(r => r.status === "approved").length || 0}
                </p>
              </div>
              <Check className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Rejected</p>
                <p className="text-2xl font-bold text-red-600">
                  {data?.requests?.filter(r => r.status === "rejected").length || 0}
                </p>
              </div>
              <X className="w-8 h-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Deletion Requests</CardTitle>
          <CardDescription>
            {statusFilter === "all" ? "All requests" : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} requests`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : data?.requests?.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No deletion requests found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processed By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.requests?.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium">{request.user_name}</p>
                          <p className="text-xs text-slate-500">{request.user_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm text-slate-600 truncate">
                        {request.reason || "No reason provided"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(request.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      {request.processed_by_name ? (
                        <span className="text-sm text-slate-600">{request.processed_by_name}</span>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {request.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:bg-green-50"
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowApproveDialog(true);
                            }}
                          >
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowRejectDialog(true);
                            }}
                          >
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                      {request.status === "rejected" && request.rejection_reason && (
                        <span className="text-xs text-slate-500" title={request.rejection_reason}>
                          Reason: {request.rejection_reason.slice(0, 30)}...
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approve Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              Approve Deletion Request
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the user's account and anonymize their data.
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="py-4 space-y-3">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-medium">{selectedRequest.user_name}</p>
                <p className="text-sm text-slate-500">{selectedRequest.user_email}</p>
                {selectedRequest.reason && (
                  <p className="text-sm text-slate-600 mt-2">
                    <strong>Reason:</strong> {selectedRequest.reason}
                  </p>
                )}
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">
                  <strong>Warning:</strong> This action cannot be undone. The user will be notified via email.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => approveMutation.mutate(selectedRequest?.id)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Approve & Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="w-5 h-5" />
              Reject Deletion Request
            </DialogTitle>
            <DialogDescription>
              The user will be notified that their request has been declined.
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="py-4 space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-medium">{selectedRequest.user_name}</p>
                <p className="text-sm text-slate-500">{selectedRequest.user_email}</p>
              </div>
              <div>
                <Label htmlFor="rejection-reason">Reason for rejection (optional)</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why the request is being rejected..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ 
                requestId: selectedRequest?.id, 
                reason: rejectionReason 
              })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Reject Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
