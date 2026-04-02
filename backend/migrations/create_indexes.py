"""
Database Index Optimization Script
Creates indexes for frequently queried collections to improve query performance.
Run this script once to set up indexes.
"""
import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

async def create_indexes():
    """Create all necessary indexes for optimal database performance."""
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🚀 Starting database index optimization...")
    
    # ============= USERS COLLECTION =============
    print("\n📋 Creating indexes for 'users' collection...")
    await db.users.create_index("id", unique=True, background=True)
    await db.users.create_index("email", unique=True, background=True)
    await db.users.create_index("role", background=True)
    await db.users.create_index("assigned_installations", background=True)
    print("   ✓ users indexes created")
    
    # ============= THREATS/OBSERVATIONS COLLECTION =============
    print("\n📋 Creating indexes for 'threats' collection...")
    await db.threats.create_index("id", unique=True, background=True)
    await db.threats.create_index("created_by", background=True)
    await db.threats.create_index("status", background=True)
    await db.threats.create_index("risk_level", background=True)
    await db.threats.create_index("risk_score", background=True)
    await db.threats.create_index("created_at", background=True)
    await db.threats.create_index("asset", background=True)
    await db.threats.create_index("linked_equipment_id", background=True)
    await db.threats.create_index("failure_mode", background=True)
    # Compound indexes for common queries
    await db.threats.create_index([("status", 1), ("risk_score", -1)], background=True)
    await db.threats.create_index([("created_by", 1), ("created_at", -1)], background=True)
    await db.threats.create_index([("asset", 1), ("status", 1)], background=True)
    print("   ✓ threats indexes created")
    
    # ============= CENTRAL ACTIONS COLLECTION =============
    print("\n📋 Creating indexes for 'central_actions' collection...")
    await db.central_actions.create_index("id", unique=True, background=True)
    await db.central_actions.create_index("action_number", background=True)  # Not unique - may have duplicates
    await db.central_actions.create_index("created_by", background=True)
    await db.central_actions.create_index("status", background=True)
    await db.central_actions.create_index("assignee", background=True)
    await db.central_actions.create_index("due_date", background=True)
    await db.central_actions.create_index("created_at", background=True)
    await db.central_actions.create_index("source_type", background=True)
    await db.central_actions.create_index("source_id", background=True)
    await db.central_actions.create_index("is_validated", background=True)
    await db.central_actions.create_index("action_type", background=True)
    # Compound indexes
    await db.central_actions.create_index([("status", 1), ("due_date", 1)], background=True)
    await db.central_actions.create_index([("assignee", 1), ("status", 1)], background=True)
    await db.central_actions.create_index([("source_type", 1), ("source_id", 1)], background=True)
    await db.central_actions.create_index([("created_by", 1), ("created_at", -1)], background=True)
    print("   ✓ central_actions indexes created")
    
    # ============= INVESTIGATIONS COLLECTION =============
    print("\n📋 Creating indexes for 'investigations' collection...")
    await db.investigations.create_index("id", unique=True, background=True)
    await db.investigations.create_index("investigation_number", background=True)  # Not unique - may have duplicates
    await db.investigations.create_index("created_by", background=True)
    await db.investigations.create_index("status", background=True)
    await db.investigations.create_index("created_at", background=True)
    await db.investigations.create_index("linked_threat_id", background=True)
    await db.investigations.create_index([("created_by", 1), ("created_at", -1)], background=True)
    print("   ✓ investigations indexes created")
    
    # ============= EQUIPMENT NODES COLLECTION =============
    print("\n📋 Creating indexes for 'equipment_nodes' collection...")
    await db.equipment_nodes.create_index("id", unique=True, background=True)
    await db.equipment_nodes.create_index("created_by", background=True)
    await db.equipment_nodes.create_index("parent_id", background=True)
    await db.equipment_nodes.create_index("node_type", background=True)
    await db.equipment_nodes.create_index("name", background=True)
    await db.equipment_nodes.create_index("path", background=True)
    await db.equipment_nodes.create_index("installation_id", background=True)
    # Compound indexes
    await db.equipment_nodes.create_index([("parent_id", 1), ("node_type", 1)], background=True)
    await db.equipment_nodes.create_index([("created_by", 1), ("node_type", 1)], background=True)
    # Text index for search
    await db.equipment_nodes.create_index([("name", "text"), ("description", "text")], background=True)
    print("   ✓ equipment_nodes indexes created")
    
    # ============= TASK TEMPLATES COLLECTION =============
    print("\n📋 Creating indexes for 'task_templates' collection...")
    await db.task_templates.create_index("id", unique=True, background=True)
    await db.task_templates.create_index("created_by", background=True)
    await db.task_templates.create_index("is_active", background=True)
    await db.task_templates.create_index("task_type", background=True)
    await db.task_templates.create_index([("created_by", 1), ("is_active", 1)], background=True)
    print("   ✓ task_templates indexes created")
    
    # ============= TASK INSTANCES COLLECTION =============
    print("\n📋 Creating indexes for 'task_instances' collection...")
    await db.task_instances.create_index("id", unique=True, background=True)
    await db.task_instances.create_index("template_id", background=True)
    await db.task_instances.create_index("assigned_to", background=True)
    await db.task_instances.create_index("status", background=True)
    await db.task_instances.create_index("scheduled_date", background=True)
    await db.task_instances.create_index("created_at", background=True)
    await db.task_instances.create_index("equipment_id", background=True)
    # Compound indexes
    await db.task_instances.create_index([("assigned_to", 1), ("status", 1), ("scheduled_date", 1)], background=True)
    await db.task_instances.create_index([("template_id", 1), ("status", 1)], background=True)
    print("   ✓ task_instances indexes created")
    
    # ============= FORM TEMPLATES COLLECTION =============
    print("\n📋 Creating indexes for 'form_templates' collection...")
    await db.form_templates.create_index("id", unique=True, background=True)
    await db.form_templates.create_index("created_by", background=True)
    await db.form_templates.create_index("is_active", background=True)
    await db.form_templates.create_index("created_at", background=True)
    print("   ✓ form_templates indexes created")
    
    # ============= FORM SUBMISSIONS COLLECTION =============
    print("\n📋 Creating indexes for 'form_submissions' collection...")
    await db.form_submissions.create_index("id", unique=True, background=True)
    await db.form_submissions.create_index("template_id", background=True)
    await db.form_submissions.create_index("submitted_by", background=True)
    await db.form_submissions.create_index("submitted_at", background=True)
    await db.form_submissions.create_index("task_instance_id", background=True)
    await db.form_submissions.create_index([("template_id", 1), ("submitted_at", -1)], background=True)
    print("   ✓ form_submissions indexes created")
    
    # ============= AI COLLECTIONS =============
    print("\n📋 Creating indexes for AI collections...")
    
    # AI Risk Insights
    await db.ai_risk_insights.create_index("id", unique=True, sparse=True, background=True)
    await db.ai_risk_insights.create_index("threat_id", background=True)
    await db.ai_risk_insights.create_index("created_at", background=True)
    
    # AI Causal Analysis
    await db.ai_causal_analysis.create_index("id", unique=True, sparse=True, background=True)
    await db.ai_causal_analysis.create_index("threat_id", background=True)
    
    # AI Fault Trees
    await db.ai_fault_trees.create_index("id", unique=True, sparse=True, background=True)
    await db.ai_fault_trees.create_index("threat_id", background=True)
    
    # AI Bow Ties
    await db.ai_bow_ties.create_index("id", unique=True, sparse=True, background=True)
    await db.ai_bow_ties.create_index("threat_id", background=True)
    
    # AI Action Optimization
    await db.ai_action_optimization.create_index("id", unique=True, sparse=True, background=True)
    await db.ai_action_optimization.create_index("threat_id", background=True)
    
    # AI Usage
    await db.ai_usage.create_index("user_id", background=True)
    await db.ai_usage.create_index("created_at", background=True)
    await db.ai_usage.create_index([("user_id", 1), ("created_at", -1)], background=True)
    
    print("   ✓ AI indexes created")
    
    # ============= FAILURE MODES COLLECTION =============
    print("\n📋 Creating indexes for 'failure_modes' collection...")
    await db.failure_modes.create_index("id", unique=True, sparse=True, background=True)
    await db.failure_modes.create_index("equipment_type", background=True)
    await db.failure_modes.create_index("failure_mode", background=True)
    try:
        await db.failure_modes.create_index([("equipment_type", "text"), ("failure_mode", "text"), ("effect", "text")], background=True)
    except Exception as e:
        print(f"   ⚠ Text index may already exist: {e}")
    print("   ✓ failure_modes indexes created")
    
    # ============= PERMISSIONS COLLECTION =============
    print("\n📋 Creating indexes for 'permissions' collection...")
    await db.permissions.create_index("role", unique=True, sparse=True, background=True)
    print("   ✓ permissions indexes created")
    
    # ============= ADHOC PLANS COLLECTION =============
    print("\n📋 Creating indexes for 'adhoc_plans' collection...")
    await db.adhoc_plans.create_index("id", unique=True, background=True)
    await db.adhoc_plans.create_index("created_by", background=True)
    await db.adhoc_plans.create_index("assigned_to", background=True)
    await db.adhoc_plans.create_index("status", background=True)
    await db.adhoc_plans.create_index("created_at", background=True)
    await db.adhoc_plans.create_index([("assigned_to", 1), ("status", 1)], background=True)
    print("   ✓ adhoc_plans indexes created")
    
    # ============= FEEDBACK COLLECTION =============
    print("\n📋 Creating indexes for 'feedback' collection...")
    await db.feedback.create_index("id", unique=True, background=True)
    await db.feedback.create_index("created_by", background=True)
    await db.feedback.create_index("status", background=True)
    await db.feedback.create_index("created_at", background=True)
    print("   ✓ feedback indexes created")
    
    print("\n✅ All database indexes created successfully!")
    print("\n📊 Index Statistics:")
    
    # List all collections and their index counts
    collections = await db.list_collection_names()
    for coll_name in sorted(collections):
        indexes = await db[coll_name].index_information()
        print(f"   {coll_name}: {len(indexes)} indexes")
    
    client.close()
    print("\n🎉 Database optimization complete!")

if __name__ == "__main__":
    asyncio.run(create_indexes())
