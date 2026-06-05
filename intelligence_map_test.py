"""
Intelligence Map API Tests
Tests the Intelligence Map dashboard endpoints.
"""

import requests
import json
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://asset-intelligence-21.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None
test_results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}


def print_section(title: str):
    """Print a section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")


def print_test(test_name: str):
    """Print test name"""
    print(f"\n--- {test_name} ---")


def print_result(success: bool, message: str, data: Optional[Any] = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if data and not success:
        print(f"Response: {json.dumps(data, indent=2, default=str)[:500]}")
    
    # Track results
    test_results["total"] += 1
    if success:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
    test_results["tests"].append({"message": message, "success": success})


def login() -> str:
    """Login and get auth token"""
    print_section("AUTHENTICATION")
    print_test("Login")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("token") or data.get("access_token")
        if token:
            print_result(True, f"Login successful. Token: {token[:20]}...")
            return token
        else:
            print_result(False, "Login response missing token", data)
            return None
    else:
        print_result(False, f"Login failed: {response.status_code}", response.json())
        return None


def get_headers() -> Dict[str, str]:
    """Get request headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


def test_intelligence_map_filters():
    """Test GET /api/intelligence-map/filters"""
    print_section("TEST: Intelligence Map Filters")
    print_test("GET /api/intelligence-map/filters")
    
    response = requests.get(
        f"{BASE_URL}/intelligence-map/filters",
        headers=get_headers()
    )
    
    if response.status_code != 200:
        print_result(False, f"Request failed with status {response.status_code}", response.json())
        return None
    
    data = response.json()
    
    # Verify response structure
    required_keys = ["plants", "systems", "equipment_types"]
    missing_keys = [key for key in required_keys if key not in data]
    
    if missing_keys:
        print_result(False, f"Response missing required keys: {missing_keys}", data)
        return None
    
    # Verify data types
    if not isinstance(data["plants"], list):
        print_result(False, "plants should be a list", data)
        return None
    
    if not isinstance(data["systems"], list):
        print_result(False, "systems should be a list", data)
        return None
    
    if not isinstance(data["equipment_types"], list):
        print_result(False, "equipment_types should be a list", data)
        return None
    
    # Print counts
    plants_count = len(data["plants"])
    systems_count = len(data["systems"])
    equipment_types_count = len(data["equipment_types"])
    
    print(f"Found {plants_count} plants, {systems_count} systems, {equipment_types_count} equipment types")
    
    # Verify plant structure
    if plants_count > 0:
        plant = data["plants"][0]
        if "id" not in plant or "name" not in plant:
            print_result(False, "Plant missing required fields (id, name)", plant)
            return None
        print(f"Sample plant: {plant['name']} (ID: {plant['id']})")
    
    # Verify system structure
    if systems_count > 0:
        system = data["systems"][0]
        if "id" not in system or "name" not in system:
            print_result(False, "System missing required fields (id, name)", system)
            return None
        print(f"Sample system: {system['name']} (ID: {system['id']})")
    
    # Verify equipment type structure
    if equipment_types_count > 0:
        eq_type = data["equipment_types"][0]
        if "id" not in eq_type or "name" not in eq_type:
            print_result(False, "Equipment type missing required fields (id, name)", eq_type)
            return None
        print(f"Sample equipment type: {eq_type['name']} (ID: {eq_type['id']})")
    
    print_result(True, f"Filters endpoint returned valid data: {plants_count} plants, {systems_count} systems, {equipment_types_count} equipment types")
    return data


def test_intelligence_map_stats(filters_data=None):
    """Test GET /api/intelligence-map/stats"""
    print_section("TEST: Intelligence Map Stats")
    
    # Test 1: Get stats without filters
    print_test("GET /api/intelligence-map/stats (no filters)")
    
    response = requests.get(
        f"{BASE_URL}/intelligence-map/stats",
        headers=get_headers()
    )
    
    if response.status_code != 200:
        print_result(False, f"Request failed with status {response.status_code}", response.json())
        return
    
    data = response.json()
    
    # Verify main sections
    required_sections = [
        "failure_modes", "strategies", "equipment_types", "equipment",
        "maintenance_programs", "schedules", "planned_work", "pm_imports",
        "relationships", "insights", "task_sources"
    ]
    
    missing_sections = [section for section in required_sections if section not in data]
    
    if missing_sections:
        print_result(False, f"Response missing required sections: {missing_sections}", data)
        return
    
    # Verify failure_modes structure
    fm = data["failure_modes"]
    if "count" not in fm or "connected_equipment_types" not in fm:
        print_result(False, "failure_modes missing required fields", fm)
        return
    print(f"Failure Modes: {fm['count']} total, {fm['connected_equipment_types']} connected equipment types")
    
    # Verify strategies structure
    strategies = data["strategies"]
    if "count" not in strategies or "failure_mode_strategies" not in strategies or "task_templates" not in strategies:
        print_result(False, "strategies missing required fields", strategies)
        return
    print(f"Strategies: {strategies['count']} equipment type strategies, {strategies['failure_mode_strategies']} failure mode strategies, {strategies['task_templates']} task templates")
    
    # Verify equipment_types structure
    eq_types = data["equipment_types"]
    if "count" not in eq_types:
        print_result(False, "equipment_types missing required fields", eq_types)
        return
    print(f"Equipment Types: {eq_types['count']} total")
    
    # Verify equipment structure
    equipment = data["equipment"]
    if "count" not in equipment or "with_type" not in equipment or "with_coverage" not in equipment:
        print_result(False, "equipment missing required fields", equipment)
        return
    print(f"Equipment: {equipment['count']} total, {equipment['with_type']} with type, {equipment['with_coverage']} with coverage")
    
    # Verify maintenance_programs structure
    programs = data["maintenance_programs"]
    if "count" not in programs or "total_tasks" not in programs:
        print_result(False, "maintenance_programs missing required fields", programs)
        return
    print(f"Maintenance Programs: {programs['count']} programs, {programs['total_tasks']} total tasks")
    
    # Verify schedules structure
    schedules = data["schedules"]
    if "count" not in schedules or "by_status" not in schedules or "missing_frequency" not in schedules:
        print_result(False, "schedules missing required fields", schedules)
        return
    print(f"Schedules: {schedules['count']} total, {schedules['missing_frequency']} missing frequency")
    print(f"Schedules by status: {schedules['by_status']}")
    
    # Verify planned_work structure
    planned_work = data["planned_work"]
    if "count" not in planned_work:
        print_result(False, "planned_work missing required fields", planned_work)
        return
    print(f"Planned Work: {planned_work['count']} tasks")
    
    # Verify pm_imports structure
    pm_imports = data["pm_imports"]
    if "sessions" not in pm_imports or "total_tasks" not in pm_imports or "imported" not in pm_imports or "accepted" not in pm_imports:
        print_result(False, "pm_imports missing required fields", pm_imports)
        return
    print(f"PM Imports: {pm_imports['sessions']} sessions, {pm_imports['total_tasks']} total tasks, {pm_imports['imported']} imported, {pm_imports['accepted']} accepted")
    
    # Verify relationships structure (for Sankey diagram)
    relationships = data["relationships"]
    required_relationships = [
        "fm_to_strategies", "strategies_to_equipment_types", "equipment_types_to_equipment",
        "equipment_to_programs", "programs_to_schedules", "schedules_to_work", "pm_to_programs"
    ]
    missing_relationships = [rel for rel in required_relationships if rel not in relationships]
    if missing_relationships:
        print_result(False, f"relationships missing required fields: {missing_relationships}", relationships)
        return
    
    # Verify each relationship has source, target, value
    for rel_name, rel_data in relationships.items():
        if "source" not in rel_data or "target" not in rel_data or "value" not in rel_data:
            print_result(False, f"relationship {rel_name} missing required fields", rel_data)
            return
    print(f"Relationships: All {len(relationships)} relationships have correct structure")
    
    # Verify insights structure
    insights = data["insights"]
    required_insights = [
        "failure_mode_coverage", "strategy_density", "pm_source_split",
        "schedule_health", "schedule_compliance"
    ]
    missing_insights = [insight for insight in required_insights if insight not in insights]
    if missing_insights:
        print_result(False, f"insights missing required fields: {missing_insights}", insights)
        return
    
    # Verify failure_mode_coverage
    fm_coverage = insights["failure_mode_coverage"]
    if "value" not in fm_coverage or "unit" not in fm_coverage or "numerator" not in fm_coverage or "denominator" not in fm_coverage:
        print_result(False, "failure_mode_coverage missing required fields", fm_coverage)
        return
    print(f"Failure Mode Coverage: {fm_coverage['value']}{fm_coverage['unit']} ({fm_coverage['numerator']}/{fm_coverage['denominator']})")
    
    # Verify strategy_density
    strategy_density = insights["strategy_density"]
    if "value" not in strategy_density or "unit" not in strategy_density:
        print_result(False, "strategy_density missing required fields", strategy_density)
        return
    print(f"Strategy Density: {strategy_density['value']} {strategy_density['unit']}")
    
    # Verify pm_source_split
    pm_split = insights["pm_source_split"]
    if "generated" not in pm_split or "imported" not in pm_split:
        print_result(False, "pm_source_split missing required fields", pm_split)
        return
    print(f"PM Source Split: {pm_split['generated']}% generated, {pm_split['imported']}% imported")
    
    # Verify schedule_health
    schedule_health = insights["schedule_health"]
    if "missing_frequency" not in schedule_health:
        print_result(False, "schedule_health missing required fields", schedule_health)
        return
    print(f"Schedule Health: {schedule_health['missing_frequency']} missing frequency")
    
    # Verify schedule_compliance
    schedule_compliance = insights["schedule_compliance"]
    if "value" not in schedule_compliance or "unit" not in schedule_compliance:
        print_result(False, "schedule_compliance missing required fields", schedule_compliance)
        return
    print(f"Schedule Compliance: {schedule_compliance['value']}{schedule_compliance['unit']}")
    
    # Verify task_sources structure
    task_sources = data["task_sources"]
    required_sources = ["strategy", "imported", "ai", "manual"]
    missing_sources = [source for source in required_sources if source not in task_sources]
    if missing_sources:
        print_result(False, f"task_sources missing required fields: {missing_sources}", task_sources)
        return
    print(f"Task Sources: strategy={task_sources['strategy']}, imported={task_sources['imported']}, ai={task_sources['ai']}, manual={task_sources['manual']}")
    
    print_result(True, "Stats endpoint returned valid data with all required sections and correct structure")
    
    # Test 2: Test with filters if available
    if filters_data:
        # Test with plant_id filter
        if filters_data.get("plants") and len(filters_data["plants"]) > 0:
            plant_id = filters_data["plants"][0]["id"]
            print_test(f"GET /api/intelligence-map/stats (with plant_id={plant_id})")
            
            response = requests.get(
                f"{BASE_URL}/intelligence-map/stats",
                params={"plant_id": plant_id},
                headers=get_headers()
            )
            
            if response.status_code == 200:
                filtered_data = response.json()
                print(f"Filtered by plant: {filtered_data['equipment']['count']} equipment")
                print_result(True, f"Stats endpoint works with plant_id filter")
            else:
                print_result(False, f"Stats endpoint failed with plant_id filter: {response.status_code}", response.json())
        
        # Test with equipment_type_id filter
        if filters_data.get("equipment_types") and len(filters_data["equipment_types"]) > 0:
            equipment_type_id = filters_data["equipment_types"][0]["id"]
            print_test(f"GET /api/intelligence-map/stats (with equipment_type_id={equipment_type_id})")
            
            response = requests.get(
                f"{BASE_URL}/intelligence-map/stats",
                params={"equipment_type_id": equipment_type_id},
                headers=get_headers()
            )
            
            if response.status_code == 200:
                filtered_data = response.json()
                print(f"Filtered by equipment type: {filtered_data['equipment']['count']} equipment")
                print_result(True, f"Stats endpoint works with equipment_type_id filter")
            else:
                print_result(False, f"Stats endpoint failed with equipment_type_id filter: {response.status_code}", response.json())
        
        # Test with show_linked_only parameter
        print_test("GET /api/intelligence-map/stats (with show_linked_only=true)")
        
        response = requests.get(
            f"{BASE_URL}/intelligence-map/stats",
            params={"show_linked_only": "true"},
            headers=get_headers()
        )
        
        if response.status_code == 200:
            linked_data = response.json()
            print(f"Linked only: {linked_data['equipment']['count']} equipment")
            print_result(True, f"Stats endpoint works with show_linked_only parameter")
        else:
            print_result(False, f"Stats endpoint failed with show_linked_only parameter: {response.status_code}", response.json())


def print_summary():
    """Print test summary"""
    print_section("TEST SUMMARY")
    print(f"Total Tests: {test_results['total']}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Success Rate: {(test_results['passed'] / test_results['total'] * 100):.1f}%")
    
    if test_results['failed'] > 0:
        print("\nFailed Tests:")
        for test in test_results['tests']:
            if not test['success']:
                print(f"  ❌ {test['message']}")


def main():
    """Run all tests"""
    global auth_token
    
    print_section("INTELLIGENCE MAP API TESTS")
    print(f"Base URL: {BASE_URL}")
    print(f"Test User: {TEST_EMAIL}")
    
    # Login
    auth_token = login()
    if not auth_token:
        print("\n❌ Cannot proceed without authentication")
        return
    
    # Test filters endpoint
    filters_data = test_intelligence_map_filters()
    
    # Test stats endpoint
    test_intelligence_map_stats(filters_data)
    
    # Print summary
    print_summary()


if __name__ == "__main__":
    main()
