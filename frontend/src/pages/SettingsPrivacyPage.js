import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Shield, 
  Download, 
  Trash2, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Mail,
  Database,
  Lock,
  Eye,
  ChevronDown,
  ChevronUp,
  Loader2,
  X
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { useAuth } from "../contexts/AuthContext";
import { gdprAPI } from "../lib/api";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

export default function SettingsPrivacyPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  
  // State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [expandedPolicy, setExpandedPolicy] = useState(null);

  // Queries
  const { data: privacyPolicy, isLoading: policyLoading } = useQuery({
    queryKey: ["privacy-policy"],
    queryFn: gdprAPI.getPrivacyPolicy,
  });

  const { data: termsOfService, isLoading: termsLoading } = useQuery({
    queryKey: ["terms-of-service"],
    queryFn: gdprAPI.getTermsOfService,
  });

  const { data: deletionStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["deletion-status"],
    queryFn: gdprAPI.getDeletionStatus,
  });

  const { data: consentStatus, isLoading: consentLoading } = useQuery({
    queryKey: ["consent-status"],
    queryFn: gdprAPI.getConsentStatus,
  });

  // Query for pending deletion request
  const { data: myDeletionRequest, isLoading: requestLoading } = useQuery({
    queryKey: ["my-deletion-request"],
    queryFn: gdprAPI.getMyDeletionRequest,
  });

  // Mutations
  const exportMutation = useMutation({
    mutationFn: gdprAPI.exportData,
    onSuccess: (data) => {
      // Create download link
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `gdpr_export_${new Date().toISOString().split("T")[0]}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Your data has been exported successfully");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to export data");
    },
  });

  const consentMutation = useMutation({
    mutationFn: gdprAPI.updateConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent-status"] });
      toast.success("Privacy preferences updated");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to update preferences");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: gdprAPI.requestAccountDeletion,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["my-deletion-request"] });
      toast.success("Your deletion request has been submitted for approval");
      setShowDeleteDialog(false);
      setDeleteConfirmEmail("");
      setDeleteReason("");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to submit deletion request");
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: gdprAPI.cancelDeletionRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-deletion-request"] });
      toast.success("Your deletion request has been cancelled");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to cancel request");
    },
  });

  const handleConsentChange = (key, value) => {
    const newConsents = {
      ...consentStatus?.consents,
      [key]: value,
    };
    consentMutation.mutate(newConsents);
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()) {
      toast.error("Email does not match your account");
      return;
    }
    deleteMutation.mutate({
      confirm_email: deleteConfirmEmail,
      reason: deleteReason,
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Shield className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Privacy & Data</h1>
          <p className="text-slate-500">Manage your privacy settings and personal data (GDPR)</p>
        </div>
      </div>

      {/* Your Rights Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Your Data Rights (GDPR)
          </CardTitle>
          <CardDescription>
            Under GDPR, you have specific rights regarding your personal data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-green-500" />
                <span className="font-medium">Right to Access</span>
              </div>
              <p className="text-sm text-slate-600">
                You can request and download all your personal data at any time.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Trash2 className="w-4 h-4 text-red-500" />
                <span className="font-medium">Right to Erasure</span>
              </div>
              <p className="text-sm text-slate-600">
                You can request deletion of your account and personal data.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Download className="w-4 h-4 text-blue-500" />
                <span className="font-medium">Data Portability</span>
              </div>
              <p className="text-sm text-slate-600">
                Export your data in a machine-readable format (JSON).
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-purple-500" />
                <span className="font-medium">Control Processing</span>
              </div>
              <p className="text-sm text-slate-600">
                Manage how your data is processed via consent settings below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Export Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-green-500" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download all your personal data in JSON format (Article 15 & 20)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-2">
                This includes your profile, submissions, observations, actions, and activity logs.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Database className="w-3 h-3" />
                <span>Exported as machine-readable JSON</span>
              </div>
            </div>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="export-data-btn"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Consent Management Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-500" />
            Consent Preferences
          </CardTitle>
          <CardDescription>
            Control how your data is processed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {consentLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="font-medium">Essential Cookies</Label>
                  <p className="text-sm text-slate-500">Required for the application to function</p>
                </div>
                <Switch checked={true} disabled />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="font-medium">Analytics</Label>
                  <p className="text-sm text-slate-500">Help us improve the application</p>
                </div>
                <Switch
                  checked={consentStatus?.consents?.analytics || false}
                  onCheckedChange={(checked) => handleConsentChange("analytics", checked)}
                  disabled={consentMutation.isPending}
                  data-testid="consent-analytics"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="font-medium">Marketing Emails</Label>
                  <p className="text-sm text-slate-500">Receive updates and newsletters</p>
                </div>
                <Switch
                  checked={consentStatus?.consents?.marketing_emails || false}
                  onCheckedChange={(checked) => handleConsentChange("marketing_emails", checked)}
                  disabled={consentMutation.isPending}
                  data-testid="consent-marketing"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="font-medium">AI Processing</Label>
                  <p className="text-sm text-slate-500">Allow AI features to analyze your data</p>
                </div>
                <Switch
                  checked={consentStatus?.consents?.ai_processing !== false}
                  onCheckedChange={(checked) => handleConsentChange("ai_processing", checked)}
                  disabled={consentMutation.isPending}
                  data-testid="consent-ai"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Terms of Service Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Terms of Service
          </CardTitle>
          <CardDescription>
            {termsOfService?.last_updated && `Last updated: ${termsOfService.last_updated} • v${termsOfService.version}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {termsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {termsOfService?.sections?.map((section, index) => (
                <AccordionItem key={index} value={`tos-section-${index}`}>
                  <AccordionTrigger className="text-left">
                    {section.title}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-slate-600 mb-2">{section.content}</p>
                    {section.items && (
                      <ul className="list-disc list-inside space-y-1 text-sm text-slate-500">
                        {section.items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Privacy Policy Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            Privacy Policy
          </CardTitle>
          <CardDescription>
            {privacyPolicy?.last_updated && `Last updated: ${privacyPolicy.last_updated}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policyLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {privacyPolicy?.sections?.map((section, index) => (
                <AccordionItem key={index} value={`section-${index}`}>
                  <AccordionTrigger className="text-left">
                    {section.title}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-slate-600 mb-2">{section.content}</p>
                    {section.items && (
                      <ul className="list-disc list-inside space-y-1 text-sm text-slate-500">
                        {section.items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Delete Account Card */}
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Request deletion of your account (requires owner approval)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading || requestLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : myDeletionRequest?.has_pending_request ? (
            /* Show pending request status */
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">Deletion Request Pending</span>
                </div>
                <p className="text-sm text-amber-600 mb-2">
                  Your account deletion request is awaiting owner approval.
                </p>
                <div className="text-xs text-amber-500 space-y-1">
                  <p>Submitted: {new Date(myDeletionRequest.request?.created_at).toLocaleString()}</p>
                  {myDeletionRequest.request?.reason && (
                    <p>Reason: {myDeletionRequest.request.reason}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => cancelRequestMutation.mutate()}
                disabled={cancelRequestMutation.isPending}
                data-testid="cancel-deletion-request-btn"
              >
                {cancelRequestMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Cancel Request
                  </>
                )}
              </Button>
            </div>
          ) : myDeletionRequest?.request?.status === "rejected" ? (
            /* Show rejected request info */
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700 mb-2">
                  <X className="w-4 h-4" />
                  <span className="font-medium">Previous Request Rejected</span>
                </div>
                <p className="text-sm text-red-600 mb-2">
                  Your deletion request was rejected on {new Date(myDeletionRequest.request?.processed_at).toLocaleDateString()}.
                </p>
                {myDeletionRequest.request?.rejection_reason && (
                  <p className="text-xs text-red-500">
                    Reason: {myDeletionRequest.request.rejection_reason}
                  </p>
                )}
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={!deletionStatus?.can_delete}
                data-testid="delete-account-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Submit New Request
              </Button>
            </div>
          ) : (
            <>
              {/* Data Summary */}
              <div className="mb-4 p-4 bg-white rounded-lg border">
                <h4 className="font-medium mb-2">Data that will be affected:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Form Submissions:</span>
                    <Badge variant="outline">{deletionStatus?.data_summary?.form_submissions || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Observations:</span>
                    <Badge variant="outline">{deletionStatus?.data_summary?.observations || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Actions:</span>
                    <Badge variant="outline">{deletionStatus?.data_summary?.actions || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Investigations:</span>
                    <Badge variant="outline">{deletionStatus?.data_summary?.investigations || 0}</Badge>
                  </div>
                </div>
              </div>

              {/* Info about approval workflow */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> Deletion requests require owner approval. You will be notified via email once your request is processed.
                </p>
              </div>

              {/* Warnings */}
              {deletionStatus?.warnings?.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Warnings</span>
                  </div>
                  <ul className="text-sm text-amber-600 space-y-1">
                    {deletionStatus.warnings.map((warning, i) => (
                      <li key={i}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={!deletionStatus?.can_delete}
                data-testid="delete-account-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Request Account Deletion
              </Button>

              {!deletionStatus?.can_delete && (
                <p className="mt-2 text-sm text-red-500">
                  Account deletion is currently not available. See warnings above.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Delete Your Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. Your account and personal data will be permanently deleted.
              Some data may be anonymized for audit purposes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="confirm-email">
                Type your email to confirm: <strong>{user?.email}</strong>
              </Label>
              <Input
                id="confirm-email"
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder="Enter your email"
                className="mt-1"
                data-testid="delete-confirm-email"
              />
            </div>

            <div>
              <Label htmlFor="delete-reason">Reason for leaving (optional)</Label>
              <Textarea
                id="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Help us improve by sharing why you're leaving..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteMutation.isPending || deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()}
              data-testid="confirm-delete-account-btn"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete My Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
