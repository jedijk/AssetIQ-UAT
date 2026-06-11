#!/usr/bin/env python3
"""
Backend API Testing Script for Process Intelligence Import Feature
Tests the Process Import API endpoints for ISO 14224 hierarchy building
"""

import requests
import json
import sys
import io
import time
from typing import Optional, Dict, Any
from PIL import Image, ImageDraw, ImageFont

# Configuration
BASE_URL = "https://observation-cinema.preview.emergentagent.com/api"
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

def create_test_process_diagram() -> bytes:
    """Create a simple test process diagram image with equipment tags"""
    # Create a white image
    width, height = 1200, 800
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a default font
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except:
        font = ImageFont.load_default()
        small_font = ImageFont.load_default()
    
    # Draw title
    draw.text((400, 30), "Process Flow Diagram - Unit 1U-10", fill='black', font=font)
    
    # Draw equipment boxes with tags
    equipment = [
        {"tag": "1P-4003", "name": "Feed Pump", "x": 150, "y": 200},
        {"tag": "1R-2002", "name": "Main Reactor", "x": 450, "y": 200},
        {"tag": "1E-3001", "name": "Heat Exchanger", "x": 750, "y": 200},
        {"tag": "1T-5001", "name": "Storage Tank", "x": 150, "y": 450},
        {"tag": "1C-6001", "name": "Compressor", "x": 450, "y": 450},
        {"tag": "1F-7001", "name": "Filter Unit", "x": 750, "y": 450},
    ]
    
    for eq in equipment:
        # Draw box
        x, y = eq["x"], eq["y"]
        draw.rectangle([x, y, x+180, y+120], outline='black', width=2)
        
        # Draw tag
        draw.text((x+10, y+10), eq["tag"], fill='blue', font=font)
        
        # Draw name
        draw.text((x+10, y+50), eq["name"], fill='black', font=small_font)
    
    # Draw some connecting lines
    draw.line([(240, 260), (450, 260)], fill='black', width=2)
    draw.line([(630, 260), (750, 260)], fill='black', width=2)
    draw.line([(240, 510), (450, 510)], fill='black', width=2)
    draw.line([(630, 510), (750, 510)], fill='black', width=2)
    
    # Draw arrows
    draw.polygon([(440, 255), (450, 260), (440, 265)], fill='black')
    draw.polygon([(740, 255), (750, 260), (740, 265)], fill='black')
    
    # Add some labels
    draw.text((50, 150), "Section: Main Process", fill='green', font=small_font)
    draw.text((50, 400), "Section: Utilities", fill='green', font=small_font)
    
    # Save to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.getvalue()

def test_process_import_upload(token: str, results: TestResult) -> Optional[str]:
    """Test Process Import Upload endpoint"""
    print(f"\n{Colors.BLUE}=== Testing Process Import Upload ==={Colors.END}")
    
    # Create test process diagram
    diagram_content = create_test_process_diagram()
    
    # Test 1: Upload process diagram with options
    try:
        files = {
            'file': ('test_process_diagram.png', diagram_content, 'image/png')
        }
        headers = {"Authorization": f"Bearer {token}"}
        
        # Add query parameters for options
        params = {
            'generate_subunits': 'true',
            'estimate_criticality': 'true'
        }
        
        response = requests.post(
            f"{BASE_URL}/process-import/upload",
            headers=headers,
            files=files,
            params=params,
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if "session_id" in data and "status" in data:
                session_id = data["session_id"]
                results.add_pass("Process Import Upload - Image file upload")
                print(f"  Session ID: {session_id}")
                print(f"  Status: {data['status']}")
                print(f"  Message: {data.get('message', 'N/A')}")
                print(f"  Options: {data.get('options', {})}")
                return session_id
            else:
                results.add_fail("Process Import Upload - Image file upload", f"Missing required fields: {list(data.keys())}")
                return None
        else:
            results.add_fail("Process Import Upload - Image file upload", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("Process Import Upload - Image file upload", str(e))
        return None

def test_process_import_get_session(token: str, session_id: str, results: TestResult, max_wait: int = 120):
    """Test Process Import Get Session endpoint and wait for processing"""
    print(f"\n{Colors.BLUE}=== Testing Process Import Get Session ==={Colors.END}")
    
    # Poll session until processing is complete
    start_time = time.time()
    status = "processing"
    
    print(f"{Colors.YELLOW}Waiting for AI processing to complete...{Colors.END}")
    
    while status == "processing" and (time.time() - start_time) < max_wait:
        try:
            response = requests.get(
                f"{BASE_URL}/process-import/session/{session_id}",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                status = data.get("status", "unknown")
                progress = data.get("progress", 0)
                progress_msg = data.get("progress_message", "")
                
                print(f"  Progress: {progress}% - {progress_msg}")
                
                if status == "processing":
                    time.sleep(5)  # Wait 5 seconds before next poll
                elif status == "ready_for_review":
                    results.add_pass("Process Import Get Session - Processing completed")
                    
                    # Validate response structure
                    required_fields = ["session_id", "status", "hierarchy_items", "stats"]
                    missing_fields = [f for f in required_fields if f not in data]
                    
                    if not missing_fields:
                        results.add_pass("Process Import Get Session - Response structure valid")
                        print(f"  Status: {data['status']}")
                        print(f"  Hierarchy items: {len(data['hierarchy_items'])}")
                        print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
                        
                        # Validate hierarchy item structure
                        if data['hierarchy_items']:
                            item = data['hierarchy_items'][0]
                            item_fields = ["item_id", "tag", "name", "level", "equipment_type", 
                                          "confidence", "review_status", "criticality"]
                            missing_item_fields = [f for f in item_fields if f not in item]
                            
                            if not missing_item_fields:
                                results.add_pass("Process Import Get Session - Hierarchy item structure valid")
                                print(f"  Sample item: {item['tag']} - {item['name']}")
                                print(f"  Level: {item['level']}")
                                print(f"  Equipment type: {item['equipment_type']}")
                                print(f"  Confidence: {item['confidence']}")
                                print(f"  Criticality: {item.get('criticality', {})}")
                            else:
                                results.add_fail("Process Import Get Session - Hierarchy item structure", f"Missing item fields: {missing_item_fields}")
                    else:
                        results.add_fail("Process Import Get Session - Response structure", f"Missing fields: {missing_fields}")
                    
                    return data
                elif status == "error":
                    error_msg = data.get("error_message", "Unknown error")
                    results.add_fail("Process Import Get Session - Processing failed", f"Error: {error_msg}")
                    return None
            else:
                results.add_fail("Process Import Get Session - API call", f"Status {response.status_code}: {response.text}")
                return None
        except Exception as e:
            results.add_fail("Process Import Get Session - Exception", str(e))
            return None
    
    if status == "processing":
        results.add_fail("Process Import Get Session - Timeout", f"Processing did not complete within {max_wait} seconds")
        return None
    
    return None

def test_process_import_accept_reject_item(token: str, session_id: str, results: TestResult):
    """Test Process Import Accept/Reject Item endpoints"""
    print(f"\n{Colors.BLUE}=== Testing Process Import Accept/Reject Item ==={Colors.END}")
    
    # First, get the session to get item IDs
    try:
        response = requests.get(
            f"{BASE_URL}/process-import/session/{session_id}",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail("Process Import Accept/Reject - Setup", "Failed to get session")
            return
        
        data = response.json()
        items = data.get("hierarchy_items", [])
        
        if len(items) < 2:
            results.add_fail("Process Import Accept/Reject - Setup", "Not enough items to test")
            return
        
        item_id_1 = items[0]["item_id"]
        item_id_2 = items[1]["item_id"]
        
        # Test 1: Accept an item
        try:
            response = requests.post(
                f"{BASE_URL}/process-import/session/{session_id}/item/{item_id_1}/accept",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("success") and "stats" in data:
                    results.add_pass("Process Import Accept Item - Accept item")
                    print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
                else:
                    results.add_fail("Process Import Accept Item - Accept item", f"Unexpected response: {data}")
            else:
                results.add_fail("Process Import Accept Item - Accept item", f"Status {response.status_code}: {response.text}")
        except Exception as e:
            results.add_fail("Process Import Accept Item - Accept item", str(e))
        
        # Test 2: Reject an item
        try:
            response = requests.post(
                f"{BASE_URL}/process-import/session/{session_id}/item/{item_id_2}/reject",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("success") and "stats" in data:
                    results.add_pass("Process Import Reject Item - Reject item")
                    print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
                else:
                    results.add_fail("Process Import Reject Item - Reject item", f"Unexpected response: {data}")
            else:
                results.add_fail("Process Import Reject Item - Reject item", f"Status {response.status_code}: {response.text}")
        except Exception as e:
            results.add_fail("Process Import Reject Item - Reject item", str(e))
        
        # Test 3: Verify item status changed
        try:
            response = requests.get(
                f"{BASE_URL}/process-import/session/{session_id}",
                headers=get_headers(token),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("hierarchy_items", [])
                
                item_1 = next((i for i in items if i["item_id"] == item_id_1), None)
                item_2 = next((i for i in items if i["item_id"] == item_id_2), None)
                
                if item_1 and item_1.get("review_status") == "accepted":
                    results.add_pass("Process Import Accept Item - Status persisted")
                else:
                    results.add_fail("Process Import Accept Item - Status persistence", f"Expected 'accepted', got {item_1.get('review_status') if item_1 else 'item not found'}")
                
                if item_2 and item_2.get("review_status") == "rejected":
                    results.add_pass("Process Import Reject Item - Status persisted")
                else:
                    results.add_fail("Process Import Reject Item - Status persistence", f"Expected 'rejected', got {item_2.get('review_status') if item_2 else 'item not found'}")
            else:
                results.add_fail("Process Import Accept/Reject - Status verification", f"Failed to get session: {response.status_code}")
        except Exception as e:
            results.add_fail("Process Import Accept/Reject - Status verification", str(e))
        
    except Exception as e:
        results.add_fail("Process Import Accept/Reject - Setup", str(e))

def test_process_import_accept_all(token: str, session_id: str, results: TestResult):
    """Test Process Import Accept All endpoint"""
    print(f"\n{Colors.BLUE}=== Testing Process Import Accept All ==={Colors.END}")
    
    # Test: Accept all items with confidence >= 70
    try:
        params = {
            'min_confidence': 70
        }
        
        response = requests.post(
            f"{BASE_URL}/process-import/session/{session_id}/accept-all",
            headers=get_headers(token),
            params=params,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and "accepted_count" in data and "stats" in data:
                results.add_pass("Process Import Accept All - Accept high confidence items")
                print(f"  Accepted count: {data['accepted_count']}")
                print(f"  Stats: {json.dumps(data['stats'], indent=2)}")
            else:
                results.add_fail("Process Import Accept All - Accept high confidence items", f"Unexpected response: {data}")
        else:
            results.add_fail("Process Import Accept All - Accept high confidence items", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Process Import Accept All - Accept high confidence items", str(e))

def test_process_import_export_csv(token: str, session_id: str, results: TestResult):
    """Test Process Import Export CSV endpoint"""
    print(f"\n{Colors.BLUE}=== Testing Process Import Export CSV ==={Colors.END}")
    
    # Test: Export hierarchy as CSV
    try:
        response = requests.get(
            f"{BASE_URL}/process-import/session/{session_id}/export",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            # Check if response is CSV
            content_type = response.headers.get('Content-Type', '')
            
            if 'text/csv' in content_type or 'csv' in content_type:
                results.add_pass("Process Import Export CSV - CSV export successful")
                
                # Validate CSV content
                csv_content = response.text
                lines = csv_content.strip().split('\n')
                
                if len(lines) > 1:  # At least header + 1 data row
                    results.add_pass("Process Import Export CSV - CSV has data")
                    print(f"  CSV rows: {len(lines)}")
                    print(f"  Header: {lines[0]}")
                    
                    # Check for expected columns
                    expected_cols = ["ID or Tag", "Name", "Level", "Equipment Type", "Safety", "Production", "Environmental", "Reputation"]
                    header = lines[0]
                    missing_cols = [col for col in expected_cols if col not in header]
                    
                    if not missing_cols:
                        results.add_pass("Process Import Export CSV - CSV has correct columns")
                    else:
                        results.add_fail("Process Import Export CSV - CSV columns", f"Missing columns: {missing_cols}")
                else:
                    results.add_fail("Process Import Export CSV - CSV data", "CSV has no data rows")
            else:
                results.add_fail("Process Import Export CSV - Content type", f"Expected CSV, got {content_type}")
        else:
            results.add_fail("Process Import Export CSV - CSV export", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Process Import Export CSV - CSV export", str(e))

def test_process_import_list_sessions(token: str, results: TestResult):
    """Test Process Import List Sessions endpoint"""
    print(f"\n{Colors.BLUE}=== Testing Process Import List Sessions ==={Colors.END}")
    
    # Test: List sessions
    try:
        response = requests.get(
            f"{BASE_URL}/process-import/sessions",
            headers=get_headers(token),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if "sessions" in data and "total" in data:
                results.add_pass("Process Import List Sessions - List sessions")
                print(f"  Total sessions: {data['total']}")
                print(f"  Sessions returned: {len(data['sessions'])}")
                
                if data['sessions']:
                    session = data['sessions'][0]
                    print(f"  Sample session: {session.get('file_name')} - Status: {session.get('status')}")
            else:
                results.add_fail("Process Import List Sessions - List sessions", f"Missing required fields: {list(data.keys())}")
        else:
            results.add_fail("Process Import List Sessions - List sessions", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.add_fail("Process Import List Sessions - List sessions", str(e))

def main():
    """Main test execution"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}Process Intelligence Import API Testing{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    results = TestResult()
    
    # Login
    token = login()
    if not token:
        print(f"\n{Colors.RED}Failed to authenticate. Cannot proceed with tests.{Colors.END}")
        sys.exit(1)
    
    # Test Process Import Upload
    session_id = test_process_import_upload(token, results)
    if not session_id:
        print(f"\n{Colors.RED}Failed to upload file. Cannot proceed with remaining tests.{Colors.END}")
        results.summary()
        sys.exit(1)
    
    # Test Get Session (with polling for completion)
    session_data = test_process_import_get_session(token, session_id, results)
    if not session_data:
        print(f"\n{Colors.RED}Failed to get session or processing failed. Cannot proceed with remaining tests.{Colors.END}")
        results.summary()
        sys.exit(1)
    
    # Run remaining tests
    test_process_import_accept_reject_item(token, session_id, results)
    test_process_import_accept_all(token, session_id, results)
    test_process_import_export_csv(token, session_id, results)
    test_process_import_list_sessions(token, results)
    
    # Print summary
    success = results.summary()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
