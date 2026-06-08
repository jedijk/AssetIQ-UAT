#!/usr/bin/env python3
"""
Backend API Testing Script for Chat Quick Report Flow
Tests the updated chat flow for quick observation reporting after the fix.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://observation-hub-2.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global session
session = requests.Session()
auth_token = None


def login():
    """Login and get auth token"""
    global auth_token
    print("\n" + "="*80)
    print("LOGGING IN")
    print("="*80)
    
    response = session.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        auth_token = data.get("access_token")
        
        # Get CSRF token from cookie and set it in headers for all future requests
        csrf_token = session.cookies.get('assetiq_csrf')
        if csrf_token:
            session.headers.update({"X-CSRF-Token": csrf_token})
        
        print(f"✓ Login successful")
        print(f"  User: {data.get('user', {}).get('email')}")
        print(f"  Cookies received: {list(session.cookies.keys())}")
        print(f"  CSRF token set: {bool(csrf_token)}")
        
        return True
    else:
        print(f"✗ Login failed: {response.status_code}")
        print(f"  Response: {response.text}")
        return False


def clear_chat_history():
    """Clear chat history"""
    print("\n" + "="*80)
    print("TEST 1: CLEAR CHAT HISTORY")
    print("="*80)
    
    response = session.delete(f"{BASE_URL}/chat/clear")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Chat history cleared successfully")
        print(f"  Deleted messages: {data.get('deleted_messages', 0)}")
        return True
    else:
        print(f"✗ Failed to clear chat history: {response.status_code}")
        print(f"  Response: {response.text}")
        return False


def test_quick_report_known_equipment():
    """Test quick report flow with known equipment"""
    print("\n" + "="*80)
    print("TEST 2: QUICK REPORT FLOW - KNOWN EQUIPMENT")
    print("="*80)
    print("Sending: 'Pump P-101 has a bearing noise problem'")
    print("Expected: Observation created IMMEDIATELY in ONE STEP")
    
    response = session.post(
        f"{BASE_URL}/chat/send",
        json={"content": "Pump P-101 has a bearing noise problem"}
    )
    
    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")
        threat = data.get("threat")
        awaiting_context_for_threat = data.get("awaiting_context_for_threat")
        question_type = data.get("question_type")
        
        print(f"\n✓ Response received (200 OK)")
        print(f"  Question Type: {question_type}")
        print(f"  Has Threat Object: {threat is not None}")
        print(f"  Awaiting Context For Threat: {awaiting_context_for_threat}")
        print(f"  Message: {message[:200]}...")
        
        # Check if observation was created immediately
        threat_id = None
        if threat:
            threat_id = threat.get("id")
        elif awaiting_context_for_threat:
            threat_id = awaiting_context_for_threat
        
        if threat_id and "observation recorded" in message.lower():
            print(f"\n✓ SUCCESS: Observation created immediately!")
            print(f"  Threat ID: {threat_id}")
            
            if threat:
                print(f"  Equipment: {threat.get('asset', 'N/A')}")
                print(f"  Failure Mode: {threat.get('failure_mode', 'N/A')}")
            
            # Check if it's asking for confirmation (should NOT be)
            if "is this correct" in message.lower() or "confirm" in message.lower():
                print(f"\n⚠ WARNING: System is asking for confirmation")
                print(f"  This suggests the quick report flow may not be fully working")
                return False, threat_id
            
            return True, threat_id
        else:
            print(f"\n✗ FAILURE: Observation was NOT created immediately")
            
            if not threat_id:
                print(f"  No threat_id found in response")
            if "observation recorded" not in message.lower():
                print(f"  Message does not confirm observation was recorded")
            
            # Check if it's asking for confirmation
            if "is this correct" in message.lower() or "confirm" in message.lower():
                print(f"  ERROR: System is asking for confirmation!")
                print(f"  The quick report flow is NOT working as expected")
            
            return False, threat_id
    else:
        print(f"✗ Request failed: {response.status_code}")
        print(f"  Response: {response.text}")
        return False, None


def test_quick_report_unknown_equipment():
    """Test quick report flow with unknown equipment"""
    print("\n" + "="*80)
    print("TEST 3: QUICK REPORT FLOW - UNKNOWN EQUIPMENT")
    print("="*80)
    print("Sending: 'There's a strange vibration noise'")
    print("Expected: Observation created IMMEDIATELY with 'Unknown equipment'")
    
    response = session.post(
        f"{BASE_URL}/chat/send",
        json={"content": "There's a strange vibration noise"}
    )
    
    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")
        threat = data.get("threat")
        awaiting_context_for_threat = data.get("awaiting_context_for_threat")
        question_type = data.get("question_type")
        
        print(f"\n✓ Response received (200 OK)")
        print(f"  Question Type: {question_type}")
        print(f"  Has Threat Object: {threat is not None}")
        print(f"  Awaiting Context For Threat: {awaiting_context_for_threat}")
        print(f"  Message: {message[:200]}...")
        
        # Check if observation was created immediately
        threat_id = None
        if threat:
            threat_id = threat.get("id")
        elif awaiting_context_for_threat:
            threat_id = awaiting_context_for_threat
        
        if threat_id and "observation recorded" in message.lower():
            print(f"\n✓ SUCCESS: Observation created immediately!")
            print(f"  Threat ID: {threat_id}")
            
            if threat:
                equipment = threat.get('asset', 'N/A')
                print(f"  Equipment: {equipment}")
                print(f"  Failure Mode: {threat.get('failure_mode', 'N/A')}")
                
                # Check if equipment is "Unknown" as expected
                if "unknown" in equipment.lower():
                    print(f"  ✓ Equipment correctly set to 'Unknown' (as expected)")
            
            # Check if it's asking for confirmation (should NOT be)
            if "is this correct" in message.lower() or "confirm" in message.lower():
                print(f"\n⚠ WARNING: System is asking for confirmation")
                print(f"  This suggests the quick report flow may not be fully working")
                return False, threat_id
            
            return True, threat_id
        else:
            print(f"\n✗ FAILURE: Observation was NOT created immediately")
            
            if not threat_id:
                print(f"  No threat_id found in response")
            if "observation recorded" not in message.lower():
                print(f"  Message does not confirm observation was recorded")
            
            # Check if it's asking for confirmation
            if "is this correct" in message.lower() or "confirm" in message.lower():
                print(f"  ERROR: System is asking for confirmation!")
                print(f"  The quick report flow is NOT working as expected")
            
            return False, threat_id
    else:
        print(f"✗ Request failed: {response.status_code}")
        print(f"  Response: {response.text}")
        return False, None


def verify_observations(threat_ids):
    """Verify observations were created by checking GET /api/threats"""
    print("\n" + "="*80)
    print("TEST 4: VERIFY OBSERVATIONS WERE CREATED")
    print("="*80)
    
    response = session.get(f"{BASE_URL}/threats")
    
    if response.status_code == 200:
        data = response.json()
        threats = data if isinstance(data, list) else data.get("threats", [])
        
        print(f"✓ Retrieved {len(threats)} total observations")
        
        # Find our test observations
        found_threats = []
        for threat_id in threat_ids:
            if threat_id:
                threat = next((t for t in threats if t.get("id") == threat_id), None)
                if threat:
                    found_threats.append(threat)
                    print(f"\n✓ Found observation: {threat_id}")
                    print(f"  Equipment: {threat.get('equipment_name', 'N/A')}")
                    print(f"  Failure Mode: {threat.get('failure_mode', 'N/A')}")
                    print(f"  Description: {threat.get('description', 'N/A')[:100]}...")
                else:
                    print(f"\n✗ Observation NOT found: {threat_id}")
        
        return len(found_threats) == len([t for t in threat_ids if t])
    else:
        print(f"✗ Failed to retrieve observations: {response.status_code}")
        print(f"  Response: {response.text}")
        return False


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CHAT QUICK REPORT FLOW TESTING")
    print("Testing the updated chat flow for quick observation reporting")
    print("="*80)
    
    # Login
    if not login():
        print("\n✗ TESTING ABORTED: Login failed")
        return
    
    # Test 1: Clear chat history
    clear_chat_history()
    
    # Wait a bit for cleanup
    time.sleep(1)
    
    # Test 2: Quick report with known equipment
    success1, threat_id1 = test_quick_report_known_equipment()
    
    # Test 3: Clear and test with unknown equipment
    time.sleep(1)
    clear_chat_history()
    time.sleep(1)
    
    success2, threat_id2 = test_quick_report_unknown_equipment()
    
    # Test 4: Verify observations
    time.sleep(1)
    threat_ids = [threat_id1, threat_id2]
    success3 = verify_observations(threat_ids)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total_tests = 3
    passed_tests = sum([success1, success2, success3])
    
    print(f"\nTests Passed: {passed_tests}/{total_tests}")
    print(f"  Test 2 (Known Equipment): {'✓ PASS' if success1 else '✗ FAIL'}")
    print(f"  Test 3 (Unknown Equipment): {'✓ PASS' if success2 else '✗ FAIL'}")
    print(f"  Test 4 (Verify Observations): {'✓ PASS' if success3 else '✗ FAIL'}")
    
    if passed_tests == total_tests:
        print(f"\n✓ ALL TESTS PASSED - Quick Report Flow is working correctly!")
        print(f"  Observations are created IMMEDIATELY in ONE STEP")
        print(f"  No confirmation step required")
    else:
        print(f"\n✗ SOME TESTS FAILED - Quick Report Flow has issues")
        print(f"  Please review the test output above for details")
    
    print("\n" + "="*80)


if __name__ == "__main__":
    main()
