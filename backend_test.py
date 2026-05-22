#!/usr/bin/env python3
"""
Backend API Testing Script for Investigation Features
Tests the new investigation-related API endpoints
"""

import requests
import json
import sys
from typing import Optional, Dict, Any

# Configuration
BASE_URL = "https://pm-plan-converter.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def add_pass(self, test_name: str):
        self.passed += 1
        print(f"{Colors.GREEN}✓{Colors.END} {test_name}")
    
    def add_fail(self, test_name: str, error: str):
        self.failed += 1
        self.errors.append({"test": test_name, "error": error})
        print(f"{Colors.RED}✗{Colors.END} {test_name}")
        print(f"  {Colors.RED}Error: {error}{Colors.END}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"Test Summary: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"{Colors.RED}Failed tests: {self.failed}{Colors.END}")
            for err in self.errors:
                print(f"  - {err['test']}: {err['error']}")
        else:
            print(f"{Colors.GREEN}All tests passed!{Colors.END}")
        print(f"{'='*60}\n")
        return self.failed == 0

def login() -> Optional[str]:
    """Login and return auth token"""
    print(f"\n{Colors.BLUE}=== Authentication ==={Colors.END}")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token") or data.get("access_token")
            if token:
                print(f"{Colors.GREEN}✓{Colors.END} Login successful")
                return token
            else:
                print(f"{Colors.RED}✗{Colors.END} No token in response")
                print(f"Response keys: {list(data.keys())}")
                return None
        else:
            print(f"{Colors.RED}✗{Colors.END} Login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"{Colors.RED}✗{Colors.END} Login error: {str(e)}")
        return None

def get_headers(token: str) -> Dict[str, str]:
    """Get request headers with auth token"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def get_existing_investigation(token: str) -> Optional[str]:
    """Get an existing investigation ID for testing"""
    try:
        response = requests.get(
            f"{BASE_URL}/investigations",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            investigations = data.get("investigations", [])
            if investigations:
                inv_id = investigations[0]["id"]
                print(f"{Colors.GREEN}✓{Colors.END} Found existing investigation: {inv_id}")
                return inv_id
            else:
                print(f"{Colors.YELLOW}⚠{Colors.END} No existing investigations found, creating one...")
                return create_test_investigation(token)
        else:
            print(f"{Colors.RED}✗{Colors.END} Failed to get investigations: {response.status_code}")
            return None
    except Exception as e:
        print(f"{Colors.RED}✗{Colors.END} Error getting investigations: {str(e)}")
        return None

def create_test_investigation(token: str) -> Optional[str]:
    """Create a test investigation for testing"""
    try:
        payload = {
            "title": "Test Investigation for API Testing",
            "description": "The operator failed to follow procedure and this caused the pump to fail due to high temperature",
            "asset_name": "Pump-101",
            "location": "Plant A",
            "incident_date": "2024-01-15T10:30:00Z",
            "investigation_leader": "Test User",
            "team_members": []
        }
        
        response = requests.post(
            f"{BASE_URL}/investigations",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            inv_id = data.get("id")
            print(f"{Colors.GREEN}✓{Colors.END} Created test investigation: {inv_id}")
            return inv_id
        else:
            print(f"{Colors.RED}✗{Colors.END} Failed to create investigation: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"{Colors.RED}✗{Colors.END} Error creating investigation: {str(e)}")
        return None

def test_ai_problem_check(token: str, inv_id: str, results: TestResult):
    """Test AI Problem Check API"""
    print(f"\n{Colors.BLUE}=== Testing AI Problem Check API ==={Colors.END}")
    
    # Test 1: Valid request with defensive reasoning
    try:
        payload = {
            "description": "The operator failed to follow procedure and this caused the pump to fail"
        }
        
        response = requests.post(
            f"{BASE_URL}/investigations/{inv_id}/ai-problem-check",
            headers=get_headers(token),
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if "analysis" in data and "has_issues" in data and "refined_description" in data and "changes_made" in data:
                results.add_pass("AI Problem Check - Valid request with defensive reasoning")
                
                # Print analysis details
                print(f"  Analysis: {json.dumps(data['analysis'], indent=2)}")
                print(f"  Has Issues: {data['has_issues']}")
                print(f"  Refined: {data['refined_description'][:100]}...")
            else:
                results.add_fail("AI Problem Check - Valid request", f"Missing required fields in response: {list(data.keys())}")
        else:
            results.add_fail("AI Problem Check - Valid request", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("AI Problem Check - Valid request", str(e))
    
    # Test 2: Empty description (should return 400)
    try:
        payload = {"description": ""}
        
        response = requests.post(
            f"{BASE_URL}/investigations/{inv_id}/ai-problem-check",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 400:
            results.add_pass("AI Problem Check - Empty description returns 400")
        else:
            results.add_fail("AI Problem Check - Empty description", f"Expected 400, got {response.status_code}")
    except Exception as e:
        results.add_fail("AI Problem Check - Empty description", str(e))
    
    # Test 3: Invalid investigation ID (should return 404)
    try:
        payload = {"description": "Test description"}
        
        response = requests.post(
            f"{BASE_URL}/investigations/invalid-id-12345/ai-problem-check",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 404:
            results.add_pass("AI Problem Check - Invalid investigation ID returns 404")
        else:
            results.add_fail("AI Problem Check - Invalid investigation ID", f"Expected 404, got {response.status_code}")
    except Exception as e:
        results.add_fail("AI Problem Check - Invalid investigation ID", str(e))

def test_similar_incidents(token: str, inv_id: str, results: TestResult):
    """Test Similar Incidents API"""
    print(f"\n{Colors.BLUE}=== Testing Similar Incidents API ==={Colors.END}")
    
    try:
        response = requests.get(
            f"{BASE_URL}/investigations/{inv_id}/similar-incidents",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if "found" in data and "similar_incidents" in data:
                results.add_pass("Similar Incidents - Valid request")
                print(f"  Found: {data['found']}")
                print(f"  Similar incidents count: {len(data['similar_incidents'])}")
                
                if data['similar_incidents']:
                    print(f"  Sample incident: {data['similar_incidents'][0]}")
            else:
                results.add_fail("Similar Incidents - Valid request", f"Missing required fields: {list(data.keys())}")
        else:
            results.add_fail("Similar Incidents - Valid request", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Similar Incidents - Valid request", str(e))
    
    # Test invalid investigation ID
    try:
        response = requests.get(
            f"{BASE_URL}/investigations/invalid-id-12345/similar-incidents",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 404:
            results.add_pass("Similar Incidents - Invalid investigation ID returns 404")
        else:
            results.add_fail("Similar Incidents - Invalid investigation ID", f"Expected 404, got {response.status_code}")
    except Exception as e:
        results.add_fail("Similar Incidents - Invalid investigation ID", str(e))

def test_linked_incident(token: str, inv_id: str, results: TestResult):
    """Test Linked Incident API"""
    print(f"\n{Colors.BLUE}=== Testing Linked Incident API ==={Colors.END}")
    
    try:
        response = requests.get(
            f"{BASE_URL}/investigations/{inv_id}/linked-incident",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if "linked_incident" in data:
                results.add_pass("Linked Incident - Valid request")
                print(f"  Linked incident: {data['linked_incident']}")
            else:
                results.add_fail("Linked Incident - Valid request", f"Missing 'linked_incident' field")
        else:
            results.add_fail("Linked Incident - Valid request", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Linked Incident - Valid request", str(e))

def test_recurring_quadrant(token: str, inv_id: str, results: TestResult):
    """Test Recurring Quadrant API"""
    print(f"\n{Colors.BLUE}=== Testing Recurring Quadrant API ==={Colors.END}")
    
    try:
        payload = {
            "current_is": ["High temperature", "Vibration detected"],
            "current_is_not": ["Low pressure", "Normal flow rate"],
            "past_was": ["High temperature", "Abnormal noise"],
            "past_was_not": ["Low pressure", "Vibration detected"]
        }
        
        response = requests.patch(
            f"{BASE_URL}/investigations/{inv_id}/recurring-quadrant",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response
            if "message" in data and "recurring_quadrant" in data:
                results.add_pass("Recurring Quadrant - Save quadrant data")
                print(f"  Message: {data['message']}")
                print(f"  Quadrant data saved: {json.dumps(data['recurring_quadrant'], indent=2)}")
            else:
                results.add_fail("Recurring Quadrant - Save quadrant data", f"Unexpected response structure: {list(data.keys())}")
        else:
            results.add_fail("Recurring Quadrant - Save quadrant data", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Recurring Quadrant - Save quadrant data", str(e))
    
    # Verify data was saved by getting the investigation
    try:
        response = requests.get(
            f"{BASE_URL}/investigations/{inv_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            investigation = data.get("investigation", {})
            
            if investigation.get("recurring_quadrant"):
                results.add_pass("Recurring Quadrant - Data persisted correctly")
                print(f"  Verified quadrant data in investigation")
            else:
                results.add_fail("Recurring Quadrant - Data persistence", "Quadrant data not found in investigation")
        else:
            results.add_fail("Recurring Quadrant - Data verification", f"Failed to get investigation: {response.status_code}")
    except Exception as e:
        results.add_fail("Recurring Quadrant - Data verification", str(e))

def test_link_unlink_incident(token: str, inv_id: str, results: TestResult):
    """Test Link and Unlink Incident APIs"""
    print(f"\n{Colors.BLUE}=== Testing Link/Unlink Incident APIs ==={Colors.END}")
    
    # First, create a second investigation to link to
    second_inv_id = create_test_investigation(token)
    
    if not second_inv_id:
        results.add_fail("Link Incident - Setup", "Failed to create second investigation")
        return
    
    # Test linking
    try:
        response = requests.patch(
            f"{BASE_URL}/investigations/{inv_id}/link-incident",
            headers=get_headers(token),
            params={"linked_incident_id": second_inv_id},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("linked_incident_id") == second_inv_id and data.get("is_recurring") == True:
                results.add_pass("Link Incident - Link to another incident")
                print(f"  Linked to: {second_inv_id}")
            else:
                results.add_fail("Link Incident - Link to another incident", f"Unexpected response: {data}")
        else:
            results.add_fail("Link Incident - Link to another incident", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Link Incident - Link to another incident", str(e))
    
    # Verify link was created
    try:
        response = requests.get(
            f"{BASE_URL}/investigations/{inv_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            investigation = data.get("investigation", {})
            
            if investigation.get("linked_incident_id") == second_inv_id:
                results.add_pass("Link Incident - Link persisted correctly")
            else:
                results.add_fail("Link Incident - Link persistence", f"Expected linked_incident_id={second_inv_id}, got {investigation.get('linked_incident_id')}")
        else:
            results.add_fail("Link Incident - Link verification", f"Failed to get investigation: {response.status_code}")
    except Exception as e:
        results.add_fail("Link Incident - Link verification", str(e))
    
    # Test unlinking
    try:
        response = requests.delete(
            f"{BASE_URL}/investigations/{inv_id}/link-incident",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if "message" in data:
                results.add_pass("Unlink Incident - Remove link")
                print(f"  Message: {data['message']}")
            else:
                results.add_fail("Unlink Incident - Remove link", f"Unexpected response: {data}")
        else:
            results.add_fail("Unlink Incident - Remove link", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Unlink Incident - Remove link", str(e))
    
    # Verify link was removed
    try:
        response = requests.get(
            f"{BASE_URL}/investigations/{inv_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            investigation = data.get("investigation", {})
            
            if investigation.get("linked_incident_id") is None:
                results.add_pass("Unlink Incident - Link removed correctly")
            else:
                results.add_fail("Unlink Incident - Link removal", f"Link still exists: {investigation.get('linked_incident_id')}")
        else:
            results.add_fail("Unlink Incident - Unlink verification", f"Failed to get investigation: {response.status_code}")
    except Exception as e:
        results.add_fail("Unlink Incident - Unlink verification", str(e))

def main():
    """Main test execution"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}Investigation API Testing{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    results = TestResult()
    
    # Login
    token = login()
    if not token:
        print(f"\n{Colors.RED}Failed to authenticate. Cannot proceed with tests.{Colors.END}")
        sys.exit(1)
    
    # Get or create investigation
    print(f"\n{Colors.BLUE}=== Setup ==={Colors.END}")
    inv_id = get_existing_investigation(token)
    if not inv_id:
        print(f"\n{Colors.RED}Failed to get investigation ID. Cannot proceed with tests.{Colors.END}")
        sys.exit(1)
    
    # Run all tests
    test_ai_problem_check(token, inv_id, results)
    test_similar_incidents(token, inv_id, results)
    test_linked_incident(token, inv_id, results)
    test_recurring_quadrant(token, inv_id, results)
    test_link_unlink_incident(token, inv_id, results)
    
    # Print summary
    success = results.summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
