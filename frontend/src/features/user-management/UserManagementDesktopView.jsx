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
  Filter,
  RefreshCw,
  Camera,
  Trash2,
  AlertCircle,
  UserPlus,
  Bell,
  Factory,
  Crown,
  KeyRound,
  Lock,
  PlayCircle,
  Smartphone,
  Mail,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import ImageEditor from "../../components/ImageEditor";
import SettingsPermissionsPage from "../../pages/SettingsPermissionsPage";
import { roleIcons, roleColors, UserAvatar, SimpleModeUserBadge, SimpleModeDropdownItem, Email2faDropdownItem } from "./userManagementShared";

export function UserManagementDesktopView({
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
  setPasswordDialog,
  activeTab,
  setActiveTab,
  showCreateUser,
  setShowCreateUser,
  createUserForm,
  setCreateUserForm,
  createUserMutation,
  installationDialogUser,
  setInstallationDialogUser,
  selectedInstallations,
  setSelectedInstallations,
  updateInstallationsMutation,
  }) {
  return (
    <>
    <div className="p-6 max-w-7xl mx-auto" data-testid="user-management-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
            <p className="text-sm text-slate-500">Manage user roles and permissions</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <Button 
              onClick={() => setShowCreateUser(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="create-user-btn"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs for Users and Permissions */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="users" className="flex items-center gap-2" data-testid="users-tab">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2" data-testid="permissions-tab">
            <Shield className="w-4 h-4" />
            Permissions
          </TabsTrigger>
        </TabsList>

        {/* Users Tab Content */}
        <TabsContent value="users" className="space-y-6">
          {/* Role Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(roles).map(([roleKey, roleInfo]) => {
          const RoleIcon = roleIcons[roleKey] || Shield;
          const count = users.filter(u => u.role === roleKey).length;
          return (
            <div
              key={roleKey}
              className={`p-4 rounded-lg border ${roleColors[roleKey]} cursor-pointer transition-transform hover:scale-105`}
              onClick={() => setRoleFilter(roleFilter === roleKey ? "all" : roleKey)}
              data-testid={`role-stat-${roleKey}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <RoleIcon className="w-4 h-4" />
                <span className="font-semibold text-sm">{roleInfo.name}</span>
              </div>
              <div className="text-2xl font-bold">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="user-search-input"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]" data-testid="role-filter">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("userManagement.allRoles")}</SelectItem>
            {Object.entries(roles).map(([roleKey, roleInfo]) => (
              <SelectItem key={roleKey} value={roleKey}>{roleInfo.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge
          variant={simpleModeFilter ? "default" : "outline"}
          className={`cursor-pointer whitespace-nowrap h-10 px-3 flex items-center ${simpleModeFilter ? "bg-green-100 text-green-800 border-green-200" : "bg-green-50 text-green-700 border-green-200"}`}
          onClick={() => setSimpleModeFilter((v) => !v)}
          data-testid="simple-mode-filter-desktop"
        >
          <Smartphone className="w-3.5 h-3.5 mr-1.5" />
          Simple Mode ({simpleModeCount})
        </Badge>
      </div>

      {/* Pending Approvals Section */}
      {pendingData?.count > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-amber-800">
                Pending Approvals ({pendingData.count})
              </h2>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetchPending()}
              className="text-amber-700 border-amber-300 hover:bg-amber-100"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
          <div className="space-y-3">
            {pendingData.users?.map((user) => (
              <div 
                key={user.id} 
                className="flex items-center justify-between bg-white rounded-lg border border-amber-200 p-4"
                data-testid={`pending-user-${user.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <UserPlus className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                    Pending Approval
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    Registered {formatDate(user.created_at)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-300 hover:bg-green-50"
                    onClick={() => {
                      setApprovalDialogUser(user);
                      setApprovalAction("approve");
                      setApprovalRole("viewer");
                    }}
                    data-testid={`approve-btn-${user.id}`}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => {
                      setApprovalDialogUser(user);
                      setApprovalAction("reject");
                    }}
                    data-testid={`reject-btn-${user.id}`}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Table */}
      {usersLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : displayUsers.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("userManagement.noUsersFound")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">User</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 hidden md:table-cell">Installations</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 hidden lg:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 hidden xl:table-cell">Last Login</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayUsers.map((user) => {
                  const RoleIcon = roleIcons[user.role] || Shield;
                  const avatarUrl = avatarUrls[user.id];
                  return (
                    <tr key={user.id} className="hover:bg-slate-50" data-testid={`user-row-${user.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative group">
                            <UserAvatar user={user} avatarUrl={avatarUrl} size="md" />
                            {/* Upload overlay on hover */}
                            <button
                              onClick={() => handleAvatarUpload(user.id)}
                              className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              title={t("userManagement.uploadPhoto")}
                            >
                              <Camera className="w-4 h-4 text-white" />
                            </button>
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                              {user.name}
                              <SimpleModeUserBadge enabled={user.default_simple_mode} t={t} />
                            </div>
                            <div className="text-sm text-slate-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${roleColors[user.role]} gap-1`}>
                          <RoleIcon className="w-3 h-3" />
                          {user.role_name}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {user.role === "owner" ? (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              <Crown className="w-3 h-3 mr-1" />
                              All Installations
                            </Badge>
                          ) : user.assigned_installations && user.assigned_installations.length > 0 ? (
                            user.assigned_installations.slice(0, 2).map((inst, idx) => (
                              <Badge key={`${user.id}-inst-${inst}`} variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                <Factory className="w-3 h-3 mr-1" />
                                {inst}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              No access
                            </span>
                          )}
                          {user.role !== "owner" && user.assigned_installations && user.assigned_installations.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{user.assigned_installations.length - 2} more
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-slate-600">
                          {user.department || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-sm text-slate-500">
                          {formatDate(user.last_login)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.is_active ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <Check className="w-3 h-3 mr-1" /> Active
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-200">
                            <X className="w-3 h-3 mr-1" /> Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleAvatarUpload(user.id)}>
                              <Camera className="w-4 h-4 mr-2" /> {t("userManagement.uploadPhoto") || "Upload Photo"}
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
                                data-testid={`desktop-set-password-${user.id}`}
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
                                data-testid={`desktop-reset-consent-${user.id}`}
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
                              data-testid={`delete-user-${user.id}`}
                              disabled={user.id === currentUser?.id}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> 
                              {user.id === currentUser?.id ? "Cannot delete yourself" : "Delete User"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("userManagement.editUserProfile")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("common.name")}</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("userManagement.department")}</Label>
              <Input
                value={editForm.department}
                onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                placeholder="e.g., Maintenance, Operations"
              />
            </div>
            <div>
              <Label>{t("userManagement.position")}</Label>
              <Input
                value={editForm.position}
                onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                placeholder="e.g., Reliability Engineer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!changeRoleUser} onOpenChange={() => setChangeRoleUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("userManagement.changeUserRole")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 mb-4">
              Changing role for <strong>{changeRoleUser?.name}</strong>
            </p>
            <div className="space-y-3">
              {Object.entries(roles).map(([roleKey, roleInfo]) => {
                const RoleIcon = roleIcons[roleKey] || Shield;
                return (
                  <div
                    key={roleKey}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedRole === roleKey 
                        ? "border-blue-500 bg-blue-50" 
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    onClick={() => setSelectedRole(roleKey)}
                  >
                    <div className="flex items-center gap-3">
                      <RoleIcon className={`w-5 h-5 ${selectedRole === roleKey ? "text-blue-600" : "text-slate-500"}`} />
                      <div className="flex-1">
                        <div className="font-medium">{roleInfo.name}</div>
                        <div className="text-sm text-slate-500">{roleInfo.description}</div>
                      </div>
                      {selectedRole === roleKey && (
                        <Check className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoleUser(null)}>{t("common.cancel")}</Button>
            <Button 
              onClick={handleConfirmRoleChange} 
              disabled={updateRoleMutation.isPending || selectedRole === changeRoleUser?.role}
            >
              {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Editor Dialog */}
      <ImageEditor
        open={editorOpen}
        onClose={handleEditorClose}
        imageSrc={editorImage}
        onSave={handleEditorSave}
        aspectRatio={1}
        cropShape="round"
        title={t("userManagement.editPhoto") || "Edit Photo"}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete User</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete <span className="font-semibold text-foreground">{deleteConfirmUser?.name}</span>?
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This action cannot be undone. All data associated with this user will be removed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteUserMutation.mutate(deleteConfirmUser?.id)}
              disabled={deleteUserMutation.isPending}
              data-testid="confirm-delete-user-btn"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {setPasswordDialog}

      {/* Hidden file input for avatar upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
        data-testid="avatar-file-input"
      />

      {/* Approval Dialog */}
      <Dialog open={!!approvalDialogUser} onOpenChange={(open) => !open && setApprovalDialogUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approvalAction === "approve" ? (
                <>
                  <UserCheck className="w-5 h-5 text-green-600" />
                  Approve User
                </>
              ) : (
                <>
                  <UserX className="w-5 h-5 text-red-600" />
                  Reject User
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {approvalDialogUser && (
            <div className="space-y-4 py-4">
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
                      <SelectTrigger data-testid="approval-role-select">
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
                  
                  <p className="text-sm text-slate-500">
                    The user will be notified via email that their account has been approved and they can now log in.
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Rejection Reason (optional)</Label>
                    <Input
                      placeholder="e.g., Not authorized for this organization"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      data-testid="rejection-reason-input"
                    />
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">
                      This user will be notified that their account request was rejected. They will not be able to log in.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogUser(null)}>
              Cancel
            </Button>
            <Button
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
              data-testid={`confirm-${approvalAction}-btn`}
            >
              {approvalMutation.isPending ? (
                "Processing..."
              ) : approvalAction === "approve" ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Approve User
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Reject User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Installations Dialog */}
      <Dialog open={!!installationDialogUser} onOpenChange={(open) => {
        if (!open) {
          setInstallationDialogUser(null);
          setSelectedInstallations([]);
        }
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-blue-600" />
              Manage Installations
            </DialogTitle>
          </DialogHeader>
          
          {installationDialogUser && (
            <div className="space-y-4 py-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <Users className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-medium">{installationDialogUser.name}</p>
                  <p className="text-sm text-slate-500">{installationDialogUser.email}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Assigned Installations</Label>
                <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {installations.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No installations available</p>
                  ) : (
                    installations.map(inst => (
                      <label 
                        key={inst.id} 
                        className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedInstallations.includes(inst.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedInstallations([...selectedInstallations, inst.id]);
                            } else {
                              setSelectedInstallations(selectedInstallations.filter(id => id !== inst.id));
                            }
                          }}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm">{inst.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedInstallations.length > 0 && (
                  <p className="text-xs text-slate-500">{selectedInstallations.length} installation(s) selected</p>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallationDialogUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Convert selected installation IDs to names for storage
                const selectedNames = selectedInstallations.map(id => {
                  const inst = installations.find(i => i.id === id);
                  return inst ? inst.name : id;
                });
                updateInstallationsMutation.mutate({
                  userId: installationDialogUser?.id,
                  installations: selectedNames,
                });
              }}
              disabled={updateInstallationsMutation.isPending}
            >
              {updateInstallationsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Create New User
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Full Name *</Label>
              <Input
                id="create-name"
                placeholder="John Doe"
                value={createUserForm.name}
                onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                data-testid="create-user-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="john@company.com"
                value={createUserForm.email}
                onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                data-testid="create-user-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                value={createUserForm.password}
                onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                data-testid="create-user-password"
              />
              <p className="text-xs text-slate-500">Default password. User should change it on first login.</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-role">Role</Label>
              <Select 
                value={createUserForm.role} 
                onValueChange={(val) => setCreateUserForm({ ...createUserForm, role: val })}
              >
                <SelectTrigger id="create-role" data-testid="create-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roles).map(([key, role]) => (
                    <SelectItem key={key} value={key}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-position">Position</Label>
              <Input
                id="create-position"
                placeholder="Reliability Engineer"
                value={createUserForm.position}
                onChange={(e) => setCreateUserForm({ ...createUserForm, position: e.target.value })}
                data-testid="create-user-position"
              />
            </div>
            
            
            {/* Installations Assignment */}
            <div className="space-y-2">
              <Label>Assign to Installations</Label>
              <div className="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-slate-50">
                {installations.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-2">No installations available</p>
                ) : (
                  <div className="space-y-2">
                    {installations.map((installation) => {
                      const installationName = installation.name || installation;
                      const isSelected = createUserForm.installations.includes(installationName);
                      return (
                        <label 
                          key={installation.id || installationName} 
                          className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCreateUserForm({
                                  ...createUserForm,
                                  installations: [...createUserForm.installations, installationName]
                                });
                              } else {
                                setCreateUserForm({
                                  ...createUserForm,
                                  installations: createUserForm.installations.filter(i => i !== installationName)
                                });
                              }
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{installationName}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">Select which installations this user can access</p>
            </div>
            
            {/* Send welcome email checkbox */}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <input
                type="checkbox"
                id="send-email"
                checked={createUserForm.send_email}
                onChange={(e) => setCreateUserForm({ ...createUserForm, send_email: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <div>
                <Label htmlFor="send-email" className="cursor-pointer">Send welcome email</Label>
                <p className="text-xs text-slate-500">User will receive login credentials and must change password on first login</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUser(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createUserMutation.mutate(createUserForm)}
              disabled={!createUserForm.name || !createUserForm.email || createUserMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="create-user-submit"
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
        </TabsContent>

        {/* Permissions Tab Content */}
        <TabsContent value="permissions">
          <SettingsPermissionsPage embedded={true} />
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
