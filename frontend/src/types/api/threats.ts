import type { TenantScopedEntity } from "./common";

export type ThreatStatus = "Open" | "open" | "In Progress" | "in_progress" | "Resolved" | "resolved" | "Closed" | "closed";

export type Threat = TenantScopedEntity & {
  linked_equipment_id?: string | null;
  asset?: string;
  description?: string;
  status?: ThreatStatus;
  risk_level?: string;
  risk_score?: number;
  failure_mode?: string;
  observation_id?: string | null;
};

export type ThreatListResponse = {
  threats: Threat[];
  total?: number;
};
