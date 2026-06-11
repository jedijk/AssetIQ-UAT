"""
Observation Workspace API Tests
Tests the new Observation Workspace endpoints for the Reliability Intelligence Workspace
"""

import requests
import json
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://navigation-ops-patch.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None
observation_id = None


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


def get_existing_observation_id() -> Optional[str]:
    """Get an existing observation/threat ID from the database"""
    print_test("Get Existing Observation ID")
    
    response = requests.get(
        f"{BASE_URL}/threats",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        
        # Handle both list and dict responses
        if isinstance(data, list):
            threats = data
        else:
            threats = data.get("threats", [])
        
        if threats:
            obs_id = threats[0].get("id")
            obs_title = threats[0].get("title", "Unknown")
            obs_number = threats[0].get("threat_number", "N/A")
            print_result(True, f"Found observation: {obs_title} (ID: {obs_id}, Number: {obs_number})")
            return obs_id
        else:
            print_result(False, "No observations found in database")
            return None
    else:
        print_result(False, f"Failed to get observations: {response.status_code}", response.json())
        return None


# ============= OBSERVATION WORKSPACE API TESTS =============

def test_get_observation_workspace():
    """Test GET /api/observation-workspace/{observation_id}"""
    print_test("Get Observation Workspace")
    
    if not observation_id:
        print_result(False, "No observation ID available")
        return False
    
    response = requests.get(
        f"{BASE_URL}/observation-workspace/{observation_id}",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        
        # Verify all required sections are present
        required_sections = [
            "observation", "equipment", "failure_mode", "exposure", 
            "timeline", "reliability_intelligence", "recommended_actions", 
            "action_plan", "process_journey"
        ]
        
        missing_sections = [section for section in required_sections if section not in data]
        
        if missing_sections:
            print_result(False, f"Missing sections: {missing_sections}", data)
            return False
        
        print_result(True, "All required sections present")
        
        # Verify observation section
        obs = data.get("observation", {})
        obs_fields = ["id", "title", "threat_number", "status", "asset"]
        missing_obs_fields = [f for f in obs_fields if f not in obs]
        if missing_obs_fields:
            print_result(False, f"Observation missing fields: {missing_obs_fields}")
        else:
            print_result(True, f"Observation section valid: {obs.get('title')}")
        
        # Verify equipment section
        equipment = data.get("equipment", {})
        if equipment.get("id") or equipment.get("name"):
            print_result(True, f"Equipment section valid: {equipment.get('name')}")
        else:
            print_result(True, "Equipment section present (may be empty if no equipment linked)")
        
        # Verify failure_mode section
        failure_mode = data.get("failure_mode", {})
        if failure_mode.get("name"):
            print_result(True, f"Failure mode section valid: {failure_mode.get('name')}")
            if failure_mode.get("rpn"):
                print_result(True, f"RPN present: {failure_mode.get('rpn')}")
        else:
            print_result(True, "Failure mode section present (may be empty if no FM linked)")
        
        # Verify exposure section
        exposure = data.get("exposure", {})
        exposure_fields = ["production", "safety", "environmental", "alarp", "risk_summary"]
        missing_exposure = [f for f in exposure_fields if f not in exposure]
        if missing_exposure:
            print_result(False, f"Exposure missing fields: {missing_exposure}")
        else:
            print_result(True, "Exposure section complete")
            
            # Check production exposure
            prod = exposure.get("production", {})
            if "value" in prod and "formatted_value" in prod:
                print_result(True, f"Production exposure: {prod.get('formatted_value')}")
            
            # Check ALARP progress
            alarp = exposure.get("alarp", {})
            if "percentage" in alarp and "status" in alarp:
                print_result(True, f"ALARP progress: {alarp.get('percentage')}% - {alarp.get('status')}")
        
        # Verify timeline section
        timeline = data.get("timeline", {})
        events = timeline.get("events", [])
        print_result(True, f"Timeline has {len(events)} events")
        
        if events:
            # Check if events are sorted by date (most recent first)
            first_event = events[0]
            event_fields = ["id", "date", "event_type", "title"]
            missing_event_fields = [f for f in event_fields if f not in first_event]
            if missing_event_fields:
                print_result(False, f"Timeline event missing fields: {missing_event_fields}")
            else:
                print_result(True, f"Timeline events properly structured")
        
        # Verify reliability_intelligence section
        ri = data.get("reliability_intelligence", {})
        ri_fields = ["most_likely_cause", "supporting_evidence", "contributing_factors", "ai_confidence"]
        missing_ri = [f for f in ri_fields if f not in ri]
        if missing_ri:
            print_result(False, f"Reliability intelligence missing fields: {missing_ri}")
        else:
            print_result(True, f"Reliability intelligence complete (confidence: {ri.get('ai_confidence')}%)")
            
            # Check supporting evidence
            evidence = ri.get("supporting_evidence", {})
            if "historical_events" in evidence:
                print_result(True, f"Historical events: {evidence.get('historical_events')}")
        
        # Verify recommended_actions section
        rec_actions = data.get("recommended_actions", [])
        print_result(True, f"Recommended actions: {len(rec_actions)}")
        
        if rec_actions:
            first_rec = rec_actions[0]
            rec_fields = ["id", "action_type", "title", "source"]
            missing_rec_fields = [f for f in rec_fields if f not in first_rec]
            if missing_rec_fields:
                print_result(False, f"Recommended action missing fields: {missing_rec_fields}")
            else:
                print_result(True, f"Recommended actions properly structured")
        
        # Verify action_plan section
        action_plan = data.get("action_plan", [])
        print_result(True, f"Action plan has {len(action_plan)} actions")
        
        # Verify process_journey section
        journey = data.get("process_journey", [])
        print_result(True, f"Process journey has {len(journey)} stages")
        
        if journey:
            stages = [s.get("stage") for s in journey]
            expected_stages = ["Observation", "Assessment", "Planning", "Investigation", "Action", "ALARP", "Learning"]
            if stages == expected_stages:
                print_result(True, "Process journey stages correct")
            else:
                print_result(False, f"Process journey stages incorrect: {stages}")
        
        return True
    else:
        print_result(False, f"Failed to get observation workspace: {response.status_code}", response.json())
        return False


def test_get_observation_timeline():
    """Test GET /api/observation-workspace/{observation_id}/timeline"""
    print_test("Get Observation Timeline")
    
    if not observation_id:
        print_result(False, "No observation ID available")
        return False
    
    response = requests.get(
        f"{BASE_URL}/observation-workspace/{observation_id}/timeline",
        headers=get_headers(),
        params={"limit": 20}
    )
    
    if response.status_code == 200:
        data = response.json()
        
        # Verify response structure
        if "events" not in data:
            print_result(False, "Response missing 'events' field", data)
            return False
        
        events = data.get("events", [])
        total = data.get("total", 0)
        
        print_result(True, f"Timeline retrieved: {total} events")
        
        if events:
            # Verify event structure
            first_event = events[0]
            required_fields = ["id", "date", "event_type", "title"]
            missing_fields = [f for f in required_fields if f not in first_event]
            
            if missing_fields:
                print_result(False, f"Event missing fields: {missing_fields}")
                return False
            else:
                print_result(True, f"Event structure valid: {first_event.get('event_type')} - {first_event.get('title')}")
            
            # Check if events are sorted by date (most recent first)
            if len(events) > 1:
                dates_sorted = True
                for i in range(len(events) - 1):
                    date1 = events[i].get("date", "")
                    date2 = events[i + 1].get("date", "")
                    if date1 and date2 and date1 < date2:
                        dates_sorted = False
                        break
                
                if dates_sorted:
                    print_result(True, "Timeline events properly sorted by date (most recent first)")
                else:
                    print_result(False, "Timeline events not properly sorted")
        
        return True
    else:
        print_result(False, f"Failed to get timeline: {response.status_code}", response.json())
        return False


def test_add_action_to_plan():
    """Test POST /api/observation-workspace/{observation_id}/add-action"""
    print_test("Add Action to Plan")
    
    if not observation_id:
        print_result(False, "No observation ID available")
        return False
    
    payload = {
        "title": "Test Action from Workspace",
        "description": "Created via workspace API test",
        "action_type": "corrective",
        "priority": "medium"
    }
    
    response = requests.post(
        f"{BASE_URL}/observation-workspace/{observation_id}/add-action",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        
        if not data.get("success"):
            print_result(False, "Response indicates failure", data)
            return False
        
        action = data.get("action", {})
        message = data.get("message", "")
        
        # Verify action was created
        if not action.get("id"):
            print_result(False, "Action missing ID", data)
            return False
        
        action_number = action.get("action_number", "")
        action_title = action.get("title", "")
        
        print_result(True, f"Action created: {action_number} - {action_title}")
        
        # Verify action fields
        required_fields = ["id", "action_number", "title", "action_type", "status", "priority"]
        missing_fields = [f for f in required_fields if f not in action]
        
        if missing_fields:
            print_result(False, f"Action missing fields: {missing_fields}")
            return False
        else:
            print_result(True, "Action structure valid")
        
        # Verify action is linked to observation
        if action.get("observation_id") == observation_id:
            print_result(True, "Action correctly linked to observation")
        else:
            print_result(False, f"Action not linked to observation correctly")
        
        return True
    else:
        print_result(False, f"Failed to add action: {response.status_code}", response.json())
        return False


def test_add_recommendation_to_plan():
    """Test POST /api/observation-workspace/{observation_id}/add-recommendation"""
    print_test("Add Recommendation to Plan")
    
    if not observation_id:
        print_result(False, "No observation ID available")
        return False
    
    payload = {
        "id": "test-rec-1",
        "action_type": "PM",
        "title": "Test Recommendation Action",
        "source": "ai_generated",
        "expected_impact": "Test impact",
        "confidence": 75
    }
    
    response = requests.post(
        f"{BASE_URL}/observation-workspace/{observation_id}/add-recommendation",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        
        if not data.get("success"):
            print_result(False, "Response indicates failure", data)
            return False
        
        action = data.get("action", {})
        message = data.get("message", "")
        
        # Verify action was created from recommendation
        if not action.get("id"):
            print_result(False, "Action missing ID", data)
            return False
        
        action_number = action.get("action_number", "")
        action_title = action.get("title", "")
        
        print_result(True, f"Recommendation added as action: {action_number} - {action_title}")
        
        # Verify action fields
        required_fields = ["id", "action_number", "title", "action_type", "status"]
        missing_fields = [f for f in required_fields if f not in action]
        
        if missing_fields:
            print_result(False, f"Action missing fields: {missing_fields}")
            return False
        else:
            print_result(True, "Action structure valid")
        
        # Verify action type mapping (PM -> preventive)
        if action.get("action_type") == "preventive":
            print_result(True, "Action type correctly mapped (PM -> preventive)")
        else:
            print_result(False, f"Action type not mapped correctly: {action.get('action_type')}")
        
        # Verify recommendation metadata is preserved
        if action.get("expected_impact") == "Test impact":
            print_result(True, "Expected impact preserved")
        
        if action.get("confidence") == 75:
            print_result(True, "Confidence score preserved")
        
        return True
    else:
        print_result(False, f"Failed to add recommendation: {response.status_code}", response.json())
        return False


# ============= MAIN TEST RUNNER =============

def run_all_tests():
    """Run all Observation Workspace API tests"""
    global auth_token, observation_id
    
    print("\n" + "="*80)
    print("  OBSERVATION WORKSPACE API TESTS")
    print("="*80)
    
    # Authentication
    auth_token = login()
    if not auth_token:
        print("\n❌ CRITICAL: Authentication failed. Cannot proceed with tests.")
        return
    
    # Get existing observation ID
    observation_id = get_existing_observation_id()
    if not observation_id:
        print("\n❌ CRITICAL: No observation found. Cannot proceed with tests.")
        return
    
    # Run tests
    print_section("OBSERVATION WORKSPACE API TESTS")
    
    test_results = []
    
    # Test 1: Get Observation Workspace
    result1 = test_get_observation_workspace()
    test_results.append(("Get Observation Workspace", result1))
    
    # Test 2: Get Timeline
    result2 = test_get_observation_timeline()
    test_results.append(("Get Observation Timeline", result2))
    
    # Test 3: Add Action
    result3 = test_add_action_to_plan()
    test_results.append(("Add Action to Plan", result3))
    
    # Test 4: Add Recommendation
    result4 = test_add_recommendation_to_plan()
    test_results.append(("Add Recommendation to Plan", result4))
    
    # Print summary
    print_section("TEST SUMMARY")
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    print(f"Tests Passed: {passed}/{total}\n")
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80 + "\n")
    
    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
