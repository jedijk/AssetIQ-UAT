from services.tenant_schema import BACKFILL_TENANT_ID, merge_tenant_filter


def scoped(user, query=None):
    return merge_tenant_filter(query or {}, user)


def scoped_job(query=None, tenant_id=None):
    tid = tenant_id or BACKFILL_TENANT_ID
    if not tid:
        return query or {}
    return merge_tenant_filter(query or {}, {"company_id": tid})
