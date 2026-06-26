"""Persist chat state after process_chat_message (observation or in-flow)."""
import logging
from typing import Optional

from ai_helpers import generate_observation_description
from chat_handler_v2 import ChatState
from models.api_models import ChatResponse
from services.chat_routes_confirm import threat_to_response
from services.chat_routes_observation import create_observation
from services.chat_routes_state import (
    read_conv,
    store_assistant_msg,
    write_conv,
)

logger = logging.getLogger(__name__)


async def finalize_chat_machine_result(
    user_id: str,
    session_id: str,
    detected_lang: str,
    image_thumbnail: Optional[str],
    result: dict,
    ai_mode: bool = False,
) -> ChatResponse:
    """Persist state + assistant message after `process_chat_message`."""
    new_state = result["state"]
    resp_text = result["response_text"]
    conv = await read_conv(user_id)

    logger.info(
        "_save_and_respond: create_observation=%s, has_obs_data=%s, ai_mode=%s",
        result.get("create_observation"),
        bool(result.get("observation_data")),
        ai_mode,
    )

    if result.get("create_observation") and result.get("observation_data"):
        obs_data = result.get("observation_data") or {}

        original_input = (
            conv.get("issue_description")
            or conv.get("original_message")
            or result.get("original_message")
            or obs_data.get("original_description")
            or ""
        )

        issue_summary = conv.get("issue_summary") or ""
        parsed_description = ""
        for line in issue_summary.split("\n"):
            if "**Description:**" in line or "**Beschrijving:**" in line:
                parsed_description = (
                    line.replace("**Description:**", "")
                    .replace("**Beschrijving:**", "")
                    .strip()
                )
                break

        if not parsed_description and original_input:
            chat_lang = (obs_data.get("chat_ui_language") or "en").lower()
            parsed_description = await generate_observation_description(
                user_input=original_input,
                equipment_name=obs_data.get("equipment_name"),
                failure_mode=obs_data.get("failure_mode_name"),
                language=chat_lang,
                use_ai=ai_mode,
            )
            logger.info(
                "Generated observation description (ai_mode=%s): %s...",
                ai_mode,
                parsed_description[:100],
            )

        user_description = parsed_description or original_input or ""

        obs = await create_observation(
            user_id, obs_data, session_id, image_thumbnail, user_description
        )
        threat = obs["threat"]
        auto_actions = obs["auto_created_actions"]
        new_threat_id = obs["threat_id"]

        ctx_nl = obs_data.get("chat_ui_language") == "nl"

        actions_info = ""
        if auto_actions:
            if ctx_nl:
                actions_info = f"\n\n**{len(auto_actions)} actie(s) automatisch aangemaakt:**\n"
                for a in auto_actions[:3]:
                    actions_info += f"- {a['title'][:50]}{'...' if len(a['title'])>50 else ''}\n"
                if len(auto_actions) > 3:
                    actions_info += f"- ...en nog {len(auto_actions)-3}\n"
            else:
                actions_info = f"\n\n**{len(auto_actions)} action(s) auto-created:**\n"
                for a in auto_actions[:3]:
                    actions_info += f"- {a['title'][:50]}{'...' if len(a['title'])>50 else ''}\n"
                if len(auto_actions) > 3:
                    actions_info += f"- ...and {len(auto_actions)-3} more\n"

        if ctx_nl:
            context_prompt = (
                f"Melding vastgelegd: **{threat['title']}**{actions_info}\n\n"
                f"Wilt u aanvullende context toevoegen? Dat kan bijvoorbeeld:\n"
                f"- Opmerkingen over wat u heeft gezien\n"
                f"- Temperaturen of metingen\n"
                f"- Omstandigheden (weer, bedrijfstoestand)\n"
                f"- Een foto van het probleem\n\n"
                f"Typ uw opmerkingen of zeg 'skip' om verder te gaan."
            )
        else:
            context_prompt = (
                f"Observation recorded: **{threat['title']}**{actions_info}\n\n"
                f"Would you like to add any additional context? You can:\n"
                f"- Add comments about what you observed\n"
                f"- Provide temperature or measurement readings\n"
                f"- Describe the conditions (weather, operating state)\n"
                f"- Upload a photo of the issue\n\n"
                f"Type your observations or say 'skip' to continue."
            )

        await write_conv(
            user_id,
            state=ChatState.AWAITING_CONTEXT,
            pending_data={},
            equipment_suggestions=None,
            failure_mode_suggestions=None,
            original_message=None,
            awaiting_context_for_threat=new_threat_id,
            issue_description=None,
            issue_summary=None,
        )

        eq_data = result["observation_data"].get("equipment", {})
        await store_assistant_msg(
            user_id,
            context_prompt,
            chat_state=ChatState.AWAITING_CONTEXT,
            threat_id=new_threat_id,
            threat_title=threat["title"],
            threat_asset=threat["asset"],
            threat_equipment_type=threat.get("equipment_type"),
            threat_equipment_tag=eq_data.get("tag"),
            threat_description=threat.get("description", ""),
            threat_risk_level=threat["risk_level"],
            threat_risk_score=threat["risk_score"],
            threat_rank=threat.get("rank"),
            threat_summary=True,
            awaiting_context_for_threat=new_threat_id,
            question_type="context",
        )

        return ChatResponse(
            message=context_prompt,
            threat=threat_to_response(threat),
            follow_up_question=context_prompt,
            question_type="context",
            awaiting_context_for_threat=new_threat_id,
            detected_language=detected_lang,
            is_mixed_language=bool((obs_data or {}).get("mixed_language_input")),
        )

    await write_conv(
        user_id,
        state=new_state,
        pending_data=result.get("pending_data", {}),
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        original_message=result.get("original_message"),
        awaiting_context_for_threat=None,
    )

    q_type = (
        "asset"
        if result.get("equipment_suggestions")
        else ("failure" if result.get("failure_mode_suggestions") is not None else None)
    )

    await store_assistant_msg(
        user_id,
        resp_text,
        chat_state=new_state,
        pending_data=result.get("pending_data", {}),
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        show_new_failure_mode_option=result.get("show_new_failure_mode_option"),
        question_type=q_type,
        original_message=result.get("original_message"),
    )

    return ChatResponse(
        message=resp_text,
        follow_up_question=resp_text if new_state != ChatState.COMPLETE else None,
        question_type=q_type,
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        show_new_failure_mode_option=result.get("show_new_failure_mode_option"),
        detected_language=detected_lang,
        is_mixed_language=bool((result.get("pending_data") or {}).get("mixed_language_input")),
    )
