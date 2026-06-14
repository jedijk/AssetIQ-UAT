import type { TenantScopedEntity } from "./common";

export type InvestigationStatus =
  | "draft"
  | "active"
  | "in_progress"
  | "completed"
  | "closed"
  | string;

export type Investigation = TenantScopedEntity & {
  title?: string;
  description?: string;
  status?: InvestigationStatus;
  threat_id?: string;
  equipment_id?: string;
  created_by?: string;
};

export type InvestigationListResponse = {
  investigations: Investigation[];
  total?: number;
};

export type InvestigationDeleteResponse = {
  message: string;
  deleted_central_actions?: number;
};

export type InvestigationDeleteOptions = {
  deleteCentralActions?: boolean;
};
