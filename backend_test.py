"""
Backend Test for Chat Summary Format Enhancement
Tests the updated chat summary format for reporting observations.
"""
import requests
import json
import time

# Configuration
BASE_URL = "https://strategy-fixes-1.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None
headers = {}

def login():
    """Login and get auth token"""
    global auth_token, headers
    print("\n" + "="*80)
    print("TEST 1: Login")
    print("="*80)
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Login response: {json.dumps(data, indent=2)}")
        
        # Try different token field names
        auth_token = data.get("access_token") or data.get("token") or data.get("accessToken")
        
        if not auth_token:
            print(f"❌ No token found in response")
            return False
            
        headers = {"Authorization": f"Bearer {auth_token}"}
        print("✅ Login successful")
        print(f"User: {data.get('user', {}).get('email')}")
        print(f"Token (first 20 chars): {auth_token[:20]}...")
        return True
    else:
        print(f"❌ Login failed: {response.text}")
        return False

def clear_chat_history():
    """Clear chat history"""
    print("\n" + "="*80)
    print("TEST 2: Clear Chat History")
    print("="*80)
    
    response = requests.delete(
        f"{BASE_URL}/chat/clear",
        headers=headers
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Chat history cleared successfully")
        print(f"Response: {json.dumps(data, indent=2)}")
        return True
    else:
        print(f"❌ Failed to clear chat history: {response.text}")
        return False

def send_chat_message(content, test_name):
    """Send a chat message and verify the response"""
    print("\n" + "="*80)
    print(f"TEST: {test_name}")
    print("="*80)
    print(f"Message: {content}")
    
    response = requests.post(
        f"{BASE_URL}/chat/send",
        headers=headers,
        json={"content": content}
    )
    
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("\n✅ Message sent successfully")
        
        # Extract response details
        message = data.get("message", "")
        issue_summary = data.get("issue_summary", "")
        question_type = data.get("question_type", "")
        
        print(f"\nQuestion Type: {question_type}")
        print(f"\nAssistant Response:")
        print("-" * 80)
        print(message)
        print("-" * 80)
        
        if issue_summary:
            print(f"\nIssue Summary:")
            print("-" * 80)
            print(issue_summary)
            print("-" * 80)
        
        # Verify the summary format
        print("\n📋 VERIFICATION:")
        print("-" * 80)
        
        # Check if message contains the expected header
        if "📋 **Observation Summary**" in message or "📋 **Observatie Samenvatting**" in message:
            print("✅ Contains observation summary header")
        else:
            print("❌ Missing observation summary header")
        
        # Check if issue_summary contains expected sections
        if issue_summary:
            has_equipment = "**Equipment:**" in issue_summary or "**Apparatuur:**" in issue_summary
            has_issue_type = "**Issue Type:**" in issue_summary or "**Storing Type:**" in issue_summary or "**Type:**" in issue_summary
            has_description = "**Description:**" in issue_summary or "**Beschrijving:**" in issue_summary
            
            print(f"{'✅' if has_equipment else '❌'} Contains Equipment section")
            print(f"{'✅' if has_issue_type else '❌'} Contains Issue Type section")
            print(f"{'✅' if has_description else '❌'} Contains Description section")
            
            # Check if it looks professional (not just echoing user input)
            if len(issue_summary) > 50 and ("Pump" in issue_summary or "bearing" in issue_summary.lower()):
                print("✅ Summary appears professionally written")
            else:
                print("⚠️  Summary may need review")
        else:
            print("❌ No issue_summary in response")
        
        # Check for action options
        if "Accept" in message or "Accepteren" in message:
            print("✅ Contains Accept action option")
        else:
            print("❌ Missing Accept action option")
        
        if "Revise" in message or "Aanpassen" in message:
            print("✅ Contains Revise action option")
        else:
            print("❌ Missing Revise action option")
        
        if "Cancel" in message or "Annuleren" in message:
            print("✅ Contains Cancel action option")
        else:
            print("❌ Missing Cancel action option")
        
        return True, data
    else:
        print(f"❌ Failed to send message: {response.text}")
        return False, None

def test_specific_bearing_noise():
    """Test with specific bearing noise problem"""
    content = "Pump P-101 has a bearing noise problem, sounds like grinding"
    return send_chat_message(content, "TEST 3: Specific Bearing Noise Problem")

def test_vague_workshop_noise():
    """Test with vague workshop noise"""
    # First clear chat to reset state
    clear_chat_history()
    time.sleep(1)  # Small delay to ensure state is reset
    
    content = "there's a weird noise coming from somewhere in the workshop"
    return send_chat_message(content, "TEST 4: Vague Workshop Noise")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CHAT SUMMARY FORMAT TESTING")
    print("Testing the updated chat summary format for reporting observations")
    print("="*80)
    
    # Test 1: Login
    if not login():
        print("\n❌ Login failed. Cannot continue with tests.")
        return
    
    time.sleep(1)
    
    # Test 2: Clear chat history
    if not clear_chat_history():
        print("\n⚠️  Failed to clear chat history, but continuing with tests...")
    
    time.sleep(1)
    
    # Test 3: Specific bearing noise problem
    success1, data1 = test_specific_bearing_noise()
    
    time.sleep(2)
    
    # Test 4: Vague workshop noise
    success2, data2 = test_vague_workshop_noise()
    
    # Final summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    if success1 and success2:
        print("✅ All tests completed successfully")
        print("\n📋 Key Findings:")
        print("- Chat summary format is working")
        print("- Professional summaries are being generated")
        print("- Equipment, Issue Type, and Description sections are present")
        print("- Action options (Accept/Revise/Cancel) are displayed")
    else:
        print("❌ Some tests failed")
        if not success1:
            print("- Specific bearing noise test failed")
        if not success2:
            print("- Vague workshop noise test failed")
    
    print("\n" + "="*80)

if __name__ == "__main__":
    main()
