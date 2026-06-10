"""
Threat list enrichment helpers (creator info, equipment tags).
"""
from database import db
from services.cache_service import cache
from utils.mongo_regex import exact_case_insensitive_any


async def enrich_with_creator_info(items: list) -> list:
    """Add creator name and initials to items based on created_by field."""
    if not items:
        return items

    creator_ids = list(set(item.get("created_by") for item in items if item.get("created_by")))
    if not creator_ids:
        return items

    cached_creators = cache.get_users_batch(creator_ids)
    uncached_ids = [uid for uid in creator_ids if uid not in cached_creators]

    if uncached_ids:
        creators = await db.users.find(
            {"id": {"$in": uncached_ids}},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "email": 1,
                "photo_url": 1,
                "avatar_path": 1,
                "avatar_data": 1,
                "position": 1,
                "role": 1,
            },
        ).to_list(100)
        fetched_map = {c["id"]: c for c in creators}
        cache.set_users_batch(fetched_map)
        cached_creators.update(fetched_map)

    creator_map = cached_creators

    for item in items:
        creator_id = item.get("created_by")
        if creator_id and creator_id in creator_map:
            creator = creator_map[creator_id]
            item["creator_name"] = creator.get("name") or creator.get("email", "").split("@")[0]
            item["creator_position"] = creator.get("position") or creator.get("role") or "Team Member"
            if creator.get("photo_url"):
                item["creator_photo"] = creator.get("photo_url")
            elif creator.get("avatar_path") or creator.get("avatar_data"):
                item["creator_photo"] = f"/api/users/{creator_id}/avatar"
            else:
                item["creator_photo"] = None
            name = item["creator_name"]
            if name:
                parts = name.split()
                item["creator_initials"] = "".join(p[0].upper() for p in parts[:2])
            else:
                item["creator_initials"] = "?"
        else:
            item["creator_name"] = None
            item["creator_position"] = None
            item["creator_photo"] = None
            item["creator_initials"] = "?"

    return items


async def enrich_with_equipment_tags(items: list) -> list:
    """Add equipment tag to items based on linked_equipment_id or asset name."""
    if not items:
        return items

    equipment_ids = list(
        set(item.get("linked_equipment_id") for item in items if item.get("linked_equipment_id"))
    )
    asset_names = list(set(item.get("asset", "").lower() for item in items if item.get("asset")))

    if not equipment_ids and not asset_names:
        return items

    query_conditions = []
    if equipment_ids:
        query_conditions.append({"id": {"$in": equipment_ids}})
    if asset_names:
        name_match = exact_case_insensitive_any(*asset_names)
        if name_match:
            query_conditions.append({"name": name_match})

    equipment_nodes = await db.equipment_nodes.find(
        {"$or": query_conditions} if query_conditions else {},
        {"_id": 0, "id": 1, "name": 1, "tag": 1},
    ).to_list(500)

    equipment_by_id = {eq["id"]: eq for eq in equipment_nodes}
    equipment_by_name = {eq["name"].lower(): eq for eq in equipment_nodes if eq.get("name")}

    for item in items:
        tag = None
        eq_id = item.get("linked_equipment_id")
        if eq_id and eq_id in equipment_by_id:
            tag = equipment_by_id[eq_id].get("tag")
        if not tag:
            asset_name = (item.get("asset") or "").lower()
            if asset_name and asset_name in equipment_by_name:
                tag = equipment_by_name[asset_name].get("tag")
        item["equipment_tag"] = tag

    return items


async def enrich_with_action_plan_counts(items: list) -> list:
    """
    Add action_plan_count per observation/threat: central_actions linked to the
    observation plus one when a causal investigation exists (matches workspace action plan).
    """
    if not items:
        return items

    threat_ids = [item["id"] for item in items if item.get("id")]
    if not threat_ids:
        for item in items:
            item["action_plan_count"] = 0
        return items

    action_counts = {tid: 0 for tid in threat_ids}

    pipeline = [
        {
            "$match": {
                "$or": [
                    {"source_id": {"$in": threat_ids}},
                    {"observation_id": {"$in": threat_ids}},
                    {"threat_id": {"$in": threat_ids}},
                ]
            }
        },
        {
            "$project": {
                "linked_observation_id": {
                    "$switch": {
                        "branches": [
                            {
                                "case": {"$in": ["$threat_id", threat_ids]},
                                "then": "$threat_id",
                            },
                            {
                                "case": {"$in": ["$observation_id", threat_ids]},
                                "then": "$observation_id",
                            },
                            {
                                "case": {"$in": ["$source_id", threat_ids]},
                                "then": "$source_id",
                            },
                        ],
                        "default": None,
                    }
                }
            }
        },
        {"$match": {"linked_observation_id": {"$ne": None}}},
        {"$group": {"_id": "$linked_observation_id", "count": {"$sum": 1}}},
    ]

    async for row in db.central_actions.aggregate(pipeline):
        linked_id = row.get("_id")
        if linked_id in action_counts:
            action_counts[linked_id] = row.get("count", 0)

    investigation_threat_ids = set()
    async for inv in db.investigations.find(
        {"threat_id": {"$in": threat_ids}},
        {"_id": 0, "threat_id": 1},
    ):
        threat_id = inv.get("threat_id")
        if threat_id:
            investigation_threat_ids.add(threat_id)

    for item in items:
        tid = item.get("id")
        count = action_counts.get(tid, 0)
        if tid in investigation_threat_ids:
            count += 1
        item["action_plan_count"] = count

    return items
