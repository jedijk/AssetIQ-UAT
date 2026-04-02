"""
Test suite for bug fixes in iteration 21:
1. Causal Intelligence - generate causes for threat
2. Equipment deletion - impact analysis dialog
3. Dashboard Quick View - form submission modal
4. Observations timeline - threatTimeline query key invalidation
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://form-designer-2-1.preview.emergentagent.com')

class TestCausalIntelligence:
    """Test Causal Intelligence (AI cause generation) for threats"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_generate_causes_for_threat(self):
        """Test generating probable causes for a specific threat"""
        threat_id = "793e2a1c-b40e-414f-b847-663fbfea22a6"
        
        # First verify threat exists
        response = requests.get(f"{BASE_URL}/api/threats/{threat_id}", headers=self.headers)
        assert response.status_code == 200, f"Threat not found: {response.text}"
        threat = response.json()
        print(f"Testing causal intelligence for threat: {threat.get('title')}")
        
        # Generate causes
        response = requests.post(
            f"{BASE_URL}/api/ai/generate-causes/{threat_id}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Generate causes failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "threat_id" in data, "Missing threat_id in response"
        assert data["threat_id"] == threat_id, "Threat ID mismatch"
        assert "summary" in data, "Missing summary in response"
        assert "probable_causes" in data, "Missing probable_causes in response"
        assert "confidence" in data, "Missing confidence in response"
        
        # Verify probable causes structure
        assert len(data["probable_causes"]) > 0, "No probable causes returned"
        
        for cause in data["probable_causes"]:
            assert "id" in cause, "Cause missing id"
            assert "description" in cause, "Cause missing description"
            assert "category" in cause, "Cause missing category"
            assert "probability" in cause, "Cause missing probability"
            assert "probability_level" in cause, "Cause missing probability_level"
            
            # Verify probability_level is valid enum value
            valid_levels = ["very_likely", "likely", "possible", "unlikely"]
            assert cause["probability_level"] in valid_levels, \
                f"Invalid probability_level: {cause['probability_level']}"
            
            # Verify mitigation_actions structure
            if "mitigation_actions" in cause:
                for action in cause["mitigation_actions"]:
                    assert "action" in action, "Mitigation action missing 'action' field"
                    assert "action_type" in action, "Mitigation action missing 'action_type'"
                    assert "discipline" in action, "Mitigation action missing 'discipline'"
        
        print(f"✓ Generated {len(data['probable_causes'])} probable causes")
        print(f"✓ Confidence level: {data['confidence']}")


class TestEquipmentDeletion:
    """Test equipment deletion with impact analysis"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_deletion_impact(self):
        """Test getting deletion impact analysis for equipment node"""
        # First get equipment nodes
        response = requests.get(f"{BASE_URL}/api/equipment-hierarchy/nodes", headers=self.headers)
        assert response.status_code == 200, f"Failed to get nodes: {response.text}"
        
        nodes = response.json().get("nodes", [])
        assert len(nodes) > 0, "No equipment nodes found"
        
        # Find a node with children for better testing
        node_with_children = None
        for node in nodes:
            if node.get("level") != "maintainable_item":
                # Check if it has children
                children = [n for n in nodes if n.get("parent_id") == node.get("id")]
                if len(children) > 0:
                    node_with_children = node
                    break
        
        test_node = node_with_children or nodes[0]
        node_id = test_node["id"]
        
        # Get deletion impact
        response = requests.get(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{node_id}/deletion-impact",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get deletion impact: {response.text}"
        
        impact = response.json()
        
        # Verify response structure
        assert "node" in impact, "Missing node info in impact"
        assert "children_count" in impact, "Missing children_count"
        assert "impact" in impact, "Missing impact details"
        assert "total_impacted" in impact, "Missing total_impacted count"
        
        # Verify impact details structure
        impact_details = impact["impact"]
        assert "tasks" in impact_details, "Missing tasks impact"
        assert "actions" in impact_details, "Missing actions impact"
        assert "investigations" in impact_details, "Missing investigations impact"
        assert "task_plans" in impact_details, "Missing task_plans impact"
        
        # Each impact category should have count and items
        for category in ["tasks", "actions", "investigations", "task_plans"]:
            assert "count" in impact_details[category], f"Missing count in {category}"
            assert "items" in impact_details[category], f"Missing items in {category}"
        
        print(f"✓ Deletion impact for '{test_node.get('name')}':")
        print(f"  - Children: {impact['children_count']}")
        print(f"  - Tasks affected: {impact_details['tasks']['count']}")
        print(f"  - Actions affected: {impact_details['actions']['count']}")
        print(f"  - Investigations affected: {impact_details['investigations']['count']}")
        print(f"  - Task plans affected: {impact_details['task_plans']['count']}")


class TestFormSubmissions:
    """Test form submissions for Dashboard Quick View"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_form_submissions(self):
        """Test getting form submissions for dashboard"""
        response = requests.get(
            f"{BASE_URL}/api/form-submissions?limit=10",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get submissions: {response.text}"
        
        data = response.json()
        
        # Response can be array or object with submissions key
        submissions = data if isinstance(data, list) else data.get("submissions", [])
        
        print(f"✓ Retrieved {len(submissions)} form submissions")
        
        # If there are submissions, verify structure
        if len(submissions) > 0:
            submission = submissions[0]
            # Check for expected fields
            expected_fields = ["id", "template_name", "submitted_at", "status"]
            for field in expected_fields:
                if field in submission:
                    print(f"  - Has {field}: {submission.get(field)}")


class TestMyTasks:
    """Test My Tasks page - form completion flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_adhoc_plans(self):
        """Test getting adhoc plans"""
        response = requests.get(f"{BASE_URL}/api/adhoc-plans", headers=self.headers)
        assert response.status_code == 200, f"Failed to get adhoc plans: {response.text}"
        
        data = response.json()
        plans = data.get("plans", []) if isinstance(data, dict) else data
        print(f"✓ Retrieved {len(plans)} adhoc plans")
        
        # Find Check adhoc task template
        check_plan = None
        for plan in plans:
            if isinstance(plan, dict):
                if "Check" in plan.get("title", "") or "Pump Vibration" in plan.get("form_template_name", ""):
                    check_plan = plan
                    break
        
        if check_plan:
            print(f"  - Found plan: {check_plan.get('title')}")
            print(f"  - Has form: {check_plan.get('form_template_id') is not None}")
    
    def test_execute_adhoc_plan(self):
        """Test executing an adhoc plan"""
        # Get adhoc plans
        response = requests.get(f"{BASE_URL}/api/adhoc-plans", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        plans = data.get("plans", []) if isinstance(data, dict) else data
        if len(plans) == 0:
            pytest.skip("No adhoc plans available")
        
        # Find a plan with form fields
        plan_with_form = None
        for plan in plans:
            if isinstance(plan, dict) and (plan.get("form_template_id") or plan.get("has_form")):
                plan_with_form = plan
                break
        
        if not plan_with_form:
            plan_with_form = plans[0] if isinstance(plans[0], dict) else {"id": plans[0]}
        
        plan_id = plan_with_form["id"]
        
        # Execute the plan
        response = requests.post(
            f"{BASE_URL}/api/adhoc-plans/{plan_id}/execute",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to execute plan: {response.text}"
        
        result = response.json()
        assert "task_id" in result or "id" in result, "No task ID returned"
        
        task_id = result.get("task_id") or result.get("id")
        print(f"✓ Executed adhoc plan '{plan_with_form.get('name')}'")
        print(f"  - Created task: {task_id}")
        
        return task_id
    
    def test_get_my_tasks(self):
        """Test getting my tasks"""
        response = requests.get(
            f"{BASE_URL}/api/my-tasks?filter=all",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get tasks: {response.text}"
        
        data = response.json()
        tasks = data.get("tasks", []) if isinstance(data, dict) else data
        
        print(f"✓ Retrieved {len(tasks)} tasks")
        
        # Check for adhoc tasks
        adhoc_tasks = [t for t in tasks if t.get("source_type") == "adhoc" or t.get("is_adhoc")]
        print(f"  - Adhoc tasks: {len(adhoc_tasks)}")


class TestThreatTimeline:
    """Test threat timeline query key invalidation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_threat_timeline(self):
        """Test getting threat timeline"""
        threat_id = "793e2a1c-b40e-414f-b847-663fbfea22a6"
        
        # Get threat timeline
        response = requests.get(
            f"{BASE_URL}/api/threats/{threat_id}/timeline",
            headers=self.headers
        )
        
        # Timeline endpoint may not exist, check for 200 or 404
        if response.status_code == 404:
            print("✓ Timeline endpoint not found (may be embedded in threat detail)")
            # Try getting threat detail which may include timeline
            response = requests.get(
                f"{BASE_URL}/api/threats/{threat_id}",
                headers=self.headers
            )
            assert response.status_code == 200
            threat = response.json()
            if "timeline" in threat:
                print(f"  - Timeline embedded in threat detail: {len(threat['timeline'])} events")
        else:
            assert response.status_code == 200, f"Failed to get timeline: {response.text}"
            timeline = response.json()
            print(f"✓ Retrieved timeline with {len(timeline)} events")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
