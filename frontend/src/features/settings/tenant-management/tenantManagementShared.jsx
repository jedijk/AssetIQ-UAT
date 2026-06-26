import { Badge } from "../../../components/ui/badge";

const STATUS_VARIANT = {
  active: "default",
  trial: "secondary",
  suspended: "destructive",
  archived: "outline",
};

export function TenantStatusBadge({ status }) {
  return (
    <Badge variant={STATUS_VARIANT[status] || "outline"} className="capitalize">
      {status || "unknown"}
    </Badge>
  );
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
