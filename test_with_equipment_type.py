import requests

BASE_URL = "https://flicker-solver.preview.emergentagent.com/api"
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

# Test with equipment_type_id filter
equipment_type_id = "motor_electric"
print(f"\nTesting with equipment_type_id={equipment_type_id}")

response = requests.get(
    f"{BASE_URL}/intelligence-map/stats",
    params={"equipment_type_id": equipment_type_id},
    headers=headers
)

if response.status_code == 200:
    data = response.json()
    print(f"✅ Success!")
    print(f"  Equipment: {data['equipment']['count']}")
    print(f"  Failure Modes: {data['failure_modes']['count']}")
    print(f"  Strategies: {data['strategies']['count']}")
    print(f"  Programs: {data['maintenance_programs']['count']}")
else:
    print(f"❌ Failed: {response.status_code}")
    print(response.json())
