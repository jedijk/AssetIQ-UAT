import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../../components/ui/table";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";
import { TenantStatusBadge, formatDate, formatTenantId, enabledModuleCount } from "./tenantManagementShared";

export default function TenantList({
  tenants,
  loading,
  selectedTenantId,
  onSelect,
  includeArchived,
  onIncludeArchivedChange,
  onCreateClick,
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Loading tenants…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch
            id="include-archived"
            checked={includeArchived}
            onCheckedChange={onIncludeArchivedChange}
          />
          <Label htmlFor="include-archived" className="text-sm">Show archived</Label>
        </div>
        <Button size="sm" onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-1" /> Create tenant
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>AI</TableHead>
              <TableHead>Modules</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No tenants found
                </TableCell>
              </TableRow>
            ) : tenants.map((tenant) => (
              <TableRow
                key={tenant.tenant_id}
                className={`cursor-pointer ${selectedTenantId === tenant.tenant_id ? "bg-muted/60" : ""}`}
                onClick={() => onSelect(tenant.tenant_id)}
              >
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell className="font-mono text-xs max-w-[120px] truncate" title={tenant.tenant_id}>
                  {formatTenantId(tenant.tenant_id)}
                </TableCell>
                <TableCell>
                  <TenantStatusBadge status={tenant.status} registryStatus={tenant.registry_status} />
                </TableCell>
                <TableCell>{tenant.plan || "—"}</TableCell>
                <TableCell>{tenant.user_count ?? 0}</TableCell>
                <TableCell>{tenant.site_count ?? 0}</TableCell>
                <TableCell>{tenant.equipment_count ?? 0}</TableCell>
                <TableCell>{tenant.ai_enabled ? "On" : "Off"}</TableCell>
                <TableCell>{enabledModuleCount(tenant.modules)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(tenant.created_at)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(tenant.last_activity_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
