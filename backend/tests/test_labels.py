"""
Smart Labeling System (Sprint 1) - Backend API tests
Covers: presets, template CRUD, duplicate, archive, preview, print, jobs.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "Jaap8019@"


@pytest.fixture(scope="module")
def token():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------- Presets ----------
class TestPresets:
    def test_presets_shape(self, client):
        r = client.get(f"{BASE_URL}/api/labels/presets")
        assert r.status_code == 200
        data = r.json()
        assert len(data["presets"]) == 4
        keys = {p["key"] for p in data["presets"]}
        assert keys == {"standard", "compact", "qr_only", "with_logo"}
        assert len(data["asset_fields"]) == 9


# ---------- Template CRUD ----------
class TestTemplateCRUD:
    def test_list_templates(self, client):
        r = client.get(f"{BASE_URL}/api/labels/templates")
        assert r.status_code == 200
        assert "templates" in r.json()

    def test_list_with_status_filter(self, client):
        r = client.get(f"{BASE_URL}/api/labels/templates?status=draft")
        assert r.status_code == 200
        for t in r.json()["templates"]:
            assert t["status"] == "draft"

    def test_create_default_template(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Default"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["version"] == 1
        assert d["status"] == "draft"
        assert d["preset"] == "standard"
        assert "id" in d
        # cleanup
        client.delete(f"{BASE_URL}/api/labels/templates/{d['id']}")

    @pytest.mark.parametrize("preset", ["standard", "compact", "qr_only", "with_logo"])
    def test_create_all_presets(self, client, preset):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": f"TEST_{preset}", "preset": preset})
        assert r.status_code == 200, r.text
        assert r.json()["preset"] == preset
        client.delete(f"{BASE_URL}/api/labels/templates/{r.json()['id']}")

    def test_get_template(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Get"})
        tid = r.json()["id"]
        g = client.get(f"{BASE_URL}/api/labels/templates/{tid}")
        assert g.status_code == 200
        assert g.json()["id"] == tid
        client.delete(f"{BASE_URL}/api/labels/templates/{tid}")

    def test_update_template_increments_version(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Update"})
        tid = r.json()["id"]
        u = client.put(f"{BASE_URL}/api/labels/templates/{tid}",
                       json={"name": "TEST_Update_v2", "status": "published",
                             "field_bindings": [{"source": "asset_id"}]})
        assert u.status_code == 200
        d = u.json()
        assert d["version"] == 2
        assert d["name"] == "TEST_Update_v2"
        assert d["status"] == "published"
        assert d["updated_at"] != r.json()["updated_at"]
        client.delete(f"{BASE_URL}/api/labels/templates/{tid}")

    def test_update_nonexistent_returns_404(self, client):
        r = client.put(f"{BASE_URL}/api/labels/templates/does-not-exist", json={"name": "x"})
        assert r.status_code == 404

    def test_duplicate_template(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Dup", "status": "published"})
        tid = r.json()["id"]
        # bump version first
        client.put(f"{BASE_URL}/api/labels/templates/{tid}", json={"name": "TEST_Dup2"})
        d = client.post(f"{BASE_URL}/api/labels/templates/{tid}/duplicate")
        assert d.status_code == 200
        dd = d.json()
        assert dd["id"] != tid
        assert "(copy)" in dd["name"]
        assert dd["status"] == "draft"
        assert dd["version"] == 1
        client.delete(f"{BASE_URL}/api/labels/templates/{tid}")
        client.delete(f"{BASE_URL}/api/labels/templates/{dd['id']}")

    def test_delete_soft_archives(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Arch"})
        tid = r.json()["id"]
        d = client.delete(f"{BASE_URL}/api/labels/templates/{tid}")
        assert d.status_code == 200
        # Default list should exclude archived
        lst = client.get(f"{BASE_URL}/api/labels/templates").json()["templates"]
        assert tid not in [t["id"] for t in lst]
        # But it still exists with status archived
        g = client.get(f"{BASE_URL}/api/labels/templates/{tid}")
        assert g.status_code == 200
        assert g.json()["status"] == "archived"
        # Archived filter returns it
        arch = client.get(f"{BASE_URL}/api/labels/templates?status=archived").json()["templates"]
        assert tid in [t["id"] for t in arch]


# ---------- Preview ----------
class TestPreview:
    def test_preview_with_template_id(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Prev"})
        tid = r.json()["id"]
        p = client.post(f"{BASE_URL}/api/labels/preview", json={"template_id": tid})
        assert p.status_code == 200
        assert p.headers["content-type"].startswith("application/pdf")
        assert p.content[:4] == b"%PDF"
        client.delete(f"{BASE_URL}/api/labels/templates/{tid}")

    def test_preview_with_inline_template(self, client):
        p = client.post(f"{BASE_URL}/api/labels/preview", json={
            "template": {"name": "inline", "preset": "compact",
                         "field_bindings": [{"source": "asset_name"}]}
        })
        assert p.status_code == 200
        assert p.content[:4] == b"%PDF"

    def test_preview_sample_data_merges(self, client):
        p = client.post(f"{BASE_URL}/api/labels/preview", json={
            "template": {"name": "inline"},
            "sample_data": {"asset_id": "OVR-1", "asset_name": "Override"}
        })
        assert p.status_code == 200
        assert p.content[:4] == b"%PDF"

    def test_preview_404_missing_template_id(self, client):
        r = client.post(f"{BASE_URL}/api/labels/preview", json={"template_id": "missing-id"})
        assert r.status_code == 404

    def test_preview_400_no_template(self, client):
        r = client.post(f"{BASE_URL}/api/labels/preview", json={})
        assert r.status_code == 400

    def test_preview_custom_url_qr(self, client):
        r = client.post(f"{BASE_URL}/api/labels/preview", json={
            "template": {
                "name": "custom_qr",
                "qr_config": {"target_type": "custom_url", "custom_url": "https://x.io/{asset_id}"}
            }
        })
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_preview_custom_binding_with_value(self, client):
        r = client.post(f"{BASE_URL}/api/labels/preview", json={
            "template": {
                "name": "custom_bind",
                "preset": "compact",
                "field_bindings": [{"source": "custom", "label": "Lot", "value": "LOT-XYZ"}]
            }
        })
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ---------- Print & Jobs ----------
class TestPrintAndJobs:
    def test_print_empty_asset_ids_with_copies(self, client):
        r = client.post(f"{BASE_URL}/api/labels/templates", json={"name": "TEST_Print"})
        tid = r.json()["id"]
        p = client.post(f"{BASE_URL}/api/labels/print", json={
            "template_id": tid, "asset_ids": [], "copies": 3
        })
        assert p.status_code == 200
        assert p.headers["content-type"].startswith("application/pdf")
        assert p.content[:4] == b"%PDF"
        assert "inline" in p.headers.get("content-disposition", "").lower()
        assert p.headers.get("X-Print-Job-Id")

        # verify job recorded
        jobs = client.get(f"{BASE_URL}/api/labels/jobs").json()["jobs"]
        assert len(jobs) > 0
        latest = jobs[0]
        assert latest["template_id"] == tid
        # qty = len(datasets)*copies; with empty asset_ids datasets falls back to [SAMPLE] so qty=3
        assert latest["qty"] == 3
        assert latest["user_name"]
        client.delete(f"{BASE_URL}/api/labels/templates/{tid}")

    def test_jobs_sorted_desc(self, client):
        r = client.get(f"{BASE_URL}/api/labels/jobs?limit=10")
        assert r.status_code == 200
        jobs = r.json()["jobs"]
        times = [j["created_at"] for j in jobs]
        assert times == sorted(times, reverse=True)
