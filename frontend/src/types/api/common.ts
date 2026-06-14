/** Shared API contract types — Wave 3 TypeScript migration foundation (Phase 1). */

export type ApiSuccessResponse<T> = T & {
  success?: boolean;
};

export type PaginatedResponse<TItem, TKey extends string = "items"> = {
  total: number;
} & Record<TKey, TItem[]>;

export type ApiErrorResponse = {
  detail: string | { msg: string; type?: string }[];
};

export type TenantScopedEntity = {
  tenant_id?: string;
  id: string;
  created_at?: string;
  updated_at?: string;
};

export type ReportPeriod = {
  period_days: number;
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  label: string;
  previous_label: string;
};
