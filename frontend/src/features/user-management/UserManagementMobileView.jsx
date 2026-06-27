import React from "react";
import {
  Users,
  Search,
  Shield,
  ShieldCheck,
  Eye,
  Edit,
  X,
  Check,
  RefreshCw,
  Camera,
  Trash2,
  AlertCircle,
  UserPlus,
  Bell,
  Factory,
  KeyRound,
  Lock,
  PlayCircle,
  ArrowLeft,
  Smartphone,
  Briefcase,
  Building2,
  Clock,
  MoreVertical,
  UserCog,
  UserX,
  UserCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import ImageEditor from "../../components/ImageEditor";
import { roleIcons, roleColors, UserAvatar, SimpleModeUserBadge, SimpleModeDropdownItem, Email2faDropdownItem } from "./userManagementShared";

export function UserManagementMobileView({
  navigate,
  refetch,
  search,
  setSearch,
  roleFilter,
  setRoleFilter,
  simpleModeFilter,
  setSimpleModeFilter,
  simpleModeCount,
  users,
  usersLoading,
  displayUsers,
  pendingData,
  roles,
  isOwner,
  currentUser,
  t,
  formatDate,
  avatarUrls,
  editingUser,
  setEditingUser,
  editForm,
  setEditForm,
  changeRoleUser,
  setChangeRoleUser,
  selectedRole,
  setSelectedRole,
  approvalDialogUser,
  setApprovalDialogUser,
  approvalAction,
  setApprovalAction,
  approvalRole,
  setApprovalRole,
  approvalInstallations,
  setApprovalInstallations,
  rejectionReason,
  setRejectionReason,
  approvalMutation,
  deleteConfirmUser,
  setDeleteConfirmUser,
  deleteUserMutation,
  editorOpen,
  editorImage,
  fileInputRef,
  handleAvatarUpload,
  handleEditProfile,
  handleChangeRole,
  handleToggleSimpleMode,
  handleToggleEmail2fa,
  email2faAvailable,
  handleConfirmRoleChange,
  handleSaveProfile,
  handleEditorClose,
  handleEditorSave,
  handleFileChange,
  handleOpenSetPassword,
  resetPasswordMutation,
  resetIntroMutation,
  resetConsentMutation,
  updateProfileMutation,
  updateRoleMutation,
  updateStatusMutation,
  installations,
  setInstallationDialogUser,
  setSelectedInstallations,
  setPasswordDialog,
  }) {
  return (
    <>
      <div className="min-h-screen bg-slate-50 pb-20" data-testid="user-management-page-mobile">
        {/* Mobile Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-lg font-bold text-slate-900">Users & Roles</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
              data-testid="mobile-user-search"
            />
          </div>
          
          {/* Role Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <Badge 
              variant={roleFilter === "all" ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap shrink-0"
              onClick={() => setRoleFilter("all")}
            >
              All ({users.length})
            </Badge>
            {Object.entries(roles).map(([roleKey, roleInfo]) => {
              const count = users.filter(u => u.role === roleKey).length;
              return (
                <Badge 
                  key={roleKey}
                  variant={roleFilter === roleKey ? "default" : "outline"}
                  className={`cursor-pointer whitespace-nowrap shrink-0 ${roleFilter === roleKey ? '' : roleColors[roleKey]}`}
                  onClick={() => setRoleFilter(roleFilter === roleKey ? "all" : roleKey)}
                >
                  {roleInfo.name} ({count})
                </Badge>
              );
            })}
            <Badge
              variant={simpleModeFilter ? "default" : "outline"}
              className={`cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${simpleModeFilter ? "bg-green-100 text-green-800 border-green-200" : "bg-green-50 text-green-700 border-green-200"}`}
              onClick={() => setSimpleModeFilter((v) => !v)}
              data-testid="simple-mode-filter-mobile"
            >
              <Smartphone className="w-3 h-3 shrink-0" />
              Simple Mode ({simpleModeCount})
            </Badge>
          </div>
        </div>

        {/* Pending Approvals Banner */}
        {pendingData?.count > 0 && (
          <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-amber-800 text-sm">
                {pendingData.count} Pending Approval{pendingData.count > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {pendingData.users?.slice(0, 3).map((user) => (
                <div 
                  key={user.id}
                  className="flex items-center justify-between bg-white rounded-lg p-2 border border-amber-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <UserPlus className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-600"
                      onClick={() => {
                        setApprovalDialogUser(user);
                        setApprovalAction("approve");
                        setApprovalRole("viewer");
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-600"
                      onClick={() => {
                        setApprovalDialogUser(user);
                        setApprovalAction("reject");
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Cards */}
        <div className="p-4 space-y-3">
          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : displayUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No users found</p>
            </div>
          ) : (
            displayUsers.map((user) => {
              const RoleIcon = roleIcons[user.role] || Shield;
              const avatarUrl = avatarUrls[user.id];
              return (
                <div 
                  key={user.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                  data-testid={`mobile-user-card-${user.id}`}
                >
                  {/* Top row with avatar, name, and menu */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <div 
                        className="relative cursor-pointer shrink-0"
                        onClick={() => handleAvatarUpload(user.id)}
                      >
                        <UserAvatar user={user} avatarUrl={avatarUrl} size="lg" />
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-white rounded-full flex items-center justify-center shadow border">
                          <Camera className="w-3 h-3 text-slate-500" />
                        </div>
                      </div>

                      {/* Name and email */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 truncate">{user.name}</span>
                          <SimpleModeUserBadge enabled={user.default_simple_mode} t={t} />
                          {user.is_active ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Active" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Inactive" />
                          )}
                        </div>
                        <p className="text-sm text-slate-500 truncate">{user.email}</p>
                      </div>
                    </div>

                    {/* Actions Menu Button */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-9 w-9 shrink-0 border-slate-200" 
                          data-testid={`mobile-user-menu-${user.id}`}
                        >
                          <MoreVertical className="w-5 h-5 text-slate-600" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAvatarUpload(user.id)}>
                          <Camera className="w-4 h-4 mr-2" /> Upload Photo
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditProfile(user)}>
                          <Edit className="w-4 h-4 mr-2" /> Edit Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(user)}>
                          <UserCog className="w-4 h-4 mr-2" /> Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setInstallationDialogUser(user);
                          // Convert user's assigned installation names to IDs for checkbox state
                          const userInstallationNames = user.assigned_installations || [];
                          const selectedIds = installations
                            .filter(inst => userInstallationNames.includes(inst.name))
                            .map(inst => inst.id);
                          setSelectedInstallations(selectedIds);
                        }}>
                          <Factory className="w-4 h-4 mr-2" /> Manage Installations
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => resetPasswordMutation.mutate(user.id)}
                          disabled={resetPasswordMutation.isPending}
                        >
                          <KeyRound className="w-4 h-4 mr-2" /> Reset Password
                        </DropdownMenuItem>
                        {isOwner && (
                          <DropdownMenuItem
                            onClick={() => handleOpenSetPassword(user)}
                            data-testid={`mobile-set-password-${user.id}`}
                          >
                            <Lock className="w-4 h-4 mr-2" />
                            {user.has_password
                              ? (t("userManagement.setPassword") || "Set Password")
                              : (t("userManagement.createPassword") || "Create Password")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => resetIntroMutation.mutate(user.id)}
                          disabled={resetIntroMutation.isPending}
                        >
                          <PlayCircle className="w-4 h-4 mr-2" /> Reset Intro Tour
                        </DropdownMenuItem>
                        {isOwner && (
                          <DropdownMenuItem
                            onClick={() => resetConsentMutation.mutate({ userId: user.id })}
                            disabled={resetConsentMutation.isPending}
                            data-testid={`reset-consent-${user.id}`}
                          >
                            <ShieldCheck className="w-4 h-4 mr-2" /> Reset GDPR Consent
                          </DropdownMenuItem>
                        )}
                        <SimpleModeDropdownItem
                          user={user}
                          t={t}
                          onToggle={handleToggleSimpleMode}
                          isPending={updateProfileMutation.isPending}
                        />
                        {email2faAvailable && (
                          <Email2faDropdownItem
                            user={user}
                            t={t}
                            onToggle={handleToggleEmail2fa}
                            isPending={updateProfileMutation.isPending}
                          />
                        )}
                        <DropdownMenuSeparator />
                        {user.is_active ? (
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => updateStatusMutation.mutate({ userId: user.id, isActive: false })}
                          >
                            <UserX className="w-4 h-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem 
                            className="text-green-600"
                            onClick={() => updateStatusMutation.mutate({ userId: user.id, isActive: true })}
                          >
                            <UserCheck className="w-4 h-4 mr-2" /> Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className={user.id === currentUser?.id ? "text-gray-400 cursor-not-allowed" : "text-red-600"}
                          onClick={() => user.id !== currentUser?.id && setDeleteConfirmUser(user)}
                          disabled={user.id === currentUser?.id}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> 
                          {user.id === currentUser?.id ? "Cannot delete yourself" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Role badges */}
                  <div className="flex flex-wrap gap-2 mt-2 ml-14">
                    <Badge className={`${roleColors[user.role]} gap-1 text-xs`}>
                      <RoleIcon className="w-3 h-3" />
                      {user.role_name}
                    </Badge>
                    {user.department && (
                      <Badge variant="outline" className="text-xs">
                        <Building2 className="w-3 h-3 mr-1" />
                        {user.department}
                      </Badge>
                    )}
                  </div>

                  {/* Extra Info Row */}
                  {(user.position || user.last_login) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
                      {user.position && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {user.position}
                        </span>
                      )}
                      {user.last_login && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(user.last_login)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Mobile Edit Profile Dialog - Full Screen */}
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="sm:max-w-md h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[85vh] p-0 gap-0 [&>button]:hidden">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0">
                <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <span className="font-semibold">Edit Profile</span>
                <Button 
                  size="sm" 
                  onClick={handleSaveProfile} 
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? "..." : "Save"}
                </Button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Department</Label>
                  <Input
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    placeholder="e.g., Maintenance"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Position</Label>
                  <Input
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    placeholder="e.g., Reliability Engineer"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile Change Role Dialog - Full Screen */}
        <Dialog open={!!changeRoleUser} onOpenChange={() => setChangeRoleUser(null)}>
          <DialogContent className="sm:max-w-md h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[85vh] p-0 gap-0 [&>button]:hidden">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0">
                <Button variant="ghost" size="sm" onClick={() => setChangeRoleUser(null)}>
                  Cancel
                </Button>
                <span className="font-semibold">Change Role</span>
                <Button 
                  size="sm" 
                  onClick={handleConfirmRoleChange} 
                  disabled={updateRoleMutation.isPending || selectedRole === changeRoleUser?.role}
                >
                  {updateRoleMutation.isPending ? "..." : "Save"}
                </Button>
              </div>
              
              {/* User Info */}
              <div className="p-4 bg-slate-50 border-b">
                <p className="text-sm text-slate-600">
                  Changing role for <strong>{changeRoleUser?.name}</strong>
                </p>
              </div>
              
              {/* Role Options */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {Object.entries(roles).map(([roleKey, roleInfo]) => {
                  const RoleIcon = roleIcons[roleKey] || Shield;
                  const isSelected = selectedRole === roleKey;
                  return (
                    <div
                      key={roleKey}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
                      }`}
                      onClick={() => setSelectedRole(roleKey)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          isSelected ? "bg-blue-100" : "bg-slate-100"
                        }`}>
                          <RoleIcon className={`w-5 h-5 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{roleInfo.name}</div>
                          <div className="text-sm text-slate-500">{roleInfo.description}</div>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile Approval Dialog */}
        <Dialog open={!!approvalDialogUser} onOpenChange={(open) => !open && setApprovalDialogUser(null)}>
          <DialogContent className="sm:max-w-md h-auto max-h-[85vh] p-0 gap-0 [&>button]:hidden rounded-t-xl">
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
                <Button variant="ghost" size="sm" onClick={() => setApprovalDialogUser(null)}>
                  Cancel
                </Button>
                <span className="font-semibold">
                  {approvalAction === "approve" ? "Approve" : "Reject"} User
                </span>
                <Button
                  size="sm"
                  variant={approvalAction === "approve" ? "default" : "destructive"}
                  onClick={() => {
                    // Convert installation IDs to names for the backend
                    const installationNames = approvalInstallations
                      .map(id => installations.find(inst => inst.id === id)?.name)
                      .filter(Boolean);
                    
                    approvalMutation.mutate({
                      userId: approvalDialogUser?.id,
                      action: approvalAction,
                      role: approvalAction === "approve" ? approvalRole : undefined,
                      rejectionReason: approvalAction === "reject" ? rejectionReason : undefined,
                      assignedInstallations: approvalAction === "approve" ? installationNames : undefined,
                    });
                  }}
                  disabled={approvalMutation.isPending}
                >
                  {approvalMutation.isPending ? "..." : (approvalAction === "approve" ? "Approve" : "Reject")}
                </Button>
              </div>

              {approvalDialogUser && (
                <div className="p-4 space-y-4">
                  {/* User Info */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center">
                      <Users className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-medium">{approvalDialogUser.name}</p>
                      <p className="text-sm text-slate-500">{approvalDialogUser.email}</p>
                    </div>
                  </div>
                  
                  {approvalAction === "approve" ? (
                    <>
                      <div className="space-y-2">
                        <Label>Assign Role</Label>
                        <Select value={approvalRole} onValueChange={setApprovalRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(roles).map(([roleKey, roleInfo]) => (
                              <SelectItem key={roleKey} value={roleKey}>
                                {roleInfo.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Factory className="w-4 h-4" /> Assign Installations
                        </Label>
                        <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                          {installations.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-2">No installations available</p>
                          ) : (
                            installations.map(inst => (
                              <label 
                                key={inst.id} 
                                className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={approvalInstallations.includes(inst.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setApprovalInstallations([...approvalInstallations, inst.id]);
                                    } else {
                                      setApprovalInstallations(approvalInstallations.filter(id => id !== inst.id));
                                    }
                                  }}
                                  className="rounded border-slate-300"
                                />
                                <span className="text-sm">{inst.name}</span>
                              </label>
                            ))
                          )}
                        </div>
                        {approvalInstallations.length > 0 && (
                          <p className="text-xs text-slate-500">{approvalInstallations.length} installation(s) selected</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Rejection Reason (optional)</Label>
                      <Input
                        placeholder="e.g., Not authorized"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile Delete Confirmation */}
        <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
          <DialogContent className="sm:max-w-sm p-4">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Delete User
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <p className="text-sm text-slate-600">
                Delete <strong>{deleteConfirmUser?.name}</strong>? This cannot be undone.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmUser(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                className="flex-1"
                onClick={() => deleteUserMutation.mutate(deleteConfirmUser?.id)}
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? "..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Image Editor (shared) */}
        <ImageEditor
          open={editorOpen}
          onClose={handleEditorClose}
          imageSrc={editorImage}
          onSave={handleEditorSave}
          aspectRatio={1}
          cropShape="round"
          title="Edit Photo"
        />

        {setPasswordDialog}

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </>
  );
}
