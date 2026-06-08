"""
Backend Test - Chat Flow for Reporting Observations

Tests the complete chat flow including:
1. Clear chat history
2. Send initial message with issue confirmation
3. Accept flow
4. Revise flow
5. Cancel flow
"""

import requests
import json
import time

# Configuration
BASE_URL = "https://observation-hub-2.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None
test_results = []


def log_result(test_name, passed, message="", details=None):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {
        "test": test_name,
        "passed": passed,
        "message": message,
        "details": details
    }
    test_results.append(result)
    print(f"{status}: {test_name}")
    if message:
        print(f"   {message}")
    if details and not passed:
        print(f"   Details: {json.dumps(details, indent=2)}")
    print()


def login():
    """Login and get auth token"""
    print("\n" + "="*80)
    print("  CHAT FLOW TESTING - OBSERVATION REPORTING")
    print("="*80 + "\n")
    print(f"Logging in as {TEST_EMAIL}...")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("token") or data.get("access_token")
        if token:
            print("✅ Login successful\n")
            return token
    
    print(f"❌ Login failed: {response.status_code}")
    print(f"Response: {response.text}")
    return None


def get_headers():
    """Get request headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


def test_clear_chat():
    """Test 1: Clear chat history"""
    print("--- Test 1: Clear Chat History ---")
    
    response = requests.delete(f"{BASE_URL}/chat/clear", headers=get_headers())
    
    if response.status_code == 200:
        data = response.json()
        log_result(
            "Clear Chat History",
            data.get("success") == True,
            f"Deleted {data.get('deleted_messages', 0)} messages"
        )
        return True
    else:
        log_result(
            "Clear Chat History",
            False,
            f"Failed with status {response.status_code}",
            response.text
        )
        return False


def test_initial_message_with_confirmation():
    """Test 2: Send initial message and verify issue confirmation"""
    print("--- Test 2: Send Initial Message (Issue Confirmation) ---")
    
    response = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "Pump P-101 has a bearing noise problem"}
    )
    
    if response.status_code != 200:
        log_result(
            "Initial Message - Issue Confirmation",
            False,
            f"Failed with status {response.status_code}",
            response.text
        )
        return None
    
    data = response.json()
    
    # Verify response structure
    checks = []
    
    # Check 1: Should have a message
    has_message = bool(data.get("message"))
    checks.append(("Has message", has_message))
    
    # Check 2: Should have question_type = "issue_confirm"
    question_type = data.get("question_type")
    is_issue_confirm = question_type == "issue_confirm"
    checks.append(("Question type is 'issue_confirm'", is_issue_confirm))
    
    # Check 3: Should have issue_summary
    has_summary = bool(data.get("issue_summary"))
    checks.append(("Has issue_summary", has_summary))
    
    # Check 4: Message should contain summary and options
    message = data.get("message", "")
    has_accept_option = "accept" in message.lower()
    has_revise_option = "revise" in message.lower() or "aanpassen" in message.lower()
    has_cancel_option = "cancel" in message.lower() or "annuleren" in message.lower()
    checks.append(("Message contains Accept option", has_accept_option))
    checks.append(("Message contains Revise option", has_revise_option))
    checks.append(("Message contains Cancel option", has_cancel_option))
    
    # Check 5: Should NOT create observation yet
    no_threat = data.get("threat") is None
    checks.append(("No observation created yet", no_threat))
    
    all_passed = all(check[1] for check in checks)
    
    details = {
        "question_type": question_type,
        "issue_summary": data.get("issue_summary"),
        "message_preview": message[:200] if message else None,
        "checks": checks
    }
    
    log_result(
        "Initial Message - Issue Confirmation",
        all_passed,
        f"Summary: {data.get('issue_summary', 'N/A')[:100]}",
        details if not all_passed else None
    )
    
    return data if all_passed else None


def test_accept_flow():
    """Test 3: Test Accept flow - should create observation"""
    print("--- Test 3: Accept Flow ---")
    
    # First, send initial message
    response1 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "Pump P-101 has a bearing noise problem"}
    )
    
    if response1.status_code != 200:
        log_result("Accept Flow", False, "Failed to send initial message")
        return False
    
    time.sleep(0.5)  # Small delay
    
    # Send "accept"
    response2 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "accept"}
    )
    
    if response2.status_code != 200:
        log_result(
            "Accept Flow",
            False,
            f"Failed with status {response2.status_code}",
            response2.text
        )
        return False
    
    data = response2.json()
    
    # Verify observation was created
    checks = []
    
    # Check 1: Should have threat object
    has_threat = data.get("threat") is not None
    checks.append(("Observation created", has_threat))
    
    if has_threat:
        threat = data["threat"]
        
        # Check 2: Should have threat_id
        has_id = bool(threat.get("id"))
        checks.append(("Has threat_id", has_id))
        
        # Check 3: Should have equipment/asset
        has_asset = bool(threat.get("asset"))
        checks.append(("Has equipment/asset", has_asset))
        
        # Check 4: Should have failure_mode
        has_failure_mode = bool(threat.get("failure_mode"))
        checks.append(("Has failure_mode", has_failure_mode))
        
        # Check 5: Message should indicate observation recorded
        message = data.get("message", "")
        is_recorded = "recorded" in message.lower() or "vastgelegd" in message.lower()
        checks.append(("Message indicates observation recorded", is_recorded))
        
        details = {
            "threat_id": threat.get("id"),
            "equipment": threat.get("asset"),
            "failure_mode": threat.get("failure_mode"),
            "message": message[:200]
        }
    else:
        details = {"response": data}
    
    all_passed = all(check[1] for check in checks)
    
    log_result(
        "Accept Flow",
        all_passed,
        f"Threat ID: {threat.get('id') if has_threat else 'N/A'}",
        details if not all_passed else None
    )
    
    return all_passed


def test_revise_flow():
    """Test 4: Test Revise flow - should ask to redescribe"""
    print("--- Test 4: Revise Flow ---")
    
    # Clear chat first
    requests.delete(f"{BASE_URL}/chat/clear", headers=get_headers())
    time.sleep(0.5)
    
    # Send initial message
    response1 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "Pump P-101 has a bearing noise problem"}
    )
    
    if response1.status_code != 200:
        log_result("Revise Flow", False, "Failed to send initial message")
        return False
    
    time.sleep(0.5)
    
    # Send "revise"
    response2 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "revise"}
    )
    
    if response2.status_code != 200:
        log_result(
            "Revise Flow",
            False,
            f"Failed with status {response2.status_code}",
            response2.text
        )
        return False
    
    data = response2.json()
    
    # Verify response
    checks = []
    
    # Check 1: Should have question_type = "issue_redescribe"
    question_type = data.get("question_type")
    is_redescribe = question_type == "issue_redescribe"
    checks.append(("Question type is 'issue_redescribe'", is_redescribe))
    
    # Check 2: Should NOT create observation
    no_threat = data.get("threat") is None
    checks.append(("No observation created", no_threat))
    
    # Check 3: Message should ask to describe again
    message = data.get("message", "")
    asks_redescribe = "describe" in message.lower() or "geef" in message.lower()
    checks.append(("Message asks to describe again", asks_redescribe))
    
    all_passed = all(check[1] for check in checks)
    
    details = {
        "question_type": question_type,
        "message": message,
        "checks": checks
    }
    
    log_result(
        "Revise Flow",
        all_passed,
        f"Question type: {question_type}",
        details if not all_passed else None
    )
    
    return all_passed


def test_cancel_flow():
    """Test 5: Test Cancel flow - should reset conversation"""
    print("--- Test 5: Cancel Flow ---")
    
    # Clear chat first
    requests.delete(f"{BASE_URL}/chat/clear", headers=get_headers())
    time.sleep(0.5)
    
    # Send initial message
    response1 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "Pump P-101 has a bearing noise problem"}
    )
    
    if response1.status_code != 200:
        log_result("Cancel Flow", False, "Failed to send initial message")
        return False
    
    time.sleep(0.5)
    
    # Send "cancel"
    response2 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "cancel"}
    )
    
    if response2.status_code != 200:
        log_result(
            "Cancel Flow",
            False,
            f"Failed with status {response2.status_code}",
            response2.text
        )
        return False
    
    data = response2.json()
    
    # Verify response
    checks = []
    
    # Check 1: Should NOT create observation
    no_threat = data.get("threat") is None
    checks.append(("No observation created", no_threat))
    
    # Check 2: Message should indicate cancelled and ask what to report
    message = data.get("message", "")
    is_cancelled = "cancel" in message.lower() or "geannuleerd" in message.lower()
    asks_what_to_report = "what" in message.lower() or "wat" in message.lower()
    checks.append(("Message indicates cancelled", is_cancelled))
    checks.append(("Message asks what to report", asks_what_to_report))
    
    all_passed = all(check[1] for check in checks)
    
    details = {
        "message": message,
        "checks": checks
    }
    
    log_result(
        "Cancel Flow",
        all_passed,
        "Conversation reset successfully",
        details if not all_passed else None
    )
    
    return all_passed


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("  TEST SUMMARY")
    print("="*80 + "\n")
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {(passed/total*100):.1f}%\n")
    
    if total - passed > 0:
        print("Failed Tests:")
        for r in test_results:
            if not r["passed"]:
                print(f"  ❌ {r['test']}: {r['message']}")
    
    print("\n" + "="*80 + "\n")


def main():
    """Run all tests"""
    global auth_token
    
    # Login
    auth_token = login()
    if not auth_token:
        print("❌ Cannot proceed without authentication")
        return
    
    # Run tests
    test_clear_chat()
    test_initial_message_with_confirmation()
    test_accept_flow()
    test_revise_flow()
    test_cancel_flow()
    
    # Print summary
    print_summary()


if __name__ == "__main__":
    main()
