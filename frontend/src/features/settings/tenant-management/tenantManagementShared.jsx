import { Badge } from "../../../components/ui/badge";

const STATUS_VARIANT = {
  active: "default",
  trial: "secondary",
  suspended: "destructive",
  archived: "outline",
  legacy: "secondary",
};

export function TenantStatusBadge({ status, registryStatus }) {
  if (registryStatus === "legacy") {
    return (
      <Badge variant={STATUS_VARIANT.legacy} className="capitalize">
        legacy
      </Badge>
    );
  }
  return (
    <Badge variant={STATUS_VARIANT[status] || "outline"} className="capitalize">
      {status || "unknown"}
    </Badge>
  );
}

export function formatTenantId(tenantId) {
  if (!tenantId) return "—";
  return tenantId.length <= 12 ? tenantId : `${tenantId.slice(0, 8)}…`;
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function enabledModuleCount(modules = {}) {
  return Object.values(modules).filter(Boolean).length;
}
