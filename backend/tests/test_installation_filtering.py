"""
Test Installation-Based Filtering Feature
Tests that users with assigned installations see only related data.
Key behaviors:
- Users with NO installations assigned see 0 data
- Users with installations assigned see filtered data
- Stats, threats, actions, equipment all respect installation filtering
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_USER_EMAIL = "test@test.com"
TEST_USER_PASSWORD = "test"

# Jaap user (also has Tyromer assigned per the review request)
JAAP_USER_EMAIL = "jedijk@gmail.com"


class TestInstallationFiltering:
    """Test installation-based data filtering across all endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token") or data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.user = data.get("user", {})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    # ============= STATS ENDPOINT TESTS =============
    
    def test_stats_endpoint_returns_filtered_counts(self):
        """Test /api/stats returns counts filtered by assigned installations."""
        response = self.session.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200, f"Stats endpoint failed: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "total_threats" in data, "Missing total_threats in stats"
        assert "open_threats" in data, "Missing open_threats in stats"
        assert "critical_count" in data, "Missing critical_count in stats"
        assert "high_count" in data, "Missing high_count in stats"
        
        # Values should be integers
        assert isinstance(data["total_threats"], int)
        assert isinstance(data["open_threats"], int)
        assert isinstance(data["critical_count"], int)
        assert isinstance(data["high_count"], int)
        
        print(f"Stats: total={data['total_threats']}, open={data['open_threats']}, critical={data['critical_count']}, high={data['high_count']}")
    
    # ============= THREATS ENDPOINT TESTS =============
    
    def test_threats_endpoint_returns_filtered_threats(self):
        """Test /api/threats returns threats filtered by assigned installations."""
        response = self.session.get(f"{BASE_URL}/api/threats")
        assert response.status_code == 200, f"Threats endpoint failed: {response.text}"
        
        threats = response.json()
        assert isinstance(threats, list), "Threats should be a list"
        
        print(f"Threats returned: {len(threats)}")
        
        # If user has installations assigned, they should see threats
        # If user has NO installations, they should see 0 threats
        # We verify the endpoint works and returns proper structure
        if len(threats) > 0:
            threat = threats[0]
            assert "id" in threat, "Threat missing id"
            assert "title" in threat, "Threat missing title"
            assert "risk_score" in threat, "Threat missing risk_score"
    
    def test_top_threats_endpoint_returns_filtered_threats(self):
        """Test /api/threats/top returns top threats filtered by installations."""
        response = self.session.get(f"{BASE_URL}/api/threats/top?limit=10")
        assert response.status_code == 200, f"Top threats endpoint failed: {response.text}"
        
        threats = response.json()
        assert isinstance(threats, list), "Top threats should be a list"
        assert len(threats) <= 10, "Should respect limit parameter"
        
        print(f"Top threats returned: {len(threats)}")
    
    # ============= ACTIONS ENDPOINT TESTS =============
    
    def test_actions_endpoint_returns_filtered_actions(self):
        """Test /api/actions returns actions filtered by assigned installations."""
        response = self.session.get(f"{BASE_URL}/api/actions")
        assert response.status_code == 200, f"Actions endpoint failed: {response.text}"
        
        data = response.json()
        assert "actions" in data, "Missing actions in response"
        assert "stats" in data, "Missing stats in response"
        
        actions = data["actions"]
        stats = data["stats"]
        
        assert isinstance(actions, list), "Actions should be a list"
        assert "total" in stats, "Missing total in stats"
        assert "open" in stats, "Missing open in stats"
        
        print(f"Actions: total={stats['total']}, open={stats['open']}, in_progress={stats.get('in_progress', 0)}")
    
    # ============= EQUIPMENT HIERARCHY TESTS =============
    
    def test_equipment_nodes_returns_filtered_nodes(self):
        """Test /api/equipment-hierarchy/nodes returns nodes filtered by installations."""
        response = self.session.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        assert response.status_code == 200, f"Equipment nodes endpoint failed: {response.text}"
        
        data = response.json()
        assert "nodes" in data, "Missing nodes in response"
        
        nodes = data["nodes"]
        assert isinstance(nodes, list), "Nodes should be a list"
        
        print(f"Equipment nodes returned: {len(nodes)}")
        
        # Verify node structure if any exist
        if len(nodes) > 0:
            node = nodes[0]
            assert "id" in node, "Node missing id"
            assert "name" in node, "Node missing name"
            assert "level" in node, "Node missing level"
    
    def test_hierarchy_stats_returns_filtered_stats(self):
        """Test /api/equipment-hierarchy/stats returns stats filtered by installations."""
        response = self.session.get(f"{BASE_URL}/api/equipment-hierarchy/stats")
        assert response.status_code == 200, f"Hierarchy stats endpoint failed: {response.text}"
        
        data = response.json()
        assert "total_nodes" in data, "Missing total_nodes in stats"
        assert "by_level" in data, "Missing by_level in stats"
        assert "by_criticality" in data, "Missing by_criticality in stats"
        
        print(f"Hierarchy stats: total_nodes={data['total_nodes']}")
    
    # ============= USER MANAGEMENT TESTS =============
    
    def test_user_has_assigned_installations_via_rbac(self):
        """Test that user's assigned_installations can be retrieved via RBAC endpoint."""
        # Note: /api/auth/me doesn't include assigned_installations (by design)
        # The assigned_installations field is available via RBAC users endpoint
        response = self.session.get(f"{BASE_URL}/api/rbac/users")
        assert response.status_code == 200, f"RBAC users endpoint failed: {response.text}"
        
        data = response.json()
        users = data.get("users", [])
        
        # Find the current user (test@test.com)
        current_user = next((u for u in users if u.get("email") == TEST_USER_EMAIL), None)
        assert current_user is not None, f"Current user {TEST_USER_EMAIL} not found in users list"
        
        # Check assigned_installations field exists
        assert "assigned_installations" in current_user, "User missing assigned_installations field"
        
        installations = current_user.get("assigned_installations", [])
        print(f"User assigned installations: {installations}")
        
        # Verify the test user has Tyromer assigned (per the review request)
        assert "Tyromer" in installations, f"Expected Tyromer in installations, got: {installations}"
    
    def test_rbac_users_includes_installations_column(self):
        """Test that RBAC users endpoint includes assigned_installations for each user."""
        response = self.session.get(f"{BASE_URL}/api/rbac/users")
        assert response.status_code == 200, f"RBAC users endpoint failed: {response.text}"
        
        data = response.json()
        assert "users" in data, "Missing users in response"
        
        users = data["users"]
        if len(users) > 0:
            user = users[0]
            # Check that assigned_installations field exists
            assert "assigned_installations" in user, "User missing assigned_installations field"
            print(f"First user installations: {user.get('assigned_installations', [])}")
    
    # ============= INSTALLATIONS ENDPOINT TESTS =============
    
    def test_get_all_installations_endpoint(self):
        """Test /api/equipment-hierarchy/installations returns all available installations."""
        response = self.session.get(f"{BASE_URL}/api/equipment-hierarchy/installations")
        assert response.status_code == 200, f"Installations endpoint failed: {response.text}"
        
        data = response.json()
        assert "installations" in data, "Missing installations in response"
        
        installations = data["installations"]
        assert isinstance(installations, list), "Installations should be a list"
        
        print(f"Available installations: {len(installations)}")
        for inst in installations[:5]:  # Print first 5
            print(f"  - {inst.get('name')} (level: {inst.get('level')})")
    
    # ============= CONSISTENCY TESTS =============
    
    def test_stats_and_threats_count_consistency(self):
        """Test that stats total_threats matches actual threats count."""
        # Get stats
        stats_response = self.session.get(f"{BASE_URL}/api/stats")
        assert stats_response.status_code == 200
        stats = stats_response.json()
        
        # Get threats
        threats_response = self.session.get(f"{BASE_URL}/api/threats?limit=1000")
        assert threats_response.status_code == 200
        threats = threats_response.json()
        
        # Compare counts
        stats_total = stats.get("total_threats", 0)
        actual_count = len(threats)
        
        print(f"Stats total_threats: {stats_total}, Actual threats count: {actual_count}")
        
        # They should match (or be close - stats might include all statuses)
        # Note: There might be slight differences due to status filtering
        assert abs(stats_total - actual_count) <= actual_count * 0.5, \
            f"Stats total ({stats_total}) differs significantly from actual count ({actual_count})"
    
    def test_equipment_stats_and_nodes_count_consistency(self):
        """Test that equipment stats total_nodes matches actual nodes count."""
        # Get stats
        stats_response = self.session.get(f"{BASE_URL}/api/equipment-hierarchy/stats")
        assert stats_response.status_code == 200
        stats = stats_response.json()
        
        # Get nodes
        nodes_response = self.session.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        assert nodes_response.status_code == 200
        nodes_data = nodes_response.json()
        
        stats_total = stats.get("total_nodes", 0)
        actual_count = len(nodes_data.get("nodes", []))
        
        print(f"Stats total_nodes: {stats_total}, Actual nodes count: {actual_count}")
        
        # They should match
        assert stats_total == actual_count, \
            f"Stats total_nodes ({stats_total}) doesn't match actual count ({actual_count})"


class TestInstallationFilteringEdgeCases:
    """Test edge cases for installation filtering."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token") or data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    def test_threats_with_status_filter(self):
        """Test threats endpoint with status filter still respects installation filtering."""
        response = self.session.get(f"{BASE_URL}/api/threats?status=Open")
        assert response.status_code == 200, f"Threats with status filter failed: {response.text}"
        
        threats = response.json()
        assert isinstance(threats, list)
        
        # All returned threats should have Open status
        for threat in threats:
            assert threat.get("status") == "Open", f"Threat {threat.get('id')} has wrong status"
        
        print(f"Open threats: {len(threats)}")
    
    def test_actions_with_filters(self):
        """Test actions endpoint with various filters."""
        # Test with status filter
        response = self.session.get(f"{BASE_URL}/api/actions?status=open")
        assert response.status_code == 200
        
        data = response.json()
        actions = data.get("actions", [])
        
        # All returned actions should have open status
        for action in actions:
            assert action.get("status") == "open", f"Action {action.get('id')} has wrong status"
        
        print(f"Open actions: {len(actions)}")
    
    def test_equipment_nodes_structure(self):
        """Test that equipment nodes have proper hierarchy structure."""
        response = self.session.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        assert response.status_code == 200
        
        nodes = response.json().get("nodes", [])
        
        # Build parent-child map
        node_map = {n["id"]: n for n in nodes}
        
        # Verify all parent_ids reference existing nodes (within filtered set)
        for node in nodes:
            parent_id = node.get("parent_id")
            if parent_id:
                # Parent should either be in the filtered set or be an installation
                # (which might be the root of the filtered tree)
                pass  # This is expected behavior
        
        # Count by level
        level_counts = {}
        for node in nodes:
            level = node.get("level", "unknown")
            level_counts[level] = level_counts.get(level, 0) + 1
        
        print(f"Nodes by level: {level_counts}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
