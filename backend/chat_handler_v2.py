"""
Chat Handler V2 - Pure Business Logic

Matches equipment from hierarchy and failure modes from FMEA library.
No DB state queries — state is passed in by the caller (routes/chat.py).
"""

from __future__ import annotations

import re
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


def _chat_ui(locale: str, en: str, nl: str) -> str:
    """Pick Dutch or English assistant string for chat (not for stored threats)."""
    return nl if (locale or "en").lower().startswith("nl") else en


def _prompt_lang_from_user_text(text: str) -> Optional[str]:
    """
    If the user message clearly reads English or Dutch, return 'en' or 'nl'.
    Used to avoid Dutch equipment prompts when the issue text is English but
    chat_ui_language / ui_language still say nl (app default or stale conv).
    """
    if not text:
        return None
    s = text.strip()
    if len(s) < 6:
        return None
    low = f" {s.lower()} "
    nl_markers = (
        " het ", " een ", " niet ", " naar ", " deze ", " wordt ", " graag ",
        " geen ", " ook ", " alleen ", " kunt ", " kunnen ", " moeten ", " wij ",
        " uw ", " bijvoorbeeld ", " melding ", " klep ", " pomp ", " storing ",
        " temperatuur ", " apparatuur ", " lekkage ", " defect ", " werkt niet ",
    )
    if any(m in low for m in nl_markers):
        return "nl"
    en_markers = (
        " the ", " and ", " with ", " that ", " this ", " which ", " sensor ",
        " filter ", " valve ", " high ", " low ", " temperature ", " problem ",
        " issue ", " broken ", " leak ", " full ", " often ", " very ", " bearing ",
    )
    if any(m in low for m in en_markers):
        return "en"
    return None


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

async def search_equipment_hierarchy(db, search_text: str, user_id: str) -> List[Dict[str, Any]]:
    """Search equipment at operational levels by name/tag/type/description."""
    import re
    
    keywords = extract_keywords(search_text)
    if not keywords:
        return []

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
    
    # Helper function to normalize tag for comparison (remove dashes, underscores, lowercase)
    def normalize_tag(t):
        return re.sub(r'[-_\s]', '', t.lower()) if t else ''

    search_conditions = []
    for kw in keywords:
        from utils.mongo_regex import case_insensitive_contains

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
    
    if not search_conditions:
        return []

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
    # Calculate max possible score for confidence calculation
    # Max score per keyword: 10 (name) + 8 (tag) + 5 (type) + 3 (desc) = 26
    max_possible_score = len(keywords) * 26 if keywords else 1
    
    search_text_lower = search_text.lower()
    search_text_normalized = normalize_tag(search_text)
    
    for eq in equipment_list:
        score = 0
        name = (eq.get("name") or "").lower()
        tag = (eq.get("tag") or eq.get("tag_number") or "").lower()
        tag_normalized = normalize_tag(tag)
        desc = (eq.get("description") or "").lower()
        eq_type = (eq.get("equipment_type") or eq.get("equipment_type_name") or "").lower()
        
        # Check for EXACT tag match (with or without dashes) - 100% confidence
        exact_tag_match = False
        if tag_normalized:
            # Check full tag patterns (with dashes)
            for tp in all_tag_patterns:
                tp_normalized = normalize_tag(tp)
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
            qn_normalized = normalize_tag(qn)
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
    ui_language: str = "en",
) -> Dict[str, Any]:
    """
    Pure state-machine logic. Receives state, returns new state + response.
    Caller is responsible for reading/writing state to DB.
    """
    pending_data = dict(pending_data or {})
    ul = (ui_language or "en").lower()[:2]
    if ul not in ("nl", "en"):
        ul = "en"
    inferred = _prompt_lang_from_user_text(message_content)
    if inferred == "en" and ul == "nl":
        ul = "en"
    pending_data["chat_ui_language"] = ul
    loc = ul
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
        return _result(
            text=_chat_ui(
                loc,
                "Cancelled. What would you like to report?",
                "Geannuleerd. Wat wilt u melden?",
            ),
            state=ChatState.INITIAL,
            pending={"chat_ui_language": loc},
            orig=None,
        )

    # --- Helper: after equipment is selected, auto-select failure mode (QUICK REPORT) ---
    def _after_equipment_selected(equipment, fm_library, orig_msg, pdata):
        pdata["equipment"] = equipment
        pdata["equipment_id"] = equipment.get("id")
        pdata["equipment_name"] = equipment.get("name")
        pdata["equipment_type"] = equipment.get("equipment_type")
        pdata["criticality"] = equipment.get("criticality")
        pdata["installation_id"] = equipment.get("installation_id")
        pdata.setdefault("chat_ui_language", loc)

        fm_matches = search_failure_modes(fm_library, orig_msg, equipment.get("equipment_type"))

        # QUICK REPORT: Auto-select best failure mode instead of asking
        if len(fm_matches) >= 1:
            # Use best match (highest scored)
            fm = fm_matches[0]
            pdata["failure_mode"] = fm
            pdata["failure_mode_id"] = fm.get("id")
            pdata["failure_mode_name"] = fm.get("failure_mode")
            pdata["recommended_actions"] = fm.get("recommended_actions", [])
            pdata["ai_auto_selected_failure_mode"] = True
            
            review_note = _chat_ui(
                loc,
                "\n\n✓ AI auto-selected failure mode. You can edit this in the observation details if needed.",
                "\n\n✓ AI heeft automatisch de storingsmodus geselecteerd. U kunt deze aanpassen in de observatiedetails indien nodig.",
            )
            
            return _result(
                text=_chat_ui(
                    loc,
                    f"Observation recorded!\n\n📍 Equipment: {_equip_label(equipment)}\n⚠️ Issue: {fm.get('failure_mode')}{review_note}",
                    f"Melding vastgelegd!\n\n📍 Apparatuur: {_equip_label(equipment)}\n⚠️ Storing: {fm.get('failure_mode')}{review_note}",
                ),
                state=ChatState.COMPLETE, pending=pdata, create=True, obs_data=pdata, orig=orig_msg)
        else:
            # No failure mode found - use original description as custom failure mode
            pdata["failure_mode_name"] = orig_msg[:100] if len(orig_msg) > 100 else orig_msg
            pdata["is_custom_failure_mode"] = True
            pdata["ai_auto_selected_failure_mode"] = False
            
            review_note = _chat_ui(
                loc,
                "\n\n⚠️ No matching failure mode found. Please review and update the failure mode in the observation details.",
                "\n\n⚠️ Geen passende storingsmodus gevonden. Controleer en update de storingsmodus in de observatiedetails.",
            )
            
            return _result(
                text=_chat_ui(
                    loc,
                    f"Observation recorded!\n\n📍 Equipment: {_equip_label(equipment)}\n⚠️ Issue: {pdata['failure_mode_name']}{review_note}",
                    f"Melding vastgelegd!\n\n📍 Apparatuur: {_equip_label(equipment)}\n⚠️ Storing: {pdata['failure_mode_name']}{review_note}",
                ),
                state=ChatState.COMPLETE, pending=pdata, create=True, obs_data=pdata, orig=orig_msg)

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
            # Only auto-select if confidence >= 80%
            if eq_matches[0].get("confidence", 0) >= 80:
                logger.info(f"Auto-selected equipment with {eq_matches[0].get('confidence')}% confidence: {eq_matches[0].get('name')}")
                return _after_equipment_selected(eq_matches[0], failure_modes_library, original_message, pending_data)
            else:
                # Low confidence single match - ask user to confirm
                logger.info(f"Single match with low confidence ({eq_matches[0].get('confidence')}%), showing for user selection")
                return _result(
                    text=_chat_ui(
                        loc,
                        "I found one possible match. Please confirm or specify more details:",
                        "Ik heb één mogelijke match gevonden. Bevestig of geef meer details:",
                    ),
                    state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches, orig=original_message)
        elif len(eq_matches) > 1:
            # Multiple matches - always show list for user to select
            logger.info(f"Multiple equipment matches ({len(eq_matches)}), showing list for user selection")
            return _result(
                text=_chat_ui(
                    loc,
                    "Which equipment? Please select:",
                    "Welk stuk apparatuur bedoelt u? Maak een keuze:",
                ),
                state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches, orig=original_message)
        else:
            return _result(
                text=_chat_ui(
                    loc,
                    "I couldn't find that equipment. Please specify the equipment name or tag:",
                    "Ik heb dat apparaat niet gevonden. Geef de naam of het tag-nummer door:",
                ),
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
                text=_chat_ui(
                    loc,
                    f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                    f"Melding vastgelegd voor {_equip_label(pending_data.get('equipment', {}))}.",
                ),
                state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)

        # Custom failure mode
        if message_content.lower().startswith("new failure mode:"):
            custom = message_content.split(":", 1)[1].strip()
            if custom and len(custom) >= 3:
                pending_data["failure_mode_name"] = custom
                pending_data["is_custom_failure_mode"] = True
                return _result(
                    text=_chat_ui(
                        loc,
                        f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                        f"Melding vastgelegd voor {_equip_label(pending_data.get('equipment', {}))}.",
                    ),
                    state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)
            return _result(
                text=_chat_ui(
                    loc,
                    "Please provide a valid failure mode name (at least 3 characters):",
                    "Geef een geldige storingsmodus (minimaal 3 tekens):",
                ),
                state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=prev_failure_mode_suggestions,
                new_fm_opt=True)

        selected = match_failure_mode_from_suggestions(message_content, prev_failure_mode_suggestions)
        if selected:
            pending_data["failure_mode"] = selected
            pending_data["failure_mode_id"] = selected.get("id")
            pending_data["failure_mode_name"] = selected.get("failure_mode")
            pending_data["recommended_actions"] = selected.get("recommended_actions", [])
            return _result(
                text=_chat_ui(
                    loc,
                    f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                    f"Melding vastgelegd voor {_equip_label(pending_data.get('equipment', {}))}.",
                ),
                state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)

        # Re-search
        fm_matches = search_failure_modes(failure_modes_library, message_content,
                                          pending_data.get("equipment_type"))
        if len(fm_matches) == 1:
            fm = fm_matches[0]
            pending_data["failure_mode"] = fm
            pending_data["failure_mode_id"] = fm.get("id")
            pending_data["failure_mode_name"] = fm.get("failure_mode")
            return _result(
                text=_chat_ui(
                    loc,
                    f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                    f"Melding vastgelegd voor {_equip_label(pending_data.get('equipment', {}))}.",
                ),
                state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)
        elif len(fm_matches) > 1:
            return _result(
                text=_chat_ui(
                    loc,
                    f"Equipment: {_equip_label(pending_data.get('equipment', {}))}. "
                    f"Which failure type? Please select:",
                    f"Apparatuur: {_equip_label(pending_data.get('equipment', {}))}. "
                    f"Welke storingscategorie? Maak een keuze:",
                ),
                state=ChatState.AWAITING_FAILURE_MODE, fm_sugg=fm_matches, new_fm_opt=True)
        else:
            return _result(
                text=_chat_ui(
                    loc,
                    f"Equipment: {_equip_label(pending_data.get('equipment', {}))}. "
                    f"No matching failure mode found. Would you like to specify the failure mode?",
                    f"Apparatuur: {_equip_label(pending_data.get('equipment', {}))}. "
                    f"Geen passende storingsmodus gevonden. Wilt u de storingsmodus zelf opgeven?",
                ),
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
            return _result(
                text=_chat_ui(
                    loc,
                    f"Observation recorded for {_equip_label(pending_data.get('equipment', {}))}.",
                    f"Melding vastgelegd voor {_equip_label(pending_data.get('equipment', {}))}.",
                ),
                state=ChatState.COMPLETE, pending=pending_data, create=True, obs_data=pending_data)
        return _result(
            text=_chat_ui(
                loc,
                "Please provide a valid failure mode name (at least 3 characters):",
                "Geef een geldige storingsmodus (minimaal 3 tekens):",
            ),
            state=ChatState.AWAITING_NEW_FAILURE_MODE)

    # ==============================
    # INITIAL — fresh message (QUICK REPORT MODE)
    # ==============================
    # Quick Report Flow: Create observation immediately with AI auto-selection
    # User can always edit equipment and failure mode later
    
    eq_matches = await search_equipment_hierarchy(db, message_content, user_id)
    pd0 = {**pending_data, "original_description": message_content}
    
    # Auto-select equipment only if single match with >= 80% confidence
    # Otherwise, show list for user selection (for multiple matches or low confidence)
    selected_equipment = None
    
    if len(eq_matches) == 1 and eq_matches[0].get("confidence", 0) >= 80:
        # High confidence single match - auto-select
        selected_equipment = eq_matches[0]
        logger.info(f"Quick report: Auto-selected equipment with {eq_matches[0].get('confidence')}% confidence: {selected_equipment.get('name')} ({selected_equipment.get('tag')})")
        pd0["ai_auto_selected_equipment"] = True
    elif len(eq_matches) >= 1:
        # Multiple matches OR single low-confidence match - ask user to select
        logger.info(f"Quick report: {len(eq_matches)} equipment match(es) found, asking user to select")
        return _result(
            text=_chat_ui(
                loc,
                "Which equipment? Please select:",
                "Welk stuk apparatuur bedoelt u? Maak een keuze:",
            ),
            state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches, orig=message_content, pending=pd0)
    else:
        # No equipment found - use unknown placeholder
        selected_equipment = _unknown_equipment_placeholder(pd0)
        logger.info("Quick report: No equipment match, using unknown placeholder")
        pd0["ai_auto_selected_equipment"] = True
    
    # Set equipment data in pending
    pd0["equipment"] = selected_equipment
    pd0["equipment_id"] = selected_equipment.get("id")
    pd0["equipment_name"] = selected_equipment.get("name")
    pd0["equipment_type"] = selected_equipment.get("equipment_type")
    pd0["criticality"] = selected_equipment.get("criticality")
    pd0["installation_id"] = selected_equipment.get("installation_id")
    
    # Auto-select best failure mode
    fm_matches = search_failure_modes(failure_modes_library, message_content, selected_equipment.get("equipment_type"))
    
    if len(fm_matches) >= 1:
        # Use the best match
        fm = fm_matches[0]
        pd0["failure_mode"] = fm
        pd0["failure_mode_id"] = fm.get("id")
        pd0["failure_mode_name"] = fm.get("failure_mode")
        pd0["recommended_actions"] = fm.get("recommended_actions", [])
        pd0["ai_auto_selected_failure_mode"] = True  # Flag that this was auto-selected
        logger.info(f"Quick report: Auto-selected failure mode: {fm.get('failure_mode')}")
    else:
        # No failure mode found - use original description as failure mode name
        pd0["failure_mode_name"] = message_content[:100] if len(message_content) > 100 else message_content
        pd0["is_custom_failure_mode"] = True
        pd0["ai_auto_selected_failure_mode"] = False
        logger.info("Quick report: No failure mode match, using description as custom failure mode")
    
    # Build response message showing what was auto-selected
    eq_label = _equip_label(selected_equipment)
    fm_label = pd0.get("failure_mode_name", "Not specified")
    
    # Determine if selections need review
    needs_review_items = []
    if not selected_equipment.get("id"):
        needs_review_items.append("equipment")
    if not pd0.get("failure_mode_id"):
        needs_review_items.append("failure mode")
    
    if needs_review_items:
        review_note = _chat_ui(
            loc,
            f"\n\n⚠️ Please review and update the {' and '.join(needs_review_items)} in the observation details.",
            f"\n\n⚠️ Controleer en update de {' en '.join(needs_review_items)} in de observatiedetails.",
        )
    else:
        review_note = _chat_ui(
            loc,
            "\n\n✓ AI auto-selected equipment and failure mode. You can edit these in the observation details if needed.",
            "\n\n✓ AI heeft automatisch apparatuur en storingsmodus geselecteerd. U kunt deze aanpassen in de observatiedetails indien nodig.",
        )
    
    return _result(
        text=_chat_ui(
            loc,
            f"Observation recorded!\n\n📍 Equipment: {eq_label}\n⚠️ Issue: {fm_label}{review_note}",
            f"Melding vastgelegd!\n\n📍 Apparatuur: {eq_label}\n⚠️ Storing: {fm_label}{review_note}",
        ),
        state=ChatState.COMPLETE,
        pending=pd0,
        create=True,
        obs_data=pd0,
        orig=message_content
    )
