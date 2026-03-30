"""
Database Seed Script for Deployment
Replaces ALL collections with seed data from preview environment.
Run this script to sync deployment database with preview data.
"""

import asyncio
import json
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path

# Collections to seed (complete replace) - ALL application data
SEED_COLLECTIONS = [
    # Core data
    'equipment_nodes',
    'threats', 
    'observations',
    'investigations',
    'central_actions',
    'action_items',
    'cause_nodes',
    'failure_identifications',
    
    # Tasks
    'task_instances',
    'task_templates',
    'task_plans',
    
    # Users & Auth
    'users',
    
    # Forms
    'form_templates',
    'form_submissions',
    
    # AI/Analysis data
    'ai_causal_analysis',
    'ai_risk_insights',
    'ai_bow_ties',
    'ai_fault_trees',
    'ai_action_optimization',
    
    # Equipment & Failure Modes
    'failure_modes',
    'failure_mode_versions',
    'equipment_failure_modes',
    'custom_equipment_types',
    
    # Decision Engine
    'decision_rules',
    'decision_suggestions',
    'maintenance_strategies',
    
    # Other
    'timeline_events',
    'feedback',
    'chat_messages',
]

async def seed_database():
    """Seed the database with preview data."""
    
    # Get MongoDB connection
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    
    print(f"Connecting to MongoDB: {mongo_url[:30]}...")
    print(f"Database: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Load seed data
    seed_file = Path(__file__).parent / 'seed_data.json'
    if not seed_file.exists():
        print(f"ERROR: Seed file not found: {seed_file}")
        return False
    
    with open(seed_file, 'r') as f:
        seed_data = json.load(f)
    
    print(f"\nLoaded seed data with {len(seed_data)} collections")
    
    # Seed each collection
    for coll_name in SEED_COLLECTIONS:
        if coll_name not in seed_data:
            print(f"  SKIP: {coll_name} (not in seed data)")
            continue
        
        docs = seed_data[coll_name]
        
        # Remove _id field to let MongoDB generate new ones (avoid conflicts)
        for doc in docs:
            if '_id' in doc:
                del doc['_id']
        
        # Delete existing data
        delete_result = await db[coll_name].delete_many({})
        print(f"  {coll_name}: Deleted {delete_result.deleted_count} existing documents")
        
        # Insert new data
        if docs:
            insert_result = await db[coll_name].insert_many(docs)
            print(f"  {coll_name}: Inserted {len(insert_result.inserted_ids)} documents")
        else:
            print(f"  {coll_name}: No documents to insert")
    
    print("\nDatabase seeding completed!")
    return True

async def check_if_seeding_needed():
    """Check if database needs seeding (empty or flag set)."""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Check if equipment_nodes is empty (indicator of fresh deployment)
    count = await db.equipment_nodes.count_documents({})
    return count == 0

def run_seed():
    """Entry point for seeding."""
    asyncio.run(seed_database())

if __name__ == "__main__":
    run_seed()
