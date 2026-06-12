"""
Chat Quick Report Flow Backend API Tests
Tests the updated chat flow for quick observation reporting.
"""

import requests
import json
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://action-lockup-bug.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None
threat_ids = []


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
        print(f"Response: {json.dumps(data, indent=2, default=str)}")


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


# ============= CHAT QUICK REPORT TESTS =============

def test_clear_chat_history():
    """Test DELETE /api/chat/clear"""
    print_test("Clear Chat History")
    
    response = requests.delete(
        f"{BASE_URL}/chat/clear",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            deleted_count = data.get("deleted_messages", 0)
            print_result(True, f"Chat history cleared. Deleted {deleted_count} messages")
        else:
            print_result(False, "Clear chat history failed", data)
    else:
        print_result(False, f"Failed to clear chat history: {response.status_code}", response.json())


def test_quick_report_known_equipment():
    """Test Quick Report Flow - Known Equipment (Pump P-101 bearing noise)"""
    global threat_ids
    print_test("Quick Report - Known Equipment")
    
    payload = {
        "content": "Pump P-101 has a bearing noise problem",
        "image_base64": None
    }
    
    response = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")
        threat = data.get("threat")
        
        print(f"Response message: {message[:200]}...")
        
        # Check if observation was created immediately
        if threat:
            threat_id = threat.get("id")
            threat_title = threat.get("title", "")
            equipment = threat.get("asset", "")
            failure_mode = threat.get("failure_mode", "")
            
            threat_ids.append(threat_id)
            
            print_result(True, f"✅ Observation created IMMEDIATELY")
            print(f"   Threat ID: {threat_id}")
            print(f"   Title: {threat_title}")
            print(f"   Equipment: {equipment}")
            print(f"   Failure Mode: {failure_mode}")
            
            # Verify equipment was auto-selected
            if equipment and equipment != "Unknown equipment":
                print_result(True, f"✅ Equipment auto-selected: {equipment}")
            else:
                print_result(False, f"❌ Equipment not auto-selected or unknown: {equipment}")
            
            # Verify failure mode was auto-selected
            if failure_mode and failure_mode != "Unknown / not specified":
                print_result(True, f"✅ Failure mode auto-selected: {failure_mode}")
            else:
                print_result(False, f"❌ Failure mode not auto-selected: {failure_mode}")
            
            # Check for AI auto-selection message
            if "auto-select" in message.lower() or "ai" in message.lower():
                print_result(True, "✅ Response mentions AI auto-selection")
            else:
                print_result(False, "❌ Response doesn't mention AI auto-selection")
            
            # Verify no follow-up questions asking for equipment or failure mode
            if "which equipment" not in message.lower() and "select equipment" not in message.lower():
                print_result(True, "✅ No follow-up question asking for equipment")
            else:
                print_result(False, "❌ Response asks for equipment selection (should not)")
            
            if "which failure" not in message.lower() and "select failure" not in message.lower():
                print_result(True, "✅ No follow-up question asking for failure mode")
            else:
                print_result(False, "❌ Response asks for failure mode selection (should not)")
        else:
            print_result(False, "❌ CRITICAL: Observation NOT created immediately. No threat in response.")
            print(f"Full response: {json.dumps(data, indent=2)}")
    else:
        print_result(False, f"Failed to send chat message: {response.status_code}", response.json())


def test_quick_report_unknown_equipment():
    """Test Quick Report Flow - Unknown Equipment (vibration in workshop)"""
    global threat_ids
    print_test("Quick Report - Unknown Equipment")
    
    payload = {
        "content": "There's a strange vibration in the workshop area"
    }
    
    response = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")
        threat = data.get("threat")
        
        print(f"Response message: {message[:200]}...")
        
        # Check if observation was created immediately
        if threat:
            threat_id = threat.get("id")
            threat_title = threat.get("title", "")
            equipment = threat.get("asset", "")
            failure_mode = threat.get("failure_mode", "")
            
            threat_ids.append(threat_id)
            
            print_result(True, f"✅ Observation created IMMEDIATELY (even with unknown equipment)")
            print(f"   Threat ID: {threat_id}")
            print(f"   Title: {threat_title}")
            print(f"   Equipment: {equipment}")
            print(f"   Failure Mode: {failure_mode}")
            
            # Equipment may be "Unknown equipment" - that's OK
            if equipment:
                if "unknown" in equipment.lower():
                    print_result(True, f"✅ Equipment marked as unknown (expected): {equipment}")
                else:
                    print_result(True, f"✅ Equipment auto-selected: {equipment}")
            else:
                print_result(False, f"❌ Equipment field is empty")
            
            # Verify failure mode was set (may be custom)
            if failure_mode:
                print_result(True, f"✅ Failure mode set: {failure_mode}")
            else:
                print_result(False, f"❌ Failure mode not set")
            
            # Check for review note when equipment is unknown
            if "unknown" in equipment.lower() and ("review" in message.lower() or "update" in message.lower()):
                print_result(True, "✅ Response notes that equipment needs review")
            
            # Verify no follow-up questions asking user to select equipment
            if "which equipment" not in message.lower() and "select equipment" not in message.lower():
                print_result(True, "✅ No follow-up question asking for equipment (correct behavior)")
            else:
                print_result(False, "❌ Response asks for equipment selection (should create with unknown)")
        else:
            print_result(False, "❌ CRITICAL: Observation NOT created immediately. No threat in response.")
            print(f"Full response: {json.dumps(data, indent=2)}")
    else:
        print_result(False, f"Failed to send chat message: {response.status_code}", response.json())


def test_verify_observations_created():
    """Test GET /api/threats to verify observations were created"""
    print_test("Verify Observations Created")
    
    response = requests.get(
        f"{BASE_URL}/threats",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        threats = data.get("threats", [])
        
        print_result(True, f"Retrieved {len(threats)} observations")
        
        # Check if our created observations are in the list
        found_count = 0
        for threat_id in threat_ids:
            found = any(t.get("id") == threat_id for t in threats)
            if found:
                found_count += 1
                threat = next(t for t in threats if t.get("id") == threat_id)
                print(f"   ✅ Found: {threat.get('title', 'Unknown')}")
        
        if found_count == len(threat_ids):
            print_result(True, f"✅ All {found_count} created observations found in list")
        else:
            print_result(False, f"❌ Only {found_count}/{len(threat_ids)} observations found")
    else:
        print_result(False, f"Failed to get threats: {response.status_code}", response.json())


def test_chat_history_after_quick_reports():
    """Test GET /api/chat/history to verify messages were stored"""
    print_test("Verify Chat History")
    
    response = requests.get(
        f"{BASE_URL}/chat/history",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        messages = response.json()
        
        print_result(True, f"Retrieved {len(messages)} chat messages")
        
        # Check for our test messages
        user_messages = [m for m in messages if m.get("role") == "user"]
        assistant_messages = [m for m in messages if m.get("role") == "assistant"]
        
        print(f"   User messages: {len(user_messages)}")
        print(f"   Assistant messages: {len(assistant_messages)}")
        
        # Verify our test messages are present
        pump_msg = any("P-101" in m.get("content", "") for m in user_messages)
        workshop_msg = any("workshop" in m.get("content", "").lower() for m in user_messages)
        
        if pump_msg:
            print_result(True, "✅ Pump P-101 message found in history")
        else:
            print_result(False, "❌ Pump P-101 message not found in history")
        
        if workshop_msg:
            print_result(True, "✅ Workshop vibration message found in history")
        else:
            print_result(False, "❌ Workshop vibration message not found in history")
    else:
        print_result(False, f"Failed to get chat history: {response.status_code}", response.json())


# ============= MAIN TEST RUNNER =============

def run_all_tests():
    """Run all chat quick report tests"""
    global auth_token
    
    print("\n" + "="*80)
    print("  CHAT QUICK REPORT FLOW BACKEND API TESTS")
    print("="*80)
    
    # Authentication
    auth_token = login()
    if not auth_token:
        print("\n❌ CRITICAL: Authentication failed. Cannot proceed with tests.")
        return
    
    # Run tests in order
    print_section("1. CLEAR CHAT HISTORY")
    test_clear_chat_history()
    
    print_section("2. QUICK REPORT - KNOWN EQUIPMENT")
    test_quick_report_known_equipment()
    
    print_section("3. QUICK REPORT - UNKNOWN EQUIPMENT")
    test_quick_report_unknown_equipment()
    
    print_section("4. VERIFY OBSERVATIONS")
    test_verify_observations_created()
    
    print_section("5. VERIFY CHAT HISTORY")
    test_chat_history_after_quick_reports()
    
    print_section("TEST SUMMARY")
    print("All chat quick report flow tests completed.")
    print("Review the results above for any failures.")
    print("\n" + "="*80 + "\n")


if __name__ == "__main__":
    run_all_tests()
