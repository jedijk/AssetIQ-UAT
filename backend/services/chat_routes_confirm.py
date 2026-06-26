"""Issue-confirmation helpers and threat response normalization for chat."""
from datetime import datetime, timezone

from models.api_models import ThreatResponse
from utils.text_language import analyze_text_languages


def issue_confirm_yes(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    if t in {
        "yes", "y", "yeah", "yep", "correct", "ok", "okay", "sure", "fine",
        "ja", "klopt", "akkoord", "precies", "continue", "proceed", "next", "go",
        "accept", "accepteren", "confirm", "bevestig", "bevestigen",
    }:
        return True
    return (
        t.startswith("yes")
        or t.startswith("ja ")
        or t.startswith("ja,")
        or t.startswith("ok ")
        or t.startswith("accept")
    )


def issue_confirm_no(text: str) -> bool:
    t = (text or "").strip().lower()
    return t in {
        "no", "nope", "nee", "incorrect", "wrong", "not correct", "klopt niet",
        "revise", "revision", "change", "different", "anders", "aanpassen", "wijzig",
    }


def issue_confirm_assistant_text(detected_lang: str, summary: str) -> str:
    """Generate confirmation message with professional summary and clear action options."""
    if detected_lang == "nl":
        return (
            f"📋 **Observatie Samenvatting**\n\n"
            f"{summary}\n\n"
            f"---\n"
            f"**Kies een actie:**\n"
            f"• **Accepteren** - Maak de melding aan met bovenstaande gegevens\n"
            f"• **Aanpassen** - Typ uw wijzigingen hieronder\n"
            f"• **Annuleren** - Stop en begin opnieuw"
        )
    return (
        f"📋 **Observation Summary**\n\n"
        f"{summary}\n\n"
        f"---\n"
        f"**Choose an action:**\n"
        f"• **Accept** - Create observation with above details\n"
        f"• **Revise** - Type your changes below\n"
        f"• **Cancel** - Stop and start over"
    )


def issue_confirm_language_code(detected_lang: str) -> str:
    return "nl" if detected_lang == "nl" else "en"


def threat_to_response(threat: dict) -> ThreatResponse:
    """Normalize a threat document before Pydantic validation."""
    data = dict(threat or {})
    if isinstance(data.get("risk_score"), float):
        data["risk_score"] = int(data["risk_score"])
    if data.get("recommended_actions") is None:
        data["recommended_actions"] = []
    data.setdefault("rank", 1)
    data.setdefault("total_threats", 1)
    data.setdefault("occurrence_count", 1)
    data.setdefault("impact", "Equipment Damage")
    data.setdefault("frequency", "First Time")
    data.setdefault("likelihood", "Possible")
    data.setdefault("detectability", "Moderate")
    data.setdefault("status", "Observation")
    data.setdefault("created_by", "")
    data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    return ThreatResponse(**data)


def issue_confirm_ui_lang_from_copy(summary: str, issue_body: str, fallback: str) -> str:
    """Match issue-confirm chrome to readable language."""
    blob = f"{summary or ''}\n{issue_body or ''}".strip()
    if len(blob) < 3:
        fb = (fallback or "en").lower()[:2]
        return fb if fb == "nl" else "en"

    profile = analyze_text_languages(blob)
    if profile.get("is_mixed"):
        fb = (fallback or "en").lower()[:2]
        return fb if fb in ("nl", "de") else "en"

    primary = profile.get("primary") or "en"
    if primary == "nl":
        return "nl"
    if primary == "de":
        return "en"
    return "en"
