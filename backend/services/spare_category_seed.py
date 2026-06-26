"""Default tenant spare part categories — seeded per tenant on first access."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from typing import Optional

from database import db
from services.tenant_schema import merge_tenant_filter, tenant_id_from_user, with_tenant_id

SEED_SPARE_CATEGORIES = [
    ("bearing", "Bearing", 1),
    ("motor", "Motor", 2),
    ("gearbox", "Gearbox", 3),
    ("belt", "Belt", 4),
    ("seal", "Seal", 5),
    ("sensor", "Sensor", 6),
    ("pump", "Pump", 7),
    ("instrument", "Instrument", 8),
    ("electrical", "Electrical", 9),
    ("other", "Other", 10),
]


async def seed_spare_categories_for_user(user: Optional[dict]) -> int:
    """Insert default categories for the user's tenant when none exist."""
    tid = tenant_id_from_user(user)
    pseudo_user = user or {}
    if tid and not pseudo_user.get("company_id"):
        pseudo_user = {**pseudo_user, "company_id": tid, "tenant_id": tid}
    query = merge_tenant_filter({}, pseudo_user) if tid else {}
    existing = await db.spare_categories.count_documents(query)
    if existing > 0:
        return 0
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    docs = []
    for value, label, sort_order in SEED_SPARE_CATEGORIES:
        doc = {
            "id": str(uuid4()),
            "value": value,
            "label": label,
            "sort_order": sort_order,
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        if tid:
            doc = with_tenant_id(doc, pseudo_user)
        docs.append(doc)
    if docs:
        try:
            await db.spare_categories.insert_many(docs, ordered=False)
        except Exception:
            # Another request may have seeded concurrently.
            pass
    return len(docs)
