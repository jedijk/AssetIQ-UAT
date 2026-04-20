"""
Import equipment hierarchy from Excel file to Tyromer installation

The Excel has a sequential structure where:
- Groups are separated by header rows (no Level)
- Within each group, items are sequential: Plant/Unit → Section/System → Equipment Unit → Subunit → Maintainable Item
- Parent relationship is determined by the previous item at the parent level

Rules:
- ID = Tag field
- Name = node name  
- Level must be valid ISO 14224 level
- Skip items without valid Tag or Level
"""
import asyncio
import sys
import os
import httpx
import pandas as pd
from io import BytesIO

# Configuration
API_URL = os.environ.get("API_URL", "https://version-auto-update.preview.emergentagent.com")
TYROMER_INSTALLATION_ID = "5fb4f269-191f-47d1-b190-e865a6430c7e"

# Valid ISO 14224 Levels mapping
VALID_LEVELS = {
    "Plant/Unit": "plant_unit",
    "Section/System": "section_system",
    "Equipment Unit": "equipment_unit",
    "Subunit": "subunit",
    "Maintainable Item": "maintainable_item",
}

# Level hierarchy order (index indicates depth)
LEVEL_ORDER = ["plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"]

async def login():
    """Login and get token"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_URL}/api/auth/login",
            json={"email": "test@test.com", "password": "admin123"}
        )
        if response.status_code == 200:
            return response.json()["token"]
        else:
            print(f"Login failed: {response.text}")
            sys.exit(1)

async def get_all_nodes(token):
    """Get all existing nodes"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{API_URL}/api/equipment-hierarchy/nodes",
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("nodes", data) if isinstance(data, dict) else data
        return []

async def update_node(token, node_id, data):
    """Update an existing node"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.patch(
            f"{API_URL}/api/equipment-hierarchy/nodes/{node_id}",
            headers={"Authorization": f"Bearer {token}"},
            json=data
        )
        if response.status_code == 200:
            return response.json()
        else:
            print(f"    Failed to update: {response.text}")
            return None

async def create_node(token, data):
    """Create a new equipment node"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{API_URL}/api/equipment-hierarchy/nodes",
            headers={"Authorization": f"Bearer {token}"},
            json=data
        )
        if response.status_code in [200, 201]:
            return response.json()
        else:
            print(f"    Failed to create: {response.text}")
            return None

async def main():
    # Download the Excel file
    print("Downloading Excel file...")
    excel_url = "https://customer-assets.emergentagent.com/job_d7857aee-556b-43c4-be83-cb625b13d6c2/artifacts/7cpd0c5c_equipment_hierarchy_20260407_090659%20%281%29.xlsx"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(excel_url)
        if response.status_code != 200:
            print(f"Failed to download file: {response.status_code}")
            sys.exit(1)
        excel_data = BytesIO(response.content)
    
    # Read Excel
    print("Reading Excel data...")
    df = pd.read_excel(excel_data)
    rows = df.to_dict('records')
    print(f"Total rows: {len(rows)}")
    
    # Login
    print("\nLogging in...")
    token = await login()
    print("Logged in successfully")
    
    # Get existing nodes
    print("Getting existing nodes...")
    all_nodes = await get_all_nodes(token)
    print(f"Found {len(all_nodes)} existing nodes")
    
    # Build lookup maps
    nodes_by_tag = {n.get("tag"): n for n in all_nodes if isinstance(n, dict) and n.get("tag")}
    nodes_by_name_parent = {}
    for n in all_nodes:
        if isinstance(n, dict):
            key = (n.get("name", "").lower(), n.get("parent_id"))
            nodes_by_name_parent[key] = n
    
    # Track the current parent at each level
    # This allows us to build the hierarchy as we iterate
    # Key: level_index, Value: node dict with "id"
    current_parents = {
        -1: {"id": TYROMER_INSTALLATION_ID, "name": "Tyromer"},  # Installation level (-1)
    }
    
    # Stats
    updated_count = 0
    created_count = 0
    skipped_count = 0
    
    print("\n=== Processing rows ===")
    for idx, row in enumerate(rows):
        tag = str(row.get('ID', '')).strip() if pd.notna(row.get('ID')) else ""
        name = str(row.get('Name', '')).strip() if pd.notna(row.get('Name')) else ""
        level_str = str(row.get('Level', '')).strip() if pd.notna(row.get('Level')) else ""
        description = str(row.get('Description', '')).strip() if pd.notna(row.get('Description')) else None
        equipment_type = str(row.get('Equipment Type', '')).strip() if pd.notna(row.get('Equipment Type')) else None
        
        # Skip if no valid level
        iso_level = VALID_LEVELS.get(level_str)
        if not iso_level:
            # This is a group header row, skip
            continue
        
        # Skip if no tag
        if not tag:
            print(f"  Row {idx+1} SKIP: No tag for {name}")
            skipped_count += 1
            continue
        
        if not name:
            name = tag
        
        # Get the level index
        level_idx = LEVEL_ORDER.index(iso_level)
        
        # Find parent - it's the most recent node at level (level_idx - 1)
        parent_level_idx = level_idx - 1
        if parent_level_idx not in current_parents:
            print(f"  Row {idx+1} SKIP {tag}: No parent at level {parent_level_idx}")
            skipped_count += 1
            continue
        
        parent_id = current_parents[parent_level_idx]["id"]
        
        # Check if already exists by tag
        if tag in nodes_by_tag:
            existing = nodes_by_tag[tag]
            current_parents[level_idx] = existing
            # print(f"  Row {idx+1} EXISTS {tag}: {name}")
            continue
        
        # Check if exists by name + parent (needs tag update)
        lookup_key = (name.lower(), parent_id)
        if lookup_key in nodes_by_name_parent:
            existing = nodes_by_name_parent[lookup_key]
            if not existing.get("tag"):
                # Update with tag
                print(f"  Row {idx+1} UPDATE {tag}: {name} (adding tag)")
                update_data = {"tag": tag}
                if description and not existing.get("description"):
                    update_data["description"] = description
                result = await update_node(token, existing["id"], update_data)
                if result:
                    current_parents[level_idx] = result
                    nodes_by_tag[tag] = result
                    updated_count += 1
                else:
                    skipped_count += 1
            else:
                current_parents[level_idx] = existing
                nodes_by_tag[tag] = existing
            continue
        
        # Create new node
        node_data = {
            "name": name,
            "level": iso_level,
            "parent_id": parent_id,
            "tag": tag,
        }
        if description:
            node_data["description"] = description
        if equipment_type:
            node_data["equipment_type"] = equipment_type
        
        print(f"  Row {idx+1} CREATE {tag}: {name} (level: {iso_level}, parent: {current_parents[parent_level_idx]['name']})")
        result = await create_node(token, node_data)
        
        if result:
            current_parents[level_idx] = result
            nodes_by_tag[tag] = result
            nodes_by_name_parent[(name.lower(), parent_id)] = result
            created_count += 1
        else:
            skipped_count += 1
        
        await asyncio.sleep(0.02)
    
    print(f"\n{'='*50}")
    print(f"=== Import Complete ===")
    print(f"Updated with tags: {updated_count}")
    print(f"Created new: {created_count}")
    print(f"Skipped: {skipped_count}")
    print(f"{'='*50}")

if __name__ == "__main__":
    asyncio.run(main())
