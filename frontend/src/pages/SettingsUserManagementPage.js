import { getBackendUrl, getAuthHeaders } from '../lib/apiConfig';
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { formatDate as formatDateUtil } from "../lib/dateUtils";
import ImageEditor from "../components/ImageEditor";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import { usersAPI, equipmentHierarchyAPI, rbacAPI } from "../lib/api";
import {
  Users,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Wrench,
  Settings,
  UserCog,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  ChevronDown,
  MoreVertical,
  UserX,
  UserCheck,
  Edit,
  X,
  Check,
  Filter,
  RefreshCw,
  Camera,
  Upload,
  Trash2,
  AlertCircle,
  UserPlus,
  Bell,
  Factory,
  Crown,
  KeyRound,
  PlayCircle,
  ArrowLeft,
  Smartphone,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import SettingsPermissionsPage from "./SettingsPermissionsPage";

// Role icons mapping
const roleIcons = {
  owner: Crown,
  admin: ShieldAlert,
  reliability_engineer: ShieldCheck,
  maintenance: Wrench,
  operations: Settings,
  viewer: Eye,
};

// Role colors
const roleColors = {
  owner: "bg-purple-100 text-purple-800 border-purple-200",
  admin: "bg-red-100 text-red-800 border-red-200",
  reliability_engineer: "bg-blue-100 text-blue-800 border-blue-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  operations: "bg-green-100 text-green-800 border-green-200",
  viewer: "bg-slate-100 text-slate-800 border-slate-200",
};

// Helper component for user avatars with proper fallback
const UserAvatar = ({ user, avatarUrl, size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-lg",
    xl: "h-16 w-16 text-xl"
  };
  
  const initials = user?.name?.charAt(0)?.toUpperCase() || "U";
  
  return (
    <Avatar className={`${sizeClasses[size]} border-2 border-white shadow-sm ${className}`}>
      {avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={user?.name || "User"} 
          className="object-cover"
        />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};

const SettingsUserManagementPage = () => {
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
  
  // Tab state for Users / Permissions
  const [activeTab, setActiveTab] = useState("users");

  // Queries
  const { data: usersData, isLoading: usersLoading, refetch } = useQuery({
    queryKey: ["rbac-users", search, roleFilter],
    queryFn: () => rbacAPI.getUsers({
      search: search || undefined,
      role: roleFilter !== "all" ? roleFilter : undefined
    })
  });
  
  // Pending users query
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ["pending-users"],
    queryFn: rbacAPI.getPendingUsers,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      toast.success("Role updated successfully");
      setChangeRoleUser(null);
    },
    onError: () => toast.error("Failed to update role")
  });

  const updateStatusMutation = useMutation({
    mutationFn: rbacAPI.updateUserStatus,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
      toast.success(data.is_active ? "User activated" : "User deactivated");
    },
    onError: () => toast.error("Failed to update status")
  });

  const updateProfileMutation = useMutation({
    mutationFn: rbacAPI.updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rbac-users"] });
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

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return formatDateUtil(dateStr);
  };

  // Mobile Layout
  if (isMobile) {
    return (
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
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No users found</p>
            </div>
          ) : (
            users.map((user) => {
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
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">{user.name}</span>
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
                        <DropdownMenuItem 
                          onClick={() => {
                            const newVal = !user.default_simple_mode;
                            updateProfileMutation.mutate({ userId: user.id, data: { default_simple_mode: newVal } });
                            toast.success(`Simple Mode default ${newVal ? "enabled" : "disabled"} for ${user.name}`);
                          }}
                        >
                          <Smartphone className="w-4 h-4 mr-2" /> 
                          Default Simple Mode
                          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded ${user.default_simple_mode ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                            {user.default_simple_mode ? "ON" : "OFF"}
                          </span>
                        </DropdownMenuItem>
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

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  // Desktop Layout
  return (
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
      ) : users.length === 0 ? (
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
                {users.map((user) => {
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
                            <div className="font-medium text-slate-900">{user.name}</div>
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
                            <DropdownMenuItem 
                              onClick={() => {
                                const newVal = !user.default_simple_mode;
                                updateProfileMutation.mutate({ userId: user.id, data: { default_simple_mode: newVal } });
                                toast.success(`Simple Mode default ${newVal ? "enabled" : "disabled"} for ${user.name}`);
                              }}
                            >
                              <Smartphone className="w-4 h-4 mr-2" /> 
                              Default Simple Mode
                              <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded ${user.default_simple_mode ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                                {user.default_simple_mode ? "ON" : "OFF"}
                              </span>
                            </DropdownMenuItem>
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
  );
};

export default SettingsUserManagementPage;
