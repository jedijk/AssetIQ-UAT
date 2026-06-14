"""Form template and submission persistence — tenant-scoped."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from repositories.base import TenantScopedRepository


class FormTemplateRepository(TenantScopedRepository):
    collection_name = "form_templates"


class FormSubmissionRepository(TenantScopedRepository):
    collection_name = "form_submissions"

    async def list_recent(
        self,
        *,
        user: Optional[dict] = None,
        limit: int = 200,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> List[dict]:
        query = dict(extra_filter or {})
        return await self.find_many(
            query,
            user=user,
            sort=[("submitted_at", -1)],
            limit=limit,
        )
