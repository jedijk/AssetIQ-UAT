import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
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
} from "lucide-react";
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

// Get base URL without /api suffix
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// Role icons mapping
const roleIcons = {
  admin: ShieldAlert,
  reliability_engineer: ShieldCheck,
  maintenance: Wrench,
  operations: Settings,
  viewer: Eye,
};

// Role colors
const roleColors = {
  admin: "bg-red-100 text-red-800 border-red-200",
  reliability_engineer: "bg-blue-100 text-blue-800 border-blue-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  operations: "bg-green-100 text-green-800 border-green-200",
  viewer: "bg-slate-100 text-slate-800 border-slate-200",
};

// API functions
const rbacAPI = {
  getUsers: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append("search", params.search);
    if (params.role) queryParams.append("role", params.role);
    if (params.is_active !== undefined) queryParams.append("is_active", params.is_active);
    
    const response = await fetch(`${API_BASE_URL}/api/rbac/users?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },
  
  getRoles: async () => {
    const response = await fetch(`${API_BASE_URL}/api/rbac/roles`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch roles");
    return response.json();
  },
  
  updateUserRole: async ({ userId, role }) => {
    const response = await fetch(`${API_BASE_URL}/api/rbac/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ role })
    });
    if (!response.ok) throw new Error("Failed to update role");
    return response.json();
  },
  
  updateUserStatus: async ({ userId, isActive }) => {
    const response = await fetch(`${API_BASE_URL}/api/rbac/users/${userId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ is_active: isActive })
    });
    if (!response.ok) throw new Error("Failed to update status");
    return response.json();
  },
  
  updateUserProfile: async ({ userId, data }) => {
    const response = await fetch(`${API_BASE_URL}/api/rbac/users/${userId}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Failed to update profile");
    return response.json();
  }
};

const SettingsUserManagementPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  // State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [changeRoleUser, setChangeRoleUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");

  // Queries
  const { data: usersData, isLoading: usersLoading, refetch } = useQuery({
    queryKey: ["rbac-users", search, roleFilter],
    queryFn: () => rbacAPI.getUsers({
      search: search || undefined,
      role: roleFilter !== "all" ? roleFilter : undefined
    })
  });

  const { data: rolesData } = useQuery({
    queryKey: ["rbac-roles"],
    queryFn: rbacAPI.getRoles
  });

  // Mutations
  const updateRoleMutation = useMutation({
    mutationFn: rbacAPI.updateUserRole,
    onSuccess: () => {
      queryClient.invalidateQueries(["rbac-users"]);
      toast.success("Role updated successfully");
      setChangeRoleUser(null);
    },
    onError: () => toast.error("Failed to update role")
  });

  const updateStatusMutation = useMutation({
    mutationFn: rbacAPI.updateUserStatus,
    onSuccess: (data) => {
      queryClient.invalidateQueries(["rbac-users"]);
      toast.success(data.is_active ? "User activated" : "User deactivated");
    },
    onError: () => toast.error("Failed to update status")
  });

  const updateProfileMutation = useMutation({
    mutationFn: rbacAPI.updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries(["rbac-users"]);
      toast.success("Profile updated successfully");
      setEditingUser(null);
    },
    onError: () => toast.error("Failed to update profile")
  });

  const users = usersData?.users || [];
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
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

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
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Role Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 hidden md:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 hidden lg:table-cell">Last Login</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const RoleIcon = roleIcons[user.role] || Shield;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50" data-testid={`user-row-${user.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                            {user.name?.charAt(0)?.toUpperCase() || "U"}
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
                        <span className="text-sm text-slate-600">
                          {user.department || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
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
                            <DropdownMenuItem onClick={() => handleEditProfile(user)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangeRole(user)}>
                              <UserCog className="w-4 h-4 mr-2" /> Change Role
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
            <div>
              <Label>{t("userManagement.phone")}</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+31..."
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
    </div>
  );
};

export default SettingsUserManagementPage;
