import { SettingsCard } from "../../../pages/SettingsPage";
import { Button } from "../../../components/ui/button";

export default function TenantDangerZone({
  tenant,
  onSuspend,
  onReactivate,
  onArchive,
  loading,
}) {
  if (!tenant) return null;

  const isSuspended = tenant.status === "suspended";
  const isArchived = tenant.status === "archived";
  const isActive = tenant.status === "active" || tenant.status === "trial";

  return (
    <SettingsCard
      title="Danger zone"
      description="Suspend, reactivate, or archive tenants. Data is preserved; hard delete is not available."
    >
      <div className="flex flex-wrap gap-2">
        {isActive && (
          <Button variant="destructive" size="sm" disabled={loading} onClick={() => onSuspend(tenant.tenant_id)}>
            Suspend tenant
          </Button>
        )}
        {isSuspended && (
          <Button size="sm" disabled={loading} onClick={() => onReactivate(tenant.tenant_id)}>
            Reactivate tenant
          </Button>
        )}
        {!isArchived && (
          <Button variant="outline" size="sm" disabled={loading} onClick={() => {
            if (window.confirm("Archive this tenant? Users will not be able to log in.")) {
              onArchive(tenant.tenant_id);
            }
          }}>
            Archive tenant
          </Button>
        )}
      </div>
      {isArchived && (
        <p className="text-sm text-muted-foreground mt-2">This tenant is archived and hidden from active lists.</p>
      )}
    </SettingsCard>
  );
}
