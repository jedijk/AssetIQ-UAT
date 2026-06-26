import { useEffect, useState } from "react";
import { SettingsCard } from "../../../pages/SettingsPage";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";

export default function TenantModulesCard({ tenant, modulesCatalog, onSave, updating }) {
  const [modules, setModules] = useState({});

  useEffect(() => {
    if (tenant?.modules) setModules({ ...tenant.modules });
  }, [tenant?.tenant_id, tenant?.modules]);

  if (!tenant) return null;

  const catalog = modulesCatalog?.length
    ? modulesCatalog
    : Object.entries(tenant.modules || {}).map(([key]) => ({ key, label: key }));

  return (
    <SettingsCard title="Module controls" description="Enable or disable product modules for this tenant">
      <div className="space-y-3">
        {catalog.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-4">
            <Label htmlFor={`tenant-mod-${m.key}`}>{m.label}</Label>
            <Switch
              id={`tenant-mod-${m.key}`}
              checked={Boolean(modules[m.key])}
              onCheckedChange={(v) => setModules((prev) => ({ ...prev, [m.key]: v }))}
            />
          </div>
        ))}
      </div>
      <Button
        className="mt-4"
        size="sm"
        disabled={updating}
        onClick={() => onSave(modules)}
      >
        {updating ? "Saving…" : "Save modules"}
      </Button>
    </SettingsCard>
  );
}
