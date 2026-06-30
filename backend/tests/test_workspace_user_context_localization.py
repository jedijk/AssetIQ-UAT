import pytest

from utils.workspace_localization import localize_workspace_payload


@pytest.mark.asyncio
async def test_hides_user_context_when_same_as_description_in_source(monkeypatch):
    async def _noop_load(*_a, **_k):
        return {}

    monkeypatch.setattr(
        "utils.workspace_localization._load_entity_fields",
        _noop_load,
    )

    payload = {
        "observation": {
            "id": "obs-1",
            "description": "Pump filter blocked.",
            "user_context": "Pump filter blocked.",
        },
        "failure_mode": {},
        "reliability_intelligence": {},
        "recommended_actions": [],
        "action_plan": [],
    }

    out = await localize_workspace_payload(payload, "nl", allow_live_translation=False)
    obs = out["observation"]
    assert obs.get("show_user_context") is False
    assert "user_context" not in obs


@pytest.mark.asyncio
async def test_hides_untranslated_user_context_in_non_english_ui(monkeypatch):
    async def _load_obs_fields(_entity_type, _entity_id, language):
        if language == "nl":
            return {"description": "Pompfilter geblokkeerd."}
        return {}

    monkeypatch.setattr(
        "utils.workspace_localization._load_entity_fields",
        _load_obs_fields,
    )

    payload = {
        "observation": {
            "id": "obs-1",
            "description": "The oil pump filter is blocked.",
            "user_context": "Raw operator note about the filter.",
        },
        "failure_mode": {},
        "reliability_intelligence": {},
        "recommended_actions": [],
        "action_plan": [],
    }

    out = await localize_workspace_payload(payload, "nl", allow_live_translation=False)
    obs = out["observation"]
    assert obs["description"] == "Pompfilter geblokkeerd."
    assert obs.get("show_user_context") is False
    assert "user_context" not in obs


@pytest.mark.asyncio
async def test_shows_translated_user_context_when_available(monkeypatch):
    async def _load_obs_fields(_entity_type, _entity_id, language):
        if language == "nl":
            return {
                "description": "Pompfilter geblokkeerd.",
                "user_context": "Ruwe operatorennotitie over het filter.",
            }
        return {}

    monkeypatch.setattr(
        "utils.workspace_localization._load_entity_fields",
        _load_obs_fields,
    )

    payload = {
        "observation": {
            "id": "obs-1",
            "description": "The oil pump filter is blocked.",
            "user_context": "Raw operator note about the filter.",
        },
        "failure_mode": {},
        "reliability_intelligence": {},
        "recommended_actions": [],
        "action_plan": [],
    }

    out = await localize_workspace_payload(payload, "nl", allow_live_translation=False)
    obs = out["observation"]
    assert obs.get("show_user_context") is True
    assert obs["user_context"] == "Ruwe operatorennotitie over het filter."
