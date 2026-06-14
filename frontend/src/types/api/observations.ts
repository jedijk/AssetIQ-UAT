import type { TenantScopedEntity } from "./common";

export type ObservationSeverity = "low" | "medium" | "high" | "critical" | "warning";
export type ObservationStatus = "open" | "in_review" | "action_required" | "closed";

export type Observation = TenantScopedEntity & {
  equipment_id?: string | null;
  equipment_name?: string | null;
  efm_id?: string | null;
  task_id?: string | null;
  failure_mode_id?: string | null;
  failure_mode_name?: string | null;
  description: string;
  severity: ObservationSeverity;
  observation_type?: string;
  status: ObservationStatus;
  source?: string;
  threat_id?: string | null;
  media_urls?: string[];
  tags?: string[];
};

export type ObservationListResponse = {
  total: number;
  observations: Observation[];
};

export type ObservationCreatePayload = {
  equipment_id?: string;
  efm_id?: string;
  task_id?: string;
  failure_mode_id?: string;
  description: string;
  severity?: ObservationSeverity;
  observation_type?: string;
  media_urls?: string[];
  measured_values?: Record<string, unknown>[];
  location?: string;
  tags?: string[];
};
