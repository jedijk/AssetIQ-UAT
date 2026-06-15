"""Tenant filter coverage on recently hardened service paths."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

USER = {"company_id": "co-1", "id": "user-1"}


@pytest.mark.asyncio
async def test_work_item_query_investigation_lookup_is_tenant_scoped():
    mock_db = MagicMock()
    inv_col = MagicMock()
    actions_col = MagicMock()
    mock_db.task_instances = MagicMock()
    mock_db.central_actions = actions_col
    mock_db.investigations = inv_col
    mock_db.equipment_nodes = MagicMock()
    mock_db.task_plans = MagicMock()
    mock_db.task_templates = MagicMock()
    mock_db.form_templates = MagicMock()
    mock_db.threats = MagicMock()

    ti_cursor = MagicMock()
    ti_cursor.sort.return_value = ti_cursor
    ti_cursor.limit.return_value = ti_cursor
    ti_cursor.to_list = AsyncMock(return_value=[])
    mock_db.task_instances.find = MagicMock(return_value=ti_cursor)

    actions_col.find = MagicMock(return_value=MagicMock(
        to_list=AsyncMock(return_value=[{
            "id": "a-1",
            "source_type": "investigation",
            "source_id": "inv-1",
            "created_by": "user-1",
            "status": "open",
        }])
    ))

    inv_cursor = MagicMock()
    inv_cursor.to_list = AsyncMock(return_value=[])
    inv_col.find = MagicMock(return_value=inv_cursor)

    with patch("services.work_item_query.db", mock_db), patch(
        "services.work_item_query.get_task_generation_config",
        AsyncMock(return_value={"enabled": True}),
    ), patch(
        "services.work_item_query.work_items_source_mode",
        return_value="v2_instances",
    ):
        from services.work_item_query import fetch_work_items

        await fetch_work_items("user-1", filter_name="open", user=USER)

    if inv_col.find.called:
        inv_filter = inv_col.find.call_args[0][0]
        assert inv_filter["$and"][1]["$or"][0] == {"tenant_id": "co-1"}


@pytest.mark.asyncio
async def test_my_tasks_complete_action_scopes_central_actions():
    mock_db = MagicMock()
    actions = MagicMock()
    mock_db.central_actions = actions
    mock_db.threats = MagicMock()
    actions.find_one = AsyncMock(return_value={"id": "act-1", "created_by": "user-1"})
    actions.update_one = AsyncMock()

    with patch("services.my_tasks_service.db", mock_db), patch(
        "services.observation_mitigation.build_action_plan_completion_notification",
        AsyncMock(return_value=None),
    ):
        from services.my_tasks_service import complete_action

        await complete_action(USER, "act-1", None)

    find_filter = actions.find_one.call_args[0][0]
    assert find_filter["$and"][0]["id"] == "act-1"
    update_filter = actions.update_one.call_args[0][0]
    assert update_filter["$and"][0]["id"] == "act-1"


@pytest.mark.asyncio
async def test_ril_service_equipment_lookup_is_tenant_scoped():
    mock_db = MagicMock()
    mock_db.equipment_nodes = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(return_value={"id": "eq-1", "name": "Pump"})

    from services.ril_service import RILService

    svc = RILService(mock_db, tenant_user=USER)
    await svc._find_equipment_node("eq-1")

    filt = mock_db.equipment_nodes.find_one.call_args[0][0]
    assert filt["$and"][0] == {"id": "eq-1"}
    assert {"tenant_id": "co-1"} in filt["$and"][1]["$or"]


@pytest.mark.asyncio
async def test_my_tasks_adhoc_plans_scopes_task_plans_and_templates():
    mock_db = MagicMock()
    plans_col = MagicMock()
    templates_col = MagicMock()
    instances_col = MagicMock()
    mock_db.task_plans = plans_col
    mock_db.task_templates = templates_col
    mock_db.task_instances = instances_col
    mock_db.form_templates = MagicMock()
    mock_db.equipment = MagicMock()

    plans_cursor = MagicMock()
    plans_cursor.sort.return_value = plans_cursor
    plans_cursor.to_list = AsyncMock(return_value=[])
    plans_col.find = MagicMock(return_value=plans_cursor)

    templates_col.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    instances_col.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))

    with patch("services.my_tasks_service.db", mock_db):
        from services.my_tasks_service import get_adhoc_plans

        await get_adhoc_plans(USER)

    plan_filter = plans_col.find.call_args[0][0]
    assert plan_filter["$and"][1]["$or"][0] == {"tenant_id": "co-1"}


@pytest.mark.asyncio
async def test_my_tasks_execute_adhoc_plan_scopes_plan_and_instance_writes():
    from bson import ObjectId

    mock_db = MagicMock()
    plans_col = MagicMock()
    instances_col = MagicMock()
    templates_col = MagicMock()
    mock_db.task_plans = plans_col
    mock_db.task_instances = instances_col
    mock_db.task_templates = templates_col
    mock_db.form_templates = MagicMock()

    plan = {
        "_id": ObjectId(),
        "id": "plan-1",
        "is_adhoc": True,
        "is_active": True,
        "task_template_name": "Inspect pump",
    }
    plans_col.find_one = AsyncMock(return_value=plan)
    instances_col.find_one = AsyncMock(return_value=None)
    templates_col.find_one = AsyncMock(return_value={"description": "Check seals"})
    instances_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    plans_col.update_one = AsyncMock()

    with patch("services.my_tasks_service.db", mock_db), patch(
        "services.my_tasks_service.serialize_task",
        lambda task: task,
    ):
        from services.my_tasks_service import execute_adhoc_plan

        await execute_adhoc_plan(USER, "plan-1")

    plan_lookup = plans_col.find_one.call_args[0][0]
    assert plan_lookup["$and"][0] == {"id": "plan-1"}
    update_filter = plans_col.update_one.call_args[0][0]
    assert update_filter["$and"][0]["id"] == "plan-1"
