import { useEffect, useState } from "react";
import { SettingsCard } from "../../../pages/SettingsPage";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";

export default function TenantAISettingsCard({ tenant, onSave, updating }) {
  const [settings, setSettings] = useState({ enabled: true, monthly_budget_usd: "", risk_analysis_enabled: true, copilot_enabled: true });

  useEffect(() => {
    if (tenant?.ai_settings) {
      setSettings({
        enabled: tenant.ai_settings.enabled ?? true,
        monthly_budget_usd: tenant.ai_settings.monthly_budget_usd ?? "",
        risk_analysis_enabled: tenant.ai_settings.risk_analysis_enabled ?? true,
        copilot_enabled: tenant.ai_settings.copilot_enabled ?? true,
      });
    }
  }, [tenant?.tenant_id, tenant?.ai_settings]);

  if (!tenant) return null;

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  return (
    <SettingsCard title="AI controls" description="Per-tenant AI feature toggles and budget">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="ai-enabled">AI enabled</Label>
          <Switch id="ai-enabled" checked={settings.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai-budget">Monthly budget (USD)</Label>
          <Input
            id="ai-budget"
            type="number"
            min="0"
            placeholder="No limit"
            value={settings.monthly_budget_usd}
            onChange={(e) => set("monthly_budget_usd", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="ai-risk">AI Risk Analysis</Label>
          <Switch id="ai-risk" checked={settings.risk_analysis_enabled} onCheckedChange={(v) => set("risk_analysis_enabled", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="ai-copilot">RIL Copilot</Label>
          <Switch id="ai-copilot" checked={settings.copilot_enabled} onCheckedChange={(v) => set("copilot_enabled", v)} />
        </div>
      </div>
      <Button
        className="mt-4"
        size="sm"
        disabled={updating}
        onClick={() => onSave({
          enabled: settings.enabled,
          ai_settings: {
            enabled: settings.enabled,
            monthly_budget_usd: settings.monthly_budget_usd,
            risk_analysis_enabled: settings.risk_analysis_enabled,
            copilot_enabled: settings.copilot_enabled,
          },
        })}
      >
        {updating ? "Saving…" : "Save AI settings"}
      </Button>
    </SettingsCard>
  );
}
