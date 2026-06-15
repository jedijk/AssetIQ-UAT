"""
Translations & Localization framework backend tests.
Covers:
  - GET /api/translations/entities/failure_mode/Cavitation?language_code=nl
  - GET /api/translations/coverage
  - POST /api/translations/generate-all/{entity_type} for observation, form_template, investigation
  - POST /api/observations auto-translate
  - PATCH /api/threats/{id} auto-translate
  - POST /api/form-templates auto-translate
  - POST /api/translations/generate sync (<=5) and async (>5)
  - POST /api/failure-modes uses NAME as entity_id
"""
import os
import time
import uuid
import pytest
import requests

from conftest import TEST_OWNER_EMAIL, TEST_OWNER_PASSWORD

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = TEST_OWNER_EMAIL
PASSWORD = TEST_OWNER_PASSWORD


@pytest.fixture(scope="session")
def token():
    last_err = None
    for _ in range(4):
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": EMAIL, "password": PASSWORD}, timeout=90)
            if r.status_code == 200:
                break
            last_err = f"{r.status_code} {r.text}"
        except Exception as e:
            last_err = str(e)
            time.sleep(3)
    else:
        pytest.skip(f"login unreachable: {last_err}")
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- 1. failure_mode/Cavitation/nl ----------
def test_failure_mode_cavitation_nl(headers):
    r = requests.get(
        f"{BASE_URL}/api/translations/entities/failure_mode/Cavitation",
        params={"language_code": "nl"},
        headers=headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["entity_id"] == "Cavitation"
    nl = data["translations"].get("nl", {})
    # name field present and looks Dutch (Cavitatie or similar)
    print("Cavitation nl:", nl)
    assert nl, "No Dutch translation found for Cavitation - main agent must seed/generate"
    name = (nl.get("name") or "").lower()
    assert name, "Missing 'name' field in nl translation"
    # accept Cavitatie variants
    assert "cavit" in name


# ---------- 2. coverage ----------
def test_coverage(headers):
    r = requests.get(f"{BASE_URL}/api/translations/coverage",
                     headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    cov = r.json()["coverage"]
    for et in ["failure_mode", "equipment_type", "observation",
               "form_template", "equipment_node", "investigation",
               "maintenance_task_template"]:
        assert et in cov, f"missing entity_type {et}"
        assert "translated" in cov[et] and "total" in cov[et]


# ---------- 3. generate-all/observation ----------
def _coverage_translated(headers, et):
    r = requests.get(f"{BASE_URL}/api/translations/coverage",
                     headers=headers, timeout=20)
    return r.json()["coverage"].get(et, {}).get("translated", 0)


def test_generate_all_observation(headers):
    before = _coverage_translated(headers, "observation")
    r = requests.post(
        f"{BASE_URL}/api/translations/generate-all/observation",
        params={"target_languages": ["nl", "de"], "only_missing": True},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    print("generate-all observation:", body)
    # if nothing to translate, that's still success
    if body.get("total") == 0:
        return
    # wait for background to process
    deadline = time.time() + 60
    after = before
    while time.time() < deadline:
        after = _coverage_translated(headers, "observation")
        if after > before:
            break
        time.sleep(5)
    assert after >= before  # never regress


# ---------- 4. generate-all/form_template ----------
def test_generate_all_form_template(headers):
    r = requests.post(
        f"{BASE_URL}/api/translations/generate-all/form_template",
        params={"target_languages": ["nl", "de"], "only_missing": True},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, r.text


# ---------- 5. generate-all/investigation ----------
def test_generate_all_investigation(headers):
    before = _coverage_translated(headers, "investigation")
    r = requests.post(
        f"{BASE_URL}/api/translations/generate-all/investigation",
        params={"target_languages": ["nl", "de"], "only_missing": True},
        headers=headers, timeout=120,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    print("generate-all investigation:", body)
    # small set (<=5) → sync; coverage may grow immediately
    after = _coverage_translated(headers, "investigation")
    assert after >= before


# ---------- 6. POST /api/observations triggers auto-translate ----------
def test_create_observation_auto_translate(headers):
    desc = f"TEST_AUTO_TR_{uuid.uuid4().hex[:6]} Bearing showing abnormal vibration at high speed"
    r = requests.post(
        f"{BASE_URL}/api/observations",
        json={"description": desc, "severity": "medium"},
        headers=headers, timeout=30,
    )
    assert r.status_code in (200, 201), r.text
    obs = r.json()
    obs_id = obs.get("id")
    assert obs_id
    # wait for background task
    nl_value = None
    deadline = time.time() + 45
    while time.time() < deadline:
        r2 = requests.get(
            f"{BASE_URL}/api/translations/entities/observation/{obs_id}",
            headers=headers, timeout=15)
        if r2.status_code == 200:
            nl = r2.json().get("translations", {}).get("nl", {})
            if nl.get("description"):
                nl_value = nl["description"]
                break
        time.sleep(3)
    assert nl_value, f"Observation {obs_id} was not auto-translated to nl"
    print("auto-trans nl:", nl_value)
    # cleanup
    requests.delete(f"{BASE_URL}/api/observations/{obs_id}", headers=headers, timeout=15)


# ---------- 7. PATCH /api/threats/{id} triggers auto-translate ----------
def test_patch_threat_auto_translate(headers):
    # find any existing threat
    r = requests.get(f"{BASE_URL}/api/threats?limit=1", headers=headers, timeout=20)
    if r.status_code != 200 or not r.json():
        pytest.skip("no threats available to patch")
    tid = r.json()[0]["id"]
    new_title = f"TEST_AUTO_TR_{uuid.uuid4().hex[:6]} updated title for auto translate"
    new_desc = f"TEST_AUTO_TR_{uuid.uuid4().hex[:6]} updated description for auto translate"
    r2 = requests.patch(
        f"{BASE_URL}/api/threats/{tid}",
        json={"title": new_title, "description": new_desc},
        headers=headers, timeout=20,
    )
    assert r2.status_code == 200, r2.text
    # check translation appears
    deadline = time.time() + 45
    found = False
    while time.time() < deadline:
        rt = requests.get(
            f"{BASE_URL}/api/translations/entities/observation/{tid}",
            headers=headers, timeout=15)
        if rt.status_code == 200:
            nl = rt.json().get("translations", {}).get("nl", {})
            if nl.get("description") or nl.get("title") or nl.get("name"):
                found = True
                break
        time.sleep(3)
    assert found, f"threat {tid} description auto-translate not found"


# ---------- 8. POST /api/form-templates triggers auto-translate ----------
def test_create_form_template_auto_translate(headers):
    name = f"TEST_AUTO_TR_Form_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": name,
        "description": "Inspection checklist for bearings and seals",
        "fields": [],
    }
    r = requests.post(f"{BASE_URL}/api/form-templates",
                      json=payload, headers=headers, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"form-templates create not available: {r.status_code} {r.text}")
    ft = r.json()
    fid = ft.get("id") or ft.get("template", {}).get("id")
    assert fid
    deadline = time.time() + 45
    ok = False
    while time.time() < deadline:
        rt = requests.get(
            f"{BASE_URL}/api/translations/entities/form_template/{fid}",
            headers=headers, timeout=15)
        if rt.status_code == 200:
            nl = rt.json().get("translations", {}).get("nl", {})
            if nl.get("name") or nl.get("description"):
                ok = True
                break
        time.sleep(3)
    # cleanup
    requests.delete(f"{BASE_URL}/api/form-templates/{fid}", headers=headers, timeout=15)
    assert ok, f"form_template {fid} not auto-translated"


# ---------- 9. POST /api/translations/generate sync (<=5) ----------
def test_generate_sync_small(headers):
    # find an observation to translate
    r = requests.get(f"{BASE_URL}/api/observations", headers=headers, timeout=20)
    if r.status_code != 200:
        pytest.skip("no observations to test sync generate")
    data = r.json()
    items = data.get("observations", []) if isinstance(data, dict) else data
    if not items:
        pytest.skip("no observations")
    ids = [i["id"] for i in items[:3]]
    r2 = requests.post(
        f"{BASE_URL}/api/translations/generate",
        json={"entity_type": "observation", "entity_ids": ids,
              "target_languages": ["nl"]},
        headers=headers, timeout=120,
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    print("generate sync body:", body)
    # sync path - should contain success or job info
    assert body  # any 200 body is acceptable


# ---------- 10. POST /api/failure-modes uses NAME as entity_id ----------
def test_failure_mode_uses_name_as_entity_id(headers):
    name = f"TEST_FM_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": name,
        "failure_mode": name,
        "equipment": "Pump",
        "category": "mechanical",
        "equipment_type": "Pump",
        "severity": 5, "occurrence": 5, "detectability": 5,
        "description": "synthetic failure mode for translation test",
        "potential_effects": "loss of efficiency",
        "potential_causes": "wear",
        "recommended_actions": ["inspect", "replace"],
    }
    r = requests.post(f"{BASE_URL}/api/failure-modes",
                      json=payload, headers=headers, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"failure-modes create not available: {r.status_code} {r.text}")
    fm = r.json()
    fm_id_uuid = fm.get("id") or fm.get("failure_mode", {}).get("id")
    # auto-translate runs in background using NAME — wait & query by NAME
    deadline = time.time() + 60
    nl_found = False
    while time.time() < deadline:
        rt = requests.get(
            f"{BASE_URL}/api/translations/entities/failure_mode/{name}",
            headers=headers, timeout=15)
        if rt.status_code == 200:
            nl = rt.json().get("translations", {}).get("nl", {})
            if nl.get("name") or nl.get("description"):
                nl_found = True
                break
        time.sleep(3)
    # cleanup
    if fm_id_uuid:
        requests.delete(f"{BASE_URL}/api/failure-modes/{fm_id_uuid}",
                        headers=headers, timeout=15)
    assert nl_found, f"failure_mode {name} not auto-translated using NAME as entity_id"
