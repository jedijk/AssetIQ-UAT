import pytest
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestFailureModesCategories:
    def test_get_categories_returns_list(self, authenticated_client):
        """GET /api/failure-modes/categories returns expected categories"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/categories")
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        cats = data["categories"]
        assert isinstance(cats, list)
        assert len(cats) >= 8

    def test_get_categories_contains_expected_types(self, authenticated_client):
        """Categories include all standard FMEA categories"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/categories")
        assert response.status_code == 200
        cats = response.json()["categories"]
        expected = {"Rotating", "Static", "Piping", "Instrumentation", "Electrical", "Process", "Safety", "Environment"}
        assert expected.issubset(set(cats))


class TestFailureModesLibrary:
    def test_get_all_failure_modes(self, authenticated_client):
        """GET /api/failure-modes returns at least 100 failure modes"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes")
        assert response.status_code == 200
        data = response.json()
        assert "failure_modes" in data
        assert "total" in data
        assert data["total"] >= 100  # At least 100 failure modes in library
        assert len(data["failure_modes"]) >= 100

    def test_failure_mode_fields(self, authenticated_client):
        """Each failure mode has required FMEA fields"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes")
        assert response.status_code == 200
        modes = response.json()["failure_modes"]
        fm = modes[0]
        assert "id" in fm
        assert "category" in fm
        assert "equipment" in fm
        assert "failure_mode" in fm
        assert "keywords" in fm
        assert "severity" in fm
        assert "occurrence" in fm
        assert "detectability" in fm
        assert "rpn" in fm
        assert "recommended_actions" in fm

    def test_rpn_calculation_correct(self, authenticated_client):
        """RPN = severity × occurrence × detectability"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes")
        assert response.status_code == 200
        modes = response.json()["failure_modes"]
        for fm in modes[:10]:
            expected_rpn = fm["severity"] * fm["occurrence"] * fm["detectability"]
            assert fm["rpn"] == expected_rpn, f"RPN mismatch for {fm['failure_mode']}: expected {expected_rpn}, got {fm['rpn']}"

    def test_filter_by_category_rotating(self, authenticated_client):
        """Filter by Rotating category returns only Rotating items"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes?category=Rotating")
        assert response.status_code == 200
        data = response.json()
        modes = data["failure_modes"]
        assert len(modes) > 0
        for fm in modes:
            assert fm["category"] == "Rotating"

    def test_filter_by_category_safety(self, authenticated_client):
        """Filter by Safety category returns only Safety items"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes?category=Safety")
        assert response.status_code == 200
        modes = response.json()["failure_modes"]
        assert len(modes) > 0
        for fm in modes:
            assert fm["category"] == "Safety"

    def test_search_by_keyword(self, authenticated_client):
        """Search by keyword returns relevant failure modes"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes?search=seal")
        assert response.status_code == 200
        data = response.json()
        modes = data["failure_modes"]
        assert len(modes) > 0

    def test_search_by_equipment_name(self, authenticated_client):
        """Search by equipment name should return results - BUG: search only checks keywords, not equipment/failure_mode fields"""
        # 'pump' appears in pump failure modes' equipment field but NOT in keywords
        # This test documents the bug: search for 'pump' returns 0 results
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes?search=pump")
        assert response.status_code == 200
        modes = response.json()["failure_modes"]
        # BUG: Should return pump failure modes but search only checks keywords list
        # Seal failure has keywords: ["leak","seal","drip","pump leak"] - "pump leak" would match
        # But searching just "pump" returns 0 - expected > 0
        assert len(modes) > 0, "BUG-002: Search does not search equipment/failure_mode name fields, only keywords"

    def test_default_sorted_by_rpn_desc(self, authenticated_client):
        """Results are sorted by RPN descending"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes")
        assert response.status_code == 200
        modes = response.json()["failure_modes"]
        rpns = [fm["rpn"] for fm in modes]
        assert rpns == sorted(rpns, reverse=True), "Failure modes should be sorted by RPN descending"


class TestFailureModeById:
    def test_get_failure_mode_by_id(self, authenticated_client):
        """GET /api/failure-modes/{id} returns specific failure mode"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 1
        assert data["failure_mode"] == "Seal Failure"
        assert data["category"] == "Rotating"

    def test_get_failure_mode_invalid_id(self, authenticated_client):
        """GET /api/failure-modes/9999 returns 404"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/9999")
        assert response.status_code == 404


class TestHighRiskFailureModes:
    def test_get_high_risk_modes(self, authenticated_client):
        """GET /api/failure-modes/high-risk returns high RPN items"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/high-risk")
        assert response.status_code == 200
        data = response.json()
        assert "failure_modes" in data
        modes = data["failure_modes"]
        assert len(modes) > 0

    def test_high_risk_modes_above_threshold(self, authenticated_client):
        """All high-risk items have RPN above threshold (default 200)"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/high-risk")
        assert response.status_code == 200
        modes = response.json()["failure_modes"]
        for fm in modes:
            assert fm["rpn"] >= 200, f"Expected RPN >= 200, got {fm['rpn']} for {fm['failure_mode']}"


class TestEquipmentTypes:
    def test_get_equipment_types(self, authenticated_client):
        """GET /api/failure-modes/equipment-types returns equipment list"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/equipment-types")
        assert response.status_code == 200
        data = response.json()
        assert "equipment_types" in data
        equipment = data["equipment_types"]
        assert isinstance(equipment, list)
        assert len(equipment) > 0
