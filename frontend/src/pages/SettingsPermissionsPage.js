import { useState } from "react";
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
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
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

export default function SettingsPermissionsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState("admin");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Mobile detection
  useState(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  });

  // Fetch permissions
  const { data: permissionsData, isLoading, error } = useQuery({
    queryKey: ["permissions"],
    queryFn: permissionsAPI.getAll,
    retry: 1,
  });

  // Update permission mutation
  const updateMutation = useMutation({
    mutationFn: permissionsAPI.patchPermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      toast.success("Permission updated");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to update permission");
    },
  });

  // Reset permissions mutation
  const resetMutation = useMutation({
    mutationFn: permissionsAPI.reset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
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

  // Show mobile message
  if (isMobile) {
    return <DesktopOnlyMessage title="Permissions Management" icon={Shield} />;
  }

  // Check if user is owner
  if (user?.role !== "owner") {
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
          <TabsList className="bg-white border border-slate-200 p-1 h-auto flex-wrap mb-6">
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
                  <span>{config?.label || role}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

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
          {roles?.filter(r => r !== "owner").map((role) => (
            <TabsContent key={role} value={role} className="mt-0">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${ROLE_CONFIG[role]?.bgColor || 'bg-slate-100'}`}>
                        <RoleIcon className={`w-5 h-5 ${ROLE_CONFIG[role]?.color || 'text-slate-600'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{ROLE_CONFIG[role]?.label || role}</CardTitle>
                        <CardDescription>Configure what this role can do</CardDescription>
                      </div>
                    </div>
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
          ))}
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
    </div>
  );
}
