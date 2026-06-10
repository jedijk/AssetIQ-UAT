"""
Chat Handler V2 - Pure Business Logic

Matches equipment from hierarchy and failure modes from FMEA library.
No DB state queries — state is passed in by the caller (routes/chat.py).
"""

from __future__ import annotations

import re
import logging
from typing import List, Dict, Any, Optional

from services.equipment_search_service import (
    extract_keywords,
    extract_tag_from_message,
    lookup_equipment_by_tag,
    match_equipment_from_suggestions,
    normalize_text,
    search_equipment_hierarchy,
)

logger = logging.getLogger(__name__)


def _chat_ui(locale: str, en: str, nl: str, de: str | None = None) -> str:
    """Pick localized assistant string for chat (not for stored threats)."""
    loc = (locale or "en").lower()[:2]
    if loc == "nl":
        return nl
    if loc == "de":
        return de if de is not None else en
    return en


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
    de_markers = (
        " der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " eine ",
        " ein ", " dem ", " den ", " auch ", " aber ", " oder ", " pumpe ", " ventil ",
        " temperatur ", " undicht ", " defekt ", " stoerung ", " störung ", " meldung ",
        " bitte ", " kein ", " keine ", " funktioniert ", " gerät ", " anlage ",
    )
    if any(m in low for m in de_markers):
        return "de"
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
        "weet niet", "onbekend", "geen idee",
        "weiß nicht", "weiss nicht", "keine ahnung", "unbekannt",
        "weiss es nicht", "weiß es nicht",
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


def _build_complete_observation_result(
    pdata: Dict,
    equipment: Dict,
    fm_library: List[Dict],
    orig_msg: str,
    loc: str,
) -> Dict[str, Any]:
    """Auto-assign failure mode and finish observation creation (no user selection step)."""
    pdata = dict(pdata)
    pdata["equipment"] = equipment
    pdata["equipment_id"] = equipment.get("id")
    pdata["equipment_name"] = equipment.get("name")
    pdata["equipment_type"] = equipment.get("equipment_type")
    pdata["criticality"] = equipment.get("criticality")
    pdata["installation_id"] = equipment.get("installation_id")
    pdata.setdefault("chat_ui_language", loc)

    fm_matches = search_failure_modes(fm_library, orig_msg, equipment.get("equipment_type"))
    if fm_matches:
        fm = fm_matches[0]
        pdata["failure_mode"] = fm
        pdata["failure_mode_id"] = fm.get("id")
        pdata["failure_mode_name"] = fm.get("failure_mode")
        pdata["recommended_actions"] = fm.get("recommended_actions", [])
        pdata["ai_auto_selected_failure_mode"] = True
    else:
        pdata["failure_mode_name"] = orig_msg[:100] if len(orig_msg) > 100 else orig_msg
        pdata["is_custom_failure_mode"] = True
        pdata["ai_auto_selected_failure_mode"] = False
        pdata.pop("failure_mode", None)
        pdata.pop("failure_mode_id", None)
        pdata.pop("recommended_actions", None)

    eq_label = _equip_label(equipment)
    if not equipment.get("id"):
        review_note = _chat_ui(
            loc,
            "\n\n⚠️ Please review and update the equipment in the observation details.",
            "\n\n⚠️ Controleer en update de apparatuur in de observatiedetails.",
            "\n\n⚠️ Bitte prüfen und aktualisieren Sie die Anlage in den Beobachtungsdetails.",
        )
    else:
        review_note = _chat_ui(
            loc,
            "\n\n✓ You can edit details in the observation workspace if needed.",
            "\n\n✓ U kunt details aanpassen in de observatiewerkruimte indien nodig.",
            "\n\n✓ Sie können Details bei Bedarf im Beobachtungsbereich anpassen.",
        )

    text = _chat_ui(
        loc,
        f"Observation recorded!\n\n📍 Equipment: {eq_label}{review_note}",
        f"Melding vastgelegd!\n\n📍 Apparatuur: {eq_label}{review_note}",
        f"Beobachtung erfasst!\n\n📍 Anlage: {eq_label}{review_note}",
    )

    return {
        "response_text": text,
        "state": ChatState.COMPLETE,
        "pending_data": pdata,
        "equipment_suggestions": None,
        "failure_mode_suggestions": None,
        "show_new_failure_mode_option": False,
        "create_observation": True,
        "observation_data": pdata,
        "original_message": orig_msg,
    }


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
    from utils.text_language import resolve_chat_ui_language

    short_command = len((message_content or "").strip()) < 4
    ul, lang_profile = resolve_chat_ui_language(
        message_content,
        explicit=ui_language,
        fallback=ui_language or pending_data.get("chat_ui_language") or "en",
        sticky=pending_data.get("chat_ui_language"),
        short_command=short_command,
    )
    if lang_profile.get("is_mixed"):
        pending_data["mixed_language_input"] = True
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
                "Abgebrochen. Was möchten Sie melden?",
            ),
            state=ChatState.INITIAL,
            pending={"chat_ui_language": loc},
            orig=None,
        )

    # --- Helper: after equipment is selected, auto-assign failure mode and complete ---
    def _after_equipment_selected(equipment, fm_library, orig_msg, pdata):
        return _build_complete_observation_result(pdata, equipment, fm_library, orig_msg, loc)

    # ==============================
    # AWAITING_FAILURE_MODE / AWAITING_NEW_FAILURE_MODE (legacy — auto-complete)
    # ==============================
    if current_state in (ChatState.AWAITING_FAILURE_MODE, ChatState.AWAITING_NEW_FAILURE_MODE):
        equipment = pending_data.get("equipment") or _unknown_equipment_placeholder(pending_data)
        orig = pending_data.get("original_description") or original_message
        return _build_complete_observation_result(
            pending_data, equipment, failure_modes_library, orig, loc
        )

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

        eq_matches = await search_equipment_hierarchy(db, message_content, user_id, ui_language=loc)
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
                        "Ich habe eine mögliche Übereinstimmung gefunden. Bitte bestätigen oder mehr Details angeben:",
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
                    "Welche Anlage? Bitte auswählen:",
                ),
                state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches, orig=original_message)
        else:
            return _result(
                text=_chat_ui(
                    loc,
                    "I couldn't find that equipment. Please specify the equipment name or tag:",
                    "Ik heb dat apparaat niet gevonden. Geef de naam of het tag-nummer door:",
                    "Ich habe diese Anlage nicht gefunden. Bitte geben Sie den Namen oder das Tag an:",
                ),
                state=ChatState.AWAITING_EQUIPMENT,
                eq_sugg=prev_equipment_suggestions, orig=original_message)

    # ==============================
    # INITIAL — fresh message (QUICK REPORT MODE)
    # ==============================
    # Quick Report Flow: Create observation immediately with AI auto-selection
    # User can always edit equipment and failure mode later
    
    eq_matches = await search_equipment_hierarchy(db, message_content, user_id, ui_language=loc)
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
                "Welche Anlage? Bitte auswählen:",
            ),
            state=ChatState.AWAITING_EQUIPMENT, eq_sugg=eq_matches, orig=message_content, pending=pd0)
    else:
        # No equipment found - use unknown placeholder
        selected_equipment = _unknown_equipment_placeholder(pd0)
        logger.info("Quick report: No equipment match, using unknown placeholder")
        pd0["ai_auto_selected_equipment"] = True
    
    return _build_complete_observation_result(
        pd0, selected_equipment, failure_modes_library, message_content, loc
    )
