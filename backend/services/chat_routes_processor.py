"""Core chat state machine processing (text + voice)."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from ai_helpers import (
    analyze_attachment_image,
    answer_data_query,
    classify_user_intent,
    get_data_context,
    merge_issue_description_with_edit,
    summarize_issue_description,
)
from chat_handler_v2 import ChatState, _chat_ui, process_chat_message
from database import db
from models.api_models import ChatResponse
from services.chat_central_action_service import create_chat_central_action
from services.chat_routes_confirm import (
    issue_confirm_assistant_text,
    issue_confirm_language_code,
    issue_confirm_no,
    issue_confirm_ui_lang_from_copy,
    issue_confirm_yes,
)
from services.chat_routes_finalize import finalize_chat_machine_result
from services.chat_routes_media import compress_image
from services.chat_routes_state import (
    get_failure_modes_from_db,
    read_conv,
    reset_conv,
    store_assistant_msg,
    tenant_ctx_for_user,
    write_conv,
)
from services.equipment_search_service import search_equipment_hierarchy
from services.tenant_schema import with_tenant_id
from services.tenant_scope import scoped
from utils.auto_translate import translate_action
from utils.text_language import resolve_chat_ui_language

logger = logging.getLogger(__name__)


async def core_chat_process(user_id: str, content: str, session_id: str,
                             detected_lang: str, image_base64: str = None, ai_mode: bool = False):
    """
    Central chat processing used by both /chat/send and /chat/voice-send.
    Returns a ChatResponse-compatible dict.
    
    ai_mode: When True, enables AI-powered description generation and better
             language detection (slower). When False, uses fast text processing.
    """
    logger.info(f"=== CHAT REQUEST === user={user_id}, content={content[:50] if content else 'None'}..., ai_mode={ai_mode}")
    
    image_thumbnail = None
    if image_base64:
        image_thumbnail = compress_image(image_base64)
    
    # 0. Stale control signals — when the conversation is INITIAL (no active prompt),
    # silently swallow command words like "skip", "cancel", "yes", "no", "ok".
    # These usually mean an earlier auto-skip/double-click fired after the active
    # context had already ended. Without this guard the bot stores "skip" in
    # history AND treats it as a new observation, producing duplicate or
    # nonsensical messages like 'Here is what I understood: skip'.
    _content_lc = (content or "").strip().lower()
    _ignored_commands = {
        "skip", "cancel", "yes", "y", "no", "n", "ok", "okay",
        "revise", "ja", "nee", "klopt", "akkoord",
    }
    if not image_base64 and _content_lc in _ignored_commands:
        _conv_peek = await read_conv(user_id)
        if _conv_peek.get("state", ChatState.INITIAL) == ChatState.INITIAL:
            # Neither store the user message nor reply — keep the UI clean.
            return ChatResponse(message="", detected_language=detected_lang, is_mixed_language=None)

    tenant_user = await tenant_ctx_for_user(user_id)

    # 1. Store user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "user",
        "content": content,
        "has_image": image_base64 is not None,
        "image_data": image_thumbnail,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with_tenant_id(user_msg, await tenant_ctx_for_user(user_id))
    await db.chat_messages.insert_one(user_msg)

    # 2. Read conversation state (single source of truth)
    conv = await read_conv(user_id)
    state = conv.get("state", ChatState.INITIAL)
    pending_data = dict(conv.get("pending_data") or {})
    low = content.strip().lower()
    short_cmd = (
        low
        in {
            "yes", "y", "yeah", "yep", "ja", "ja,", "skip", "revise", "no", "nee",
            "cancel", "ok", "okay", "klopt", "akkoord",
        }
        or len(content.strip()) < 4
    )
    sticky_ul = conv.get("chat_ui_language")
    explicit_ul = (detected_lang or "").lower()[:2] if detected_lang else None
    if explicit_ul not in ("nl", "en", "de"):
        explicit_ul = None
    ul, lang_profile = resolve_chat_ui_language(
        content,
        explicit=explicit_ul,
        fallback=explicit_ul or sticky_ul or "en",
        sticky=sticky_ul,
        short_command=short_cmd,
    )
    pending_data["chat_ui_language"] = ul
    if lang_profile.get("is_mixed"):
        pending_data["mixed_language_input"] = True
    await write_conv(user_id, chat_ui_language=ul)
    ui_is_nl = ul == "nl"
    is_mixed_language = bool(lang_profile.get("is_mixed"))
    original_message = conv.get("original_message")
    eq_suggestions = conv.get("equipment_suggestions") or []
    fm_suggestions = conv.get("failure_mode_suggestions") or []
    threat_id = conv.get("awaiting_context_for_threat")

    from database import get_current_db_name
    logger.info(f"Chat: db={get_current_db_name()}, user={user_id[:20]}, state={state}, msg='{content[:50]}'")

    # ------------------------------------------------------------------
    # 3. Issue description summary / confirm (before equipment & failure modes)
    # ------------------------------------------------------------------
    if state == ChatState.AWAITING_ISSUE_CONFIRM:
        issue_desc = (conv.get("issue_description") or "").strip()
        if content.strip().lower() == "cancel":
            await reset_conv(user_id)
            reply = (
                "Geannuleerd. Wat wilt u melden?"
                if ui_is_nl
                else "Cancelled. What would you like to report?"
            )
            await store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
            return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)

        if issue_confirm_yes(content):
            if not issue_desc:
                await reset_conv(user_id)
                reply = (
                    "Begin opnieuw met een korte beschrijving van het probleem."
                    if ui_is_nl
                    else "Please start again with a short description of the issue."
                )
                await store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
                return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)
            await write_conv(user_id, issue_description=None, issue_summary=None)
            fm_library = await get_failure_modes_from_db()
            pd = {
                **pending_data,
                "original_description": issue_desc,
                "issue_description": issue_desc,
            }
            result = await process_chat_message(
                db=db,
                user_id=user_id,
                message_content=issue_desc,
                failure_modes_library=fm_library,
                current_state=ChatState.INITIAL,
                pending_data=pd,
                prev_equipment_suggestions=[],
                prev_failure_mode_suggestions=[],
                original_message=issue_desc,
                ui_language=detected_lang,
            )
            return await finalize_chat_machine_result(
                user_id, session_id, detected_lang, image_thumbnail, result, ai_mode
            )

        if issue_confirm_no(content):
            await write_conv(
                user_id,
                state=ChatState.AWAITING_ISSUE_DESCRIPTION,
                issue_description=None,
                issue_summary=None,
            )
            reply = (
                "Geef het probleem opnieuw kort met eigen woorden."
                if ui_is_nl
                else "Please describe the issue again in your own words."
            )
            await store_assistant_msg(
                user_id, reply,
                chat_state=ChatState.AWAITING_ISSUE_DESCRIPTION,
                question_type="issue_redescribe",
            )
            return ChatResponse(
                message=reply,
                follow_up_question=reply,
                question_type="issue_redescribe",
                detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            )

        prior_summary = (conv.get("issue_summary") or "").strip()
        if issue_desc:
            merged = await merge_issue_description_with_edit(
                issue_desc, prior_summary, content, detected_lang
            )
            updated_issue = (merged or "").strip() or content.strip()
        else:
            updated_issue = content.strip()

        summary = await summarize_issue_description(updated_issue, detected_lang)
        await write_conv(
            user_id,
            state=ChatState.AWAITING_ISSUE_CONFIRM,
            issue_description=updated_issue,
            issue_summary=summary,
        )
        ic_ui_lang = issue_confirm_ui_lang_from_copy(
            summary, updated_issue, pending_data.get("chat_ui_language") or detected_lang
        )
        reply = issue_confirm_assistant_text(ic_ui_lang, summary)
        ic_lang = issue_confirm_language_code(ic_ui_lang)
        await store_assistant_msg(
            user_id, reply,
            chat_state=ChatState.AWAITING_ISSUE_CONFIRM,
            question_type="issue_confirm",
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )
        return ChatResponse(
            message=reply,
            follow_up_question=reply,
            question_type="issue_confirm",
            detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )

    if state == ChatState.AWAITING_ISSUE_DESCRIPTION:
        if content.strip().lower() == "cancel":
            await reset_conv(user_id)
            reply = (
                "Geannuleerd. Wat wilt u melden?"
                if ui_is_nl
                else "Cancelled. What would you like to report?"
            )
            await store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
            return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)
        summary = await summarize_issue_description(content, detected_lang)
        await write_conv(
            user_id,
            state=ChatState.AWAITING_ISSUE_CONFIRM,
            issue_description=content,
            issue_summary=summary,
        )
        ic_ui_lang = issue_confirm_ui_lang_from_copy(
            summary, content, pending_data.get("chat_ui_language") or detected_lang
        )
        reply = issue_confirm_assistant_text(ic_ui_lang, summary)
        ic_lang = issue_confirm_language_code(ic_ui_lang)
        await store_assistant_msg(
            user_id, reply,
            chat_state=ChatState.AWAITING_ISSUE_CONFIRM,
            question_type="issue_confirm",
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )
        return ChatResponse(
            message=reply,
            follow_up_question=reply,
            question_type="issue_confirm",
            detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )

    # ------------------------------------------------------------------
    # 4. AWAITING_CONTEXT — handle context/skip (highest priority)
    # ------------------------------------------------------------------
    if state == ChatState.AWAITING_CONTEXT:
        analysis = None
        skip_phrases = {"skip", "no", "done", "next", "nee", "klaar", "volgende"}
        is_skip = content.strip().lower() in skip_phrases

        if not is_skip and threat_id:
            ctx = {"user_context": content, "context_added_at": datetime.now(timezone.utc).isoformat()}
            if image_base64:
                att = {"type": "image", "data": image_thumbnail,
                       "description": content, "created_at": datetime.now(timezone.utc).isoformat()}
                from services.work_signal_lifecycle import update_work_signal

                await update_work_signal(
                    threat_id,
                    user=tenant_user,
                    set_fields=ctx,
                    push_fields={"attachments": att},
                    graph_label="chat_context_image",
                    sync_graph=False,
                )

                # AI image analysis — analyze photo and update threat with findings
                threat_doc = await db.threats.find_one(
                    scoped(tenant_user, {"id": threat_id}) if tenant_user else {"id": threat_id},
                    {"_id": 0, "title": 1, "asset": 1, "failure_mode": 1},
                )
                threat_context = f"{threat_doc.get('title', '')} — {threat_doc.get('asset', '')} — {threat_doc.get('failure_mode', '')}" if threat_doc else content
                analysis = await analyze_attachment_image(image_thumbnail, threat_context)
                if analysis:
                    analysis_update = {
                        "image_analysis": analysis,
                        "image_analysis_at": datetime.now(timezone.utc).isoformat(),
                    }
                    if analysis.get("severity"):
                        sev = analysis["severity"].lower()
                        if sev in ("critical", "high"):
                            analysis_update["ai_severity"] = sev
                    
                    # Build AI analysis text to append to description
                    ai_analysis_parts = []
                    if analysis.get("image_description"):
                        ai_analysis_parts.append(f"AI Photo Analysis: {analysis['image_description']}")
                    if analysis.get("visible_damage"):
                        ai_analysis_parts.append("Visible damage: " + "; ".join(analysis["visible_damage"]))
                    if analysis.get("safety_concerns"):
                        ai_analysis_parts.append("Safety concerns: " + "; ".join(analysis["safety_concerns"]))
                    
                    # Merge AI analysis into description field
                    if ai_analysis_parts:
                        ai_analysis_text = "\n".join(ai_analysis_parts)
                        # Get current description and append AI analysis
                        current_threat = await db.threats.find_one(
                            scoped(tenant_user, {"id": threat_id}) if tenant_user else {"id": threat_id},
                            {"_id": 0, "description": 1},
                        )
                        current_desc = (current_threat or {}).get("description", "") or ""
                        if current_desc:
                            new_desc = f"{current_desc}\n\n{ai_analysis_text}"
                        else:
                            new_desc = ai_analysis_text
                        analysis_update["description"] = new_desc
                    
                    await update_work_signal(
                        threat_id,
                        user=tenant_user,
                        set_fields=analysis_update,
                        graph_label="chat_image_analysis",
                        sync_graph=False,
                    )

                    # Create actions from AI recommendations
                    ai_actions = analysis.get("recommended_actions", [])
                    created_action_ids = []
                    threat_full = await db.threats.find_one(
                        scoped(tenant_user, {"id": threat_id}) if tenant_user else {"id": threat_id},
                        {
                            "_id": 0,
                            "title": 1,
                            "asset": 1,
                            "linked_equipment_id": 1,
                            "installation_id": 1,
                            "fmea_rpn": 1,
                            "risk_score": 1,
                            "risk_level": 1,
                        },
                    )
                    for ra in ai_actions:
                        action_desc = ra.get("action", "")
                        if not action_desc:
                            continue
                        action_doc = await create_chat_central_action(
                            user_id=user_id,
                            threat_id=threat_id,
                            threat_title=(threat_full or threat_doc or {}).get("title", ""),
                            title=action_desc[:200],
                            description=action_desc,
                            action_type=ra.get("type", "CM"),
                            discipline=ra.get("discipline", "Mechanical"),
                            priority=ra.get("priority", "medium"),
                            linked_equipment_id=(threat_full or {}).get("linked_equipment_id"),
                            equipment_name=(threat_full or threat_doc or {}).get("asset"),
                            auto_source="image_analysis",
                            installation_id=(threat_full or {}).get("installation_id"),
                            rpn=(threat_full or {}).get("fmea_rpn"),
                            risk_score=(threat_full or {}).get("risk_score"),
                            risk_level=(threat_full or {}).get("risk_level"),
                        )
                        aid = action_doc["id"]
                        asyncio.create_task(
                            translate_action(
                                aid,
                                {
                                    "title": action_doc.get("title", ""),
                                    "description": action_doc.get("description", "") or "",
                                },
                                user_id,
                            )
                        )
                        created_action_ids.append(aid)

                    if created_action_ids:
                        threat_row = await db.threats.find_one(
                            scoped(tenant_user, {"id": threat_id}) if tenant_user else {"id": threat_id},
                            {"_id": 0, "auto_created_action_ids": 1},
                        )
                        prior = (threat_row or {}).get("auto_created_action_ids") or []
                        await update_work_signal(
                            threat_id,
                            user=tenant_user,
                            set_fields={"auto_created_action_ids": prior + created_action_ids},
                            graph_label="chat_image_actions",
                            sync_graph=False,
                        )
            else:
                await update_work_signal(
                    threat_id,
                    user=tenant_user,
                    set_fields=ctx,
                    graph_label="chat_context_text",
                    sync_graph=False,
                )

        # Build reply and determine next state
        if is_skip:
            # User explicitly skipped - reset and move on
            await reset_conv(user_id)
            reply = (
                "Begrepen! Uw melding is opgeslagen. Wat wilt u nog melden?"
                if ui_is_nl
                else "Got it! Your observation has been saved. What else would you like to report?"
            )
            await store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
            return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)
        
        # User added context - ask for more context (keep skip timer running)
        if image_base64 and analysis:
            if ui_is_nl:
                parts = ["Bedankt! Ik heb uw foto toegevoegd aan de melding."]
                desc = analysis.get("image_description")
                if desc:
                    parts.append(f"\n\n**Beeldanalyse:** {desc}")
                severity = analysis.get("severity")
                if severity:
                    parts.append(f"\n**Ingeschatte ernst:** {severity.capitalize()}")
                safety = analysis.get("safety_concerns", [])
                if safety:
                    parts.append("\n**Veiligheid:** " + "; ".join(safety))
                ai_actions = analysis.get("recommended_actions", [])
                if ai_actions:
                    parts.append(f"\n\n**{len(ai_actions)} actie(s) aangemaakt op basis van de foto:**")
                    for a in ai_actions[:3]:
                        parts.append(f"- [{a.get('priority','').capitalize()}] {a.get('action','')[:80]}")
                parts.append(
                    "\n\n**Wilt u nog foto's of aanvullende context toevoegen?** "
                    "U kunt overslaan als u klaar bent."
                )
            else:
                parts = ["Thanks! I've added your photo to the observation."]
                desc = analysis.get("image_description")
                if desc:
                    parts.append(f"\n\n**Image analysis:** {desc}")
                severity = analysis.get("severity")
                if severity:
                    parts.append(f"\n**Assessed severity:** {severity.capitalize()}")
                safety = analysis.get("safety_concerns", [])
                if safety:
                    parts.append("\n**Safety concerns:** " + "; ".join(safety))
                ai_actions = analysis.get("recommended_actions", [])
                if ai_actions:
                    parts.append(f"\n\n**{len(ai_actions)} action(s) created from photo analysis:**")
                    for a in ai_actions[:3]:
                        parts.append(f"- [{a.get('priority','').capitalize()}] {a.get('action','')[:80]}")
                parts.append("\n\n**Would you like to add more photos or context?** You can skip if you're done.")
            reply = "".join(parts)
        elif image_base64:
            reply = (
                "Bedankt! Ik heb uw foto toegevoegd aan de melding.\n\n"
                "**Wilt u nog foto's of aanvullende context toevoegen?** U kunt overslaan als u klaar bent."
                if ui_is_nl
                else (
                    "Thanks! I've added your photo to the observation.\n\n"
                    "**Would you like to add more photos or context?** You can skip if you're done."
                )
            )
        else:
            reply = (
                "Bedankt! Ik heb uw aanvullende tekst toegevoegd aan de melding.\n\n"
                "**Wilt u nog foto's of aanvullende context toevoegen?** U kunt overslaan als u klaar bent."
                if ui_is_nl
                else (
                    "Thanks! I've added your context to the observation.\n\n"
                    "**Would you like to add more photos or context?** You can skip if you're done."
                )
            )

        # Keep awaiting_context state so skip timer runs
        await write_conv(
            user_id,
            state=ChatState.AWAITING_CONTEXT,
            pending_data={},
            awaiting_context_for_threat=threat_id,
        )
        await store_assistant_msg(
            user_id, reply,
            chat_state="awaiting_context",
            awaiting_context_for_threat=threat_id,
            question_type="context",
        )
        return ChatResponse(
            message=reply,
            follow_up_question=reply,
            question_type="context",
            awaiting_context_for_threat=threat_id,
            detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
        )

    # ------------------------------------------------------------------
    # 5. Intent classification (only in INITIAL, no image, not in-flow)
    # ------------------------------------------------------------------
    in_flow = state in {
        ChatState.AWAITING_ISSUE_CONFIRM,
        ChatState.AWAITING_ISSUE_DESCRIPTION,
        ChatState.AWAITING_EQUIPMENT,
        ChatState.AWAITING_FAILURE_MODE,
        ChatState.AWAITING_NEW_FAILURE_MODE,
    }
    
    logger.info(f"Chat flow check: state={state}, in_flow={in_flow}, has_image={bool(image_base64)}")
    
    if state == ChatState.INITIAL and not in_flow and not image_base64:
        # Quick check: Skip intent classification if message looks like an issue report
        # This saves ~1-2 seconds of AI call time
        content_lower = content.lower()
        issue_keywords = [
            # English
            "broken", "overheating", "leaking", "noise", "vibration", "failure", 
            "issue", "problem", "defect", "damage", "fault", "error", "malfunction",
            "reporting", "report", "equipment", "hot", "cold", "high", "low",
            # Dutch
            "kapot", "lek", "storing", "defect", "probleem", "schade", "fout",
            "temperatuur", "hoog", "laag", "warm", "koud", "geluid", "trilling",
            "melding", "apparaat", "machine", "motor", "pomp", "falen",
            "oververhitting", "lekkage", "slijtage", "breuk",
        ]
        looks_like_issue = any(kw in content_lower for kw in issue_keywords)
        
        # Only run intent classification if it doesn't look like an issue report
        if not looks_like_issue:
            intent = await classify_user_intent(content, session_id)
            if intent.get("is_data_query") and intent.get("confidence", 0) > 0.6:
                data_ctx = await get_data_context(user_id, intent.get("entities"))
                answer = (await answer_data_query(content, session_id, data_ctx)).get(
                    "answer", "I couldn't find the information you're looking for."
                )
                await store_assistant_msg(user_id, answer, chat_state=ChatState.INITIAL, is_data_query=True)
                return ChatResponse(message=answer, question_type="data_query", detected_language=detected_lang, is_mixed_language=is_mixed_language or None)

        # ------------------------------------------------------------------
        # Check equipment confidence BEFORE summary
        # If no high-confidence equipment match, ask user to select first
        # ------------------------------------------------------------------
        eq_matches = await search_equipment_hierarchy(db, content, user_id, ui_language=ul)
        
        # Check if the TOP match has high confidence (>= 80%)
        # This covers both single matches and cases where exact tag gives 100% confidence
        has_high_confidence_match = (
            len(eq_matches) >= 1 and eq_matches[0].get("confidence", 0) >= 80
        )
        
        if eq_matches and not has_high_confidence_match:
            # Low-confidence matches - ask for equipment selection FIRST
            logger.info(f"Chat: {len(eq_matches)} equipment matches, top confidence={eq_matches[0].get('confidence', 0)}%, asking user to select first")
            await write_conv(
                user_id,
                state=ChatState.AWAITING_EQUIPMENT,
                pending_data={"original_description": content, "chat_ui_language": ul},
                equipment_suggestions=eq_matches,
                failure_mode_suggestions=None,
                original_message=content,
                awaiting_context_for_threat=None,
                issue_description=content,
                issue_summary=None,
            )
            reply = _chat_ui(
                ul,
                "Which equipment? Please select:",
                "Welk stuk apparatuur bedoelt u? Maak een keuze:",
                "Welche Anlage? Bitte auswählen:",
            )
            await store_assistant_msg(
                user_id, reply,
                chat_state=ChatState.AWAITING_EQUIPMENT,
                question_type="equipment_select",
                equipment_suggestions=eq_matches,
            )
            return ChatResponse(
                message=reply,
                follow_up_question=reply,
                question_type="equipment_select",
                equipment_suggestions=eq_matches,
                detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            )
        
        if not eq_matches:
            # NO equipment matches found - ask user to specify equipment
            logger.info("Chat: No equipment matches found, asking user to specify equipment")
            await write_conv(
                user_id,
                state=ChatState.AWAITING_EQUIPMENT,
                pending_data={"original_description": content, "chat_ui_language": ul},
                equipment_suggestions=[],
                failure_mode_suggestions=None,
                original_message=content,
                awaiting_context_for_threat=None,
                issue_description=content,
                issue_summary=None,
            )
            reply = (
                "Ik kon de apparatuur niet vinden. Geef de naam of tag van de apparatuur op:"
                if ui_is_nl
                else "I couldn't find that equipment. Please specify the equipment name or tag:"
            )
            await store_assistant_msg(
                user_id, reply,
                chat_state=ChatState.AWAITING_EQUIPMENT,
                question_type="equipment_input",
                equipment_suggestions=[],
            )
            return ChatResponse(
                message=reply,
                follow_up_question=reply,
                question_type="equipment_input",
                equipment_suggestions=[],
                detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            )

        # High-confidence match - auto-select equipment and proceed to observation creation
        if has_high_confidence_match:
            selected_equipment = eq_matches[0]
            logger.info(f"Chat: Auto-selected equipment with {selected_equipment.get('confidence')}% confidence: {selected_equipment.get('name')} ({selected_equipment.get('tag')})")
            
            # Get failure modes library and auto-select failure mode
            fm_library = await db.failure_modes.find(
                scoped(tenant_user, {}) if tenant_user else {},
                {"_id": 0},
            ).to_list(1000)
            
            # Use chat_handler_v2 to process and auto-select failure mode
            result = await process_chat_message(
                db=db,
                user_id=user_id,
                message_content=selected_equipment.get("name", ""),  # Select equipment by name
                failure_modes_library=fm_library,
                current_state=ChatState.AWAITING_EQUIPMENT,
                pending_data={"original_description": content, "chat_ui_language": ul},
                prev_equipment_suggestions=[selected_equipment],
                prev_failure_mode_suggestions=[],
                original_message=content,
            )
            
            # Process the result through finalize_chat_machine_result if observation should be created
            return await finalize_chat_machine_result(user_id, session_id, detected_lang, None, result, ai_mode)

    # ------------------------------------------------------------------
    # 6. Process with state machine (equipment / failure mode flow)
    # ------------------------------------------------------------------
    fm_library = await get_failure_modes_from_db()

    result = await process_chat_message(
        db=db,
        user_id=user_id,
        message_content=content,
        failure_modes_library=fm_library,
        current_state=state,
        pending_data=pending_data,
        prev_equipment_suggestions=eq_suggestions,
        prev_failure_mode_suggestions=fm_suggestions,
        original_message=original_message,
        ui_language=detected_lang,
    )

    return await finalize_chat_machine_result(
        user_id, session_id, detected_lang, image_thumbnail, result, ai_mode
    )


