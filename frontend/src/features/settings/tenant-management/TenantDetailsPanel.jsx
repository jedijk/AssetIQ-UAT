import { useEffect, useState } from "react";
import { SettingsCard } from "../../../pages/SettingsPage";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import { TenantStatusBadge, formatDate } from "./tenantManagementShared";

export default function TenantDetailsPanel({ tenant, onUpdate, updating }) {
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (tenant?.status) setStatus(tenant.status);
  }, [tenant?.tenant_id, tenant?.status]);

  if (!tenant) {
    return (
      <SettingsCard title="Tenant details">
        <p className="text-sm text-muted-foreground">Select a tenant to view details.</p>
      </SettingsCard>
    );
  }

  const currentStatus = status || tenant.status;

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onUpdate({
      name: fd.get("name"),
      plan: fd.get("plan") || null,
      default_language: fd.get("default_language"),
      default_timezone: fd.get("default_timezone"),
      status: currentStatus,
      notes: fd.get("notes") || null,
    });
  };

  return (
    <SettingsCard title="Tenant details" description={tenant.slug} key={tenant.tenant_id}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <TenantStatusBadge status={tenant.status} />
          <span className="text-xs text-muted-foreground font-mono">{tenant.tenant_id}</span>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="detail-name">Name</Label>
          <Input id="detail-name" name="name" defaultValue={tenant.name} required key={`name-${tenant.tenant_id}`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="detail-plan">Plan</Label>
            <Input id="detail-plan" name="plan" defaultValue={tenant.plan || ""} key={`plan-${tenant.tenant_id}`} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="detail-status">Status</Label>
            <Select value={currentStatus} onValueChange={setStatus}>
              <SelectTrigger id="detail-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["active", "trial", "suspended", "archived"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="detail-lang">Language</Label>
            <Input id="detail-lang" name="default_language" defaultValue={tenant.default_language} key={`lang-${tenant.tenant_id}`} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="detail-tz">Timezone</Label>
            <Input id="detail-tz" name="default_timezone" defaultValue={tenant.default_timezone} key={`tz-${tenant.tenant_id}`} />
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <p><span className="text-muted-foreground">Primary admin:</span> {tenant.primary_admin?.name} ({tenant.primary_admin?.email})</p>
          <p><span className="text-muted-foreground">Created:</span> {formatDate(tenant.created_at)}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="detail-notes">Notes</Label>
          <Textarea id="detail-notes" name="notes" rows={2} defaultValue={tenant.notes || ""} key={`notes-${tenant.tenant_id}`} />
        </div>
        <Button type="submit" size="sm" disabled={updating}>{updating ? "Saving…" : "Save changes"}</Button>
      </form>
    </SettingsCard>
  );
}
