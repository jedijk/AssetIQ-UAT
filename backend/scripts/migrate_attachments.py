#!/usr/bin/env python3
"""
Migrate legacy base64 attachments to Object Storage.

This script:
1. Finds form_submissions with attachments that have 'data' but no 'url'
2. Uploads the base64 data to object storage
3. Updates the document to have 'url' and removes 'data' field

Usage:
    python scripts/migrate_attachments.py [--dry-run]
"""

import asyncio
import os
import sys
import base64
import uuid
import argparse
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient


async def migrate_attachments(dry_run: bool = True):
    """Migrate legacy base64 attachments to object storage."""
    
    print(f"{'[DRY RUN] ' if dry_run else ''}Starting attachment migration...")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
    db = client[os.environ.get("DB_NAME", "assetiq")]
    
    # Check if storage is available
    try:
        from services.storage_service import put_object, init_storage
        storage_key = init_storage()
        storage_available = storage_key is not None
    except ImportError:
        print("ERROR: Storage module not available")
        return
    
    if not storage_available:
        print("ERROR: Object storage is not configured (EMERGENT_LLM_KEY missing)")
        return
    
    # Find submissions with legacy attachments (have data but no url)
    # Use projection to only get the fields we need
    # Note: We still need to fetch the data field for migration
    print("Querying for submissions with attachments (this may take a moment)...")
    
    # First, get IDs of submissions that need migration (fast query)
    id_cursor = db.form_submissions.find(
        {"attachments": {"$exists": True, "$ne": []}},
        {"_id": 1, "id": 1}
    )
    submission_ids = [(doc.get("id"), doc.get("_id")) async for doc in id_cursor]
    
    print(f"Found {len(submission_ids)} submissions with attachments")
    
    migrated_count = 0
    error_count = 0
    skipped_count = 0
    already_migrated = 0
    
    for custom_id, mongo_id in submission_ids:
        # Fetch individual submission (still may be slow for large attachments)
        sub = await db.form_submissions.find_one(
            {"_id": mongo_id},
            {"id": 1, "_id": 1, "form_template_name": 1, "attachments": 1}
        )
        
        if not sub:
            continue
        sub_id = sub.get("id") or str(sub.get("_id"))
        attachments = sub.get("attachments", [])
        updated_attachments = []
        needs_update = False
        
        for i, att in enumerate(attachments):
            # Check if this attachment needs migration
            has_url = bool(att.get("url"))
            has_data = bool(att.get("data"))
            
            if has_url:
                # Already has URL, keep as-is
                updated_attachments.append(att)
                continue
            
            if not has_data:
                # No data to migrate
                updated_attachments.append(att)
                continue
            
            # This attachment needs migration
            data = att.get("data", "")
            file_name = att.get("name", f"attachment_{i}")
            file_type = att.get("type", "application/octet-stream")
            
            print(f"  Migrating attachment '{file_name}' ({len(data)} chars) from submission {sub_id}...")
            
            if dry_run:
                # In dry run, just mark as would-be-migrated
                new_att = {
                    "name": file_name,
                    "type": file_type,
                    "size": att.get("size"),
                    "url": f"[WOULD-BE-UPLOADED: attachments/{uuid.uuid4()}.{file_name.split('.')[-1] if '.' in file_name else 'bin'}]"
                }
                updated_attachments.append(new_att)
                needs_update = True
                migrated_count += 1
                continue
            
            # Extract base64 content
            try:
                if "," in data:
                    # Strip data URI prefix (data:image/jpeg;base64,...)
                    base64_data = data.split(",", 1)[1]
                else:
                    base64_data = data
                
                file_bytes = base64.b64decode(base64_data)
                
                # Generate storage path
                file_ext = file_name.rsplit(".", 1)[-1] if "." in file_name else "bin"
                storage_path = f"attachments/{uuid.uuid4()}.{file_ext}"
                
                # Upload to object storage
                result = put_object(storage_path, file_bytes, file_type)
                url = result.get("url", storage_path)
                
                # Create new attachment object (without data)
                new_att = {
                    "name": file_name,
                    "type": file_type,
                    "size": len(file_bytes),
                    "url": url,
                }
                updated_attachments.append(new_att)
                needs_update = True
                migrated_count += 1
                print(f"    ✓ Uploaded to {url}")
                
            except Exception as e:
                print(f"    ✗ Error migrating: {e}")
                # Keep original attachment with error marker
                att["migration_error"] = str(e)
                updated_attachments.append(att)
                error_count += 1
        
        # Update the document if any attachments were migrated
        if needs_update and not dry_run:
            await db.form_submissions.update_one(
                {"_id": sub["_id"]},
                {"$set": {"attachments": updated_attachments}}
            )
            print(f"  ✓ Updated submission {sub_id}")
    
    print("\n" + "=" * 50)
    print(f"{'[DRY RUN] ' if dry_run else ''}Migration Summary:")
    print(f"  Total submissions processed: {len(submission_ids)}")
    print(f"  Attachments migrated: {migrated_count}")
    print(f"  Attachments with errors: {error_count}")
    print(f"  Attachments skipped (already have URL): {skipped_count}")
    print(f"  Attachments already migrated: {already_migrated}")
    
    if dry_run:
        print("\nTo actually run the migration, use: python scripts/migrate_attachments.py --execute")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate legacy base64 attachments to object storage")
    parser.add_argument("--execute", action="store_true", help="Actually run the migration (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be migrated without making changes")
    args = parser.parse_args()
    
    # Default to dry-run unless --execute is specified
    dry_run = not args.execute
    
    asyncio.run(migrate_attachments(dry_run=dry_run))
