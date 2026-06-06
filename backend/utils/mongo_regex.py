"""Safe MongoDB $regex helpers — escape user input to avoid ReDoS/injection."""
from __future__ import annotations

import re
from typing import Any, Dict


def escape_regex(value: str) -> str:
    """Return a literal-safe pattern for MongoDB $regex."""
    if not value:
        return ""
    return re.escape(str(value).strip())


def case_insensitive_contains(value: str) -> Dict[str, Any]:
    """Build a case-insensitive substring match on a single field value."""
    pattern = escape_regex(value)
    if not pattern:
        return {}
    return {"$regex": pattern, "$options": "i"}


def or_search_fields(search: str, *field_names: str) -> Dict[str, Any]:
    """Build {$or: [{field: {$regex: ...}}, ...]} for list search boxes."""
    pattern = escape_regex(search)
    if not pattern or not field_names:
        return {}
    clause = {"$regex": pattern, "$options": "i"}
    fields = [f for f in field_names if f]
    if not fields:
        return {}
    return {"$or": [{field: clause} for field in fields]}
