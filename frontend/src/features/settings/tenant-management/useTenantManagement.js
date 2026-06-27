import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tenantManagementAPI } from "../../../lib/apis/tenantManagement";

const TENANTS_KEY = ["tenant-management", "tenants"];

export function useTenantManagement(selectedTenantId) {
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: [...TENANTS_KEY, includeArchived],
    queryFn: () => tenantManagementAPI.listTenants({ include_archived: includeArchived }),
  });

  const modulesQuery = useQuery({
    queryKey: ["tenant-management", "modules-catalog"],
    queryFn: () => tenantManagementAPI.getModulesCatalog(),
  });

  const tenantQuery = useQuery({
    queryKey: ["tenant-management", "tenant", selectedTenantId],
    queryFn: () => tenantManagementAPI.getTenant(selectedTenantId),
    enabled: Boolean(selectedTenantId),
  });

  const healthQuery = useQuery({
    queryKey: ["tenant-management", "health", selectedTenantId],
    queryFn: () => tenantManagementAPI.getTenantHealth(selectedTenantId),
    enabled: Boolean(selectedTenantId),
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: TENANTS_KEY });
    if (selectedTenantId) {
      queryClient.invalidateQueries({ queryKey: ["tenant-management", "tenant", selectedTenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenant-management", "health", selectedTenantId] });
    }
  }, [queryClient, selectedTenantId]);

  const createMutation = useMutation({
    mutationFn: tenantManagementAPI.createTenant,
    onSuccess: () => {
      toast.success("Tenant created");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ tenantId, payload }) => tenantManagementAPI.updateTenant(tenantId, payload),
    onSuccess: () => {
      toast.success("Tenant updated");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: tenantManagementAPI.suspendTenant,
    onSuccess: () => { toast.success("Tenant suspended"); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: tenantManagementAPI.reactivateTenant,
    onSuccess: () => { toast.success("Tenant reactivated"); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: tenantManagementAPI.archiveTenant,
    onSuccess: () => { toast.success("Tenant archived"); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const modulesMutation = useMutation({
    mutationFn: ({ tenantId, modules }) => tenantManagementAPI.updateModules(tenantId, modules),
    onSuccess: () => { toast.success("Modules updated"); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const aiMutation = useMutation({
    mutationFn: ({ tenantId, payload }) => tenantManagementAPI.updateAISettings(tenantId, payload),
    onSuccess: () => { toast.success("AI settings updated"); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const validateMutation = useMutation({
    mutationFn: tenantManagementAPI.validateTenant,
    onSuccess: (data) => {
      toast.success(`Validation complete: ${data.overall}`);
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  const registerMutation = useMutation({
    mutationFn: tenantManagementAPI.registerTenant,
    onSuccess: () => {
      toast.success("Tenant registered in registry");
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message),
  });

  return {
    tenants: tenantsQuery.data?.tenants || [],
    tenantsLoading: tenantsQuery.isLoading,
    includeArchived,
    setIncludeArchived,
    modulesCatalog: modulesQuery.data?.modules || [],
    selectedTenant: tenantQuery.data?.tenant,
    tenantLoading: tenantQuery.isLoading,
    health: healthQuery.data,
    healthLoading: healthQuery.isLoading,
    createTenant: createMutation.mutateAsync,
    creating: createMutation.isPending,
    updateTenant: updateMutation.mutateAsync,
    updating: updateMutation.isPending,
    suspendTenant: suspendMutation.mutateAsync,
    reactivateTenant: reactivateMutation.mutateAsync,
    archiveTenant: archiveMutation.mutateAsync,
    statusChanging: suspendMutation.isPending || reactivateMutation.isPending || archiveMutation.isPending,
    updateModules: modulesMutation.mutateAsync,
    modulesUpdating: modulesMutation.isPending,
    updateAISettings: aiMutation.mutateAsync,
    aiUpdating: aiMutation.isPending,
    validateTenant: validateMutation.mutateAsync,
    validating: validateMutation.isPending,
    validationResult: validateMutation.data,
    registerTenant: registerMutation.mutateAsync,
    registering: registerMutation.isPending,
    refetchHealth: healthQuery.refetch,
  };
}
