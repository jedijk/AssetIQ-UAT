"""Equipment hierarchy search and matching for chat and API routes."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from utils.mongo_regex import case_insensitive_contains
from utils.equipment_search_i18n import (
    expand_equipment_keywords,
    find_entity_ids_by_translation,
    load_equipment_translation_fields,
    score_keyword_against_translations,
    translation_search_languages_for_text,
)

def normalize_text(text: str) -> str:
    return ' '.join(text.lower().strip().split())


def extract_keywords(text: str) -> List[str]:
    words = re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())
    stop_words = {'the', 'and', 'for', 'has', 'have', 'had', 'was', 'were', 'are', 'been',
                  'being', 'with', 'from', 'this', 'that', 'these', 'those', 'there'}
    return [w for w in words if w not in stop_words]


def _normalize_tag(t):
    return re.sub(r'[-_\s]', '', t.lower()) if t else ''


def find_full_equipment_match(message: str, candidates: List[Dict]) -> Optional[Dict]:
    """Return the candidate whose name or tag exactly matches (case-insensitive)
    a substring / token in the user's message. Used to auto-select when one
    of several search results is an unambiguous exact match.
    """
    if not message or not candidates:
        return None
    msg_norm = normalize_text(message)
    # Also build a set of tokens (word-boundary splits) from the message for tag matches
    msg_tokens = set(re.findall(r'[a-zA-Z0-9\-_.]+', msg_norm))

    full_matches = []
    for eq in candidates:
        name = normalize_text(eq.get("name") or "")
        tag = normalize_text(eq.get("tag") or "")
        # Exact name match anywhere in the message (as a whole phrase)
        name_hit = bool(name) and len(name) >= 3 and re.search(r'\b' + re.escape(name) + r'\b', msg_norm) is not None
        # Exact tag match as a token (tags are usually unique identifiers)
        tag_hit = bool(tag) and tag in msg_tokens
        if name_hit or tag_hit:
            full_matches.append((eq, name_hit, tag_hit))

    if len(full_matches) == 1:
        return full_matches[0][0]
    # Tag-only match wins over name-only if the tag is unique
    tag_only = [fm for fm in full_matches if fm[2]]
    if len(tag_only) == 1:
        return tag_only[0][0]
    return None


# ------------------------------------------------------------------
# Equipment search
# ------------------------------------------------------------------

async def search_equipment_hierarchy(
    db,
    search_text: str,
    user_id: str,
    ui_language: str = "en",
) -> List[Dict[str, Any]]:
    """Search equipment at operational levels by name/tag/type/description and NL/DE translations."""

    keywords = extract_keywords(search_text)
    if not keywords:
        return []

    keywords = expand_equipment_keywords(keywords)
    translation_langs = translation_search_languages_for_text(search_text, ui_language)

    operational_levels = ["subunit", "maintainable_item", "equipment", "component", "equipment_unit"]
    
    # Extract potential tag patterns - with or without dashes
    # Pattern 1: With dashes (e.g., "1F-3001-0122", "1X-1001-0001")
    tag_patterns_with_dash = re.findall(r'\b[A-Za-z0-9]{1,3}[-_][A-Za-z0-9]{3,5}[-_][A-Za-z0-9]{3,5}\b', search_text)
    
    # Pattern 2: Without dashes - alphanumeric that looks like a tag (e.g., "1F30010122", "30010122")
    # Match: optional 1-2 alphanumeric prefix + 6+ digits, OR alphanumeric string of 8+ chars containing mostly digits
    tag_patterns_no_dash = re.findall(r'\b[A-Za-z0-9]{1,2}[0-9]{6,12}\b', search_text)
    
    # Pattern 3: Partial tags - at least 4 digits that could be part of a tag (e.g., "3001", "0122", "30010122")
    partial_tag_patterns = re.findall(r'\b[0-9]{4,}\b', search_text)
    
    # Combine all tag patterns
    all_tag_patterns = tag_patterns_with_dash + tag_patterns_no_dash
    
    # Also look for quoted equipment names
    quoted_names = re.findall(r'"([^"]+)"', search_text)

    search_conditions = []
    for kw in keywords:
        r = case_insensitive_contains(kw)
        if not r:
            continue
        search_conditions += [{"name": r}, {"tag": r}, {"tag_number": r},
                              {"description": r}, {"equipment_type": r}, {"equipment_type_name": r}]
    
    # Also add direct tag pattern searches (for cases where only tag number is provided)
    # Create flexible regex that matches with or without dashes
    for tp in all_tag_patterns + partial_tag_patterns:
        if len(tp) >= 4:  # Only meaningful partial tags
            # Create regex that allows optional dashes/underscores between characters
            # e.g., "30010122" becomes "3[-_]?0[-_]?0[-_]?1[-_]?0[-_]?1[-_]?2[-_]?2"
            flexible_pattern = '[-_]?'.join(list(tp))
            flexible_regex = {"$regex": flexible_pattern, "$options": "i"}
            search_conditions.append({"tag": flexible_regex})
            search_conditions.append({"tag_number": flexible_regex})
    
    translation_node_ids, translation_type_ids = await find_entity_ids_by_translation(
        db, keywords, translation_langs
    )
    if translation_node_ids:
        search_conditions.append({"id": {"$in": list(translation_node_ids)}})
    if translation_type_ids:
        search_conditions.append({"equipment_type_id": {"$in": list(translation_type_ids)}})

    if not search_conditions:
        return []

    equipment_projection = {
        "_id": 0, "id": 1, "name": 1, "tag": 1, "tag_number": 1,
        "equipment_type": 1, "equipment_type_name": 1, "equipment_type_id": 1,
        "description": 1, "level": 1, "criticality": 1, "parent_id": 1,
        "installation_id": 1,
    }

    equipment_list = await db.equipment_nodes.find(
        {"$and": [{"level": {"$in": operational_levels}}, {"$or": search_conditions}]},
        equipment_projection,
    ).limit(30).to_list(30)

    if equipment_list and translation_node_ids:
        seen_ids = {eq.get("id") for eq in equipment_list if eq.get("id")}
        missing_node_ids = [eid for eid in translation_node_ids if eid not in seen_ids]
        if missing_node_ids:
            extra_rows = await db.equipment_nodes.find(
                {
                    "$and": [
                        {"level": {"$in": operational_levels}},
                        {"id": {"$in": missing_node_ids}},
                    ]
                },
                equipment_projection,
            ).limit(20).to_list(20)
            for row in extra_rows:
                row_id = row.get("id")
                if row_id and row_id not in seen_ids:
                    equipment_list.append(row)
                    seen_ids.add(row_id)

    entity_ids = [eq.get("id") for eq in equipment_list if eq.get("id")]
    translations_by_lang = await load_equipment_translation_fields(
        db, entity_ids, translation_langs
    )

    # Batch-fetch parent names for maintainable items
    parent_ids = {eq["parent_id"] for eq in equipment_list
                  if eq.get("level") == "maintainable_item" and eq.get("parent_id")}
    parent_map = {}
    if parent_ids:
        parents = await db.equipment_nodes.find(
            {"id": {"$in": list(parent_ids)}}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
        parent_map = {p["id"]: p for p in parents}

    scored = []
    # Calculate max possible score for confidence calculation
    # Max score per keyword: 10 (name) + 8 (tag) + 5 (type) + 3 (desc) = 26
    max_possible_score = len(keywords) * 26 if keywords else 1
    
    search_text_lower = search_text.lower()
    search_text_normalized = _normalize_tag(search_text)
    
    for eq in equipment_list:
        score = 0
        name = (eq.get("name") or "").lower()
        tag = (eq.get("tag") or eq.get("tag_number") or "").lower()
        tag_normalized = _normalize_tag(tag)
        desc = (eq.get("description") or "").lower()
        eq_type = (eq.get("equipment_type") or eq.get("equipment_type_name") or "").lower()
        
        # Check for EXACT tag match (with or without dashes) - 100% confidence
        exact_tag_match = False
        if tag_normalized:
            # Check full tag patterns (with dashes)
            for tp in all_tag_patterns:
                tp_normalized = _normalize_tag(tp)
                if tp_normalized == tag_normalized:
                    exact_tag_match = True
                    break
            
            # Check if normalized tag appears in normalized search text
            if not exact_tag_match and len(tag_normalized) >= 6:
                if tag_normalized in search_text_normalized:
                    exact_tag_match = True
        
        # Check for PARTIAL tag match - at least last 4+ digits match - 90% confidence
        partial_tag_match = False
        if tag_normalized and not exact_tag_match:
            for ptp in partial_tag_patterns:
                # Partial tag should be significant (at least 4 digits) and match end of tag
                if len(ptp) >= 4 and tag_normalized.endswith(ptp):
                    partial_tag_match = True
                    break
                # Or partial tag appears anywhere in normalized tag
                if len(ptp) >= 6 and ptp in tag_normalized:
                    partial_tag_match = True
                    break
        
        # Check for EXACT name match from quoted text
        exact_name_match = False
        for qn in quoted_names:
            qn_lower = qn.lower()
            qn_normalized = _normalize_tag(qn)
            # Check if quoted name matches equipment name (with or without tag)
            if name == qn_lower or qn_lower.startswith(name) or name in qn_lower:
                # Also verify tag if present in quoted name
                if tag and (tag in qn_lower or tag_normalized in qn_normalized):
                    exact_name_match = True
                    break
                elif not tag and name == qn_lower:
                    exact_name_match = True
                    break

        for kw in keywords:
            if kw in name:
                score += 10
            if kw in tag:
                score += 8
            if kw in eq_type:
                score += 5
            if kw in desc:
                score += 3

        eq_id = eq.get("id")
        if eq_id and translations_by_lang:
            score += score_keyword_against_translations(keywords, translations_by_lang, eq_id)
        
        # Also give score for exact/partial tag matches (even if keyword doesn't directly match)
        if exact_tag_match:
            score += 50  # High score for exact tag match
        elif partial_tag_match:
            score += 30  # Good score for partial tag match

        if score > 0:
            parent_name = None
            if eq.get("level") == "maintainable_item" and eq.get("parent_id"):
                p = parent_map.get(eq["parent_id"])
                if p:
                    parent_name = p.get("name")

            # Calculate confidence as percentage (capped at 100%)
            # Exact tag or name match = 100% confidence
            # Partial tag match = 90% confidence
            if exact_tag_match or exact_name_match:
                confidence = 100
            elif partial_tag_match:
                confidence = 90
            else:
                confidence = min(100, round((score / max_possible_score) * 100))
            
            scored.append({
                "id": eq.get("id"), "name": eq.get("name"),
                "tag": eq.get("tag") or eq.get("tag_number"),
                "equipment_type": eq.get("equipment_type") or eq.get("equipment_type_name"),
                "description": eq.get("description"), "level": eq.get("level"),
                "criticality": eq.get("criticality"), "parent_name": parent_name,
                "score": score,
                "confidence": confidence,
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:10]


async def lookup_equipment_by_tag(db, tag: str) -> Dict[str, Any] | None:
    """Find a single equipment node by exact tag."""
    doc = await db.equipment_nodes.find_one(
        {"tag": tag},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "tag_number": 1,
         "equipment_type": 1, "equipment_type_name": 1, "description": 1,
         "level": 1, "criticality": 1, "parent_id": 1, "installation_id": 1}
    )
    if not doc:
        return None
    return {
        "id": doc.get("id"), "name": doc.get("name"),
        "tag": doc.get("tag") or doc.get("tag_number"),
        "equipment_type": doc.get("equipment_type") or doc.get("equipment_type_name"),
        "description": doc.get("description"), "level": doc.get("level"),
        "criticality": doc.get("criticality"),
        "installation_id": doc.get("installation_id"),
    }


# ------------------------------------------------------------------
# Equipment matching helpers
# ------------------------------------------------------------------

def match_equipment_from_suggestions(message: str, suggestions: list) -> Dict | None:
    """Try to match user message against previous equipment suggestions."""
    if not suggestions:
        return None

    msg_norm = normalize_text(message)
    msg_no_tag = re.sub(r'\s*\([^)]*\)\s*$', '', message).strip()
    msg_no_tag_norm = normalize_text(msg_no_tag)
    has_tag = bool(re.search(r'\([^)]+\)\s*$', message))

    # Pass 1: exact "Name (Tag)" match
    for eq in suggestions:
        eq_label = f"{eq.get('name','')} ({eq.get('tag','')})" if eq.get("tag") else eq.get("name", "")
        if eq.get("tag") and normalize_text(eq_label) == msg_norm:
            return eq

    # Pass 2: name-only exact (skip if user provided a tag – they want that specific tag)
    if not has_tag:
        for eq in suggestions:
            if normalize_text(eq.get("name", "")) == msg_norm:
                return eq

    # Pass 3: partial (skip if user has a tag)
    if not has_tag:
        for eq in sorted(suggestions, key=lambda x: len(x.get("name", "")), reverse=True):
            n = normalize_text(eq.get("name", ""))
            if n and len(n) >= 3 and (n in msg_norm or msg_no_tag_norm in n):
                return eq

    return None


def extract_tag_from_message(message: str) -> str | None:
    """Extract tag from 'Name (TAG)' format."""
    m = re.search(r'\(([A-Z0-9][A-Z0-9\-]+)\)\s*$', message)
    return m.group(1).strip() if m else None


def message_looks_like_equipment(message: str) -> bool:
    return bool(re.match(r'^.+\s*\([A-Z0-9][A-Z0-9\-]+\)\s*$', message))


# ------------------------------------------------------------------
