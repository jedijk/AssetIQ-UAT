#!/usr/bin/env python3
"""
Backend API Testing Script for Maintenance Strategy v2 Feature
Tests the Maintenance Strategy v2 API endpoints
"""

import requests
import json
import sys
import time
from typing import Optional, Dict, Any

# Configuration
BASE_URL = "https://obs-equip-compact.preview.emergentagent.com/api"
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

# ============= Test Functions =============

def test_list_strategies(token: str, results: TestResult):
    """Test 1: List Strategies - GET /api/maintenance-strategies-v2"""
    print(f"\n{Colors.BLUE}=== Test 1: List Strategies ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "strategies" in data and isinstance(data["strategies"], list):
                print(f"  Found {len(data['strategies'])} strategies")
                results.add_pass("List Strategies")
                return True
            else:
                results.add_fail("List Strategies", "Response missing 'strategies' array")
                return False
        else:
            results.add_fail("List Strategies", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("List Strategies", str(e))
        return False

def test_get_nonexistent_strategy(token: str, results: TestResult):
    """Test 2: Get Strategy (non-existent) - GET /api/maintenance-strategies-v2/pump_centrifugal"""
    print(f"\n{Colors.BLUE}=== Test 2: Get Non-Existent Strategy ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("exists") == False:
                print(f"  Correctly returned exists=false for non-existent strategy")
                results.add_pass("Get Non-Existent Strategy")
                return True
            else:
                results.add_fail("Get Non-Existent Strategy", f"Expected exists=false, got: {data}")
                return False
        else:
            results.add_fail("Get Non-Existent Strategy", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Get Non-Existent Strategy", str(e))
        return False

def test_create_strategy(token: str, results: TestResult) -> bool:
    """Test 3: Create Strategy - POST /api/maintenance-strategies-v2"""
    print(f"\n{Colors.BLUE}=== Test 3: Create Strategy with Auto-Generation ==={Colors.END}")
    try:
        payload = {
            "equipment_type_id": "pump_centrifugal",
            "equipment_type_name": "Centrifugal Pump",
            "auto_generate": True
        }
        
        response = requests.post(
            f"{BASE_URL}/maintenance-strategies-v2",
            headers=get_headers(token),
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify response structure
            required_fields = ["id", "equipment_type_id", "equipment_type_name", 
                             "failure_mode_strategies", "task_templates"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                results.add_fail("Create Strategy", f"Missing fields: {missing_fields}")
                return False
            
            # Verify auto-generation worked
            if len(data.get("failure_mode_strategies", [])) == 0:
                results.add_fail("Create Strategy", "No failure mode strategies generated")
                return False
            
            if len(data.get("task_templates", [])) == 0:
                results.add_fail("Create Strategy", "No task templates generated")
                return False
            
            print(f"  Strategy created with:")
            print(f"    - {len(data['failure_mode_strategies'])} failure mode strategies")
            print(f"    - {len(data['task_templates'])} task templates")
            print(f"    - Coverage score: {data.get('coverage_score', 0)}%")
            
            results.add_pass("Create Strategy")
            return True
        elif response.status_code == 400 and "already exists" in response.text:
            print(f"  {Colors.YELLOW}Strategy already exists, continuing...{Colors.END}")
            results.add_pass("Create Strategy (already exists)")
            return True
        else:
            results.add_fail("Create Strategy", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Create Strategy", str(e))
        return False

def test_get_existing_strategy(token: str, results: TestResult) -> Optional[Dict]:
    """Test 4: Get Strategy (existing) - GET /api/maintenance-strategies-v2/pump_centrifugal"""
    print(f"\n{Colors.BLUE}=== Test 4: Get Existing Strategy ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("exists") == True and data.get("strategy"):
                strategy = data["strategy"]
                print(f"  Strategy found:")
                print(f"    - Equipment Type: {strategy.get('equipment_type_name')}")
                print(f"    - Version: {strategy.get('version')}")
                print(f"    - Total Failure Modes: {strategy.get('total_failure_modes')}")
                print(f"    - Total Tasks: {strategy.get('total_tasks')}")
                results.add_pass("Get Existing Strategy")
                return strategy
            else:
                results.add_fail("Get Existing Strategy", f"Expected exists=true with strategy, got: {data}")
                return None
        else:
            results.add_fail("Get Existing Strategy", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("Get Existing Strategy", str(e))
        return None

def test_get_version_history(token: str, results: TestResult):
    """Test 5: Get Version History - GET /api/maintenance-strategies-v2/pump_centrifugal/version-history"""
    print(f"\n{Colors.BLUE}=== Test 5: Get Version History ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal/version-history",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "current_version" in data and "version_history" in data:
                print(f"  Current version: {data['current_version']}")
                print(f"  Version history entries: {len(data['version_history'])}")
                results.add_pass("Get Version History")
                return True
            else:
                results.add_fail("Get Version History", "Missing current_version or version_history")
                return False
        else:
            results.add_fail("Get Version History", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Get Version History", str(e))
        return False

def test_get_task_templates(token: str, results: TestResult) -> Optional[list]:
    """Test 6: Get Task Templates - GET /api/maintenance-strategies-v2/pump_centrifugal/tasks"""
    print(f"\n{Colors.BLUE}=== Test 6: Get Task Templates ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal/tasks",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "task_templates" in data and isinstance(data["task_templates"], list):
                print(f"  Found {len(data['task_templates'])} task templates")
                if len(data['task_templates']) > 0:
                    sample = data['task_templates'][0]
                    print(f"  Sample task: {sample.get('name')}")
                results.add_pass("Get Task Templates")
                return data["task_templates"]
            else:
                results.add_fail("Get Task Templates", "Missing task_templates array")
                return None
        else:
            results.add_fail("Get Task Templates", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("Get Task Templates", str(e))
        return None

def test_add_task_template(token: str, results: TestResult):
    """Test 7: Add Task Template - POST /api/maintenance-strategies-v2/pump_centrifugal/tasks"""
    print(f"\n{Colors.BLUE}=== Test 7: Add Task Template ==={Colors.END}")
    try:
        payload = {
            "name": "Test Inspection Task",
            "task_type": "preventive",
            "duration_hours": 2,
            "frequency_matrix": {
                "low": "quarterly",
                "medium": "monthly",
                "high": "weekly"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal/tasks",
            headers=get_headers(token),
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and data.get("name") == "Test Inspection Task":
                print(f"  Task template created:")
                print(f"    - ID: {data['id']}")
                print(f"    - Name: {data['name']}")
                print(f"    - Type: {data.get('task_type')}")
                print(f"    - Duration: {data.get('duration_hours')} hours")
                results.add_pass("Add Task Template")
                return data["id"]
            else:
                results.add_fail("Add Task Template", f"Unexpected response: {data}")
                return None
        else:
            results.add_fail("Add Task Template", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("Add Task Template", str(e))
        return None

def test_get_failure_mode_strategies(token: str, results: TestResult):
    """Test 8: Get Failure Mode Strategies - GET /api/maintenance-strategies-v2/pump_centrifugal/failure-modes"""
    print(f"\n{Colors.BLUE}=== Test 8: Get Failure Mode Strategies ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal/failure-modes",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "failure_mode_strategies" in data and isinstance(data["failure_mode_strategies"], list):
                print(f"  Found {len(data['failure_mode_strategies'])} failure mode strategies")
                if len(data['failure_mode_strategies']) > 0:
                    sample = data['failure_mode_strategies'][0]
                    print(f"  Sample FM: {sample.get('failure_mode_name')}")
                    print(f"    - Strategy Type: {sample.get('strategy_type')}")
                    print(f"    - Detection Methods: {sample.get('detection_methods')}")
                results.add_pass("Get Failure Mode Strategies")
                return True
            else:
                results.add_fail("Get Failure Mode Strategies", "Missing failure_mode_strategies array")
                return False
        else:
            results.add_fail("Get Failure Mode Strategies", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Get Failure Mode Strategies", str(e))
        return False

def test_generate_tasks_for_equipment(token: str, results: TestResult) -> bool:
    """Test 9: Generate Tasks for Equipment - POST /api/maintenance-strategies-v2/pump_centrifugal/generate-tasks"""
    print(f"\n{Colors.BLUE}=== Test 9: Generate Tasks for Equipment ==={Colors.END}")
    try:
        payload = {
            "equipment_id": "test-pump-001",
            "equipment_name": "Test Pump #1",
            "criticality": "high"
        }
        
        response = requests.post(
            f"{BASE_URL}/maintenance-strategies-v2/pump_centrifugal/generate-tasks",
            headers=get_headers(token),
            json=payload,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify response structure
            if "generated_tasks" not in data:
                results.add_fail("Generate Tasks", "Missing generated_tasks in response")
                return False
            
            print(f"  Tasks generated for equipment:")
            print(f"    - Equipment ID: {data.get('equipment_id')}")
            print(f"    - Criticality: {data.get('criticality')}")
            print(f"    - Total Tasks: {data.get('total_tasks')}")
            print(f"    - Strategy Version: {data.get('strategy_version')}")
            
            # Verify criticality-based frequency
            if len(data['generated_tasks']) > 0:
                sample_task = data['generated_tasks'][0]
                print(f"  Sample generated task:")
                print(f"    - Name: {sample_task.get('name')}")
                print(f"    - Frequency: {sample_task.get('frequency')}")
                print(f"    - Asset Criticality: {sample_task.get('asset_criticality')}")
            
            results.add_pass("Generate Tasks for Equipment")
            return True
        else:
            results.add_fail("Generate Tasks", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Generate Tasks", str(e))
        return False

def test_get_equipment_strategy_instance(token: str, results: TestResult):
    """Test 10: Get Equipment Strategy Instance - GET /api/maintenance-strategies-v2/equipment/test-pump-001"""
    print(f"\n{Colors.BLUE}=== Test 10: Get Equipment Strategy Instance ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/equipment/test-pump-001",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("exists") == True and data.get("instance"):
                instance = data["instance"]
                print(f"  Equipment strategy instance found:")
                print(f"    - Equipment ID: {instance.get('equipment_id')}")
                print(f"    - Equipment Name: {instance.get('equipment_name')}")
                print(f"    - Criticality: {instance.get('criticality')}")
                print(f"    - Generated Tasks: {len(instance.get('generated_tasks', []))}")
                print(f"    - Sync Status: {instance.get('sync_status')}")
                results.add_pass("Get Equipment Strategy Instance")
                return True
            else:
                results.add_fail("Get Equipment Strategy Instance", f"Expected exists=true with instance, got: {data}")
                return False
        else:
            results.add_fail("Get Equipment Strategy Instance", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Get Equipment Strategy Instance", str(e))
        return False

def test_get_sync_status(token: str, results: TestResult):
    """Test 11: Get Sync Status - GET /api/maintenance-strategies-v2/equipment/test-pump-001/sync-status"""
    print(f"\n{Colors.BLUE}=== Test 11: Get Sync Status ==={Colors.END}")
    try:
        response = requests.get(
            f"{BASE_URL}/maintenance-strategies-v2/equipment/test-pump-001/sync-status",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "sync_status" in data:
                print(f"  Sync status:")
                print(f"    - Status: {data.get('sync_status')}")
                if "current_version" in data:
                    print(f"    - Current Version: {data.get('current_version')}")
                    print(f"    - Latest Version: {data.get('latest_version')}")
                    print(f"    - Up to Date: {data.get('is_up_to_date')}")
                results.add_pass("Get Sync Status")
                return True
            else:
                results.add_fail("Get Sync Status", "Missing sync_status in response")
                return False
        else:
            results.add_fail("Get Sync Status", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("Get Sync Status", str(e))
        return False

# ============= Main Test Runner =============

def main():
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"Maintenance Strategy v2 API Test Suite")
    print(f"{'='*60}{Colors.END}\n")
    
    results = TestResult()
    
    # Login
    token = login()
    if not token:
        print(f"\n{Colors.RED}Failed to authenticate. Cannot proceed with tests.{Colors.END}")
        sys.exit(1)
    
    # Run tests in sequence
    print(f"\n{Colors.YELLOW}Starting Maintenance Strategy v2 API tests...{Colors.END}")
    
    # Test 1: List strategies
    test_list_strategies(token, results)
    
    # Test 2: Get non-existent strategy
    test_get_nonexistent_strategy(token, results)
    
    # Test 3: Create strategy with auto-generation
    if not test_create_strategy(token, results):
        print(f"\n{Colors.YELLOW}Warning: Strategy creation failed, but continuing with tests...{Colors.END}")
    
    # Test 4: Get existing strategy
    strategy = test_get_existing_strategy(token, results)
    
    # Test 5: Get version history
    test_get_version_history(token, results)
    
    # Test 6: Get task templates
    test_get_task_templates(token, results)
    
    # Test 7: Add task template
    test_add_task_template(token, results)
    
    # Test 8: Get failure mode strategies
    test_get_failure_mode_strategies(token, results)
    
    # Test 9: Generate tasks for equipment
    test_generate_tasks_for_equipment(token, results)
    
    # Test 10: Get equipment strategy instance
    test_get_equipment_strategy_instance(token, results)
    
    # Test 11: Get sync status
    test_get_sync_status(token, results)
    
    # Print summary
    success = results.summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
