"""
Database Index Creation Script for ThreatBase/AssetIQ
Creates indexes on MongoDB collections for improved query performance.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Index definitions for each collection
INDEX_DEFINITIONS = {
    # Users - frequently queried by email, role, status
    "users": [
        {"keys": [("email", 1)], "unique": True},
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("role", 1)]},
        {"keys": [("approval_status", 1)]},
        {"keys": [("assigned_installations", 1)]},
    ],
    
    # Equipment nodes - hierarchical queries, filtering by installation
    "equipment_nodes": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("parent_id", 1)]},
        {"keys": [("level", 1)]},
        {"keys": [("installation_name", 1)]},
        {"keys": [("name", 1)]},
        {"keys": [("equipment_type_id", 1)]},
        {"keys": [("criticality", 1)]},
        {"keys": [("discipline", 1)]},
        # Compound index for hierarchy queries
        {"keys": [("installation_name", 1), ("level", 1)]},
        {"keys": [("parent_id", 1), ("order", 1)]},
    ],
    
    # Threats - frequently filtered by equipment, status, risk
    "threats": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("status", 1)]},
        {"keys": [("risk_priority", -1)]},
        {"keys": [("created_at", -1)]},
        {"keys": [("failure_mode_id", 1)]},
        {"keys": [("installation_name", 1)]},
        # Compound indexes for common queries
        {"keys": [("equipment_id", 1), ("status", 1)]},
        {"keys": [("installation_name", 1), ("created_at", -1)]},
    ],
    
    # Observations - linked to equipment and threats
    "observations": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("threat_id", 1)]},
        {"keys": [("status", 1)]},
        {"keys": [("created_at", -1)]},
        {"keys": [("installation_name", 1)]},
    ],
    
    # Central Actions - common list views
    "central_actions": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("status", 1)]},
        {"keys": [("priority", 1)]},
        {"keys": [("due_date", 1)]},
        {"keys": [("assigned_to", 1)]},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("threat_id", 1)]},
        {"keys": [("installation_name", 1)]},
        {"keys": [("created_at", -1)]},
        # Compound for dashboard queries
        {"keys": [("status", 1), ("due_date", 1)]},
        {"keys": [("installation_name", 1), ("status", 1)]},
    ],
    
    # Investigations - linked to threats
    "investigations": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("threat_id", 1)]},
        {"keys": [("status", 1)]},
        {"keys": [("created_at", -1)]},
    ],
    
    # Task templates
    "task_templates": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("discipline", 1)]},
        {"keys": [("is_adhoc", 1)]},
        {"keys": [("created_at", -1)]},
    ],
    
    # Task plans
    "task_plans": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("task_template_id", 1)]},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("is_active", 1)]},
        {"keys": [("next_due_date", 1)]},
        {"keys": [("installation_name", 1)]},
        # For schedule generation
        {"keys": [("is_active", 1), ("next_due_date", 1)]},
    ],
    
    # Task instances
    "task_instances": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("task_plan_id", 1)]},
        {"keys": [("status", 1)]},
        {"keys": [("scheduled_date", 1)]},
        {"keys": [("due_date", 1)]},
        {"keys": [("assigned_user_id", 1)]},
        {"keys": [("installation_name", 1)]},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("priority", 1)]},
        # For calendar queries
        {"keys": [("scheduled_date", 1), ("status", 1)]},
        {"keys": [("installation_name", 1), ("scheduled_date", 1)]},
        # Compound index for common filtered queries
        {"keys": [("status", 1), ("scheduled_date", 1)]},
        {"keys": [("equipment_id", 1), ("status", 1)]},
    ],
    
    # Form templates
    "form_templates": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("discipline", 1)]},
        {"keys": [("created_at", -1)]},
    ],
    
    # Form submissions
    "form_submissions": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("form_template_id", 1)]},
        {"keys": [("template_id", 1)]},  # Legacy field name
        {"keys": [("submitted_by", 1)]},
        {"keys": [("submitted_at", -1)]},
        {"keys": [("task_instance_id", 1)]},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("has_warnings", 1)]},
        {"keys": [("has_critical", 1)]},
        # Compound index for common query pattern
        {"keys": [("submitted_at", -1), ("form_template_id", 1)]},
    ],
    
    # Chat messages
    "chat_messages": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("user_id", 1)]},
        {"keys": [("created_at", -1)]},
        {"keys": [("session_id", 1)]},
    ],
    
    # User events (large collection - important to index)
    "user_events": [
        {"keys": [("user_id", 1)]},
        {"keys": [("event_type", 1)]},
        {"keys": [("timestamp", -1)]},
        {"keys": [("module", 1)]},
        # Compound for analytics
        {"keys": [("user_id", 1), ("timestamp", -1)]},
        {"keys": [("event_type", 1), ("timestamp", -1)]},
    ],
    
    # Equipment failure modes
    "equipment_failure_modes": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("equipment_id", 1)]},
        {"keys": [("failure_mode_id", 1)]},
    ],
    
    # Cause nodes (for investigations)
    "cause_nodes": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("investigation_id", 1)]},
        {"keys": [("parent_id", 1)]},
    ],
    
    # Timeline events
    "timeline_events": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("investigation_id", 1)]},
        {"keys": [("timestamp", -1)]},
    ],
    
    # Action items (for investigations)
    "action_items": [
        {"keys": [("id", 1)], "unique": True},
        {"keys": [("investigation_id", 1)]},
        {"keys": [("status", 1)]},
    ],
    
    # Password resets
    "password_resets": [
        {"keys": [("email", 1)]},
        {"keys": [("token", 1)], "unique": True},
        {"keys": [("expires_at", 1)]},
    ],
    
    # Feedback
    "feedback": [
        {"keys": [("created_at", -1)]},
        {"keys": [("type", 1)]},
    ],
    
    # AI analysis caches
    "ai_risk_insights": [
        {"keys": [("threat_id", 1)]},
        {"keys": [("created_at", -1)]},
    ],
    "ai_causal_analysis": [
        {"keys": [("investigation_id", 1)]},
    ],
}


async def create_indexes():
    """Create all indexes defined above."""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database').strip('"')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    total_created = 0
    total_skipped = 0
    
    for collection_name, indexes in INDEX_DEFINITIONS.items():
        collection = db[collection_name]
        existing = await collection.index_information()
        
        for idx_def in indexes:
            keys = idx_def["keys"]
            unique = idx_def.get("unique", False)
            
            # Generate index name from keys
            idx_name = "_".join(f"{k}_{v}" for k, v in keys)
            
            if idx_name in existing:
                total_skipped += 1
                continue
            
            try:
                await collection.create_index(keys, unique=unique, name=idx_name)
                logger.info(f"Created index {idx_name} on {collection_name}")
                total_created += 1
            except Exception as e:
                logger.warning(f"Failed to create index {idx_name} on {collection_name}: {e}")
    
    logger.info(f"Index creation complete: {total_created} created, {total_skipped} already existed")
    client.close()
    
    return total_created, total_skipped


if __name__ == "__main__":
    asyncio.run(create_indexes())
