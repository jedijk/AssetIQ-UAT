import requests

BASE_URL = "https://obs-equip-compact.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Login
response = requests.post(
    f"{BASE_URL}/auth/login",
    json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
)
token = response.json().get("token") or response.json().get("access_token")

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Get equipment nodes with equipment_type_id
response = requests.get(
    f"{BASE_URL}/equipment-hierarchy/nodes",
    headers=headers
)

nodes = response.json().get("nodes", [])
equipment_types = set()
for node in nodes:
    if node.get("equipment_type_id"):
        equipment_types.add((node.get("equipment_type_id"), node.get("equipment_type_name", "Unknown")))

print(f"Found {len(equipment_types)} unique equipment types:")
for eq_type_id, eq_type_name in sorted(equipment_types):
    print(f"  - {eq_type_name} (ID: {eq_type_id})")
