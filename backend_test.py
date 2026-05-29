#!/usr/bin/env python3
"""
Backend API Testing Script for PM Import Feature
Tests the PM Intelligence Import API endpoints
"""

import requests
import json
import sys
import io
from typing import Optional, Dict, Any
from openpyxl import Workbook

# Configuration
BASE_URL = "https://cm-task-config.preview.emergentagent.com/api"
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

def create_test_excel_file() -> bytes:
    """Create a test Excel file with maintenance tasks"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Maintenance Plan"
    
    # Headers
    ws.append(["Task Description", "Equipment", "Frequency", "Notes"])
    
    # Sample maintenance tasks
    ws.append([
        "Inspect gearbox for oil leaks and abnormal noise",
        "Gearbox GB-101",
        "Weekly",
        "Check oil level and listen for unusual sounds"
    ])
    ws.append([
        "Grease bearings on main motor",
        "Motor M-201",
        "Monthly",
        "Use high-temperature grease"
    ])
    ws.append([
        "Calibrate pressure sensor",
        "Pressure Sensor PS-301",
        "Quarterly",
        "Verify against reference gauge"
    ])
    ws.append([
        "Replace hydraulic oil filter",
        "Hydraulic System HS-401",
        "Every 6 months",
        "Use OEM filter only"
    ])
    ws.append([
        "Clean cooling system and check for blockages",
        "Cooling System CS-501",
        "Monthly",
        "Flush with clean water"
    ])
    
    # Save to bytes
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def test_pm_import_upload(token: str, results: TestResult) -> Optional[str]:
    """Test PM Import Upload endpoint"""
    print(f"\n{Colors.BLUE}=== Testing PM Import Upload ==={Colors.END}")
    
    # Create test Excel file
    excel_content = create_test_excel_file()
    
    # Test 1: Upload Excel file
    try:
        files = {
            'file': ('test_maintenance_plan.xlsx', excel_content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        }
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.post(
            f"{BASE_URL}/pm-import/upload",
            headers=headers,
            files=files,
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if "session_id" in data and "status" in data:
                session_id = data["session_id"]
                results.add_pass("PM Import Upload - Excel file upload")
                print(f"  Session ID: {session_id}")
                print(f"  Status: {data['status']}")
                print(f"  Tasks count: {data.get('tasks_count', 0)}")
                return session_id
            else:
                results.add_fail("PM Import Upload - Excel file upload", f"Missing required fields: {list(data.keys())}")
                return None
        else:
            results.add_fail("PM Import Upload - Excel file upload", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("PM Import Upload - Excel file upload", str(e))
        return None
    
    # Test 2: Upload without file (should return 422)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(
            f"{BASE_URL}/pm-import/upload",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 422:
            results.add_pass("PM Import Upload - No file returns 422")
        else:
            results.add_fail("PM Import Upload - No file validation", f"Expected 422, got {response.status_code}")
    except Exception as e:
        results.add_fail("PM Import Upload - No file validation", str(e))

def test_pm_import_get_session(token: str, session_id: str, results: TestResult):
    """Test PM Import Get Session endpoint"""
    print(f"\n{Colors.BLUE}=== Testing PM Import Get Session ==={Colors.END}")
    
    # Test 1: Get valid session
    try:
        response = requests.get(
            f"{BASE_URL}/pm-import/session/{session_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            required_fields = ["session_id", "status", "tasks_extracted", "stats"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if not missing_fields:
                results.add_pass("PM Import Get Session - Valid session")
                print(f"  Status: {data['status']}")
                print(f"  Tasks extracted: {len(data['tasks_extracted'])}")
                print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
                
                # Validate task structure
                if data['tasks_extracted']:
                    task = data['tasks_extracted'][0]
                    task_fields = ["task_id", "original_task", "component", "task_type", 
                                   "suggested_failure_modes", "confidence_score", "review_status"]
                    missing_task_fields = [f for f in task_fields if f not in task]
                    
                    if not missing_task_fields:
                        results.add_pass("PM Import Get Session - Task structure valid")
                        print(f"  Sample task: {task['original_task'][:50]}...")
                        print(f"  Component: {task['component']}")
                        print(f"  Task type: {task['task_type']}")
                        print(f"  Confidence: {task['confidence_score']}")
                    else:
                        results.add_fail("PM Import Get Session - Task structure", f"Missing task fields: {missing_task_fields}")
            else:
                results.add_fail("PM Import Get Session - Valid session", f"Missing fields: {missing_fields}")
        else:
            results.add_fail("PM Import Get Session - Valid session", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("PM Import Get Session - Valid session", str(e))
    
    # Test 2: Get invalid session (should return 404)
    try:
        response = requests.get(
            f"{BASE_URL}/pm-import/session/invalid-session-id-12345",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 404:
            results.add_pass("PM Import Get Session - Invalid session returns 404")
        else:
            results.add_fail("PM Import Get Session - Invalid session", f"Expected 404, got {response.status_code}")
    except Exception as e:
        results.add_fail("PM Import Get Session - Invalid session", str(e))

def test_pm_import_accept_reject_task(token: str, session_id: str, results: TestResult):
    """Test PM Import Accept/Reject Task endpoints"""
    print(f"\n{Colors.BLUE}=== Testing PM Import Accept/Reject Task ==={Colors.END}")
    
    # First, get the session to get task IDs
    try:
        response = requests.get(
            f"{BASE_URL}/pm-import/session/{session_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail("PM Import Accept/Reject - Setup", "Failed to get session")
            return
        
        data = response.json()
        tasks = data.get("tasks_extracted", [])
        
        if len(tasks) < 2:
            results.add_fail("PM Import Accept/Reject - Setup", "Not enough tasks to test")
            return
        
        task_id_1 = tasks[0]["task_id"]
        task_id_2 = tasks[1]["task_id"]
        
        # Test 1: Accept a task
        try:
            response = requests.post(
                f"{BASE_URL}/pm-import/session/{session_id}/task/{task_id_1}/accept",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("success") and "stats" in data:
                    results.add_pass("PM Import Accept Task - Accept task")
                    print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
                else:
                    results.add_fail("PM Import Accept Task - Accept task", f"Unexpected response: {data}")
            else:
                results.add_fail("PM Import Accept Task - Accept task", f"Status {response.status_code}: {response.text}")
        except Exception as e:
            results.add_fail("PM Import Accept Task - Accept task", str(e))
        
        # Test 2: Reject a task
        try:
            response = requests.post(
                f"{BASE_URL}/pm-import/session/{session_id}/task/{task_id_2}/reject",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("success") and "stats" in data:
                    results.add_pass("PM Import Reject Task - Reject task")
                    print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
                else:
                    results.add_fail("PM Import Reject Task - Reject task", f"Unexpected response: {data}")
            else:
                results.add_fail("PM Import Reject Task - Reject task", f"Status {response.status_code}: {response.text}")
        except Exception as e:
            results.add_fail("PM Import Reject Task - Reject task", str(e))
        
        # Test 3: Verify task status changed
        try:
            response = requests.get(
                f"{BASE_URL}/pm-import/session/{session_id}",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                tasks = data.get("tasks_extracted", [])
                
                task_1 = next((t for t in tasks if t["task_id"] == task_id_1), None)
                task_2 = next((t for t in tasks if t["task_id"] == task_id_2), None)
                
                if task_1 and task_1.get("review_status") == "accepted":
                    results.add_pass("PM Import Accept Task - Status persisted")
                else:
                    results.add_fail("PM Import Accept Task - Status persistence", f"Expected 'accepted', got {task_1.get('review_status') if task_1 else 'task not found'}")
                
                if task_2 and task_2.get("review_status") == "rejected":
                    results.add_pass("PM Import Reject Task - Status persisted")
                else:
                    results.add_fail("PM Import Reject Task - Status persistence", f"Expected 'rejected', got {task_2.get('review_status') if task_2 else 'task not found'}")
            else:
                results.add_fail("PM Import Accept/Reject - Status verification", f"Failed to get session: {response.status_code}")
        except Exception as e:
            results.add_fail("PM Import Accept/Reject - Status verification", str(e))
        
    except Exception as e:
        results.add_fail("PM Import Accept/Reject - Setup", str(e))

def test_pm_import_bulk_action(token: str, session_id: str, results: TestResult):
    """Test PM Import Bulk Action endpoint"""
    print(f"\n{Colors.BLUE}=== Testing PM Import Bulk Action ==={Colors.END}")
    
    # Test: Accept high confidence tasks
    try:
        payload = {
            "action": "accept_high_confidence"
        }
        
        response = requests.post(
            f"{BASE_URL}/pm-import/session/{session_id}/bulk-action",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and "accepted_count" in data and "stats" in data:
                results.add_pass("PM Import Bulk Action - Accept high confidence")
                print(f"  Accepted count: {data['accepted_count']}")
                print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
            else:
                results.add_fail("PM Import Bulk Action - Accept high confidence", f"Unexpected response: {data}")
        else:
            results.add_fail("PM Import Bulk Action - Accept high confidence", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("PM Import Bulk Action - Accept high confidence", str(e))
    
    # Test: Invalid action (should return 400)
    try:
        payload = {
            "action": "invalid_action"
        }
        
        response = requests.post(
            f"{BASE_URL}/pm-import/session/{session_id}/bulk-action",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 400:
            results.add_pass("PM Import Bulk Action - Invalid action returns 400")
        else:
            results.add_fail("PM Import Bulk Action - Invalid action", f"Expected 400, got {response.status_code}")
    except Exception as e:
        results.add_fail("PM Import Bulk Action - Invalid action", str(e))

def test_pm_import_to_library(token: str, session_id: str, results: TestResult):
    """Test PM Import to Library endpoint"""
    print(f"\n{Colors.BLUE}=== Testing PM Import to Library ==={Colors.END}")
    
    # Test: Import accepted tasks to library
    try:
        payload = {
            "include_low_confidence": True
        }
        
        response = requests.post(
            f"{BASE_URL}/pm-import/session/{session_id}/import",
            headers=get_headers(token),
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            required_fields = ["success", "total_imported", "linked_to_existing", "new_created", "skipped"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if not missing_fields:
                results.add_pass("PM Import to Library - Import accepted tasks")
                print(f"  Total imported: {data['total_imported']}")
                print(f"  Linked to existing: {data['linked_to_existing']}")
                print(f"  New created: {data['new_created']}")
                print(f"  Skipped: {data['skipped']}")
            else:
                results.add_fail("PM Import to Library - Import accepted tasks", f"Missing fields: {missing_fields}")
        else:
            results.add_fail("PM Import to Library - Import accepted tasks", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("PM Import to Library - Import accepted tasks", str(e))
    
    # Test: Verify session status changed to 'imported'
    try:
        response = requests.get(
            f"{BASE_URL}/pm-import/session/{session_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("status") == "imported":
                results.add_pass("PM Import to Library - Session status updated to 'imported'")
            else:
                results.add_fail("PM Import to Library - Session status", f"Expected 'imported', got {data.get('status')}")
        else:
            results.add_fail("PM Import to Library - Session status verification", f"Failed to get session: {response.status_code}")
    except Exception as e:
        results.add_fail("PM Import to Library - Session status verification", str(e))

def test_pm_import_list_sessions(token: str, results: TestResult):
    """Test PM Import List Sessions endpoint"""
    print(f"\n{Colors.BLUE}=== Testing PM Import List Sessions ==={Colors.END}")
    
    # Test: List sessions
    try:
        response = requests.get(
            f"{BASE_URL}/pm-import/sessions",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if "sessions" in data and "total" in data:
                results.add_pass("PM Import List Sessions - List sessions")
                print(f"  Total sessions: {data['total']}")
                print(f"  Sessions returned: {len(data['sessions'])}")
                
                if data['sessions']:
                    session = data['sessions'][0]
                    print(f"  Sample session: {session.get('file_name')} - Status: {session.get('status')}")
            else:
                results.add_fail("PM Import List Sessions - List sessions", f"Missing required fields: {list(data.keys())}")
        else:
            results.add_fail("PM Import List Sessions - List sessions", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("PM Import List Sessions - List sessions", str(e))

def main():
    """Main test execution"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}PM Intelligence Import API Testing{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    results = TestResult()
    
    # Login
    token = login()
    if not token:
        print(f"\n{Colors.RED}Failed to authenticate. Cannot proceed with tests.{Colors.END}")
        sys.exit(1)
    
    # Test PM Import Upload
    session_id = test_pm_import_upload(token, results)
    if not session_id:
        print(f"\n{Colors.RED}Failed to upload file. Cannot proceed with remaining tests.{Colors.END}")
        results.summary()
        sys.exit(1)
    
    # Wait a moment for processing to complete
    import time
    print(f"\n{Colors.YELLOW}Waiting 5 seconds for processing to complete...{Colors.END}")
    time.sleep(5)
    
    # Run remaining tests
    test_pm_import_get_session(token, session_id, results)
    test_pm_import_accept_reject_task(token, session_id, results)
    test_pm_import_bulk_action(token, session_id, results)
    test_pm_import_to_library(token, session_id, results)
    test_pm_import_list_sessions(token, results)
    
    # Print summary
    success = results.summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
