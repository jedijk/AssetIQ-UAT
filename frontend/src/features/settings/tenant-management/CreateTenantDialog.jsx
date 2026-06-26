import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Switch } from "../../../components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";

const EMPTY = {
  name: "",
  slug: "",
  primary_admin_name: "",
  primary_admin_email: "",
  default_language: "en",
  default_timezone: "UTC",
  plan: "",
  site_name: "",
  installation_name: "",
  notes: "",
  ai_enabled: true,
  return_temp_password: true,
};

export default function CreateTenantDialog({ open, onOpenChange, onSubmit, creating, modulesCatalog }) {
  const [form, setForm] = useState(EMPTY);
  const [modules, setModules] = useState({});

  const reset = () => {
    setForm(EMPTY);
    setModules({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      plan: form.plan || undefined,
      site_name: form.site_name || undefined,
      installation_name: form.installation_name || undefined,
      notes: form.notes || undefined,
      modules: Object.keys(modules).length ? modules : undefined,
    };
    const result = await onSubmit(payload);
    if (result?.tenant?.primary_admin_temp_password) {
      window.alert(`Tenant created. Temporary admin password: ${result.tenant.primary_admin_temp_password}`);
    }
    reset();
    onOpenChange(false);
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create tenant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Tenant name *</Label>
            <Input id="name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug *</Label>
            <Input id="slug" placeholder="auto from name" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="admin_name">Primary admin name *</Label>
              <Input id="admin_name" required value={form.primary_admin_name} onChange={(e) => set("primary_admin_name", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin_email">Primary admin email *</Label>
              <Input id="admin_email" type="email" required value={form.primary_admin_email} onChange={(e) => set("primary_admin_email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="language">Default language *</Label>
              <Input id="language" required value={form.default_language} onChange={(e) => set("default_language", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="timezone">Default timezone *</Label>
              <Input id="timezone" required value={form.default_timezone} onChange={(e) => set("default_timezone", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan">Plan</Label>
            <Input id="plan" value={form.plan} onChange={(e) => set("plan", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="site">Site name</Label>
              <Input id="site" value={form.site_name} onChange={(e) => set("site_name", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="installation">Installation name</Label>
              <Input id="installation" value={form.installation_name} onChange={(e) => set("installation_name", e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ai" checked={form.ai_enabled} onCheckedChange={(v) => set("ai_enabled", v)} />
            <Label htmlFor="ai">AI enabled</Label>
          </div>
          {modulesCatalog?.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Modules</p>
              {modulesCatalog.map((m) => (
                <div key={m.key} className="flex items-center justify-between">
                  <Label htmlFor={`mod-${m.key}`}>{m.label}</Label>
                  <Switch
                    id={`mod-${m.key}`}
                    checked={modules[m.key] ?? true}
                    onCheckedChange={(v) => setModules((prev) => ({ ...prev, [m.key]: v }))}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create tenant"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
