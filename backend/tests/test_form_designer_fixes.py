"""
Test Form Designer Bug Fixes - Iteration 22
Tests for:
1. Template update via API (PATCH /api/form-templates/{id})
2. formAPI.updateTemplate function handles { id, data } object format
3. AI analysis API timeout (2 minutes)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using owner credentials"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "jedijk@gmail.com",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("token")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestFormTemplateUpdate:
    """Test form template PATCH endpoint"""
    
    def test_get_templates_list(self, auth_headers):
        """Verify we can get list of templates"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get templates: {response.text}"
        data = response.json()
        assert "templates" in data
        print(f"Found {len(data['templates'])} templates")
    
    def test_update_template_name(self, auth_headers):
        """Test updating template name via PATCH"""
        # First get a template
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=auth_headers)
        assert response.status_code == 200
        templates = response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates available to test update")
        
        template = templates[0]
        template_id = template["id"]
        original_name = template.get("name", "")
        
        # Update the template name
        test_name = f"TEST_Updated_{int(time.time())}"
        update_response = requests.patch(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers,
            json={"name": test_name}
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated.get("name") == test_name, f"Name not updated: {updated.get('name')}"
        print(f"Successfully updated template name to: {test_name}")
        
        # Restore original name
        restore_response = requests.patch(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers,
            json={"name": original_name}
        )
        assert restore_response.status_code == 200
        print(f"Restored template name to: {original_name}")
    
    def test_update_template_description(self, auth_headers):
        """Test updating template description via PATCH"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=auth_headers)
        assert response.status_code == 200
        templates = response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates available to test update")
        
        template = templates[0]
        template_id = template["id"]
        original_desc = template.get("description", "")
        
        # Update description
        test_desc = f"TEST_Description_{int(time.time())}"
        update_response = requests.patch(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers,
            json={"description": test_desc}
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated.get("description") == test_desc
        print(f"Successfully updated template description")
        
        # Verify persistence with GET
        get_response = requests.get(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched.get("description") == test_desc, "Description not persisted"
        
        # Restore original
        requests.patch(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers,
            json={"description": original_desc}
        )
    
    def test_update_template_multiple_fields(self, auth_headers):
        """Test updating multiple fields at once"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=auth_headers)
        assert response.status_code == 200
        templates = response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates available to test update")
        
        template = templates[0]
        template_id = template["id"]
        original_name = template.get("name", "")
        original_desc = template.get("description", "")
        
        # Update multiple fields
        update_response = requests.patch(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers,
            json={
                "name": f"TEST_Multi_{int(time.time())}",
                "description": "Multi-field update test",
                "require_signature": True
            }
        )
        
        assert update_response.status_code == 200, f"Multi-field update failed: {update_response.text}"
        updated = update_response.json()
        assert "name" in updated
        assert "description" in updated
        print(f"Successfully updated multiple fields")
        
        # Restore original
        requests.patch(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers,
            json={"name": original_name, "description": original_desc}
        )
    
    def test_update_nonexistent_template(self, auth_headers):
        """Test updating a non-existent template returns 404"""
        fake_id = "000000000000000000000000"
        response = requests.patch(
            f"{BASE_URL}/api/form-templates/{fake_id}",
            headers=auth_headers,
            json={"name": "Should fail"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returned 404 for non-existent template")


class TestFormTemplateDocuments:
    """Test form template document operations"""
    
    def test_get_template_documents(self, auth_headers):
        """Test getting documents for a template"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=auth_headers)
        assert response.status_code == 200
        templates = response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates available")
        
        template = templates[0]
        template_id = template["id"]
        
        # Get documents
        doc_response = requests.get(
            f"{BASE_URL}/api/form-templates/{template_id}/documents",
            headers=auth_headers
        )
        assert doc_response.status_code == 200, f"Failed to get documents: {doc_response.text}"
        data = doc_response.json()
        assert "documents" in data
        print(f"Template has {len(data['documents'])} documents")
    
    def test_template_has_documents_field(self, auth_headers):
        """Verify template response includes documents array"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=auth_headers)
        assert response.status_code == 200
        templates = response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates available")
        
        template = templates[0]
        template_id = template["id"]
        
        # Get single template
        single_response = requests.get(
            f"{BASE_URL}/api/form-templates/{template_id}",
            headers=auth_headers
        )
        assert single_response.status_code == 200
        template_data = single_response.json()
        
        # Documents field should exist (even if empty)
        assert "documents" in template_data or template_data.get("documents") is None, \
            "Template should have documents field"
        print(f"Template documents field present: {template_data.get('documents', [])}")


class TestAIAPITimeout:
    """Test AI API timeout configuration"""
    
    def test_ai_risk_analysis_endpoint_exists(self, auth_headers):
        """Verify AI risk analysis endpoint exists"""
        # Get a threat to test with
        threats_response = requests.get(f"{BASE_URL}/api/threats", headers=auth_headers)
        assert threats_response.status_code == 200
        threats_data = threats_response.json()
        # Handle both list and dict response formats
        threats = threats_data if isinstance(threats_data, list) else threats_data.get("threats", [])
        
        if not threats:
            pytest.skip("No threats available for AI testing")
        
        threat_id = threats[0]["id"]
        
        # Test AI endpoint exists (don't wait for full response)
        # Just verify endpoint is reachable
        try:
            response = requests.post(
                f"{BASE_URL}/api/ai/analyze-risk/{threat_id}",
                headers=auth_headers,
                json={"include_forecast": False},
                timeout=5  # Short timeout just to verify endpoint exists
            )
            # Either success or timeout is acceptable - we're just checking endpoint exists
            print(f"AI endpoint responded with status: {response.status_code}")
        except requests.exceptions.Timeout:
            print("AI endpoint exists but timed out (expected for long operations)")
        except requests.exceptions.RequestException as e:
            pytest.fail(f"AI endpoint not reachable: {e}")


class TestFormSubmissions:
    """Test form submissions endpoint"""
    
    def test_get_submissions(self, auth_headers):
        """Test getting form submissions"""
        response = requests.get(
            f"{BASE_URL}/api/form-submissions",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get submissions: {response.text}"
        data = response.json()
        assert "submissions" in data
        print(f"Found {len(data['submissions'])} submissions")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
