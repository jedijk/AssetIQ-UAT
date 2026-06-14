import type { TenantScopedEntity } from "./common";

export type ActionStatus = "open" | "in_progress" | "completed" | "closed";
export type ActionPriority = "critical" | "high" | "medium" | "low";
export type ActionSourceType = "threat" | "investigation" | "ai_recommendation" | string;

export type CentralAction = TenantScopedEntity & {
  action_number?: string;
  title: string;
  description?: string;
  status?: ActionStatus;
  priority?: ActionPriority;
  assignee?: string;
  discipline?: string;
  action_type?: string;
  due_date?: string;
  source_type?: ActionSourceType;
  source_id?: string;
  source_name?: string;
  threat_risk_score?: number | null;
  threat_rpn?: number | null;
  created_by?: string;
};

export type ActionStats = {
  total: number;
  open: number;
  in_progress: number;
  completed: number;
  overdue: number;
};

export type ActionListResponse = {
  actions: CentralAction[];
  stats: ActionStats;
};

export type ActionDeleteResponse = {
  message: string;
};

export type ActionFilters = {
  status?: string;
  priority?: string;
  assignee?: string;
  source_type?: string;
};
