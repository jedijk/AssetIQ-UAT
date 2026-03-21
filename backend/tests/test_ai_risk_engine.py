"""
Test suite for ThreatBase v2 AI Risk Engine endpoints
Tests: AI Risk Analysis, Causal Intelligence, Fault Tree, Bow-Tie, Action Optimization
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"

# Test threat ID provided by main agent
TEST_THREAT_ID = "43455566-4f46-4c54-8130-fdd7a7d009a1"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestAuthAndThreatAccess:
    """Verify auth and threat access before AI tests"""
    
    def test_login_success(self):
        """Test login with test credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✓ Login successful for {TEST_EMAIL}")
    
    def test_threat_exists(self, authenticated_client):
        """Verify test threat exists"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats/{TEST_THREAT_ID}")
        assert response.status_code == 200, f"Threat not found: {response.text}"
        threat = response.json()
        assert threat["id"] == TEST_THREAT_ID
        print(f"✓ Test threat found: {threat.get('title', 'Unknown')}")


class TestAIRiskAnalysis:
    """Test AI Risk Analysis endpoints (Phase 1)"""
    
    def test_analyze_risk_endpoint(self, authenticated_client):
        """POST /api/ai/analyze-risk/{threat_id} - Generate AI risk analysis"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ai/analyze-risk/{TEST_THREAT_ID}",
            json={
                "include_forecast": True,
                "forecast_days": 7,
                "include_similar_incidents": True
            }
        )
        # AI analysis can take time, allow for 30 second timeout
        assert response.status_code == 200, f"Risk analysis failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "threat_id" in data
        assert "dynamic_risk" in data
        
        dynamic_risk = data["dynamic_risk"]
        assert "risk_score" in dynamic_risk
        assert "failure_probability" in dynamic_risk
        assert "confidence" in dynamic_risk
        assert "trend" in dynamic_risk
        
        # Validate risk score is in valid range
        assert 0 <= dynamic_risk["risk_score"] <= 100, f"Risk score out of range: {dynamic_risk['risk_score']}"
        assert 0 <= dynamic_risk["failure_probability"] <= 100, f"Failure probability out of range"
        
        # Validate trend is valid enum
        assert dynamic_risk["trend"] in ["increasing", "stable", "decreasing"]
        
        # Validate confidence is valid enum
        assert dynamic_risk["confidence"] in ["high", "medium", "low"]
        
        print(f"✓ AI Risk Analysis: Score={dynamic_risk['risk_score']}, Probability={dynamic_risk['failure_probability']}%, Trend={dynamic_risk['trend']}")
    
    def test_get_risk_insights_cached(self, authenticated_client):
        """GET /api/ai/risk-insights/{threat_id} - Get cached risk insights"""
        response = authenticated_client.get(f"{BASE_URL}/api/ai/risk-insights/{TEST_THREAT_ID}")
        
        # Should return cached data after analysis
        assert response.status_code == 200, f"Get risk insights failed: {response.text}"
        
        data = response.json()
        assert "threat_id" in data
        assert "dynamic_risk" in data
        assert data["threat_id"] == TEST_THREAT_ID
        
        print(f"✓ Cached risk insights retrieved successfully")
    
    def test_get_top_risks(self, authenticated_client):
        """GET /api/ai/top-risks - Get AI-curated top risks"""
        response = authenticated_client.get(f"{BASE_URL}/api/ai/top-risks?limit=5")
        assert response.status_code == 200, f"Get top risks failed: {response.text}"
        
        data = response.json()
        assert "top_risks" in data
        assert isinstance(data["top_risks"], list)
        
        print(f"✓ Top risks endpoint returned {len(data['top_risks'])} risks")


class TestCausalIntelligence:
    """Test Causal Intelligence endpoints (Phase 2)"""
    
    def test_generate_causes_endpoint(self, authenticated_client):
        """POST /api/ai/generate-causes/{threat_id} - Generate probable causes"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ai/generate-causes/{TEST_THREAT_ID}",
            json={
                "max_causes": 5,
                "include_evidence": True,
                "include_mitigations": True
            }
        )
        assert response.status_code == 200, f"Generate causes failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "threat_id" in data
        assert "summary" in data
        assert "probable_causes" in data
        assert "confidence" in data
        
        probable_causes = data["probable_causes"]
        assert isinstance(probable_causes, list)
        
        # Validate each cause has required fields
        for cause in probable_causes:
            assert "id" in cause
            assert "description" in cause
            assert "category" in cause
            assert "probability" in cause
            assert "probability_level" in cause
            
            # Validate probability is in range
            assert 0 <= cause["probability"] <= 100
            
            # Validate probability_level is valid enum
            assert cause["probability_level"] in ["very_likely", "likely", "possible", "unlikely"]
        
        print(f"✓ Causal Analysis: {len(probable_causes)} causes identified")
        for i, cause in enumerate(probable_causes[:3], 1):
            print(f"  {i}. {cause['description'][:50]}... ({cause['probability']}%)")
    
    def test_get_causal_analysis_cached(self, authenticated_client):
        """GET /api/ai/causal-analysis/{threat_id} - Get cached causal analysis"""
        response = authenticated_client.get(f"{BASE_URL}/api/ai/causal-analysis/{TEST_THREAT_ID}")
        
        assert response.status_code == 200, f"Get causal analysis failed: {response.text}"
        
        data = response.json()
        assert "threat_id" in data
        assert "probable_causes" in data
        assert data["threat_id"] == TEST_THREAT_ID
        
        print(f"✓ Cached causal analysis retrieved successfully")
    
    def test_explain_endpoint(self, authenticated_client):
        """POST /api/ai/explain/{threat_id} - 'Why is this happening?' endpoint"""
        response = authenticated_client.post(f"{BASE_URL}/api/ai/explain/{TEST_THREAT_ID}")
        
        assert response.status_code == 200, f"Explain endpoint failed: {response.text}"
        
        data = response.json()
        assert "threat_id" in data
        assert "summary" in data or "probable_causes" in data
        
        print(f"✓ Explain endpoint working - Summary: {data.get('summary', 'N/A')[:100]}...")


class TestFaultTree:
    """Test Fault Tree generation endpoints"""
    
    def test_generate_fault_tree(self, authenticated_client):
        """POST /api/ai/fault-tree/{threat_id} - Generate fault tree"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ai/fault-tree/{TEST_THREAT_ID}",
            json={
                "max_depth": 4,
                "include_probabilities": True
            }
        )
        assert response.status_code == 200, f"Generate fault tree failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "threat_id" in data
        assert "top_event" in data
        assert "root" in data
        assert "total_nodes" in data
        
        # Validate root node structure
        root = data["root"]
        assert "id" in root
        assert "label" in root
        assert "node_type" in root
        
        # Validate node_type is valid
        valid_node_types = ["top_event", "intermediate", "basic_event", "gate_and", "gate_or"]
        assert root["node_type"] in valid_node_types
        
        print(f"✓ Fault Tree generated: {data['total_nodes']} nodes, Top Event: {data['top_event'][:50]}...")
    
    def test_get_fault_tree_cached(self, authenticated_client):
        """GET /api/ai/fault-tree/{threat_id} - Get cached fault tree"""
        response = authenticated_client.get(f"{BASE_URL}/api/ai/fault-tree/{TEST_THREAT_ID}")
        
        assert response.status_code == 200, f"Get fault tree failed: {response.text}"
        
        data = response.json()
        assert "threat_id" in data
        assert "root" in data
        
        print(f"✓ Cached fault tree retrieved successfully")


class TestBowTieModel:
    """Test Bow-Tie model generation endpoints"""
    
    def test_generate_bow_tie(self, authenticated_client):
        """POST /api/ai/bow-tie/{threat_id} - Generate bow-tie model"""
        response = authenticated_client.post(f"{BASE_URL}/api/ai/bow-tie/{TEST_THREAT_ID}")
        
        assert response.status_code == 200, f"Generate bow-tie failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "threat_id" in data
        assert "hazard" in data
        assert "top_event" in data
        assert "causes" in data
        assert "consequences" in data
        assert "preventive_barriers" in data
        assert "mitigative_barriers" in data
        
        # Validate arrays
        assert isinstance(data["causes"], list)
        assert isinstance(data["consequences"], list)
        assert isinstance(data["preventive_barriers"], list)
        assert isinstance(data["mitigative_barriers"], list)
        
        # Validate barrier structure if present
        for barrier in data["preventive_barriers"]:
            assert "id" in barrier
            assert "description" in barrier
            assert "barrier_type" in barrier
            assert barrier["barrier_type"] == "preventive"
        
        for barrier in data["mitigative_barriers"]:
            assert "id" in barrier
            assert "description" in barrier
            assert "barrier_type" in barrier
            assert barrier["barrier_type"] == "mitigative"
        
        print(f"✓ Bow-Tie Model: Hazard='{data['hazard'][:30]}...', {len(data['causes'])} causes, {len(data['consequences'])} consequences")
        print(f"  Barriers: {len(data['preventive_barriers'])} preventive, {len(data['mitigative_barriers'])} mitigative")
    
    def test_get_bow_tie_cached(self, authenticated_client):
        """GET /api/ai/bow-tie/{threat_id} - Get cached bow-tie model"""
        response = authenticated_client.get(f"{BASE_URL}/api/ai/bow-tie/{TEST_THREAT_ID}")
        
        assert response.status_code == 200, f"Get bow-tie failed: {response.text}"
        
        data = response.json()
        assert "threat_id" in data
        assert "hazard" in data
        
        print(f"✓ Cached bow-tie model retrieved successfully")


class TestActionOptimization:
    """Test Action Optimization endpoints"""
    
    def test_optimize_actions(self, authenticated_client):
        """POST /api/ai/optimize-actions/{threat_id} - Get optimized action recommendations"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ai/optimize-actions/{TEST_THREAT_ID}",
            json={
                "budget_limit": None,
                "max_downtime_hours": None,
                "prioritize_by": "roi"
            }
        )
        assert response.status_code == 200, f"Optimize actions failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "threat_id" in data
        assert "recommended_actions" in data
        assert "total_potential_risk_reduction" in data
        assert "optimal_action_sequence" in data
        assert "analysis_summary" in data
        
        recommended_actions = data["recommended_actions"]
        assert isinstance(recommended_actions, list)
        
        # Validate each action has required fields
        for action in recommended_actions:
            assert "id" in action
            assert "description" in action
            assert "action_type" in action
            assert "expected_risk_reduction" in action
            assert "urgency" in action
            
            # Validate action_type is valid
            valid_action_types = ["immediate", "short_term", "long_term", "preventive"]
            assert action["action_type"] in valid_action_types
            
            # Validate urgency is valid
            valid_urgencies = ["critical", "high", "medium", "low"]
            assert action["urgency"] in valid_urgencies
        
        print(f"✓ Action Optimization: {len(recommended_actions)} actions recommended")
        print(f"  Total potential risk reduction: {data['total_potential_risk_reduction']}%")
        for i, action in enumerate(recommended_actions[:3], 1):
            print(f"  {i}. [{action['urgency'].upper()}] {action['description'][:50]}... (reduces risk by {action['expected_risk_reduction']}%)")
    
    def test_get_action_optimization_cached(self, authenticated_client):
        """GET /api/ai/action-optimization/{threat_id} - Get cached action optimization"""
        response = authenticated_client.get(f"{BASE_URL}/api/ai/action-optimization/{TEST_THREAT_ID}")
        
        assert response.status_code == 200, f"Get action optimization failed: {response.text}"
        
        data = response.json()
        assert "threat_id" in data
        assert "recommended_actions" in data
        
        print(f"✓ Cached action optimization retrieved successfully")


class TestErrorHandling:
    """Test error handling for AI endpoints"""
    
    def test_analyze_risk_invalid_threat(self, authenticated_client):
        """Test analyze risk with non-existent threat"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ai/analyze-risk/invalid-threat-id-12345",
            json={"include_forecast": True}
        )
        assert response.status_code == 404
        print(f"✓ Invalid threat returns 404 as expected")
    
    def test_get_insights_no_analysis(self, authenticated_client):
        """Test getting insights for threat without analysis"""
        # Use a random UUID that likely doesn't have analysis
        response = authenticated_client.get(f"{BASE_URL}/api/ai/risk-insights/00000000-0000-0000-0000-000000000000")
        # Should return 404 since no analysis exists
        assert response.status_code == 404
        print(f"✓ Non-analyzed threat returns 404 as expected")
    
    def test_unauthorized_access(self):
        """Test AI endpoints without authentication"""
        response = requests.post(f"{BASE_URL}/api/ai/analyze-risk/{TEST_THREAT_ID}")
        assert response.status_code in [401, 403]
        print(f"✓ Unauthorized access blocked as expected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
