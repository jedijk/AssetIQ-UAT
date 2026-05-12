"""
Chat Handler V2 - Pure Business Logic

Matches equipment from hierarchy and failure modes from FMEA library.
No DB state queries — state is passed in by the caller (routes/chat.py).
"""

import re
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class ChatState:
    INITIAL = "initial"
    AWAITING_ISSUE_DESCRIPTION = "awaiting_issue_description"
    AWAITING_ISSUE_CONFIRM = "awaiting_issue_confirm"
    AWAITING_EQUIPMENT = "awaiting_equipment"
    AWAITING_FAILURE_MODE = "awaiting_failure_mode"
    AWAITING_NEW_FAILURE_MODE = "awaiting_new_failure_mode"
    AWAITING_CONTEXT = "awaiting_context"
    COMPLETE = "complete"


def _equip_label(equipment: dict) -> str:
    name = equipment.get("name", "Unknown")
    tag = equipment.get("tag")
    return f"{name} ({tag})" if tag else name


def _unknown_equipment_placeholder(pending_data: dict) -> dict:
    """Synthetic equipment when the operator cannot identify the asset."""
    return {
        "id": None,
        "name": "Unknown equipment",
        "tag": None,
        "equipment_type": None,
        "criticality": {},
        "installation_id": pending_data.get("installation_id"),
    }


def _message_indicates_unknown_equipment(message_content: str) -> bool:
    raw = message_content.strip().lower()
    if raw.startswith("equipment:"):
        inner = message_content.split(":", 1)[1].strip().lower()
    else:
        inner = raw
    return inner in (
        "i don't know", "i dont know", "don't know", "dont know",
        "unknown", "not sure", "no idea", "unsure",
    )


def _message_indicates_unknown_failure_mode(message_content: str) -> bool:
    raw = message_content.strip().lower()
    if raw.startswith("failure mode:"):
        inner = message_content.split(":", 1)[1].strip().lower()
    else:
        inner = raw
    return inner in (
        "i don't know", "i dont know", "don't know", "dont know",
        "unknown", "not sure", "no idea", "unsure",
    )


def normalize_text(text: str) -> str:
    return ' '.join(text.lower().strip().split())


def extract_keywords(text: str) -> List[str]:
    words = re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())
    stop_words = {'the', 'and', 'for', 'has', 'have', 'had', 'was', 'were', 'are', 'been',
                  'being', 'with', 'from', 'this', 'that', 'these', 'those', 'there'}
    return [w for w in words if w not in stop_words]


def find_full_equipment_match(message: str, candidates: List[Dict]) -> Dict | None:
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

async def search_equipment_hierarchy(db, search_text: str, user_id: str) -> List[Dict[str, Any]]:
    """Search equipment at operational levels by name/tag/type/description."""
    keywords = extract_keywords(search_text)
    if not keywords:
        return []

    operational_levels = ["subunit", "maintainable_item", "equipment", "component", "equipment_unit"]

    search_conditions = []
    for kw in keywords:
        r = {"$regex": kw, "$options": "i"}
        search_conditions += [{"name": r}, {"tag": r}, {"tag_number": r},
                              {"description": r}, {"equipment_type": r}, {"equipment_type_name": r}]

    equipment_list = await db.equipment_nodes.find(
        {"$and": [{"level": {"$in": operational_levels}}, {"$or": search_conditions}]},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "tag_number": 1,
         "equipment_type": 1, "equipment_type_name": 1, "description": 1,
         "level": 1, "criticality": 1, "parent_id": 1, "installation_id": 1}
    ).limit(20).to_list(20)

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
    for eq in equipment_list:
        score = 0
        name = (eq.get("name") or "").lower()
        tag = (eq.get("tag") or eq.get("tag_number") or "").lower()
        desc = (eq.get("description") or "").lower()
        eq_type = (eq.get("equipment_type") or eq.get("equipment_type_name") or "").lower()

        for kw in keywords:
            if kw in name:
                score += 10
            if kw in tag:
                score += 8
            if kw in eq_type:
                score += 5
            if kw in desc:
                score += 3

        if score > 0:
            parent_name = None
            if eq.get("level") == "maintainable_item" and eq.get("parent_id"):
                p = parent_map.get(eq["parent_id"])
                if p:
                    parent_name = p.get("name")

            scored.append({
                "id": eq.get("id"), "name": eq.get("name"),
                "tag": eq.get("tag") or eq.get("tag_number"),
                "equipment_type": eq.get("equipment_type") or eq.get("equipment_type_name"),
                "description": eq.get("description"), "level": eq.get("level"),
                "criticality": eq.get("criticality"), "parent_name": parent_name,
                "score": score,
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
# Failure mode search
# ------------------------------------------------------------------

def search_failure_modes(failure_modes_library: List[Dict], search_text: str,
                         equipment_type: str = None) -> List[Dict[str, Any]]:
    keywords = extract_keywords(search_text)
    if not keywords:
        return []

    scored = []
    for fm in failure_modes_library:
        score = 0
        fm_name = (fm.get("failure_mode") or "").lower()
        fm_keywords = [k.lower() for k in fm.get("keywords", [])]
        fm_category = (fm.get("category") or "").lower()
        fm_equipment = (fm.get("equipment") or "").lower()

        for kw in keywords:
            if kw in fm_name or fm_name in kw:
                score += 20
            for fk in fm_keywords:
                if kw in fk or fk in kw:
                    score += 15
                    break
            if kw in fm_category:
                score += 5
            if kw in fm_equipment:
                score += 3

        if equipment_type:
            et = equipment_type.lower()
            if et in fm_equipment or fm_equipment in et:
                score += 10

        if score > 0:
            scored.append({
                "id": fm.get("id"), "failure_mode": fm.get("failure_mode"),
                "category": fm.get("category"), "equipment": fm.get("equipment"),
                "severity": fm.get("severity"), "occurrence": fm.get("occurrence"),
                "detectability": fm.get("detectability"), "rpn": fm.get("rpn"),
                "recommended_actions": fm.get("recommended_actions", []),
                "score": score,
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:10]


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
# Failure mode matching helpers
# ------------------------------------------------------------------

def match_failure_mode_from_suggestions(message: str, suggestions: list) -> Dict | None:
    if not suggestions:
        return None

    text = message
    if text.lower().startswith("failure mode:"):
        text = text.split(":", 1)[1].strip()

    msg_norm = normalize_text(text)

    for fm in suggestions:
        fn = normalize_text(fm.get("failure_mode", ""))
        if fn and (fn == msg_norm or fn in msg_norm or msg_norm in fn):
            return fm
    return None


# ------------------------------------------------------------------
# Core state machine (pure logic)
# ------------------------------------------------------------------

async def process_chat_message(
    db,
    user_id: str,
    message_content: str,
    failure_modes_library: List[Dict],
    current_state: str = ChatState.INITIAL,
    pending_data: Dict = None,
    prev_equipment_suggestions: List = None,
    prev_failure_mode_suggestions: List = None,
    original_message: str = None,
) -> Dict[str, Any]:
    """
    Pure state-machine logic. Receives state, returns new state + response.
    Caller is responsible for reading/writing state to DB.
    """
    pending_data = dict(pending_data or {})
    prev_equipment_suggestions = prev_equipment_suggestions or []
    prev_failure_mode_suggestions = prev_failure_mode_suggestions or []
    original_message = original_message or message_content

    def _result(**kw):
        return {
            "response_text": kw.get("text", ""),
            "state": kw.get("state", ChatState.INITIAL),
            "pending_data": kw.get("pending", pending_data),
            "equipment_suggestions": kw.get("eq_sugg"),
            "failure_mode_suggestions": kw.get("fm_sugg"),
            "show_new_failure_mode_option": kw.get("new_fm_opt", False),
            "create_observation": kw.get("create", False),
            "observation_data": kw.get("obs_data"),
            "original_message": kw.get("orig", original_message),
        }

    # --- CANCEL from any state ---
    if message_content.strip().lower() == "cancel":
        return _result(text="Cancelled. What would you like to report?",
                       state=ChatState.INITIAL, pending={}, orig=None)

    # --- Helper: after equipment is selected, search failure modes ---
    def _after_equipment_selected(equipment, fm_library, orig_msg, pdata):
        pdata["equipment"] = equipment
        pdata["equipment_id"] = equipment.get("id")
        pdata["equipment_name"] = equipment.get("name")
        pdata["equipment_type"] = equipment.get("equipment_type")
        pdata["criticality"] = equipment.get("criticality")
        pdata["installation_id"] = equipment.get("installation_id")

        fm_matches = search_failure_modes(fm_library, orig_msg, equipment.get("equipment_type"))

        if len(fm_matches) == 1:
            fm = fm_matches[0]
            pdata["failure_mode"] = fm
            pdata["failure_mode_id"] = fm.get("id")
            pdata["failure_mode_name"] = fm.get("failure_mode")
            pdata["recommended_actions"] = fm.get("recommended_actions", [])
            return _result(text=f"Observation recorded for {_equip_label(equipment)}.",
                           state=ChatState.COMPLETE, pending=pdata, create=True, obs_data=pdata, orig=orig_msg)
        elif len(fm_matches) > 1:
            return _result(text=f"Equipment: {_equip_label(equipment)}. What type of failure is it? Please select:",
                           state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=fm_matches,
                           new_fm_opt=True, pending=pdata, orig=orig_msg)
        else:
            return _result(text=f"Equipment: {_equip_label(equipment)}. No matching failure mode found. Would you like to specify the failure mode?",
                           state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=[],
                           new_fm_opt=True, pending=pdata, orig=orig_msg)

    # ==============================
    # AWAITING_EQUIPMENT
    # ==============================
    if current_state == ChatState.AWAITING_EQUIPMENT:
        if _message_indicates_unknown_equipment(message_content):
            unknown_eq = _unknown_equipment_placeholder(pending_data)
            return _after_equipment_selected(
                unknown_eq, failure_modes_library, original_message, pending_data)

        selected = match_equipment_from_suggestions(message_content, prev_equipment_suggestions)

        # Direct tag lookup fallback (handles race condition or tag not in suggestions)
        if not selected:
            tag = extract_tag_from_message(message_content)
            if tag:
                selected = await lookup_equipment_by_tag(db, tag)
                if selected:
                    logger.info(f"Direct tag lookup: {selected.get('name')} ({tag})")

        if selected:
            return _after_equipment_selected(selected, failure_modes_library, original_message, pending_data)

        # No match — re-search with user's new input
        tag = extract_tag_from_message(message_content)
        if tag:
            eq = await lookup_equipment_by_tag(db, tag)
            if eq:
                return _after_equipment_selected(eq, failure_modes_library, original_message, pending_data)

        eq_matches = await search_equipment_hierarchy(db, message_content, user_id)
        if len(eq_matches) == 1:
            return _after_equipment_selected(eq_matches[0], failure_modes_library, original_message, pending_data)
        elif len(eq_matches) > 1:
            # Auto-select when a single full/exact match (by name or unique tag) is present
            full = find_full_equipment_match(message_content, eq_matches)
            if full:
                logger.info(f"Auto-selected full equipment match: {full.get('name')} ({full.get('tag')})")
                return _after_equipment_selected(full, failure_modes_library, original_message, pending_data)
            return _result(text="Which equipment? Please select:",
                           state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches, orig=original_message)
        else:
            return _result(text="I couldn't find that equipment. Please specify the equipment name or tag:",
                           state=ChatState.AWAITING_EQUIPMENT,
                           eq_sugg=prev_equipment_suggestions, orig=original_message)

    # ==============================
    # AWAITING_FAILURE_MODE
    # ==============================
    if current_state == ChatState.AWAITING_FAILURE_MODE:
        if _message_indicates_unknown_failure_mode(message_content):
            pending_data["failure_mode_name"] = "Unknown / not specified"
            pending_data["is_custom_failure_mode"] = True
            pending_data.pop("failure_mode", None)
            pending_data.pop("failure_mode_id", None)
            pending_data.pop("recommended_actions", None)
            return _result(
                text=f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)

        # Custom failure mode
        if message_content.lower().startswith("new failure mode:"):
            custom = message_content.split(":", 1)[1].strip()
            if custom and len(custom) >= 3:
                pending_data["failure_mode_name"] = custom
                pending_data["is_custom_failure_mode"] = True
                return _result(text=f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                               state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)
            return _result(text="Please provide a valid failure mode name (at least 3 characters):",
                           state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=prev_failure_mode_suggestions,
                           new_fm_opt=True)

        selected = match_failure_mode_from_suggestions(message_content, prev_failure_mode_suggestions)
        if selected:
            pending_data["failure_mode"] = selected
            pending_data["failure_mode_id"] = selected.get("id")
            pending_data["failure_mode_name"] = selected.get("failure_mode")
            pending_data["recommended_actions"] = selected.get("recommended_actions", [])
            return _result(text=f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                           state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)

        # Re-search
        fm_matches = search_failure_modes(failure_modes_library, message_content,
                                          pending_data.get("equipment_type"))
        if len(fm_matches) == 1:
            fm = fm_matches[0]
            pending_data["failure_mode"] = fm
            pending_data["failure_mode_id"] = fm.get("id")
            pending_data["failure_mode_name"] = fm.get("failure_mode")
            return _result(text=f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                           state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)
        elif len(fm_matches) > 1:
            return _result(text=f"Equipment: {_equip_label(pending_data.get('equipment', {}))}. Which failure type? Please select:",
                           state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=fm_matches, new_fm_opt=True)
        else:
            return _result(text=f"Equipment: {_equip_label(pending_data.get('equipment', {}))}. No matching failure mode found. Would you like to specify the failure mode?",
                           state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=[], new_fm_opt=True)

    # ==============================
    # AWAITING_NEW_FAILURE_MODE
    # ==============================
    if current_state == ChatState.AWAITING_NEW_FAILURE_MODE:
        custom = message_content.strip()
        if custom.lower().startswith("new failure mode:"):
            custom = custom.split(":", 1)[1].strip()
        if custom and len(custom) >= 3:
            pending_data["failure_mode_name"] = custom
            pending_data["is_custom_failure_mode"] = True
            return _result(text=f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                           state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)
        return _result(text="Please provide a valid failure mode name (at least 3 characters):",
                       state=ChatState.AWAITING_NEW_FAILURE_MODE)

    # ==============================
    # INITIAL — fresh message
    # ==============================
    eq_matches = await search_equipment_hierarchy(db, message_content, user_id)

    if len(eq_matches) == 0:
        return _result(text="Which equipment are you reporting an issue for? Please specify the equipment name or tag:",
                       state=ChatState.AWAITING_EQUIPMENT,
                       pending={"original_description": message_content}, orig=message_content)

    if len(eq_matches) == 1:
        pd = {"original_description": message_content}
        return _after_equipment_selected(eq_matches[0], failure_modes_library, message_content, pd)

    # Multiple equipment matches — auto-select if one is a clear full/exact match
    full = find_full_equipment_match(message_content, eq_matches)
    if full:
        logger.info(f"Auto-selected full equipment match (initial): {full.get('name')} ({full.get('tag')})")
        pd = {"original_description": message_content}
        return _after_equipment_selected(full, failure_modes_library, message_content, pd)

    return _result(text="Which equipment are you reporting an issue for? Please select:",
                   state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches,
                   pending={"original_description": message_content}, orig=message_content)
