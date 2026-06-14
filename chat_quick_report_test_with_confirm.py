"""
Chat Quick Report Flow - Test with Confirmation Bypass
Tests if saying "yes" to confirmation creates observation immediately.
"""

import requests
import json

# Configuration
BASE_URL = "https://reliability-graph-1.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None


def login():
    """Login and get auth token"""
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    return None


def get_headers():
    """Get request headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


def test_with_confirmation():
    """Test if saying 'yes' to confirmation triggers Quick Report Flow"""
    global auth_token
    
    print("\n" + "="*80)
    print("  TESTING QUICK REPORT FLOW WITH CONFIRMATION BYPASS")
    print("="*80 + "\n")
    
    # Login
    auth_token = login()
    if not auth_token:
        print("❌ Login failed")
        return
    print("✅ Login successful\n")
    
    # Clear chat history
    requests.delete(f"{BASE_URL}/chat/clear", headers=get_headers())
    print("✅ Chat history cleared\n")
    
    # Step 1: Send initial message
    print("--- Step 1: Send initial message ---")
    response1 = requests.post(
        f"{BASE_URL}/chat/send",
        headers=get_headers(),
        json={"content": "Pump P-101 has a bearing noise problem"}
    )
    
    if response1.status_code == 200:
        data1 = response1.json()
        print(f"Response: {data1.get('message', '')[:100]}...")
        print(f"Question type: {data1.get('question_type')}")
        print(f"Issue summary: {data1.get('issue_summary')}")
        print(f"Threat created: {data1.get('threat') is not None}")
        
        if data1.get('question_type') == 'issue_confirm':
            print("\n✅ Got issue confirmation prompt (expected)\n")
            
            # Step 2: Confirm with "yes"
            print("--- Step 2: Confirm with 'yes' ---")
            response2 = requests.post(
                f"{BASE_URL}/chat/send",
                headers=get_headers(),
                json={"content": "yes"}
            )
            
            if response2.status_code == 200:
                data2 = response2.json()
                print(f"Response: {data2.get('message', '')[:200]}...")
                print(f"Question type: {data2.get('question_type')}")
                print(f"Threat created: {data2.get('threat') is not None}")
                
                if data2.get('threat'):
                    threat = data2['threat']
                    print(f"\n✅ OBSERVATION CREATED AFTER CONFIRMATION")
                    print(f"   Threat ID: {threat.get('id')}")
                    print(f"   Equipment: {threat.get('asset')}")
                    print(f"   Failure Mode: {threat.get('failure_mode')}")
                    
                    # Check if equipment and failure mode were auto-selected
                    equipment = threat.get('asset', '')
                    failure_mode = threat.get('failure_mode', '')
                    
                    if equipment and equipment != "Unknown equipment":
                        print(f"   ✅ Equipment auto-selected: {equipment}")
                    else:
                        print(f"   ❌ Equipment not auto-selected: {equipment}")
                    
                    if failure_mode and failure_mode != "Unknown / not specified":
                        print(f"   ✅ Failure mode auto-selected: {failure_mode}")
                    else:
                        print(f"   ❌ Failure mode not auto-selected: {failure_mode}")
                else:
                    print(f"\n❌ NO OBSERVATION CREATED AFTER CONFIRMATION")
                    print(f"Full response: {json.dumps(data2, indent=2)}")
            else:
                print(f"❌ Failed to send confirmation: {response2.status_code}")
        else:
            print(f"\n❌ Unexpected question type: {data1.get('question_type')}")
    else:
        print(f"❌ Failed to send initial message: {response1.status_code}")
    
    print("\n" + "="*80 + "\n")


if __name__ == "__main__":
    test_with_confirmation()
