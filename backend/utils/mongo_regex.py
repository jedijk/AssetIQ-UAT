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


def exact_case_insensitive(value: str) -> Dict[str, Any]:
    """Build a case-insensitive exact match on a single field value."""
    pattern = escape_regex(value)
    if not pattern:
        return {}
    return {"$regex": f"^{pattern}$", "$options": "i"}


def exact_case_insensitive_any(*values: str) -> Dict[str, Any]:
    """Case-insensitive exact match for any of several literal values."""
    patterns = [escape_regex(v) for v in values if v]
    if not patterns:
        return {}
    joined = "|".join(patterns)
    return {"$regex": f"^({joined})$", "$options": "i"}


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
