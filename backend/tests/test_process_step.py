"""
Test Process Step Mapping Feature for Equipment Manager
Tests:
1. Process Step field is saved correctly via POST /api/equipment-hierarchy/nodes
2. Process Step field is updated correctly via PATCH /api/equipment-hierarchy/nodes/{id}
3. Process Step is inherited from parent when creating child at subunit/maintainable_item level
4. Process Step can be overridden after inheritance
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProcessStepFeature:
    """Test Process Step mapping feature for Equipment Manager"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        """Setup test data and cleanup after tests"""
        self.client = api_client
        self.token = auth_token
        self.client.headers.update({"Authorization": f"Bearer {auth_token}"})
        self.created_node_ids = []
        yield
        # Cleanup: Delete all test nodes
        for node_id in reversed(self.created_node_ids):
            try:
                self.client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{node_id}")
            except:
                pass
    
    def create_node(self, name, level, parent_id=None, process_step=None, equipment_type_id=None):
        """Helper to create a node and track for cleanup"""
        payload = {
            "name": name,
            "level": level,
            "parent_id": parent_id
        }
        if process_step:
            payload["process_step"] = process_step
        if equipment_type_id:
            payload["equipment_type_id"] = equipment_type_id
        
        response = self.client.post(f"{BASE_URL}/api/equipment-hierarchy/nodes", json=payload)
        if response.status_code == 200:
            node_id = response.json().get("id")
            if node_id:
                self.created_node_ids.append(node_id)
        return response
    
    def test_create_subunit_with_process_step(self):
        """Test creating a subunit with process_step field"""
        # Create hierarchy: Installation > Plant Unit > Section > Equipment Unit > Subunit
        install_resp = self.create_node("TEST_PS_Installation", "installation")
        assert install_resp.status_code == 200, f"Failed to create installation: {install_resp.text}"
        install_id = install_resp.json()["id"]
        
        plant_resp = self.create_node("TEST_PS_Plant", "plant_unit", install_id)
        assert plant_resp.status_code == 200, f"Failed to create plant: {plant_resp.text}"
        plant_id = plant_resp.json()["id"]
        
        section_resp = self.create_node("TEST_PS_Section", "section_system", plant_id)
        assert section_resp.status_code == 200, f"Failed to create section: {section_resp.text}"
        section_id = section_resp.json()["id"]
        
        equip_resp = self.create_node("TEST_PS_Equipment", "equipment_unit", section_id)
        assert equip_resp.status_code == 200, f"Failed to create equipment: {equip_resp.text}"
        equip_id = equip_resp.json()["id"]
        
        # Create subunit WITH process_step
        subunit_resp = self.create_node("TEST_PS_Subunit", "subunit", equip_id, process_step="Extrusion")
        assert subunit_resp.status_code == 200, f"Failed to create subunit: {subunit_resp.text}"
        
        subunit_data = subunit_resp.json()
        assert subunit_data.get("process_step") == "Extrusion", f"Process step not saved: {subunit_data}"
        print("PASSED: Subunit created with process_step='Extrusion'")
    
    def test_create_maintainable_item_with_process_step(self):
        """Test creating a maintainable_item with process_step field"""
        # Create full hierarchy
        install_resp = self.create_node("TEST_PS2_Installation", "installation")
        assert install_resp.status_code == 200
        install_id = install_resp.json()["id"]
        
        plant_resp = self.create_node("TEST_PS2_Plant", "plant_unit", install_id)
        plant_id = plant_resp.json()["id"]
        
        section_resp = self.create_node("TEST_PS2_Section", "section_system", plant_id)
        section_id = section_resp.json()["id"]
        
        equip_resp = self.create_node("TEST_PS2_Equipment", "equipment_unit", section_id)
        equip_id = equip_resp.json()["id"]
        
        subunit_resp = self.create_node("TEST_PS2_Subunit", "subunit", equip_id)
        subunit_id = subunit_resp.json()["id"]
        
        # Create maintainable_item WITH process_step
        mi_resp = self.create_node("TEST_PS2_MaintItem", "maintainable_item", subunit_id, process_step="Compounding")
        assert mi_resp.status_code == 200, f"Failed to create maintainable item: {mi_resp.text}"
        
        mi_data = mi_resp.json()
        assert mi_data.get("process_step") == "Compounding", f"Process step not saved: {mi_data}"
        print("PASSED: Maintainable item created with process_step='Compounding'")
    
    def test_update_process_step_via_patch(self):
        """Test updating process_step via PATCH endpoint"""
        # Create hierarchy
        install_resp = self.create_node("TEST_PS3_Installation", "installation")
        install_id = install_resp.json()["id"]
        
        plant_resp = self.create_node("TEST_PS3_Plant", "plant_unit", install_id)
        plant_id = plant_resp.json()["id"]
        
        section_resp = self.create_node("TEST_PS3_Section", "section_system", plant_id)
        section_id = section_resp.json()["id"]
        
        equip_resp = self.create_node("TEST_PS3_Equipment", "equipment_unit", section_id)
        equip_id = equip_resp.json()["id"]
        
        # Create subunit without process_step
        subunit_resp = self.create_node("TEST_PS3_Subunit", "subunit", equip_id)
        subunit_id = subunit_resp.json()["id"]
        assert subunit_resp.json().get("process_step") is None, "Process step should be None initially"
        
        # Update process_step via PATCH
        patch_resp = self.client.patch(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{subunit_id}",
            json={"process_step": "Mixing"}
        )
        assert patch_resp.status_code == 200, f"PATCH failed: {patch_resp.text}"
        
        updated_data = patch_resp.json()
        assert updated_data.get("process_step") == "Mixing", f"Process step not updated: {updated_data}"
        print("PASSED: Process step updated via PATCH to 'Mixing'")
    
    def test_process_step_inheritance_from_parent(self):
        """Test that child inherits process_step from parent when not provided"""
        # Create hierarchy
        install_resp = self.create_node("TEST_PS4_Installation", "installation")
        install_id = install_resp.json()["id"]
        
        plant_resp = self.create_node("TEST_PS4_Plant", "plant_unit", install_id)
        plant_id = plant_resp.json()["id"]
        
        section_resp = self.create_node("TEST_PS4_Section", "section_system", plant_id)
        section_id = section_resp.json()["id"]
        
        equip_resp = self.create_node("TEST_PS4_Equipment", "equipment_unit", section_id)
        equip_id = equip_resp.json()["id"]
        
        # Create subunit WITH process_step
        subunit_resp = self.create_node("TEST_PS4_Subunit", "subunit", equip_id, process_step="Extrusion")
        subunit_id = subunit_resp.json()["id"]
        assert subunit_resp.json().get("process_step") == "Extrusion"
        
        # Create maintainable_item WITHOUT process_step - should inherit from parent
        mi_resp = self.create_node("TEST_PS4_MaintItem", "maintainable_item", subunit_id)
        assert mi_resp.status_code == 200, f"Failed to create maintainable item: {mi_resp.text}"
        
        mi_data = mi_resp.json()
        assert mi_data.get("process_step") == "Extrusion", f"Process step not inherited: {mi_data}"
        print("PASSED: Maintainable item inherited process_step='Extrusion' from parent subunit")
    
    def test_process_step_override_after_inheritance(self):
        """Test that inherited process_step can be overridden"""
        # Create hierarchy
        install_resp = self.create_node("TEST_PS5_Installation", "installation")
        install_id = install_resp.json()["id"]
        
        plant_resp = self.create_node("TEST_PS5_Plant", "plant_unit", install_id)
        plant_id = plant_resp.json()["id"]
        
        section_resp = self.create_node("TEST_PS5_Section", "section_system", plant_id)
        section_id = section_resp.json()["id"]
        
        equip_resp = self.create_node("TEST_PS5_Equipment", "equipment_unit", section_id)
        equip_id = equip_resp.json()["id"]
        
        # Create subunit WITH process_step
        subunit_resp = self.create_node("TEST_PS5_Subunit", "subunit", equip_id, process_step="Extrusion")
        subunit_id = subunit_resp.json()["id"]
        
        # Create maintainable_item - inherits process_step
        mi_resp = self.create_node("TEST_PS5_MaintItem", "maintainable_item", subunit_id)
        mi_id = mi_resp.json()["id"]
        assert mi_resp.json().get("process_step") == "Extrusion", "Should inherit from parent"
        
        # Override the inherited process_step
        patch_resp = self.client.patch(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{mi_id}",
            json={"process_step": "Cooling"}
        )
        assert patch_resp.status_code == 200, f"PATCH failed: {patch_resp.text}"
        
        updated_data = patch_resp.json()
        assert updated_data.get("process_step") == "Cooling", f"Process step not overridden: {updated_data}"
        print("PASSED: Inherited process_step overridden from 'Extrusion' to 'Cooling'")
    
    def test_process_step_not_inherited_at_higher_levels(self):
        """Test that process_step is NOT inherited at installation/plant_unit/section_system/equipment_unit levels"""
        # Create installation
        install_resp = self.create_node("TEST_PS6_Installation", "installation")
        install_id = install_resp.json()["id"]
        
        # Installation should not have process_step
        assert install_resp.json().get("process_step") is None, "Installation should not have process_step"
        
        # Create plant_unit
        plant_resp = self.create_node("TEST_PS6_Plant", "plant_unit", install_id)
        plant_id = plant_resp.json()["id"]
        assert plant_resp.json().get("process_step") is None, "Plant unit should not have process_step"
        
        # Create section_system
        section_resp = self.create_node("TEST_PS6_Section", "section_system", plant_id)
        section_id = section_resp.json()["id"]
        assert section_resp.json().get("process_step") is None, "Section should not have process_step"
        
        # Create equipment_unit
        equip_resp = self.create_node("TEST_PS6_Equipment", "equipment_unit", section_id)
        assert equip_resp.json().get("process_step") is None, "Equipment unit should not have process_step"
        
        print("PASSED: Higher level nodes (installation, plant_unit, section_system, equipment_unit) do not have process_step")
    
    def test_clear_process_step(self):
        """Test clearing process_step by setting to empty string"""
        # Create hierarchy
        install_resp = self.create_node("TEST_PS7_Installation", "installation")
        install_id = install_resp.json()["id"]
        
        plant_resp = self.create_node("TEST_PS7_Plant", "plant_unit", install_id)
        plant_id = plant_resp.json()["id"]
        
        section_resp = self.create_node("TEST_PS7_Section", "section_system", plant_id)
        section_id = section_resp.json()["id"]
        
        equip_resp = self.create_node("TEST_PS7_Equipment", "equipment_unit", section_id)
        equip_id = equip_resp.json()["id"]
        
        # Create subunit WITH process_step
        subunit_resp = self.create_node("TEST_PS7_Subunit", "subunit", equip_id, process_step="Extrusion")
        subunit_id = subunit_resp.json()["id"]
        assert subunit_resp.json().get("process_step") == "Extrusion"
        
        # Clear process_step by setting to empty string
        patch_resp = self.client.patch(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{subunit_id}",
            json={"process_step": ""}
        )
        assert patch_resp.status_code == 200, f"PATCH failed: {patch_resp.text}"
        
        updated_data = patch_resp.json()
        assert updated_data.get("process_step") == "", f"Process step not cleared: {updated_data}"
        print("PASSED: Process step cleared to empty string")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@test.com",
        "password": "test"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")
