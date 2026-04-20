import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  RefreshCw, 
  Check, 
  X, 
  Clock, 
  User, 
  Users,
  AlertTriangle,
  Loader2,
  History,
  Shield,
  FileText,
  CheckCircle,
  Eye,
  BarChart3,
  Mail,
  Brain,
  Calendar
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
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

export default function SettingsConsentManagementPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showUserDetailDialog, setShowUserDetailDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [resetAllUsers, setResetAllUsers] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [resetTerms, setResetTerms] = useState(true);
  const [resetPrivacyConsent, setResetPrivacyConsent] = useState(false);
  const [resetReason, setResetReason] = useState("");

  // Query users consent status
  const { data: consentData, isLoading, refetch } = useQuery({
    queryKey: ["users-consent-status"],
    queryFn: gdprAPI.getUsersConsentStatus,
    enabled: user?.role === "owner",
  });

  // Query full consent history (acceptances + resets)
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["consent-history"],
    queryFn: gdprAPI.getConsentAcceptanceHistory,
    enabled: user?.role === "owner",
  });

  // Query user detail
  const { data: userDetail, isLoading: userDetailLoading } = useQuery({
    queryKey: ["user-consent-detail", selectedUserId],
    queryFn: () => gdprAPI.getUserConsentDetails(selectedUserId),
    enabled: !!selectedUserId && showUserDetailDialog,
  });

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () => gdprAPI.resetConsentStatus(
      resetAllUsers ? [] : selectedUsers,
      resetTerms,
      resetPrivacyConsent,
      resetReason
    ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users-consent-status"] });
      queryClient.invalidateQueries({ queryKey: ["consent-history"] });
      toast.success(`Consent reset for ${data.details.users_affected} user(s). They will be prompted at next login.`);
      setShowResetDialog(false);
      setResetReason("");
      setSelectedUsers([]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to reset consent");
    },
  });

  const openUserDetail = (userId) => {
    setSelectedUserId(userId);
    setShowUserDetailDialog(true);
  };

  const ConsentBadge = ({ enabled, label }) => (
    <Badge 
      variant="outline" 
      className={enabled 
        ? "bg-green-50 text-green-700 border-green-200" 
        : "bg-slate-50 text-slate-500 border-slate-200"
      }
    >
      {enabled ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
      {label}
    </Badge>
  );

  if (user?.role !== "owner") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <p>You don't have permission to view this page. Only owners can manage consent settings.</p>
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
          <div className="p-2 bg-blue-100 rounded-lg">
            <Shield className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Consent Management</h1>
            <p className="text-slate-500">Track and manage user consent status</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button 
            onClick={() => setShowResetDialog(true)}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset Consent
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Users</p>
                <p className="text-2xl font-bold text-slate-700">
                  {consentData?.summary?.total_users || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-slate-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Terms Accepted</p>
                <p className="text-2xl font-bold text-green-600">
                  {consentData?.summary?.accepted || 0}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-2xl font-bold text-amber-600">
                  {consentData?.summary?.pending || 0}
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
                <p className="text-sm text-slate-500">Current Version</p>
                <p className="text-2xl font-bold text-blue-600">
                  v{consentData?.current_terms_version || "1.0"}
                </p>
              </div>
              <FileText className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">
            <Users className="w-4 h-4 mr-2" />
            All Users
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="w-4 h-4 mr-2" />
            Pending ({consentData?.summary?.pending || 0})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Reset History
          </TabsTrigger>
        </TabsList>

        {/* All Users Tab */}
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>User Consent Tracking</CardTitle>
              <CardDescription>
                Click on a user to view detailed consent information
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Terms</TableHead>
                      <TableHead>Analytics</TableHead>
                      <TableHead>Marketing</TableHead>
                      <TableHead>AI Processing</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...(consentData?.accepted_users || []), ...(consentData?.pending_users || [])].map((u) => (
                      <TableRow key={u.id} className="cursor-pointer hover:bg-slate-50">
                        <TableCell onClick={() => openUserDetail(u.id)}>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                              <User className="w-4 h-4 text-slate-500" />
                            </div>
                            <div>
                              <p className="font-medium">{u.name}</p>
                              <p className="text-xs text-slate-500">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.terms_accepted_version === consentData?.current_terms_version ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <Check className="w-3 h-3 mr-1" />
                              v{u.terms_accepted_version}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              <Clock className="w-3 h-3 mr-1" />
                              {u.terms_accepted_version ? `v${u.terms_accepted_version}` : "Pending"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <ConsentBadge 
                            enabled={u.consent_preferences?.analytics} 
                            label={<BarChart3 className="w-3 h-3" />} 
                          />
                        </TableCell>
                        <TableCell>
                          <ConsentBadge 
                            enabled={u.consent_preferences?.marketing_emails} 
                            label={<Mail className="w-3 h-3" />} 
                          />
                        </TableCell>
                        <TableCell>
                          <ConsentBadge 
                            enabled={u.consent_preferences?.ai_processing !== false} 
                            label={<Brain className="w-3 h-3" />} 
                          />
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openUserDetail(u.id)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <Clock className="w-5 h-5" />
                Users Pending Terms Acceptance
              </CardTitle>
              <CardDescription>
                These users will be prompted to accept terms at their next login
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : consentData?.pending_users?.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                  <p>All users have accepted the current terms!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Current Version</TableHead>
                      <TableHead>Account Created</TableHead>
                      <TableHead>Last Login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consentData?.pending_users?.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700">
                            {u.terms_accepted_version ? `v${u.terms_accepted_version}` : "Never accepted"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Full Consent History
              </CardTitle>
              <CardDescription>
                Every terms acceptance and owner-initiated reset across all users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : historyData?.history?.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No consent events yet
                </div>
              ) : (
                <Table data-testid="consent-history-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData?.history?.map((entry, index) => {
                      const isReset = entry.event === "consent_reset";
                      return (
                        <TableRow key={index}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell>
                            {isReset ? (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                <RefreshCw className="w-3 h-3 mr-1" /> Reset
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <Check className="w-3 h-3 mr-1" /> Accepted
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{entry.user_name || "Unknown"}</p>
                              {entry.user_email && (
                                <p className="text-xs text-slate-500">{entry.user_email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.terms_version ? `v${entry.terms_version}` : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-slate-500 max-w-[240px]">
                            {isReset && entry.details ? (
                              <div className="truncate" title={entry.details.reason || ""}>
                                <Badge variant="outline" className="mr-1 text-xs">{entry.details.scope}</Badge>
                                <span className="text-xs">{entry.details.users_affected} user(s)</span>
                                {entry.details.reason && <div className="truncate text-xs mt-0.5">"{entry.details.reason}"</div>}
                              </div>
                            ) : (
                              <span className="text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Detail Dialog */}
      <Dialog open={showUserDetailDialog} onOpenChange={setShowUserDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              User Consent Details
            </DialogTitle>
          </DialogHeader>
          
          {userDetailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : userDetail ? (
            <div className="space-y-6">
              {/* User Info */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
                    <User className="w-6 h-6 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{userDetail.user.name}</p>
                    <p className="text-sm text-slate-500">{userDetail.user.email}</p>
                    <Badge variant="outline" className="mt-1">{userDetail.user.role}</Badge>
                  </div>
                </div>
              </div>

              {/* Terms Acceptance */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Terms & Privacy Acceptance
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">Status</p>
                    {userDetail.terms_acceptance.is_current ? (
                      <Badge className="mt-1 bg-green-100 text-green-700">
                        <Check className="w-3 h-3 mr-1" /> Current (v{userDetail.terms_acceptance.accepted_version})
                      </Badge>
                    ) : (
                      <Badge className="mt-1 bg-amber-100 text-amber-700">
                        <Clock className="w-3 h-3 mr-1" /> 
                        {userDetail.terms_acceptance.accepted_version 
                          ? `Outdated (v${userDetail.terms_acceptance.accepted_version})`
                          : "Not accepted"}
                      </Badge>
                    )}
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">Accepted On</p>
                    <p className="font-medium mt-1">
                      {userDetail.terms_acceptance.accepted_at 
                        ? new Date(userDetail.terms_acceptance.accepted_at).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Consent Preferences */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Consent Preferences
                  {userDetail.consent_preferences_updated_at && (
                    <span className="text-xs text-slate-500 font-normal">
                      (Updated: {new Date(userDetail.consent_preferences_updated_at).toLocaleDateString()})
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg border ${userDetail.consent_preferences.analytics ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <BarChart3 className={`w-4 h-4 ${userDetail.consent_preferences.analytics ? 'text-green-600' : 'text-slate-400'}`} />
                      <span className="font-medium">Analytics</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {userDetail.consent_preferences.analytics ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg border ${userDetail.consent_preferences.marketing_emails ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <Mail className={`w-4 h-4 ${userDetail.consent_preferences.marketing_emails ? 'text-green-600' : 'text-slate-400'}`} />
                      <span className="font-medium">Marketing Emails</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {userDetail.consent_preferences.marketing_emails ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg border ${userDetail.consent_preferences.ai_processing ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <Brain className={`w-4 h-4 ${userDetail.consent_preferences.ai_processing ? 'text-green-600' : 'text-slate-400'}`} />
                      <span className="font-medium">AI Processing</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {userDetail.consent_preferences.ai_processing ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span className="font-medium">Essential Cookies</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">Always required</p>
                  </div>
                </div>
              </div>

              {/* Consent History */}
              {(userDetail.consent_history?.length > 0 || userDetail.audit_history?.length > 0) && (
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Consent History
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {[...(userDetail.consent_history || []), ...(userDetail.audit_history || [])]
                      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                      .slice(0, 10)
                      .map((entry, index) => (
                        <div key={index} className="p-2 bg-slate-50 rounded text-sm flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-500">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {entry.event?.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDetailDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RefreshCw className="w-5 h-5" />
              Reset Consent Status
            </DialogTitle>
            <DialogDescription>
              Users will be required to re-accept terms at their next login.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <Label className="font-medium">Reset Scope</Label>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Checkbox 
                  id="reset-all" 
                  checked={resetAllUsers}
                  onCheckedChange={setResetAllUsers}
                />
                <label htmlFor="reset-all" className="text-sm cursor-pointer">
                  Reset for <strong>all users</strong> (except yourself)
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="font-medium">What to Reset</Label>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Checkbox 
                  id="reset-terms" 
                  checked={resetTerms}
                  onCheckedChange={setResetTerms}
                />
                <label htmlFor="reset-terms" className="text-sm cursor-pointer">
                  <strong>Terms & Privacy Policy acceptance</strong>
                  <p className="text-xs text-slate-500">Users will see the terms dialog at next login</p>
                </label>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Checkbox 
                  id="reset-consent" 
                  checked={resetPrivacyConsent}
                  onCheckedChange={setResetPrivacyConsent}
                />
                <label htmlFor="reset-consent" className="text-sm cursor-pointer">
                  <strong>Privacy consent preferences</strong>
                  <p className="text-xs text-slate-500">Analytics, marketing, AI processing consents</p>
                </label>
              </div>
            </div>

            <div>
              <Label htmlFor="reset-reason">Reason for reset (required)</Label>
              <Textarea
                id="reset-reason"
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="e.g., Terms of Service updated with new clauses..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>Note:</strong> This action will be logged for compliance audit.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || (!resetTerms && !resetPrivacyConsent) || !resetReason.trim()}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset Consent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
