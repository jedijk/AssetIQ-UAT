#!/usr/bin/env python3
"""
Backend API Testing for PM Import Extraction Engine Enhancements
Tests the hierarchical document processing and equipment tag expansion.
"""

import requests
import time
import json
from typing import Dict, Any, List

# Backend URL from environment
BACKEND_URL = "https://asset-pm-extract.preview.emergentagent.com/api"

# Test credentials
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(message: str):
    print(f"\n{Colors.BLUE}[TEST]{Colors.END} {message}")

def print_success(message: str):
    print(f"{Colors.GREEN}✓ {message}{Colors.END}")

def print_error(message: str):
    print(f"{Colors.RED}✗ {message}{Colors.END}")

def print_warning(message: str):
    print(f"{Colors.YELLOW}⚠ {message}{Colors.END}")

def print_info(message: str):
    print(f"  {message}")

# Global session for auth
session = requests.Session()
auth_token = None

def login() -> str:
    """Login and get auth token."""
    print_test("Logging in...")
    
    response = session.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if response.status_code != 200:
        print_error(f"Login failed: {response.status_code}")
        print_error(response.text)
        raise Exception("Login failed")
    
    data = response.json()
    token = data.get("token") or data.get("access_token")
    
    if not token:
        print_error("No access token in response")
        print_error(f"Response: {json.dumps(data, indent=2)}")
        raise Exception("No access token")
    
    # Set auth header for all future requests
    session.headers.update({"Authorization": f"Bearer {token}"})
    
    print_success(f"Logged in as {TEST_EMAIL}")
    return token

def upload_pm_file(file_path: str) -> Dict[str, Any]:
    """Upload PM Import file and return session info."""
    print_test(f"Uploading PM file: {file_path}")
    
    with open(file_path, 'rb') as f:
        files = {'file': ('test_pm_import.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = session.post(
            f"{BACKEND_URL}/pm-import/upload",
            files=files
        )
    
    if response.status_code != 200:
        print_error(f"Upload failed: {response.status_code}")
        print_error(response.text)
        raise Exception("Upload failed")
    
    data = response.json()
    session_id = data.get("session_id")
    status = data.get("status")
    
    print_success(f"File uploaded successfully")
    print_info(f"Session ID: {session_id}")
    print_info(f"Status: {status}")
    
    return data

def get_session(session_id: str) -> Dict[str, Any]:
    """Get PM Import session details."""
    response = session.get(f"{BACKEND_URL}/pm-import/session/{session_id}")
    
    if response.status_code != 200:
        print_error(f"Get session failed: {response.status_code}")
        print_error(response.text)
        raise Exception("Get session failed")
    
    return response.json()

def wait_for_processing(session_id: str, max_wait: int = 120) -> Dict[str, Any]:
    """Wait for PM Import processing to complete."""
    print_test("Waiting for processing to complete...")
    
    start_time = time.time()
    while time.time() - start_time < max_wait:
        session_data = get_session(session_id)
        status = session_data.get("status")
        progress = session_data.get("progress", 0)
        progress_message = session_data.get("progress_message", "")
        
        print_info(f"Status: {status} | Progress: {progress}% | {progress_message}")
        
        if status == "ready_for_review":
            print_success("Processing completed successfully")
            return session_data
        elif status == "error":
            error_msg = session_data.get("error_message", "Unknown error")
            print_error(f"Processing failed: {error_msg}")
            raise Exception(f"Processing failed: {error_msg}")
        
        time.sleep(3)
    
    print_error(f"Processing timeout after {max_wait} seconds")
    raise Exception("Processing timeout")

def validate_extraction(session_data: Dict[str, Any]) -> bool:
    """Validate the PM Import extraction results."""
    print_test("Validating extraction results...")
    
    tasks = session_data.get("tasks_extracted", [])
    stats = session_data.get("stats", {})
    
    print_info(f"Total tasks extracted: {len(tasks)}")
    print_info(f"Stats: {json.dumps(stats, indent=2)}")
    
    # CRITICAL VALIDATION: Count equipment tags
    tags_found = []
    records_with_tags = 0
    records_without_tags = 0
    
    for task in tasks:
        tag = (
            task.get("equipment_tag") or 
            task.get("asset") or 
            task.get("_tag") or 
            ""
        ).strip()
        
        if tag:
            tags_found.append(tag)
            records_with_tags += 1
        else:
            records_without_tags += 1
    
    unique_tags = set(tags_found)
    total_records = len(tasks)
    
    print_info(f"\nExtraction Validation:")
    print_info(f"  Total records: {total_records}")
    print_info(f"  Records with tags: {records_with_tags}")
    print_info(f"  Records without tags: {records_without_tags}")
    print_info(f"  Unique tags: {len(unique_tags)}")
    print_info(f"  Tags found: {sorted(tags_found)}")
    
    # Expected tags from test file
    expected_tags = [
        "17XA001141", "17XA001142", "17XA001143", "17XA001144",  # Scenario 1: merged cell
        "P-101", "P-102",  # Scenario 2: tags followed by task on empty Column A
        "M-201",  # Scenario 3: regular one-tag-per-task
        "V-301",  # Scenario 3: regular one-tag-per-task
        "HX-401", "HX-402"  # Scenario 4: tags with task on second tag row
    ]
    
    print_info(f"\nExpected tags: {sorted(expected_tags)}")
    print_info(f"Expected records: {len(expected_tags)}")
    
    # CRITICAL VALIDATION 1: Each equipment tag must have its own record
    all_passed = True
    
    if total_records != len(expected_tags):
        print_error(f"CRITICAL: Expected {len(expected_tags)} records, got {total_records}")
        all_passed = False
    else:
        print_success(f"✓ Correct number of records: {total_records}")
    
    # CRITICAL VALIDATION 2: All expected tags must be present
    missing_tags = set(expected_tags) - set(t.upper() for t in tags_found)
    if missing_tags:
        print_error(f"CRITICAL: Missing tags: {missing_tags}")
        all_passed = False
    else:
        print_success(f"✓ All expected tags present")
    
    # CRITICAL VALIDATION 3: No records should have comma-separated tags
    for task in tasks:
        tag = task.get("equipment_tag") or task.get("asset") or task.get("_tag") or ""
        if "," in tag:
            print_error(f"CRITICAL: Found comma-separated tags in record: {tag}")
            all_passed = False
    
    if all_passed:
        print_success("✓ No comma-separated tags found")
    
    # CRITICAL VALIDATION 4: Verify specific scenarios
    print_info("\nScenario Validation:")
    
    # Scenario 1: 4 tags sharing merged task "Calibrate temperature sensor"
    calibrate_tasks = [t for t in tasks if "calibrate" in (t.get("task_description") or t.get("original_task") or "").lower()]
    calibrate_tags = [t.get("equipment_tag") or t.get("_tag") for t in calibrate_tasks]
    
    print_info(f"  Scenario 1 (Merged cell): Found {len(calibrate_tasks)} tasks with 'calibrate'")
    print_info(f"    Tags: {calibrate_tags}")
    
    if len(calibrate_tasks) == 4:
        print_success(f"  ✓ Scenario 1: 4 separate records for merged task")
    else:
        print_error(f"  ✗ Scenario 1: Expected 4 records, got {len(calibrate_tasks)}")
        all_passed = False
    
    # Scenario 2: P-101, P-102 with task on empty Column A row
    pump_tasks = [t for t in tasks if (t.get("equipment_tag") or t.get("_tag") or "").upper() in ["P-101", "P-102"]]
    print_info(f"  Scenario 2 (Empty Column A): Found {len(pump_tasks)} pump tasks")
    
    if len(pump_tasks) == 2:
        print_success(f"  ✓ Scenario 2: 2 separate records for tags followed by task")
    else:
        print_error(f"  ✗ Scenario 2: Expected 2 records, got {len(pump_tasks)}")
        all_passed = False
    
    # Print sample tasks for verification
    print_info("\nSample Task Records:")
    for i, task in enumerate(tasks[:3], 1):
        print_info(f"\n  Task {i}:")
        print_info(f"    Equipment Tag: {task.get('equipment_tag') or task.get('_tag')}")
        print_info(f"    Task Description: {(task.get('task_description') or task.get('original_task') or '')[:60]}")
        print_info(f"    Frequency: {task.get('frequency')}")
    
    return all_passed

def main():
    """Main test execution."""
    print("\n" + "="*80)
    print("PM IMPORT EXTRACTION ENGINE ENHANCEMENT TESTING")
    print("="*80)
    
    try:
        # Step 1: Login
        login()
        
        # Step 2: Upload test file
        upload_result = upload_pm_file("/app/test_pm_import.xlsx")
        session_id = upload_result["session_id"]
        
        # Step 3: Wait for processing
        session_data = wait_for_processing(session_id)
        
        # Step 4: Validate extraction
        validation_passed = validate_extraction(session_data)
        
        # Final summary
        print("\n" + "="*80)
        if validation_passed:
            print(f"{Colors.GREEN}✓ ALL TESTS PASSED{Colors.END}")
            print("="*80)
            print("\nKEY VALIDATIONS:")
            print("  ✓ Each equipment tag has its own task record")
            print("  ✓ No comma-separated tags in output")
            print("  ✓ Merged cell scenario: 4 tags → 4 records")
            print("  ✓ Empty Column A scenario: 2 tags → 2 records")
            print("  ✓ Hierarchical document processing working correctly")
        else:
            print(f"{Colors.RED}✗ SOME TESTS FAILED{Colors.END}")
            print("="*80)
            print("\nPlease review the errors above.")
        
        return validation_passed
        
    except Exception as e:
        print_error(f"Test execution failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
