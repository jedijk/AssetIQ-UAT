import React, { useState, useRef, useEffect, useMemo } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { formatDate as formatDateUtil } from "../../lib/dateUtils";
import { usersAPI, equipmentHierarchyAPI, rbacAPI } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";

import { UserManagementMobileView } from "./UserManagementMobileView";
import { UserManagementDesktopView } from "./UserManagementDesktopView";

export default function SettingsUserManagementPage() {
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const loadedAvatarIdsRef = useRef(new Set());
  const navigate = useNavigate();
  
  // Check if current user is owner
  const isOwner = currentUser?.role === "owner";
  
  const isMobile = useIsMobile();
  
  // State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [simpleModeFilter, setSimpleModeFilter] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [changeRoleUser, setChangeRoleUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(null);
  const [avatarUrls, setAvatarUrls] = useState({});
  
  // Create user dialog state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    email: "",
    name: "",
    password: "Welcome123!",
    role: "viewer",
    position: "",
    phone: "",
    location: "",
    plant_unit: "",
    send_email: true,
    installations: [],
  });
  
  // Approval workflow state
  const [approvalDialogUser, setApprovalDialogUser] = useState(null);
  const [approvalAction, setApprovalAction] = useState("approve");
  const [approvalRole, setApprovalRole] = useState("viewer");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvalInstallations, setApprovalInstallations] = useState([]);
  
  // Installation assignment dialog state (for editing)
  const [installationDialogUser, setInstallationDialogUser] = useState(null);
  const [selectedInstallations, setSelectedInstallations] = useState([]);
  
  // Image Editor State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorImage, setEditorImage] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  
  // Delete confirmation state
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);

  // Set password dialog state (owner only)
  const [setPasswordUser, setSetPasswordUser] = useState(null);
  const [setPasswordForm, setSetPasswordForm] = useState({ password: "", confirmPassword: "" });
  
  // Tab state for Users / Permissions
  const [activeTab, setActiveTab] = useState("users");

  // Queries
  const { data: usersData, isLoading: usersLoading, refetch } = useQuery({
    queryKey: ["rbac-users", search, roleFilter],
    queryFn: () => rbacAPI.getUsers({
      search: search || undefined,
      role: roleFilter !== "all" ? roleFilter : undefined
    }),
    staleTime: 0, // Always consider data stale to ensure fresh data
    refetchOnWindowFocus: true, // Refetch when window is focused
  });
  
  // Pending users query
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ["pending-users"],
    queryFn: rbacAPI.getPendingUsers,
    staleTime: 0, // Always consider data stale
    refetchOnWindowFocus: true,
  });

  const { data: rolesData } = useQuery({
    queryKey: ["rbac-roles"],
    queryFn: rbacAPI.getRoles
  });
  
  // Equipment hierarchy query for installations - use dedicated installations endpoint
  const { data: installationsData } = useQuery({
    queryKey: ["all-installations"],
    queryFn: async () => {
      const data = await equipmentHierarchyAPI.getNodes();
      // Extract installations from equipment nodes
      const installationNodes = (data?.nodes || []).filter(n => n.level === 'installation');
      return { installations: installationNodes };
    },
    staleTime: 5 * 60 * 1000,
  });
  
  // Get installations from the API
  const installations = installationsData?.installations || [];

  // Approval mutation
  const approvalMutation = useMutation({
    mutationFn: rbacAPI.approveUser,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      queryClient.invalidateQueries({ queryKey: ["pending-users"] });
      const action = variables.action === "approve" ? "approved" : "rejected";
      toast.success(`User ${action} successfully`);
      setApprovalDialogUser(null);
      setRejectionReason("");
      setApprovalInstallations([]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to process approval");
    },
  });
  
  // Update installations mutation
  const updateInstallationsMutation = useMutation({
    mutationFn: ({ userId, installations }) => usersAPI.updateInstallations(userId, installations),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      toast.success("Installations updated successfully");
      setInstallationDialogUser(null);
      setSelectedInstallations([]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update installations");
    },
  });

  // Mutations
  const updateRoleMutation = useMutation({
    mutationFn: rbacAPI.updateUserRole,
    onSuccess: async () => {
      // Invalidate and refetch to ensure fresh data
      await queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      await refetch();
      toast.success("Role updated successfully");
      setChangeRoleUser(null);
    },
    onError: () => toast.error("Failed to update role")
  });

  const updateStatusMutation = useMutation({
    mutationFn: rbacAPI.updateUserStatus,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      await refetch();
      toast.success(data.is_active ? "User activated" : "User deactivated");
    },
    onError: () => toast.error("Failed to update status")
  });

  const updateProfileMutation = useMutation({
    mutationFn: rbacAPI.updateUserProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      await refetch();
      toast.success("Profile updated successfully");
      setEditingUser(null);
    },
    onError: () => toast.error("Failed to update profile")
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: rbacAPI.uploadUserAvatar,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      toast.success(t("userManagement.photoUploaded") || "Photo uploaded successfully");
      setEditingUserId(null);
      // Refresh avatar URL
      loadAvatar(variables.userId);
    },
    onError: (error) => {
      toast.error(error.message || t("userManagement.photoError") || "Failed to upload photo");
      setEditingUserId(null);
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: rbacAPI.deleteUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      toast.success(`User "${data.deleted_user_name}" deleted successfully`);
      setDeleteConfirmUser(null);
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.detail || error.message || "Failed to delete user";
      toast.error(errorMessage);
      setDeleteConfirmUser(null);
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: rbacAPI.resetPassword,
    onSuccess: (data) => {
      toast.success(data.message || "Password reset email sent");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send password reset email");
    }
  });

  const setPasswordMutation = useMutation({
    mutationFn: rbacAPI.setUserPassword,
    onSuccess: (data) => {
      toast.success(data.message || "Password set successfully");
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      setSetPasswordUser(null);
      setSetPasswordForm({ password: "", confirmPassword: "" });
    },
    onError: (error) => {
      const msg = error?.response?.data?.detail || error.message || "Failed to set password";
      toast.error(msg);
    },
  });

  // Reset intro tour mutation
  const resetIntroMutation = useMutation({
    mutationFn: rbacAPI.resetIntro,
    onSuccess: (data) => {
      toast.success(data.message || "Intro tour will show on next login");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reset intro tour");
    }
  });

  // GDPR consent reset — forces user to re-accept Terms & Privacy at next login
  const resetConsentMutation = useMutation({
    mutationFn: ({ userId, resetPrivacyConsent }) =>
      rbacAPI.resetConsent(userId, { reset_terms: true, reset_privacy_consent: !!resetPrivacyConsent }),
    onSuccess: (data) => {
      toast.success(data.message || "User will be prompted to re-accept Terms & Privacy at next login");
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
    },
    onError: (error) => {
      const msg = error?.response?.data?.detail || error.message || "Failed to reset consent";
      toast.error(msg);
    }
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: rbacAPI.createUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      const emailMsg = data.email_sent ? " Welcome email sent." : "";
      toast.success(`User "${data.user.name}" created successfully.${emailMsg}`);
      setShowCreateUser(false);
      setCreateUserForm({
        email: "",
        name: "",
        password: "Welcome123!",
        role: "viewer",
        position: "",
        phone: "",
        location: "",
        plant_unit: "",
        send_email: true,
        installations: [],
      });
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.detail || error.message || "Failed to create user";
      toast.error(errorMessage);
    }
  });

  // Extract users from data
  const users = useMemo(() => usersData?.users ?? [], [usersData]);

  const simpleModeCount = useMemo(
    () => users.filter((u) => u.default_simple_mode).length,
    [users],
  );

  const displayUsers = useMemo(
    () => (simpleModeFilter ? users.filter((u) => u.default_simple_mode) : users),
    [users, simpleModeFilter],
  );

  // Load avatars when users data changes
  useEffect(() => {
    const loadAvatars = async () => {
      for (const user of users) {
        // Load avatar for users that have an avatar_path and we haven't attempted yet
        if (user.avatar_path && !loadedAvatarIdsRef.current.has(user.id)) {
          loadedAvatarIdsRef.current.add(user.id); // Mark as attempted
          try {
            const url = await rbacAPI.getUserAvatar(user.id);
            if (url) {
              setAvatarUrls(prev => ({ ...prev, [user.id]: url }));
            }
          } catch (err) {
            // Silently fail - user just won't have an avatar
            console.warn(`Failed to load avatar for user ${user.id}:`, err);
          }
        }
      }
    };
    
    if (users.length > 0) {
      loadAvatars();
    }
  }, [users]);

  // Function to reload a specific user's avatar (called after upload)
  const loadAvatar = async (userId) => {
    try {
      // Allow re-fetching by removing from the loaded set
      loadedAvatarIdsRef.current.delete(userId);
      const url = await rbacAPI.getUserAvatar(userId);
      if (url) {
        setAvatarUrls(prev => ({ ...prev, [userId]: url }));
        loadedAvatarIdsRef.current.add(userId);
      }
    } catch (err) {
      // Silently fail
      console.warn(`Failed to reload avatar for user ${userId}:`, err);
    }
  };

  const handleAvatarUpload = (userId) => {
    setEditingUserId(userId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !editingUserId) return;
    
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error(t("userManagement.invalidFileType") || "Invalid file type");
      setEditingUserId(null);
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("userManagement.fileTooLarge") || "File too large");
      setEditingUserId(null);
      return;
    }
    
    // Open the image editor with the selected file
    const imageUrl = URL.createObjectURL(file);
    setEditorImage(imageUrl);
    setEditorOpen(true);
    e.target.value = ""; // Reset input
  };

  const handleEditorSave = (editedFile) => {
    if (!editingUserId) return;
    
    // Upload the edited image
    uploadAvatarMutation.mutate({ userId: editingUserId, file: editedFile });
    
    // Clean up
    if (editorImage) {
      URL.revokeObjectURL(editorImage);
    }
    setEditorOpen(false);
    setEditorImage(null);
  };

  const handleEditorClose = () => {
    if (editorImage) {
      URL.revokeObjectURL(editorImage);
    }
    setEditorOpen(false);
    setEditorImage(null);
    setEditingUserId(null);
  };
  const roles = rolesData?.roles || {};

  const handleEditProfile = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || "",
      department: user.department || "",
      position: user.position || "",
      phone: user.phone || ""
    });
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      userId: editingUser.id,
      data: editForm
    });
  };

  const handleChangeRole = (user) => {
    setChangeRoleUser(user);
    setSelectedRole(user.role);
  };

  const handleConfirmRoleChange = () => {
    if (changeRoleUser && selectedRole) {
      updateRoleMutation.mutate({
        userId: changeRoleUser.id,
        role: selectedRole
      });
    }
  };

  const handleOpenSetPassword = (user) => {
    setSetPasswordUser(user);
    setSetPasswordForm({ password: "", confirmPassword: "" });
  };

  const handleCloseSetPassword = () => {
    setSetPasswordUser(null);
    setSetPasswordForm({ password: "", confirmPassword: "" });
  };

  const handleSubmitSetPassword = () => {
    if (setPasswordForm.password !== setPasswordForm.confirmPassword) {
      toast.error(t("userManagement.passwordsDoNotMatch") || "Passwords don't match");
      return;
    }
    if (!setPasswordForm.password) {
      toast.error(t("userManagement.passwordRequired") || "Password is required");
      return;
    }
    setPasswordMutation.mutate({
      userId: setPasswordUser.id,
      password: setPasswordForm.password,
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return formatDateUtil(dateStr);
  };

  const setPasswordDialog = (
    <Dialog open={!!setPasswordUser} onOpenChange={(open) => !open && handleCloseSetPassword()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {setPasswordUser?.has_password
              ? (t("userManagement.setPassword") || "Set Password")
              : (t("userManagement.createPassword") || "Create Password")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600">
            Set a new password for <strong>{setPasswordUser?.name}</strong> ({setPasswordUser?.email})
          </p>
          <div className="space-y-2">
            <Label htmlFor="set-password-new">{t("userManagement.newPassword") || "New Password"}</Label>
            <Input
              id="set-password-new"
              type="password"
              value={setPasswordForm.password}
              onChange={(e) => setSetPasswordForm({ ...setPasswordForm, password: e.target.value })}
              data-testid="set-password-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-password-confirm">{t("userManagement.confirmPassword") || "Confirm Password"}</Label>
            <Input
              id="set-password-confirm"
              type="password"
              value={setPasswordForm.confirmPassword}
              onChange={(e) => setSetPasswordForm({ ...setPasswordForm, confirmPassword: e.target.value })}
              data-testid="set-password-confirm-input"
            />
          </div>
          <p className="text-xs text-slate-500">
            {t("userManagement.passwordRequirements") || "Minimum 8 characters with uppercase, lowercase, number, and special character."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseSetPassword}>{t("common.cancel") || "Cancel"}</Button>
          <Button
            onClick={handleSubmitSetPassword}
            disabled={
              setPasswordMutation.isPending
              || !setPasswordForm.password
              || !setPasswordForm.confirmPassword
            }
            data-testid="set-password-submit"
          >
            {setPasswordMutation.isPending
              ? (t("userManagement.saving") || "Saving...")
              : setPasswordUser?.has_password
                ? (t("userManagement.setPassword") || "Set Password")
                : (t("userManagement.createPassword") || "Create Password")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );


  const viewProps = {
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
  };

  if (isMobile) {
    return <UserManagementMobileView {...viewProps} />;
  }

  return <UserManagementDesktopView {...viewProps} />;
}

