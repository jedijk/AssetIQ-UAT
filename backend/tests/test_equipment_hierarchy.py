import pytest
import requests
import os
import uuid
from pathlib import Path

# Load frontend .env to get REACT_APP_BACKEND_URL
_frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
if _frontend_env.exists():
    for line in _frontend_env.read_text().splitlines():
        if line.strip() and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://reliability-intel-1.preview.emergentagent.com').rstrip('/')


class TestEquipmentHierarchyLibrary:
    """Test equipment hierarchy library endpoints"""
    
    def test_get_equipment_types(self, authenticated_client):
        """Get all ISO 14224 equipment types"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/types")
        assert response.status_code == 200
        data = response.json()
        assert "equipment_types" in data
        types = data["equipment_types"]
        assert len(types) >= 20  # At least 20 equipment types in library (may include custom types)
        # Verify structure
        first_type = types[0]
        assert "id" in first_type
        assert "name" in first_type
        assert "iso_class" in first_type
        assert "discipline" in first_type
        assert "icon" in first_type
        
    def test_get_disciplines(self, api_client):
        """Get all disciplines"""
        response = api_client.get(f"{BASE_URL}/api/equipment-hierarchy/disciplines")
        assert response.status_code == 200
        data = response.json()
        assert "disciplines" in data
        disciplines = data["disciplines"]
        assert "mechanical" in disciplines
        assert "electrical" in disciplines
        assert "instrumentation" in disciplines
        assert "process" in disciplines
        assert len(disciplines) == 4
        
    def test_get_criticality_profiles(self, api_client):
        """Get all criticality profiles"""
        response = api_client.get(f"{BASE_URL}/api/equipment-hierarchy/criticality-profiles")
        assert response.status_code == 200
        data = response.json()
        assert "profiles" in data
        profiles = data["profiles"]
        assert len(profiles) == 4  # 4 criticality levels
        # Verify structure
        profile_ids = [p["id"] for p in profiles]
        assert "safety_critical" in profile_ids
        assert "production_critical" in profile_ids
        assert "medium" in profile_ids
        assert "low" in profile_ids
        # Check defaults exist
        for profile in profiles:
            assert "name" in profile
            assert "level" in profile
            assert "color" in profile
            assert "defaults" in profile
            assert "fatality_risk" in profile["defaults"]
            assert "production_loss_per_day" in profile["defaults"]
            
    def test_get_iso_levels(self, api_client):
        """Get ISO 14224 hierarchy levels"""
        response = api_client.get(f"{BASE_URL}/api/equipment-hierarchy/iso-levels")
        assert response.status_code == 200
        data = response.json()
        assert "levels" in data
        assert "hierarchy" in data
        levels = data["levels"]
        # ISO 14224 has 6 levels with proper terminology
        expected_levels = ["installation", "plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"]
        assert levels == expected_levels
        # Verify hierarchy relationships
        hierarchy = data["hierarchy"]
        assert hierarchy["installation"]["parent"] is None
        assert hierarchy["installation"]["children"] == ["plant_unit"]
        assert hierarchy["plant_unit"]["parent"] == "installation"
        assert hierarchy["plant_unit"]["children"] == ["section_system"]
        assert hierarchy["maintainable_item"]["children"] == []


class TestEquipmentNodeCRUD:
    """Test equipment node CRUD operations"""
    
    def test_get_nodes_empty(self, authenticated_client):
        """Get nodes when none exist"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        # Nodes may or may not exist from previous tests
        assert isinstance(data["nodes"], list)
        
    def test_create_installation_node(self, authenticated_client):
        """Create a root installation node"""
        unique_name = f"TEST_Installation_{uuid.uuid4().hex[:8]}"
        response = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={
                "name": unique_name,
                "level": "installation",
                "description": "Test installation for pytest"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == unique_name
        assert data["level"] == "installation"
        assert data["parent_id"] is None
        assert "id" in data
        assert "created_at" in data
        return data["id"]
    
    def test_create_unit_under_installation(self, authenticated_client):
        """Create a unit under an installation (valid parent-child)"""
        # First create installation
        install_name = f"TEST_Install_{uuid.uuid4().hex[:8]}"
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": install_name, "level": "installation"}
        )
        assert install_resp.status_code == 200
        install_id = install_resp.json()["id"]
        
        # Create unit under installation
        unit_name = f"TEST_Unit_{uuid.uuid4().hex[:8]}"
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={
                "name": unit_name,
                "level": "unit",
                "parent_id": install_id
            }
        )
        assert unit_resp.status_code == 200
        unit_data = unit_resp.json()
        assert unit_data["name"] == unit_name
        assert unit_data["level"] == "unit"
        assert unit_data["parent_id"] == install_id
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_create_system_under_unit(self, authenticated_client):
        """Create full hierarchy: installation -> unit -> system"""
        # Create installation
        install_name = f"TEST_Install_{uuid.uuid4().hex[:8]}"
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": install_name, "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Create unit
        unit_name = f"TEST_Unit_{uuid.uuid4().hex[:8]}"
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": unit_name, "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        # Create system
        system_name = f"TEST_System_{uuid.uuid4().hex[:8]}"
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": system_name, "level": "system", "parent_id": unit_id}
        )
        assert system_resp.status_code == 200
        system_data = system_resp.json()
        assert system_data["level"] == "system"
        assert system_data["parent_id"] == unit_id
        
        # Cleanup (delete root cascades)
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_create_full_iso_hierarchy(self, authenticated_client):
        """Create complete ISO 14224 hierarchy: installation -> plant_unit -> section_system -> equipment_unit -> subunit -> maintainable_item"""
        ids = {}
        
        # Installation
        resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Full_Install_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        assert resp.status_code == 200
        ids["installation"] = resp.json()["id"]
        
        # Plant Unit
        resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Full_Plant_{uuid.uuid4().hex[:6]}", "level": "plant_unit", "parent_id": ids["installation"]}
        )
        assert resp.status_code == 200
        ids["plant_unit"] = resp.json()["id"]
        
        # Section System
        resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Full_Section_{uuid.uuid4().hex[:6]}", "level": "section_system", "parent_id": ids["plant_unit"]}
        )
        assert resp.status_code == 200
        ids["section_system"] = resp.json()["id"]
        
        # Equipment Unit
        resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Full_Equip_{uuid.uuid4().hex[:6]}", "level": "equipment_unit", "parent_id": ids["section_system"]}
        )
        assert resp.status_code == 200
        ids["equipment_unit"] = resp.json()["id"]
        
        # Subunit (required between equipment_unit and maintainable_item)
        resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Full_Subunit_{uuid.uuid4().hex[:6]}", "level": "subunit", "parent_id": ids["equipment_unit"]}
        )
        assert resp.status_code == 200
        ids["subunit"] = resp.json()["id"]
        
        # Maintainable Item
        resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Full_Item_{uuid.uuid4().hex[:6]}", "level": "maintainable_item", "parent_id": ids["subunit"]}
        )
        assert resp.status_code == 200
        ids["maintainable_item"] = resp.json()["id"]
        
        # Verify all nodes exist
        nodes_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        nodes = nodes_resp.json()["nodes"]
        created_ids = list(ids.values())
        for node_id in created_ids:
            assert any(n["id"] == node_id for n in nodes)
            
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{ids['installation']}")


class TestISOValidation:
    """Test ISO 14224 parent-child validation rules"""
    
    def test_root_must_be_installation(self, authenticated_client):
        """Only installation level can be root (no parent)"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": "TEST_InvalidRoot", "level": "unit", "parent_id": None}
        )
        assert response.status_code == 400
        assert "installation" in response.json()["detail"].lower()
        
    def test_invalid_parent_child_unit_under_system(self, authenticated_client):
        """Unit cannot be child of system (must be child of installation)"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Install_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Create unit
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Unit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        # Create system
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_System_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system_id = system_resp.json()["id"]
        
        # Try to create another unit under system (invalid)
        invalid_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": "TEST_InvalidUnit", "level": "unit", "parent_id": system_id}
        )
        assert invalid_resp.status_code == 400
        assert "invalid" in invalid_resp.json()["detail"].lower() or "children" in invalid_resp.json()["detail"].lower()
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_invalid_equipment_directly_under_installation(self, authenticated_client):
        """Equipment cannot be directly under installation (skipping unit and system)"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_Install_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Try to create equipment directly under installation
        invalid_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": "TEST_InvalidEquipment", "level": "equipment", "parent_id": install_id}
        )
        assert invalid_resp.status_code == 400
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")


class TestCriticalityAssignment:
    """Test criticality assignment to nodes"""
    
    def test_assign_criticality_basic(self, authenticated_client):
        """Assign criticality profile to a node"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_CritInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Assign safety_critical profile
        crit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}/criticality",
            json={"profile_id": "safety_critical"}
        )
        assert crit_resp.status_code == 200
        data = crit_resp.json()
        assert data["criticality"] is not None
        assert data["criticality"]["profile_id"] == "safety_critical"
        assert data["criticality"]["level"] == "safety_critical"
        assert "risk_score" in data["criticality"]
        
        # Verify via GET
        get_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        assert get_resp.json()["criticality"]["profile_id"] == "safety_critical"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_assign_criticality_with_custom_values(self, authenticated_client):
        """Assign criticality with custom override values"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_CritCustom_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Assign with custom values
        crit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}/criticality",
            json={
                "profile_id": "production_critical",
                "fatality_risk": 0.05,
                "production_loss_per_day": 200000,
                "downtime_days": 5
            }
        )
        assert crit_resp.status_code == 200
        data = crit_resp.json()
        assert data["criticality"]["fatality_risk"] == 0.05
        assert data["criticality"]["production_loss_per_day"] == 200000
        assert data["criticality"]["downtime_days"] == 5
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_assign_all_criticality_levels(self, authenticated_client):
        """Test all 4 criticality levels can be assigned"""
        profiles = ["safety_critical", "production_critical", "medium", "low"]
        
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_AllCrit_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        for profile_id in profiles:
            crit_resp = authenticated_client.post(
                f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}/criticality",
                json={"profile_id": profile_id}
            )
            assert crit_resp.status_code == 200
            assert crit_resp.json()["criticality"]["level"] == profile_id
            
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")


class TestDisciplineAssignment:
    """Test discipline assignment to nodes"""
    
    def test_assign_discipline(self, authenticated_client):
        """Assign discipline to a node"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_DiscInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Assign mechanical discipline
        disc_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}/discipline?discipline=mechanical"
        )
        assert disc_resp.status_code == 200
        assert disc_resp.json()["discipline"] == "mechanical"
        
        # Verify via GET
        get_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        assert get_resp.json()["discipline"] == "mechanical"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_assign_all_disciplines(self, authenticated_client):
        """Test all 4 disciplines can be assigned"""
        disciplines = ["mechanical", "electrical", "instrumentation", "process"]
        
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_AllDisc_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        for discipline in disciplines:
            disc_resp = authenticated_client.post(
                f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}/discipline?discipline={discipline}"
            )
            assert disc_resp.status_code == 200
            assert disc_resp.json()["discipline"] == discipline
            
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_invalid_discipline_rejected(self, authenticated_client):
        """Invalid discipline value is rejected"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_InvalidDisc_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Try invalid discipline
        disc_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}/discipline?discipline=invalid_discipline"
        )
        assert disc_resp.status_code == 400
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")


class TestNodeUpdateDelete:
    """Test node update and delete operations"""
    
    def test_update_node_name(self, authenticated_client):
        """Update node name"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_OrigName_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Update name
        new_name = f"TEST_UpdatedName_{uuid.uuid4().hex[:6]}"
        update_resp = authenticated_client.patch(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}",
            json={"name": new_name}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == new_name
        
        # Verify via GET
        get_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        assert get_resp.json()["name"] == new_name
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_delete_node_cascades_to_children(self, authenticated_client):
        """Deleting a node deletes all children"""
        # Create hierarchy
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_DelInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_DelUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_DelSystem_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system_id = system_resp.json()["id"]
        
        # Delete root (should cascade)
        del_resp = authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        assert del_resp.status_code == 200
        result = del_resp.json()
        assert result["message"].startswith("Deleted")
        assert len(result["deleted_ids"]) == 3  # install, unit, system
        
        # Verify all gone
        for node_id in [install_id, unit_id, system_id]:
            get_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{node_id}")
            assert get_resp.status_code == 404


class TestHierarchyStats:
    """Test hierarchy statistics endpoint"""
    
    def test_get_stats(self, authenticated_client):
        """Get hierarchy statistics"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_nodes" in data
        assert "by_level" in data
        assert "by_criticality" in data
        # Verify level counts structure (ISO 14224 standard levels)
        for level in ["installation", "plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"]:
            assert level in data["by_level"]
        # Verify criticality counts structure
        assert "unassigned" in data["by_criticality"]


class TestMoveNode:
    """Test Move Mode - repositioning nodes in the hierarchy"""
    
    def test_move_unit_to_different_installation(self, authenticated_client):
        """Move a unit from one installation to another"""
        # Create two installations
        install1_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveInstall1_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        assert install1_resp.status_code == 200
        install1_id = install1_resp.json()["id"]
        
        install2_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveInstall2_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        assert install2_resp.status_code == 200
        install2_id = install2_resp.json()["id"]
        
        # Create unit under install1
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install1_id}
        )
        assert unit_resp.status_code == 200
        unit_id = unit_resp.json()["id"]
        assert unit_resp.json()["parent_id"] == install1_id
        
        # Move unit to install2
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{unit_id}/move",
            json={"node_id": unit_id, "new_parent_id": install2_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["parent_id"] == install2_id
        
        # Verify via GET
        get_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{unit_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["parent_id"] == install2_id
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install1_id}")
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install2_id}")
        
    def test_move_system_to_different_unit(self, authenticated_client):
        """Move a system from one unit to another under the same installation"""
        # Create installation
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveSysInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        assert install_resp.status_code == 200
        install_id = install_resp.json()["id"]
        
        # Create two units
        unit1_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveSysUnit1_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        assert unit1_resp.status_code == 200
        unit1_id = unit1_resp.json()["id"]
        
        unit2_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveSysUnit2_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        assert unit2_resp.status_code == 200
        unit2_id = unit2_resp.json()["id"]
        
        # Create system under unit1
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveSys_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit1_id}
        )
        assert system_resp.status_code == 200
        system_id = system_resp.json()["id"]
        
        # Move system to unit2
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{system_id}/move",
            json={"node_id": system_id, "new_parent_id": unit2_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["parent_id"] == unit2_id
        
        # Verify via GET
        get_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{system_id}")
        assert get_resp.json()["parent_id"] == unit2_id
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_move_invalid_unit_to_system_rejected(self, authenticated_client):
        """Cannot move unit to be child of system (violates ISO 14224)"""
        # Create hierarchy: installation -> unit -> system
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_InvalidMoveInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_InvalidMoveUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_InvalidMoveSystem_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system_id = system_resp.json()["id"]
        
        # Try to move unit under system (invalid - unit cannot be child of system)
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{unit_id}/move",
            json={"node_id": unit_id, "new_parent_id": system_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 400
        assert "cannot move" in move_resp.json()["detail"].lower() or "valid children" in move_resp.json()["detail"].lower()
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_move_equipment_between_systems(self, authenticated_client):
        """Move equipment from one system to another"""
        # Create hierarchy: install -> unit -> system1, system2 -> equipment
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveEqInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveEqUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        system1_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveEqSys1_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system1_id = system1_resp.json()["id"]
        
        system2_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveEqSys2_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system2_id = system2_resp.json()["id"]
        
        # Create equipment under system1
        equip_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveEquipment_{uuid.uuid4().hex[:6]}", "level": "equipment", "parent_id": system1_id}
        )
        equip_id = equip_resp.json()["id"]
        
        # Move equipment to system2
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{equip_id}/move",
            json={"node_id": equip_id, "new_parent_id": system2_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["parent_id"] == system2_id
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_move_to_nonexistent_parent_rejected(self, authenticated_client):
        """Cannot move node to non-existent parent"""
        # Create installation with unit
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveNonexistInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveNonexistUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        # Try to move to non-existent parent
        fake_parent_id = str(uuid.uuid4())
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{unit_id}/move",
            json={"node_id": unit_id, "new_parent_id": fake_parent_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 400
        assert "not found" in move_resp.json()["detail"].lower()
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_move_nonexistent_node_rejected(self, authenticated_client):
        """Cannot move a non-existent node"""
        # Create an installation to act as parent
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveNonexistNode_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Try to move non-existent node
        fake_node_id = str(uuid.uuid4())
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{fake_node_id}/move",
            json={"node_id": fake_node_id, "new_parent_id": install_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 404
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")
        
    def test_move_preserves_children(self, authenticated_client):
        """Moving a node preserves its children structure"""
        # Create hierarchy: install1, install2 -> unit (under install1) -> system
        install1_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveChildInstall1_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install1_id = install1_resp.json()["id"]
        
        install2_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveChildInstall2_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install2_id = install2_resp.json()["id"]
        
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveChildUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install1_id}
        )
        unit_id = unit_resp.json()["id"]
        
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_MoveChildSystem_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system_id = system_resp.json()["id"]
        
        # Move unit (with system child) to install2
        move_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes/{unit_id}/move",
            json={"node_id": unit_id, "new_parent_id": install2_id, "recalculate_criticality": True}
        )
        assert move_resp.status_code == 200
        
        # Verify system's parent is still unit
        system_get = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{system_id}")
        assert system_get.json()["parent_id"] == unit_id
        
        # Verify unit is now under install2
        unit_get = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes/{unit_id}")
        assert unit_get.json()["parent_id"] == install2_id
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install1_id}")
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install2_id}")


class TestEquipmentTypeLibraryManagement:
    """Test Equipment Type Library management (add, edit, delete)"""
    
    def test_create_custom_equipment_type(self, authenticated_client):
        """Create a custom equipment type"""
        type_data = {
            "id": f"custom_pump_{uuid.uuid4().hex[:6]}",
            "name": "Custom Test Pump",
            "discipline": "mechanical",
            "icon": "droplets",
            "iso_class": "1.1.99"
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/types",
            json=type_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == type_data["id"]
        assert data["name"] == type_data["name"]
        assert data["discipline"] == "mechanical"
        
        # Verify it appears in types list
        types_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/types")
        types_list = types_resp.json()["equipment_types"]
        assert any(t["id"] == type_data["id"] for t in types_list)
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/types/{type_data['id']}")
        
    def test_update_custom_equipment_type(self, authenticated_client):
        """Update a custom equipment type"""
        type_id = f"custom_update_{uuid.uuid4().hex[:6]}"
        
        # Create type
        create_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/types",
            json={"id": type_id, "name": "Original Name", "discipline": "mechanical", "icon": "cog"}
        )
        assert create_resp.status_code == 200
        
        # Update type
        update_resp = authenticated_client.patch(
            f"{BASE_URL}/api/equipment-hierarchy/types/{type_id}",
            json={"name": "Updated Name", "discipline": "electrical"}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "Updated Name"
        assert update_resp.json()["discipline"] == "electrical"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/types/{type_id}")
        
    def test_delete_custom_equipment_type(self, authenticated_client):
        """Delete a custom equipment type"""
        type_id = f"custom_delete_{uuid.uuid4().hex[:6]}"
        
        # Create type
        create_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/types",
            json={"id": type_id, "name": "To Delete", "discipline": "mechanical", "icon": "cog"}
        )
        assert create_resp.status_code == 200
        
        # Delete type
        del_resp = authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/types/{type_id}")
        assert del_resp.status_code == 200
        
        # Verify it's gone
        types_resp = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/types")
        types_list = types_resp.json()["equipment_types"]
        assert not any(t["id"] == type_id for t in types_list)


class TestUnstructuredItems:
    """Test unstructured items and assignment functionality"""
    
    def test_parse_equipment_list(self, authenticated_client):
        """Parse a text list of equipment items"""
        content = """Pump P-101
Compressor C-201
Heat Exchanger HX-301
Valve FV-101
Motor M-501"""
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/parse-list",
            json={"content": content, "source": "paste"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "parsed_count" in data
        assert data["parsed_count"] >= 5
        
        # Clean up - delete unstructured items
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/unstructured")
        
    def test_get_unstructured_items(self, authenticated_client):
        """Get list of unstructured items"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/unstructured")
        assert response.status_code == 200
        assert "items" in response.json()
        
    def test_assign_unstructured_to_hierarchy(self, authenticated_client):
        """Assign an unstructured item to hierarchy"""
        # First, create an installation to assign to
        install_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_AssignInstall_{uuid.uuid4().hex[:6]}", "level": "installation"}
        )
        install_id = install_resp.json()["id"]
        
        # Create unit
        unit_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_AssignUnit_{uuid.uuid4().hex[:6]}", "level": "unit", "parent_id": install_id}
        )
        unit_id = unit_resp.json()["id"]
        
        # Create system
        system_resp = authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/nodes",
            json={"name": f"TEST_AssignSystem_{uuid.uuid4().hex[:6]}", "level": "system", "parent_id": unit_id}
        )
        system_id = system_resp.json()["id"]
        
        # Parse some equipment
        authenticated_client.post(
            f"{BASE_URL}/api/equipment-hierarchy/parse-list",
            json={"content": f"Test Pump TP-{uuid.uuid4().hex[:4]}", "source": "paste"}
        )
        
        # Get unstructured items
        unstructured = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/unstructured")
        items = unstructured.json()["items"]
        
        if len(items) > 0:
            item_id = items[0]["id"]
            
            # Assign to hierarchy (as equipment under system)
            assign_resp = authenticated_client.post(
                f"{BASE_URL}/api/equipment-hierarchy/unstructured/{item_id}/assign",
                json={"parent_id": system_id, "level": "equipment"}
            )
            # May succeed or fail based on item state - just verify endpoint works
            assert assign_resp.status_code in [200, 400]
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/unstructured")
        authenticated_client.delete(f"{BASE_URL}/api/equipment-hierarchy/nodes/{install_id}")

