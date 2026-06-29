"""Copilot equipment tag extraction and resolution."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from services.equipment_search_service import (
    extract_equipment_tag_candidates,
    resolve_equipment_id_from_query,
)


def test_extract_multi_segment_tag_prefers_full_tag():
    query = "give me the health of 1r-2003-0054"
    candidates = extract_equipment_tag_candidates(query)
    assert "1R-2003-0054" in candidates
    assert candidates[0] == "1R-2003-0054"


def test_extract_simple_tags():
    assert extract_equipment_tag_candidates("Why is P-104 high risk?") == ["P-104"]
    assert "1T-2001" in extract_equipment_tag_candidates("status of 1T-2001")


@pytest.mark.asyncio
async def test_resolve_equipment_id_from_query_exact_tag():
    db = MagicMock()
    db.equipment_nodes.find_one = AsyncMock(
        return_value={"id": "eq-0054", "tag": "1R-2003-0054"}
    )
    db.equipment_nodes.find = MagicMock()

    eq_id = await resolve_equipment_id_from_query(
        db,
        "give me the health of 1R-2003-0054",
        user={"company_id": "Tyromer"},
    )
    assert eq_id == "eq-0054"
    db.equipment_nodes.find_one.assert_awaited()


@pytest.mark.asyncio
async def test_copilot_classifies_health_query_as_equipment_details():
    from services.ril_copilot_service import ReliabilityCopilotService

    service = ReliabilityCopilotService(MagicMock(), MagicMock())
    intent = await service._classify_intent("give me the health of 1r-2003-0054")
    assert intent == "equipment_details"
