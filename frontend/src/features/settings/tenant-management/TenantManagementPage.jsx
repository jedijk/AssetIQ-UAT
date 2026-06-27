import { useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { SettingsSection } from "../../../pages/SettingsPage";
import { useTenantManagement } from "./useTenantManagement";
import TenantList from "./TenantList";
import CreateTenantDialog from "./CreateTenantDialog";
import TenantDetailsPanel from "./TenantDetailsPanel";
import TenantModulesCard from "./TenantModulesCard";
import TenantAISettingsCard from "./TenantAISettingsCard";
import TenantHealthCard from "./TenantHealthCard";
import TenantDangerZone from "./TenantDangerZone";

export default function TenantManagementPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const tm = useTenantManagement(selectedTenantId);

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-slate-500">Owner access required</p>
      </div>
    );
  }

  const handleCreate = async (payload) => {
    const result = await tm.createTenant(payload);
    if (result?.tenant?.tenant_id) setSelectedTenantId(result.tenant.tenant_id);
    return result;
  };

  return (
    <SettingsSection
      title="Tenant Management"
      description="Platform admin for customer tenants — create, configure, and monitor organizations."
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TenantList
            tenants={tm.tenants}
            loading={tm.tenantsLoading}
            selectedTenantId={selectedTenantId}
            onSelect={setSelectedTenantId}
            includeArchived={tm.includeArchived}
            onIncludeArchivedChange={tm.setIncludeArchived}
            onCreateClick={() => setCreateOpen(true)}
          />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <TenantDetailsPanel
            tenant={tm.selectedTenant}
            updating={tm.updating}
            registering={tm.registering}
            onRegister={() => tm.registerTenant(selectedTenantId)}
            onUpdate={(payload) => tm.updateTenant({ tenantId: selectedTenantId, payload })}
          />
          <TenantModulesCard
            tenant={tm.selectedTenant}
            modulesCatalog={tm.modulesCatalog}
            updating={tm.modulesUpdating}
            onSave={(modules) => tm.updateModules({ tenantId: selectedTenantId, modules })}
          />
          <TenantAISettingsCard
            tenant={tm.selectedTenant}
            updating={tm.aiUpdating}
            onSave={(payload) => tm.updateAISettings({ tenantId: selectedTenantId, payload })}
          />
          <TenantHealthCard
            tenant={tm.selectedTenant}
            health={tm.health}
            healthLoading={tm.healthLoading}
            onValidate={() => tm.validateTenant(selectedTenantId)}
            validating={tm.validating}
            validationResult={tm.validationResult}
          />
          <TenantDangerZone
            tenant={tm.selectedTenant}
            loading={tm.statusChanging}
            onSuspend={tm.suspendTenant}
            onReactivate={tm.reactivateTenant}
            onArchive={tm.archiveTenant}
          />
        </div>
      </div>

      <CreateTenantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        creating={tm.creating}
        modulesCatalog={tm.modulesCatalog}
      />
    </SettingsSection>
  );
}
