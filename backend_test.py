"""
Reliability Intelligence Layer (RIL) Backend API Tests
Tests all RIL endpoints as per the functional specification.
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://task-scheduler-fix.preview.emergentagent.com/api"
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Global variables
auth_token = None
equipment_id = None
observation_id = None
reading_id = None
alert_id = None
correlation_id = None
case_id = None
prediction_id = None


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


def get_equipment_id() -> Optional[str]:
    """Get an equipment ID for testing"""
    print_test("Get Equipment ID")
    
    response = requests.get(
        f"{BASE_URL}/equipment-hierarchy/nodes",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        nodes = data.get("nodes", [])
        
        # Find an equipment node (not installation level)
        for node in nodes:
            if node.get("level") in ["equipment_unit", "equipment", "subunit", "maintainable_item"]:
                eq_id = node.get("id")
                eq_name = node.get("name", "Unknown")
                print_result(True, f"Found equipment: {eq_name} (ID: {eq_id})")
                return eq_id
        
        # If no specific equipment found, use first node
        if nodes:
            eq_id = nodes[0].get("id")
            eq_name = nodes[0].get("name", "Unknown")
            print_result(True, f"Using first node: {eq_name} (ID: {eq_id})")
            return eq_id
        
        print_result(False, "No equipment nodes found")
        return None
    else:
        print_result(False, f"Failed to get equipment: {response.status_code}", response.json())
        return None


# ============= OBSERVATIONS API TESTS =============

def test_create_observation():
    """Test POST /api/ril/observations"""
    global observation_id
    print_test("Create Observation")
    
    payload = {
        "source": "manual",
        "source_system": "AssetIQ",
        "equipment_id": equipment_id,
        "title": "Unusual vibration detected on bearing",
        "description": "Operator reported increased vibration levels during rounds",
        "severity": "high",
        "confidence": 0.85,
        "readings": {
            "vibration_level": "7.2 mm/s",
            "temperature": "65°C"
        },
        "tags": ["vibration", "bearing", "operator_rounds"]
    }
    
    response = requests.post(
        f"{BASE_URL}/ril/observations",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("observation"):
            obs = data["observation"]
            observation_id = obs.get("id")
            risk_score = obs.get("risk_score", 0)
            print_result(True, f"Observation created. ID: {observation_id}, Risk Score: {risk_score}")
            
            # Verify risk_score is calculated
            if risk_score > 0:
                print_result(True, "Risk score calculated correctly")
            else:
                print_result(False, "Risk score not calculated")
        else:
            print_result(False, "Response missing observation data", data)
    else:
        print_result(False, f"Failed to create observation: {response.status_code}", response.json())


def test_list_observations():
    """Test GET /api/ril/observations"""
    print_test("List Observations")
    
    response = requests.get(
        f"{BASE_URL}/ril/observations",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        observations = data.get("observations", [])
        total = data.get("total", 0)
        print_result(True, f"Retrieved {len(observations)} observations (Total: {total})")
        
        # Verify our created observation is in the list
        if observation_id:
            found = any(obs.get("id") == observation_id for obs in observations)
            if found:
                print_result(True, "Created observation found in list")
            else:
                print_result(False, "Created observation not found in list")
    else:
        print_result(False, f"Failed to list observations: {response.status_code}", response.json())


def test_list_observations_with_filters():
    """Test GET /api/ril/observations with filters"""
    print_test("List Observations with Filters")
    
    response = requests.get(
        f"{BASE_URL}/ril/observations",
        headers=get_headers(),
        params={
            "equipment_id": equipment_id,
            "severity": "high",
            "limit": 10
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        observations = data.get("observations", [])
        print_result(True, f"Retrieved {len(observations)} high severity observations for equipment")
    else:
        print_result(False, f"Failed to list filtered observations: {response.status_code}", response.json())


# ============= READINGS API TESTS =============

def test_ingest_single_reading():
    """Test POST /api/ril/readings"""
    global reading_id
    print_test("Ingest Single Reading")
    
    payload = {
        "source": "historian_alert",
        "source_system": "PI Historian",
        "source_tag": "VIB-101.PV",
        "equipment_id": equipment_id,
        "value": 8.5,
        "unit": "mm/s",
        "quality": "Good",
        "timestamp": datetime.utcnow().isoformat(),
        "high_limit": 7.0,
        "high_high_limit": 10.0,
        "is_alarm": True,
        "alarm_type": "High"
    }
    
    response = requests.post(
        f"{BASE_URL}/ril/readings",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("reading"):
            reading = data["reading"]
            reading_id = reading.get("id")
            alert_created = data.get("alert_created", False)
            print_result(True, f"Reading ingested. ID: {reading_id}, Alert Created: {alert_created}")
        else:
            print_result(False, "Response missing reading data", data)
    else:
        print_result(False, f"Failed to ingest reading: {response.status_code}", response.json())


def test_ingest_bulk_readings():
    """Test POST /api/ril/readings/bulk"""
    print_test("Ingest Bulk Readings")
    
    now = datetime.utcnow()
    readings = []
    
    for i in range(5):
        readings.append({
            "source": "historian_alert",
            "source_system": "PI Historian",
            "source_tag": f"TEMP-{100+i}.PV",
            "equipment_id": equipment_id,
            "value": 60.0 + i * 2,
            "unit": "°C",
            "quality": "Good",
            "timestamp": (now - timedelta(minutes=i*5)).isoformat(),
            "high_limit": 70.0,
            "is_alarm": False
        })
    
    payload = {"readings": readings}
    
    response = requests.post(
        f"{BASE_URL}/ril/readings/bulk",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            ingested = data.get("ingested_count", 0)
            alerts = data.get("alerts_created", 0)
            print_result(True, f"Bulk ingest successful. Ingested: {ingested}, Alerts: {alerts}")
        else:
            print_result(False, "Bulk ingest failed", data)
    else:
        print_result(False, f"Failed to ingest bulk readings: {response.status_code}", response.json())


def test_list_readings():
    """Test GET /api/ril/readings"""
    print_test("List Readings")
    
    response = requests.get(
        f"{BASE_URL}/ril/readings",
        headers=get_headers(),
        params={"limit": 20}
    )
    
    if response.status_code == 200:
        data = response.json()
        readings = data.get("readings", [])
        total = data.get("total", 0)
        print_result(True, f"Retrieved {len(readings)} readings (Total: {total})")
    else:
        print_result(False, f"Failed to list readings: {response.status_code}", response.json())


# ============= ALERTS API TESTS =============

def test_create_alert():
    """Test POST /api/ril/alerts"""
    global alert_id
    print_test("Create Alert with Auto-Triage")
    
    payload = {
        "source": "vibration_system",
        "source_system": "Emerson AMS",
        "source_alert_id": "AMS-12345",
        "equipment_id": equipment_id,
        "title": "High vibration alarm on motor bearing",
        "description": "Vibration exceeded high threshold",
        "alert_type": "vibration_high",
        "alert_time": datetime.utcnow().isoformat(),
        "reading_value": 9.2,
        "reading_unit": "mm/s",
        "threshold_value": 7.0
    }
    
    response = requests.post(
        f"{BASE_URL}/ril/alerts",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("alert"):
            alert = data["alert"]
            alert_id = alert.get("id")
            triage = data.get("triage")
            
            print_result(True, f"Alert created. ID: {alert_id}")
            
            # Verify triage result
            if triage:
                priority = triage.get("priority")
                suggested_actions = triage.get("suggested_actions", [])
                print_result(True, f"Auto-triage completed. Priority: {priority}, Actions: {len(suggested_actions)}")
                
                # Verify priority is P1-P4
                if priority in ["P1", "P2", "P3", "P4"]:
                    print_result(True, f"Priority correctly assigned: {priority}")
                else:
                    print_result(False, f"Invalid priority: {priority}")
            else:
                print_result(False, "Triage result missing")
        else:
            print_result(False, "Response missing alert data", data)
    else:
        print_result(False, f"Failed to create alert: {response.status_code}", response.json())


def test_list_alerts():
    """Test GET /api/ril/alerts"""
    print_test("List Alerts")
    
    response = requests.get(
        f"{BASE_URL}/ril/alerts",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        alerts = data.get("alerts", [])
        total = data.get("total", 0)
        print_result(True, f"Retrieved {len(alerts)} alerts (Total: {total})")
        
        # Verify triage info is present
        if alerts:
            first_alert = alerts[0]
            has_triage = first_alert.get("triage_result") is not None
            if has_triage:
                print_result(True, "Alerts include triage information")
            else:
                print_result(False, "Alerts missing triage information")
    else:
        print_result(False, f"Failed to list alerts: {response.status_code}", response.json())


def test_update_alert():
    """Test PATCH /api/ril/alerts/{id}"""
    print_test("Update Alert Status")
    
    if not alert_id:
        print_result(False, "No alert ID available for update test")
        return
    
    response = requests.patch(
        f"{BASE_URL}/ril/alerts/{alert_id}",
        headers=get_headers(),
        params={"status": "acknowledged"}
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            updated_alert = data.get("alert", {})
            status = updated_alert.get("status")
            print_result(True, f"Alert updated. New status: {status}")
        else:
            print_result(False, "Update failed", data)
    else:
        print_result(False, f"Failed to update alert: {response.status_code}", response.json())


# ============= CORRELATIONS API TESTS =============

def test_find_correlations():
    """Test POST /api/ril/correlations/find"""
    global correlation_id
    print_test("Find Correlations")
    
    response = requests.post(
        f"{BASE_URL}/ril/correlations/find",
        headers=get_headers(),
        params={
            "equipment_id": equipment_id,
            "time_window_hours": 24
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            correlations = data.get("correlations", [])
            count = data.get("count", 0)
            print_result(True, f"Found {count} correlations")
            
            if correlations:
                correlation_id = correlations[0].get("id")
                print_result(True, f"First correlation ID: {correlation_id}")
        else:
            print_result(False, "Correlation search failed", data)
    else:
        print_result(False, f"Failed to find correlations: {response.status_code}", response.json())


def test_list_correlations():
    """Test GET /api/ril/correlations"""
    print_test("List Correlations")
    
    response = requests.get(
        f"{BASE_URL}/ril/correlations",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        correlations = data.get("correlations", [])
        total = data.get("total", 0)
        print_result(True, f"Retrieved {len(correlations)} correlations (Total: {total})")
    else:
        print_result(False, f"Failed to list correlations: {response.status_code}", response.json())


# ============= RELIABILITY CASES API TESTS =============

def test_create_case():
    """Test POST /api/ril/cases"""
    global case_id
    print_test("Create Reliability Case")
    
    payload = {
        "equipment_id": equipment_id,
        "title": "Bearing degradation investigation",
        "description": "Multiple indicators of bearing wear detected",
        "priority": "P2",
        "observation_ids": [observation_id] if observation_id else [],
        "alert_ids": [alert_id] if alert_id else [],
        "tags": ["bearing", "vibration", "investigation"]
    }
    
    response = requests.post(
        f"{BASE_URL}/ril/cases",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("case"):
            case = data["case"]
            case_id = case.get("id")
            case_number = case.get("case_number")
            risk_assessment = case.get("risk_assessment")
            
            print_result(True, f"Case created. ID: {case_id}, Number: {case_number}")
            
            # Verify case number format (RC-YYYY-NNNN)
            if case_number and case_number.startswith("RC-"):
                print_result(True, f"Case number format correct: {case_number}")
            else:
                print_result(False, f"Invalid case number format: {case_number}")
            
            # Verify risk assessment
            if risk_assessment:
                print_result(True, "Risk assessment calculated")
            else:
                print_result(False, "Risk assessment missing")
        else:
            print_result(False, "Response missing case data", data)
    else:
        print_result(False, f"Failed to create case: {response.status_code}", response.json())


def test_list_cases():
    """Test GET /api/ril/cases"""
    print_test("List Reliability Cases")
    
    response = requests.get(
        f"{BASE_URL}/ril/cases",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        cases = data.get("cases", [])
        total = data.get("total", 0)
        print_result(True, f"Retrieved {len(cases)} cases (Total: {total})")
    else:
        print_result(False, f"Failed to list cases: {response.status_code}", response.json())


def test_get_case():
    """Test GET /api/ril/cases/{id}"""
    print_test("Get Single Case with Linked Data")
    
    if not case_id:
        print_result(False, "No case ID available for get test")
        return
    
    response = requests.get(
        f"{BASE_URL}/ril/cases/{case_id}",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        case = data.get("case")
        observations = data.get("observations", [])
        alerts = data.get("alerts", [])
        equipment = data.get("equipment")
        
        print_result(True, f"Case retrieved. Observations: {len(observations)}, Alerts: {len(alerts)}")
        
        # Verify linked data
        if observations or alerts:
            print_result(True, "Linked data retrieved successfully")
        else:
            print_result(False, "No linked data found")
    else:
        print_result(False, f"Failed to get case: {response.status_code}", response.json())


def test_update_case():
    """Test PATCH /api/ril/cases/{id}"""
    print_test("Update Reliability Case")
    
    if not case_id:
        print_result(False, "No case ID available for update test")
        return
    
    payload = {
        "status": "in_progress",
        "priority": "P1",
        "resolution_summary": "Bearing replacement scheduled"
    }
    
    response = requests.patch(
        f"{BASE_URL}/ril/cases/{case_id}",
        headers=get_headers(),
        json=payload
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            updated_case = data.get("case", {})
            status = updated_case.get("status")
            priority = updated_case.get("priority")
            print_result(True, f"Case updated. Status: {status}, Priority: {priority}")
        else:
            print_result(False, "Update failed", data)
    else:
        print_result(False, f"Failed to update case: {response.status_code}", response.json())


# ============= PREDICTIONS API TESTS =============

def test_generate_prediction():
    """Test POST /api/ril/predictions/generate/{equipment_id}"""
    global prediction_id
    print_test("Generate Prediction for Equipment")
    
    response = requests.post(
        f"{BASE_URL}/ril/predictions/generate/{equipment_id}",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("prediction"):
            prediction = data["prediction"]
            prediction_id = prediction.get("id")
            health_score = prediction.get("overall_health_score", 0)
            predictions = prediction.get("predictions", [])
            
            print_result(True, f"Prediction generated. ID: {prediction_id}, Health Score: {health_score}")
            print_result(True, f"Failure mode predictions: {len(predictions)}")
        else:
            print_result(False, "Response missing prediction data", data)
    else:
        print_result(False, f"Failed to generate prediction: {response.status_code}", response.json())


def test_list_predictions():
    """Test GET /api/ril/predictions"""
    print_test("List Predictions")
    
    response = requests.get(
        f"{BASE_URL}/ril/predictions",
        headers=get_headers(),
        params={"limit": 10}
    )
    
    if response.status_code == 200:
        data = response.json()
        predictions = data.get("predictions", [])
        total = data.get("total", 0)
        print_result(True, f"Retrieved {len(predictions)} predictions (Total: {total})")
    else:
        print_result(False, f"Failed to list predictions: {response.status_code}", response.json())


def test_get_at_risk_equipment():
    """Test GET /api/ril/predictions/at-risk"""
    print_test("Get Equipment At Risk")
    
    response = requests.get(
        f"{BASE_URL}/ril/predictions/at-risk",
        headers=get_headers(),
        params={"health_threshold": 70, "limit": 20}
    )
    
    if response.status_code == 200:
        data = response.json()
        at_risk = data.get("at_risk", [])
        count = data.get("count", 0)
        print_result(True, f"Found {count} equipment at risk")
    else:
        print_result(False, f"Failed to get at-risk equipment: {response.status_code}", response.json())


# ============= DASHBOARD API TESTS =============

def test_dashboard_stats():
    """Test GET /api/ril/dashboard/stats"""
    print_test("Get Dashboard Stats")
    
    response = requests.get(
        f"{BASE_URL}/ril/dashboard/stats",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            stats = data.get("stats", {})
            open_cases = stats.get("open_cases", 0)
            alerts_7d = stats.get("alerts_7d", 0)
            observations_7d = stats.get("observations_7d", 0)
            
            print_result(True, f"Stats retrieved. Open Cases: {open_cases}, Alerts (7d): {alerts_7d}, Observations (7d): {observations_7d}")
        else:
            print_result(False, "Failed to get stats", data)
    else:
        print_result(False, f"Failed to get dashboard stats: {response.status_code}", response.json())


def test_executive_dashboard():
    """Test GET /api/ril/dashboard/executive"""
    print_test("Get Executive Dashboard")
    
    response = requests.get(
        f"{BASE_URL}/ril/dashboard/executive",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        reliability_score = data.get("reliability_score")
        risk_exposure = data.get("risk_exposure")
        predicted_failures = data.get("predicted_failures")
        
        print_result(True, f"Executive dashboard retrieved. Reliability Score: {reliability_score}, Risk Exposure: {risk_exposure}")
        
        # Verify reliability score is valid
        if reliability_score is not None and 0 <= reliability_score <= 100:
            print_result(True, f"Reliability score valid: {reliability_score}")
        else:
            print_result(False, f"Invalid reliability score: {reliability_score}")
    else:
        print_result(False, f"Failed to get executive dashboard: {response.status_code}", response.json())


def test_intelligence_dashboard():
    """Test GET /api/ril/dashboard/intelligence"""
    print_test("Get Intelligence Dashboard")
    
    response = requests.get(
        f"{BASE_URL}/ril/dashboard/intelligence",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        correlations = data.get("correlations", [])
        emerging_risks = data.get("emerging_risks", [])
        fleet_insights = data.get("fleet_insights", [])
        
        print_result(True, f"Intelligence dashboard retrieved. Correlations: {len(correlations)}, Emerging Risks: {len(emerging_risks)}")
    else:
        print_result(False, f"Failed to get intelligence dashboard: {response.status_code}", response.json())


def test_data_quality_dashboard():
    """Test GET /api/ril/dashboard/data-quality"""
    print_test("Get Data Quality Dashboard")
    
    response = requests.get(
        f"{BASE_URL}/ril/dashboard/data-quality",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        source_coverage = data.get("source_coverage", [])
        data_freshness = data.get("data_freshness", {})
        equipment_coverage = data.get("equipment_coverage", {})
        
        print_result(True, f"Data quality dashboard retrieved. Sources: {len(source_coverage)}")
        
        # Verify equipment coverage
        if equipment_coverage:
            total = equipment_coverage.get("total", 0)
            with_obs = equipment_coverage.get("with_observations", 0)
            coverage_pct = equipment_coverage.get("coverage_pct", 0)
            print_result(True, f"Equipment coverage: {with_obs}/{total} ({coverage_pct}%)")
    else:
        print_result(False, f"Failed to get data quality dashboard: {response.status_code}", response.json())


# ============= MAIN TEST RUNNER =============

def run_all_tests():
    """Run all RIL backend tests"""
    global auth_token, equipment_id
    
    print("\n" + "="*80)
    print("  RELIABILITY INTELLIGENCE LAYER (RIL) BACKEND API TESTS")
    print("="*80)
    
    # Authentication
    auth_token = login()
    if not auth_token:
        print("\n❌ CRITICAL: Authentication failed. Cannot proceed with tests.")
        return
    
    # Get equipment ID
    equipment_id = get_equipment_id()
    if not equipment_id:
        print("\n❌ CRITICAL: No equipment found. Cannot proceed with tests.")
        return
    
    # Run tests in order
    print_section("1. OBSERVATIONS API")
    test_create_observation()
    test_list_observations()
    test_list_observations_with_filters()
    
    print_section("2. READINGS API")
    test_ingest_single_reading()
    test_ingest_bulk_readings()
    test_list_readings()
    
    print_section("3. ALERTS API")
    test_create_alert()
    test_list_alerts()
    test_update_alert()
    
    print_section("4. CORRELATIONS API")
    test_find_correlations()
    test_list_correlations()
    
    print_section("5. RELIABILITY CASES API")
    test_create_case()
    test_list_cases()
    test_get_case()
    test_update_case()
    
    print_section("6. PREDICTIONS API")
    test_generate_prediction()
    test_list_predictions()
    test_get_at_risk_equipment()
    
    print_section("7. DASHBOARD API")
    test_dashboard_stats()
    test_executive_dashboard()
    test_intelligence_dashboard()
    test_data_quality_dashboard()
    
    print_section("TEST SUMMARY")
    print("All RIL backend API tests completed.")
    print("Review the results above for any failures.")
    print("\n" + "="*80 + "\n")


if __name__ == "__main__":
    run_all_tests()
