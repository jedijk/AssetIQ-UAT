"""
Test suite for Production Log Ingestion & History Builder feature.
Tests all endpoints: upload, detect-columns, parse-preview, ingest, jobs, entries, stats.
Owner-only access required.
"""
import pytest
import requests
import os
import io
import json
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "Jaap8019@"

# Sample CSV content for testing
SAMPLE_CSV = """timestamp,asset_id,status,temperature,pressure
2024-01-15 08:00:00,PUMP-001,running,45.2,120.5
2024-01-15 08:15:00,PUMP-001,shutdown,42.1,115.0
2024-01-15 08:30:00,PUMP-002,alarm,78.5,180.2
2024-01-15 08:45:00,PUMP-001,running,46.0,122.0
2024-01-15 09:00:00,PUMP-002,waste,55.3,140.1
"""

SAMPLE_CSV_NO_HEADER = """2024-01-15 10:00:00,MOTOR-001,normal,30.5,100.0
2024-01-15 10:15:00,MOTOR-001,error,35.2,105.5
"""


class TestProductionLogsAuth:
    """Test authentication and authorization for production logs endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_owner_token(self):
        """Get authentication token for owner user."""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Owner login failed: {response.status_code} - {response.text}")
    
    def test_stats_requires_auth(self):
        """Test that /stats endpoint requires authentication."""
        response = self.session.get(f"{BASE_URL}/api/production-logs/stats")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: /stats requires authentication")
    
    def test_jobs_requires_auth(self):
        """Test that /jobs endpoint requires authentication."""
        response = self.session.get(f"{BASE_URL}/api/production-logs/jobs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: /jobs requires authentication")
    
    def test_entries_requires_auth(self):
        """Test that /entries endpoint requires authentication."""
        response = self.session.get(f"{BASE_URL}/api/production-logs/entries")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: /entries requires authentication")


class TestProductionLogsOwnerAccess:
    """Test owner-only access to production logs endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with owner authentication."""
        self.session = requests.Session()
        # Login as owner
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Owner login failed: {response.status_code}")
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_stats_success(self):
        """Test GET /stats returns statistics for owner."""
        response = self.session.get(f"{BASE_URL}/api/production-logs/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total_entries" in data, "Missing total_entries in response"
        assert "unique_assets" in data, "Missing unique_assets in response"
        assert "events" in data, "Missing events in response"
        assert "jobs_total" in data, "Missing jobs_total in response"
        assert "jobs_completed" in data, "Missing jobs_completed in response"
        print(f"PASS: /stats returns valid data - {data['total_entries']} entries, {data['unique_assets']} assets")
    
    def test_get_jobs_success(self):
        """Test GET /jobs returns job list for owner."""
        response = self.session.get(f"{BASE_URL}/api/production-logs/jobs")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "jobs" in data, "Missing jobs in response"
        assert isinstance(data["jobs"], list), "jobs should be a list"
        print(f"PASS: /jobs returns {len(data['jobs'])} jobs")
    
    def test_get_entries_success(self):
        """Test GET /entries returns entries for owner."""
        response = self.session.get(f"{BASE_URL}/api/production-logs/entries")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "entries" in data, "Missing entries in response"
        assert "total" in data, "Missing total in response"
        assert "limit" in data, "Missing limit in response"
        assert "skip" in data, "Missing skip in response"
        print(f"PASS: /entries returns {data['total']} total entries")
    
    def test_get_entries_with_filters(self):
        """Test GET /entries with query filters."""
        # Test with event_type filter
        response = self.session.get(f"{BASE_URL}/api/production-logs/entries?event_type=normal&limit=10")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "entries" in data
        print(f"PASS: /entries with filters returns {len(data['entries'])} entries")


class TestProductionLogsUploadFlow:
    """Test the complete upload → detect → preview → ingest flow."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with owner authentication."""
        self.session = requests.Session()
        # Login as owner
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Owner login failed: {response.status_code}")
        token = response.json().get("token")
        self.auth_headers = {"Authorization": f"Bearer {token}"}
        self.job_id = None
    
    def test_upload_csv_file(self):
        """Test POST /upload with CSV file."""
        files = {
            'files': ('test_production_log.csv', io.BytesIO(SAMPLE_CSV.encode()), 'text/csv')
        }
        response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "job_id" in data, "Missing job_id in response"
        assert "files_uploaded" in data, "Missing files_uploaded in response"
        assert data["files_uploaded"] == 1, f"Expected 1 file uploaded, got {data['files_uploaded']}"
        self.job_id = data["job_id"]
        print(f"PASS: Upload successful - job_id: {self.job_id}")
        return data["job_id"]
    
    def test_upload_invalid_file_type(self):
        """Test POST /upload rejects invalid file types."""
        files = {
            'files': ('test.exe', io.BytesIO(b'invalid content'), 'application/octet-stream')
        }
        response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Invalid file type rejected")
    
    def test_detect_columns(self):
        """Test POST /detect-columns returns column info."""
        # First upload a file
        files = {
            'files': ('test_detect.csv', io.BytesIO(SAMPLE_CSV.encode()), 'text/csv')
        }
        upload_response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        job_id = upload_response.json()["job_id"]
        
        # Now detect columns
        form_data = {
            'job_id': job_id,
            'delimiter': ',',
            'has_header': 'true',
            'skip_rows': '0'
        }
        response = self.session.post(
            f"{BASE_URL}/api/production-logs/detect-columns",
            headers=self.auth_headers,
            data=form_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "columns" in data, "Missing columns in response"
        assert "sample_rows" in data, "Missing sample_rows in response"
        assert "suggestions" in data, "Missing suggestions in response"
        assert "timestamp" in data["columns"], "timestamp column not detected"
        assert "asset_id" in data["columns"], "asset_id column not detected"
        print(f"PASS: Detected columns: {data['columns']}")
        print(f"      Suggestions: {data['suggestions']}")
        
        # Cleanup - delete the job
        self.session.delete(f"{BASE_URL}/api/production-logs/jobs/{job_id}", headers=self.auth_headers)
        return job_id
    
    def test_parse_preview(self):
        """Test POST /parse-preview returns preview with stats."""
        # Upload file
        files = {
            'files': ('test_preview.csv', io.BytesIO(SAMPLE_CSV.encode()), 'text/csv')
        }
        upload_response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        job_id = upload_response.json()["job_id"]
        
        # Parse preview with template
        template = {
            "delimiter": ",",
            "has_header": True,
            "skip_rows": 0,
            "column_mapping": {
                "timestamp": "timestamp",
                "asset_id": "asset_id",
                "status": "status",
                "metric_columns": ["temperature", "pressure"]
            }
        }
        form_data = {
            'job_id': job_id,
            'template_json': json.dumps(template)
        }
        response = self.session.post(
            f"{BASE_URL}/api/production-logs/parse-preview",
            headers=self.auth_headers,
            data=form_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total_records" in data, "Missing total_records"
        assert "success_rate" in data, "Missing success_rate"
        assert "event_summary" in data, "Missing event_summary"
        assert "preview" in data, "Missing preview"
        
        # Verify event detection
        event_summary = data["event_summary"]
        assert "normal" in event_summary or "downtime" in event_summary or "alarm" in event_summary or "waste" in event_summary
        
        print(f"PASS: Preview - {data['total_records']} records, {data['success_rate']}% success rate")
        print(f"      Event summary: {event_summary}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/production-logs/jobs/{job_id}", headers=self.auth_headers)
        return job_id
    
    def test_full_ingest_flow(self):
        """Test complete flow: upload → detect → preview → ingest → verify."""
        # Step 1: Upload
        files = {
            'files': ('test_full_flow.csv', io.BytesIO(SAMPLE_CSV.encode()), 'text/csv')
        }
        upload_response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        job_id = upload_response.json()["job_id"]
        print(f"Step 1: Upload successful - job_id: {job_id}")
        
        # Step 2: Detect columns
        form_data = {
            'job_id': job_id,
            'delimiter': ',',
            'has_header': 'true',
            'skip_rows': '0'
        }
        detect_response = self.session.post(
            f"{BASE_URL}/api/production-logs/detect-columns",
            headers=self.auth_headers,
            data=form_data
        )
        assert detect_response.status_code == 200
        print(f"Step 2: Columns detected: {detect_response.json()['columns']}")
        
        # Step 3: Parse preview
        template = {
            "delimiter": ",",
            "has_header": True,
            "skip_rows": 0,
            "column_mapping": {
                "timestamp": "timestamp",
                "asset_id": "asset_id",
                "status": "status",
                "metric_columns": ["temperature", "pressure"]
            }
        }
        preview_response = self.session.post(
            f"{BASE_URL}/api/production-logs/parse-preview",
            headers=self.auth_headers,
            data={'job_id': job_id, 'template_json': json.dumps(template)}
        )
        assert preview_response.status_code == 200
        preview_data = preview_response.json()
        print(f"Step 3: Preview - {preview_data['total_records']} records")
        
        # Step 4: Ingest
        ingest_response = self.session.post(
            f"{BASE_URL}/api/production-logs/ingest",
            headers={**self.auth_headers, "Content-Type": "application/json"},
            json={"job_id": job_id, "confirm": True}
        )
        assert ingest_response.status_code == 200, f"Ingest failed: {ingest_response.text}"
        print(f"Step 4: Ingestion started")
        
        # Step 5: Wait for completion and verify
        time.sleep(2)  # Wait for async ingestion
        job_response = self.session.get(
            f"{BASE_URL}/api/production-logs/jobs/{job_id}",
            headers=self.auth_headers
        )
        assert job_response.status_code == 200
        job_data = job_response.json()
        print(f"Step 5: Job status: {job_data['status']}, ingested: {job_data.get('records_ingested', 0)}")
        
        # Verify entries were created
        entries_response = self.session.get(
            f"{BASE_URL}/api/production-logs/entries?limit=10",
            headers=self.auth_headers
        )
        assert entries_response.status_code == 200
        entries_data = entries_response.json()
        print(f"Step 6: Entries in DB: {entries_data['total']}")
        
        # Cleanup - delete job and ingested data
        delete_response = self.session.delete(
            f"{BASE_URL}/api/production-logs/jobs/{job_id}",
            headers=self.auth_headers
        )
        assert delete_response.status_code == 200
        print(f"Step 7: Cleanup - deleted job and {delete_response.json().get('deleted_records', 0)} records")
        
        print("PASS: Full ingest flow completed successfully")


class TestProductionLogsJobManagement:
    """Test job management endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with owner authentication."""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Owner login failed: {response.status_code}")
        token = response.json().get("token")
        self.auth_headers = {"Authorization": f"Bearer {token}"}
    
    def test_get_job_not_found(self):
        """Test GET /jobs/{job_id} returns 404 for non-existent job."""
        response = self.session.get(
            f"{BASE_URL}/api/production-logs/jobs/non-existent-job-id",
            headers=self.auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Non-existent job returns 404")
    
    def test_delete_job_not_found(self):
        """Test DELETE /jobs/{job_id} returns 404 for non-existent job."""
        response = self.session.delete(
            f"{BASE_URL}/api/production-logs/jobs/non-existent-job-id",
            headers=self.auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Delete non-existent job returns 404")
    
    def test_create_and_delete_job(self):
        """Test creating and deleting a job."""
        # Create job via upload
        files = {
            'files': ('test_delete.csv', io.BytesIO(SAMPLE_CSV.encode()), 'text/csv')
        }
        upload_response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        job_id = upload_response.json()["job_id"]
        
        # Verify job exists
        get_response = self.session.get(
            f"{BASE_URL}/api/production-logs/jobs/{job_id}",
            headers=self.auth_headers
        )
        assert get_response.status_code == 200
        job_data = get_response.json()
        assert job_data["id"] == job_id
        assert job_data["status"] == "uploaded"
        
        # Delete job
        delete_response = self.session.delete(
            f"{BASE_URL}/api/production-logs/jobs/{job_id}",
            headers=self.auth_headers
        )
        assert delete_response.status_code == 200
        
        # Verify job is deleted
        verify_response = self.session.get(
            f"{BASE_URL}/api/production-logs/jobs/{job_id}",
            headers=self.auth_headers
        )
        assert verify_response.status_code == 404
        
        print("PASS: Create and delete job flow works correctly")


class TestEventDetection:
    """Test event classification logic."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with owner authentication."""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Owner login failed: {response.status_code}")
        token = response.json().get("token")
        self.auth_headers = {"Authorization": f"Bearer {token}"}
    
    def test_event_classification(self):
        """Test that events are classified correctly based on status keywords."""
        # CSV with various status values to test classification
        test_csv = """timestamp,asset_id,status,value
2024-01-15 08:00:00,ASSET-001,running,100
2024-01-15 08:15:00,ASSET-001,shutdown,0
2024-01-15 08:30:00,ASSET-001,alarm high,150
2024-01-15 08:45:00,ASSET-001,waste detected,50
2024-01-15 09:00:00,ASSET-001,normal operation,100
"""
        # Upload
        files = {
            'files': ('test_events.csv', io.BytesIO(test_csv.encode()), 'text/csv')
        }
        upload_response = self.session.post(
            f"{BASE_URL}/api/production-logs/upload",
            headers=self.auth_headers,
            files=files
        )
        assert upload_response.status_code == 200
        job_id = upload_response.json()["job_id"]
        
        # Parse preview
        template = {
            "delimiter": ",",
            "has_header": True,
            "skip_rows": 0,
            "column_mapping": {
                "timestamp": "timestamp",
                "asset_id": "asset_id",
                "status": "status",
                "metric_columns": ["value"]
            }
        }
        preview_response = self.session.post(
            f"{BASE_URL}/api/production-logs/parse-preview",
            headers=self.auth_headers,
            data={'job_id': job_id, 'template_json': json.dumps(template)}
        )
        assert preview_response.status_code == 200
        data = preview_response.json()
        
        event_summary = data["event_summary"]
        print(f"Event classification results: {event_summary}")
        
        # Verify event types are detected
        # shutdown -> downtime, alarm -> alarm, waste -> waste, running/normal -> normal
        assert event_summary.get("downtime", 0) >= 1, "shutdown should be classified as downtime"
        assert event_summary.get("alarm", 0) >= 1, "alarm should be classified as alarm"
        assert event_summary.get("waste", 0) >= 1, "waste should be classified as waste"
        assert event_summary.get("normal", 0) >= 1, "running/normal should be classified as normal"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/production-logs/jobs/{job_id}", headers=self.auth_headers)
        
        print("PASS: Event classification works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
