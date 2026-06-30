const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTenantUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Primary label for a tenant row (prefer registry name over raw id). */
export function getTenantDisplayName(tenant, tenantId) {
  const id = tenantId || tenant?.tenant_id || tenant?.id;
  const name = tenant?.name?.trim();
  if (name) return name;
  if (id && !isTenantUuid(id)) return id;
  if (tenant?.slug?.trim()) return tenant.slug.trim();
  return id || "—";
}

/** Optional secondary line — slug/site name, never a UUID. */
export function getTenantSubtitle(tenant, tenantId) {
  const id = tenantId || tenant?.tenant_id || tenant?.id;
  const primary = getTenantDisplayName(tenant, tenantId);
  for (const extra of [tenant?.slug, tenant?.site_name, tenant?.installation_name]) {
    const value = extra?.trim();
    if (value && value !== primary) return value;
  }
  if (id && !isTenantUuid(id) && id !== primary) return id;
  return null;
}
