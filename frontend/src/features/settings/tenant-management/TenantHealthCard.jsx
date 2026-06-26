import { Loader2, Play } from "lucide-react";
import { SettingsCard } from "../../../pages/SettingsPage";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { TenantStatusBadge } from "./tenantManagementShared";

const CHECK_VARIANT = { pass: "default", warn: "secondary", fail: "destructive" };

export default function TenantHealthCard({
  tenant,
  health,
  healthLoading,
  onValidate,
  validating,
  validationResult,
}) {
  if (!tenant) return null;

  const display = validationResult || health;

  return (
    <SettingsCard title="Tenant health" description="Onboarding checks and validation">
      <div className="flex items-center gap-2 mb-4">
        <TenantStatusBadge status={tenant.status} />
        {display?.overall && (
          <Badge variant={display.overall === "healthy" || display.overall === "valid" ? "default" : "secondary"}>
            {display.overall}
          </Badge>
        )}
      </div>

      {healthLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading health…
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {(display?.checks || []).map((check) => (
            <li key={check.id} className="flex items-center justify-between gap-2">
              <span>{check.label}</span>
              <Badge variant={CHECK_VARIANT[check.status] || "outline"}>{check.status}</Badge>
            </li>
          ))}
          {(display?.issues || []).map((issue) => (
            <li key={issue.code} className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>{issue.message}</span>
              <Badge variant={issue.severity === "error" ? "destructive" : "secondary"}>{issue.severity}</Badge>
            </li>
          ))}
        </ul>
      )}

      <Button className="mt-4" size="sm" variant="outline" onClick={onValidate} disabled={validating}>
        {validating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
        Run validation
      </Button>
    </SettingsCard>
  );
}
