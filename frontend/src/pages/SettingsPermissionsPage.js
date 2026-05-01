import { useState } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { permissionsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Wrench,
  Settings,
  Crown,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Lock,
  Pencil,
  Trash2,
  FileText,
  Building2,
  MessageSquare,
  Users,
  ClipboardList,
  Target,
  Library,
  Loader2,
  Plus,
  UserPlus,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import BackButton from "../components/BackButton";

// Role icons and colors
const ROLE_CONFIG = {
  owner: { icon: Crown, color: "text-amber-600", bgColor: "bg-amber-50", label: "Owner" },
  admin: { icon: ShieldAlert, color: "text-red-600", bgColor: "bg-red-50", label: "Admin" },
  reliability_engineer: { icon: ShieldCheck, color: "text-blue-600", bgColor: "bg-blue-50", label: "Reliability Engineer" },
  maintenance: { icon: Wrench, color: "text-green-600", bgColor: "bg-green-50", label: "Maintenance" },
  operations: { icon: Settings, color: "text-purple-600", bgColor: "bg-purple-50", label: "Operations" },
  viewer: { icon: Eye, color: "text-slate-600", bgColor: "bg-slate-50", label: "Viewer" },
};

// Feature icons
const FEATURE_ICONS = {
  observations: Target,
  investigations: FileText,
  actions: ClipboardList,
  tasks: ClipboardList,
  forms: FileText,
  equipment: Building2,
  library: Library,
  feedback: MessageSquare,
  users: Users,
  settings: Settings,
};

export default function SettingsPermissionsPage({ embedded = false }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState("admin");
  const isMobile = useIsMobile();
  const [showCreateRoleDialog, setShowCreateRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", display_name: "", description: "", base_role: "viewer" });
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState(null);

  // Fetch permissions
  const { data: permissionsData, isLoading, error, refetch } = useQuery({
    queryKey: ["permissions"],
    queryFn: permissionsAPI.getAll,
    retry: 1,
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
  });

  // Update permission mutation
  const updateMutation = useMutation({
    mutationFn: permissionsAPI.patchPermission,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["permissions"] });
      await refetch();
      toast.success("Permission updated");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to update permission");
    },
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: permissionsAPI.createRole,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["permissions"] });
      await refetch();
      toast.success(data.message || "Role created successfully");
      setShowCreateRoleDialog(false);
      setNewRole({ name: "", display_name: "", description: "", base_role: "viewer" });
      // Select the newly created role
      if (data.role?.name) {
        setSelectedRole(data.role.name);
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to create role");
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: permissionsAPI.deleteRole,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["permissions"] });
      await refetch();
      toast.success("Role deleted");
      setSelectedRole("admin");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to delete role");
    },
  });

  // Reset permissions mutation
  const resetMutation = useMutation({
    mutationFn: permissionsAPI.reset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["permissions"] });
      await refetch();
      toast.success("Permissions reset to defaults");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to reset permissions");
    },
  });

  const handleTogglePermission = (role, feature, action, currentValue) => {
    updateMutation.mutate({
      role,
      feature,
      [action]: !currentValue,
    });
  };

  // Show mobile message (skip if embedded - parent handles this)
  if (isMobile && !embedded) {
    return <DesktopOnlyMessage title="Permissions Management" icon={Shield} />;
  }

  // Check if user is owner (skip if embedded - parent handles role check)
  if (user?.role !== "owner" && !embedded) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Lock className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">Access Restricted</h2>
        <p className="text-slate-500">Only owners can manage permissions.</p>
        <BackButton className="mt-4" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">Error Loading Permissions</h2>
        <p className="text-slate-500">{error.message}</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["permissions"] })} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const { permissions, features, roles } = permissionsData || {};
  const roleConfig = ROLE_CONFIG[selectedRole] || ROLE_CONFIG.viewer;
  const RoleIcon = roleConfig.icon;

  // Embedded layout (inside User Management tab)
  if (embedded) {
    return (
      <div className="space-y-6" data-testid="permissions-embedded">
        {/* Quick Header with Reset */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Role Permissions</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCreateRoleDialog(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Role
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700">
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset All Permissions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset all role permissions to their default values.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-amber-600 hover:bg-amber-700"
                    disabled={resetMutation.isPending}
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Role Selector */}
        <div className="flex flex-wrap gap-2">
          {(() => {
            // Handle both array and object formats for roles
            let roleEntries = [];
            if (Array.isArray(roles)) {
              // roles is an array of role names like ['admin', 'viewer', ...]
              roleEntries = roles.map(roleKey => [roleKey, ROLE_CONFIG[roleKey] || { name: roleKey }]);
            } else if (roles && typeof roles === 'object') {
              // roles is an object like { admin: { name: 'Admin', ... } }
              roleEntries = Object.entries(roles);
            } else {
              // fallback to ROLE_CONFIG
              roleEntries = Object.entries(ROLE_CONFIG);
            }
            
            return roleEntries.map(([roleKey, roleInfo]) => {
              const Icon = ROLE_CONFIG[roleKey]?.icon || Shield;
              const isCustom = roleInfo?.is_custom;
              const displayName = ROLE_CONFIG[roleKey]?.label || roleInfo?.display_name || roleInfo?.name || roleKey;
              return (
                <Button
                  key={roleKey}
                  variant={selectedRole === roleKey ? "default" : "outline"}
                  size="sm"
                  className={selectedRole === roleKey ? "" : "text-slate-600"}
                  onClick={() => setSelectedRole(roleKey)}
                >
                  <Icon className="w-4 h-4 mr-1" />
                  {displayName}
                  {isCustom && <Badge variant="secondary" className="ml-2 text-[10px] px-1">Custom</Badge>}
                </Button>
              );
            });
          })()}
        </div>

        {/* Permission Matrix */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <RoleIcon className={`w-5 h-5 ${roleConfig.color}`} />
                {roles?.[selectedRole]?.display_name || selectedRole} Permissions
              </CardTitle>
              {roles?.[selectedRole]?.is_custom && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete Role
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Custom Role?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the "{roles?.[selectedRole]?.display_name}" role.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteRoleMutation.mutate(selectedRole)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            {roles?.[selectedRole]?.description && (
              <CardDescription>{roles[selectedRole].description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="text-left py-2 px-3 font-medium text-slate-600">Feature</th>
                    <th className="text-center py-2 px-3 font-medium text-slate-600 w-20">
                      <div className="flex items-center justify-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        Read
                      </div>
                    </th>
                    <th className="text-center py-2 px-3 font-medium text-slate-600 w-20">
                      <div className="flex items-center justify-center gap-1">
                        <Pencil className="w-3.5 h-3.5" />
                        Write
                      </div>
                    </th>
                    <th className="text-center py-2 px-3 font-medium text-slate-600 w-20">
                      <div className="flex items-center justify-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Handle both array and object formats for features
                    let featureEntries = [];
                    if (features && typeof features === 'object' && !Array.isArray(features)) {
                      // features is an object like { observations: { name: 'Observations', description: '...' } }
                      featureEntries = Object.entries(features);
                    } else if (Array.isArray(features) && features.length > 0) {
                      // features is an array of feature keys
                      featureEntries = features.map(f => [f, { name: f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }]);
                    } else {
                      // fallback to FEATURE_ICONS keys
                      featureEntries = Object.keys(FEATURE_ICONS).map(f => [f, { name: f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }]);
                    }
                    
                    return featureEntries.map(([featureKey, featureInfo], idx) => {
                      const Icon = FEATURE_ICONS[featureKey] || FileText;
                      const perm = permissions?.[selectedRole]?.[featureKey] || {};
                      const displayName = featureInfo?.name || featureKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                      return (
                        <tr key={featureKey} className={idx % 2 === 0 ? "" : "bg-slate-50/50"}>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-slate-400" />
                              <span>{displayName}</span>
                            </div>
                          </td>
                        <td className="text-center py-2 px-3">
                          <Switch
                            checked={perm.read !== false}
                            onCheckedChange={() => handleTogglePermission(selectedRole, featureKey, "read", perm.read !== false)}
                            disabled={updateMutation.isPending || selectedRole === "owner"}
                          />
                        </td>
                        <td className="text-center py-2 px-3">
                          <Switch
                            checked={perm.write || false}
                            onCheckedChange={() => handleTogglePermission(selectedRole, featureKey, "write", perm.write)}
                            disabled={updateMutation.isPending || selectedRole === "owner"}
                          />
                        </td>
                        <td className="text-center py-2 px-3">
                          <Switch
                            checked={perm.delete || false}
                            onCheckedChange={() => handleTogglePermission(selectedRole, featureKey, "delete", perm.delete)}
                            disabled={updateMutation.isPending || selectedRole === "owner"}
                          />
                        </td>
                      </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Create Role Dialog */}
        <Dialog open={showCreateRoleDialog} onOpenChange={setShowCreateRoleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Custom Role</DialogTitle>
              <DialogDescription>
                Create a new role with custom permissions based on an existing role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name (ID)</Label>
                <Input
                  id="role-name"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="e.g., senior_engineer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-display">Display Name</Label>
                <Input
                  id="role-display"
                  value={newRole.display_name}
                  onChange={(e) => setNewRole({ ...newRole, display_name: e.target.value })}
                  placeholder="e.g., Senior Engineer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-desc">Description</Label>
                <Textarea
                  id="role-desc"
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="Role description..."
                />
              </div>
              <div className="space-y-2">
                <Label>Base Permissions From</Label>
                <Select value={newRole.base_role} onValueChange={(v) => setNewRole({ ...newRole, base_role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_CONFIG).filter(([k]) => k !== "owner").map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateRoleDialog(false)}>Cancel</Button>
              <Button onClick={() => createRoleMutation.mutate(newRole)} disabled={!newRole.name || !newRole.display_name || createRoleMutation.isPending}>
                {createRoleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton />
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="w-6 h-6 text-blue-600" />
                  <h1 className="text-xl font-bold text-slate-900">Permissions Management</h1>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Configure read, write, and delete permissions for each role</p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset to Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset All Permissions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset all role permissions to their default values. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-amber-600 hover:bg-amber-700"
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Reset Permissions
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={selectedRole} onValueChange={setSelectedRole} className="w-full">
          {/* Role Tabs */}
          <div className="flex items-center gap-3 mb-6">
            <TabsList className="bg-white border border-slate-200 p-1 h-auto flex-wrap flex-1">
              {roles?.filter(r => r !== "owner").map((role) => {
                const config = ROLE_CONFIG[role];
                const Icon = config?.icon || Eye;
                return (
                  <TabsTrigger
                    key={role}
                    value={role}
                    className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-slate-100"
                    data-testid={`role-tab-${role}`}
                  >
                    <Icon className={`w-4 h-4 ${config?.color || 'text-slate-600'}`} />
                    <span>{config?.label || role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <Button
              onClick={() => setShowCreateRoleDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
              data-testid="create-role-btn"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Role
            </Button>
          </div>

          {/* Owner Info Card */}
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Crown className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-900">Owner permissions cannot be modified</p>
                  <p className="text-xs text-amber-700">Owners always have full access to all features.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permissions Grid */}
          {roles?.filter(r => r !== "owner").map((role) => {
            const isCustomRole = !["admin", "reliability_engineer", "maintenance", "operations", "viewer"].includes(role);
            return (
            <TabsContent key={role} value={role} className="mt-0">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${ROLE_CONFIG[role]?.bgColor || 'bg-slate-100'}`}>
                        <RoleIcon className={`w-5 h-5 ${ROLE_CONFIG[role]?.color || 'text-slate-600'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {ROLE_CONFIG[role]?.label || role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          {isCustomRole && (
                            <Badge variant="secondary" className="text-xs">Custom</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>Configure what this role can do</CardDescription>
                      </div>
                    </div>
                    {isCustomRole && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteRoleConfirm(role)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        data-testid={`delete-role-${role}-btn`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Role
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-3 px-4 font-medium text-slate-600">Feature</th>
                          <th className="text-center py-3 px-4 font-medium text-slate-600 w-32">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="flex items-center justify-center gap-1 w-full">
                                  <Eye className="w-4 h-4" />
                                  <span>Read</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Can view and access this feature</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </th>
                          <th className="text-center py-3 px-4 font-medium text-slate-600 w-32">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="flex items-center justify-center gap-1 w-full">
                                  <Pencil className="w-4 h-4" />
                                  <span>Write</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Can create and edit items</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </th>
                          <th className="text-center py-3 px-4 font-medium text-slate-600 w-32">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="flex items-center justify-center gap-1 w-full">
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Can permanently remove items</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(features || {}).map(([featureKey, featureInfo]) => {
                          const rolePerms = permissions?.[role]?.[featureKey] || { read: false, write: false, delete: false };
                          const FeatureIcon = FEATURE_ICONS[featureKey] || FileText;
                          
                          return (
                            <tr key={featureKey} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  <FeatureIcon className="w-5 h-5 text-slate-400" />
                                  <div>
                                    <p className="font-medium text-slate-900">{featureInfo.name}</p>
                                    <p className="text-xs text-slate-500">{featureInfo.description}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <div className="flex justify-center">
                                  <Switch
                                    checked={rolePerms.read}
                                    onCheckedChange={() => handleTogglePermission(role, featureKey, 'read', rolePerms.read)}
                                    disabled={updateMutation.isPending}
                                    data-testid={`perm-${role}-${featureKey}-read`}
                                  />
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <div className="flex justify-center">
                                  <Switch
                                    checked={rolePerms.write}
                                    onCheckedChange={() => handleTogglePermission(role, featureKey, 'write', rolePerms.write)}
                                    disabled={updateMutation.isPending || !rolePerms.read}
                                    data-testid={`perm-${role}-${featureKey}-write`}
                                  />
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <div className="flex justify-center">
                                  <Switch
                                    checked={rolePerms.delete}
                                    onCheckedChange={() => handleTogglePermission(role, featureKey, 'delete', rolePerms.delete)}
                                    disabled={updateMutation.isPending || !rolePerms.write}
                                    data-testid={`perm-${role}-${featureKey}-delete`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            );
          })}
        </Tabs>

        {/* Legend */}
        <div className="mt-6 p-4 bg-white rounded-lg border border-slate-200">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Permission Hierarchy</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Check className="w-3 h-3 mr-1" /> Read
              </Badge>
              <span className="text-slate-500">Can view feature</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <Pencil className="w-3 h-3 mr-1" /> Write
              </Badge>
              <span className="text-slate-500">Requires Read permission</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Badge>
              <span className="text-slate-500">Requires Write permission</span>
            </div>
          </div>
        </div>
      </div>

      {/* Create Role Dialog */}
      <Dialog open={showCreateRoleDialog} onOpenChange={setShowCreateRoleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Create Custom Role
            </DialogTitle>
            <DialogDescription>
              Define a new role with custom permissions. Start from an existing role's permissions as a template.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Role Name (internal identifier) */}
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name (internal)</Label>
              <Input
                id="role-name"
                placeholder="e.g., technician, supervisor"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                className="lowercase"
                data-testid="role-name-input"
              />
              <p className="text-xs text-slate-500">Used internally. Lowercase, underscores instead of spaces.</p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                placeholder="e.g., Field Technician"
                value={newRole.display_name}
                onChange={(e) => setNewRole({ ...newRole, display_name: e.target.value })}
                data-testid="role-display-name-input"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What is this role responsible for?"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                rows={2}
                data-testid="role-description-input"
              />
            </div>

            {/* Base Role */}
            <div className="space-y-2">
              <Label>Copy Permissions From</Label>
              <Select 
                value={newRole.base_role} 
                onValueChange={(value) => setNewRole({ ...newRole, base_role: value })}
              >
                <SelectTrigger data-testid="base-role-select">
                  <SelectValue placeholder="Select a base role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-slate-600" />
                      Viewer (Read-only)
                    </div>
                  </SelectItem>
                  <SelectItem value="operations">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-purple-600" />
                      Operations
                    </div>
                  </SelectItem>
                  <SelectItem value="maintenance">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-green-600" />
                      Maintenance
                    </div>
                  </SelectItem>
                  <SelectItem value="reliability_engineer">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Reliability Engineer
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                      Admin
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">The new role will start with these permissions. You can modify them after creation.</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateRoleDialog(false);
                setNewRole({ name: "", display_name: "", description: "", base_role: "viewer" });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createRoleMutation.mutate(newRole)}
              disabled={!newRole.name || !newRole.display_name || createRoleMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="submit-create-role-btn"
            >
              {createRoleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation */}
      <AlertDialog open={!!deleteRoleConfirm} onOpenChange={(open) => !open && setDeleteRoleConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the role "{deleteRoleConfirm}". Make sure no users are assigned to this role before deleting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteRoleMutation.mutate(deleteRoleConfirm);
                setDeleteRoleConfirm(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteRoleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
