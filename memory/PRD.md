# AssetIQ / ThreatBase - Product Requirements Document

## Original Problem Statement
Full-stack platform for AI-powered reliability intelligence featuring causal analysis, FMEA libraries, task scheduling, and user management.

## Core Requirements
- Authentication with JWT
- Role-based access control (Owner, Admin, User)
- Equipment hierarchy management
- Threat/observation tracking
- Causal investigation engine
- Task planning and scheduling
- Form builder and submissions
- AI-powered risk analysis

## Tech Stack
- Frontend: React with React Query, Tailwind CSS, Shadcn/UI
- Backend: FastAPI with Motor (async MongoDB driver)
- Database: MongoDB
- Storage: Emergent Object Storage
- AI: OpenAI GPT-5.2 via Emergent LLM Key

---

## Changelog

### March 31, 2026 - Cascade Delete & Form Attachments
**Improvements:**
1. ✅ Investigation delete now optionally deletes linked Central Actions
   - Added checkbox in delete dialog: "Also delete linked Actions"
   - DELETE endpoint accepts `?delete_central_actions=true` parameter
2. ✅ Observation/Threat delete now optionally deletes linked Actions and Investigations
   - Added two checkboxes: "Also delete linked Investigations", "Also delete linked Actions"
   - DELETE endpoint accepts `?delete_actions=true&delete_investigations=true` parameters
3. ✅ Fixed file attachment upload for new form templates
   - Pending documents are now uploaded after template creation in `FormsPage.js`
4. ✅ Equipment Manager restriction - only owner can add installations
   - Backend: Added role check in `create_equipment_node` endpoint
   - Frontend: Hidden "Add Installation" button for non-owners in `EquipmentManagerPage.js`
5. ✅ Permissions Management page created at `/settings/permissions`
   - Backend: New `/api/permissions` routes for CRUD operations on role-based permissions
   - Frontend: Full UI with role tabs, feature matrix, Read/Write/Delete toggles
   - Default permissions for 6 roles: owner, admin, reliability_engineer, maintenance, operations, viewer
   - Stored in MongoDB `permissions` collection, with reset-to-defaults option
6. ✅ Merged "Task Design" and "Plan" screens into unified "Task Library"
   - Removed separate "Plans" tab from TaskSchedulerPage
   - Each task design card now shows its associated plans with expandable section
   - Plans can be created/edited/deleted inline from task cards
   - Added "New Plan" button and "Create Plan for this Task" action
7. ✅ Voice recording for feedback
   - Added MediaRecorder-based audio capture in FeedbackPage
   - Users can record, play back, and clear voice messages
   - Audio saved as base64 WebM and stored via object storage
   - Full translations for English and Dutch

### March 31, 2026 - Failure Mode Versioning Fix
**Critical Fix:**
1. ✅ Fixed Failure Mode version management - `isoformat()` error on datetime/string serialization
   - Added `safe_isoformat()` helper in `failure_modes_service.py` to handle both datetime and string values
   - Version history dialog now displays correctly with change diffs
   - Rollback/Restore functionality working
   - Auto-seed failure modes from static library on startup via `seed_failure_modes.py`

### March 31, 2026 - Code Quality & Deployment Fix
**Critical Fixes:**
1. ✅ Added `/health` endpoint to `server.py` - ROOT CAUSE of deployment failures
2. ✅ Removed hardcoded secrets from 6 test files, centralized in `conftest.py`
3. ✅ Created `secureStorage.js` with AES-GCM encryption for localStorage
4. ✅ Fixed 3 bare `except` clauses in backend services
5. ✅ Fixed React array index keys in FailureModesPage and MyTasksPage
6. ✅ Fixed "Analyse with AI" access control in Observations (removed strict created_by filters)

**Previous Session Fixes (March 30-31):**
- ✅ Database Null ID Cleanup (fix_null_ids.py)
- ✅ Password Reset error handling
- ✅ Failure Mode full-screen view
- ✅ Validation avatar rendering
- ✅ Form Builder discipline mapping
- ✅ Mobile UI menu position
- ✅ Feedback button prominence
- ✅ Login error handling improvements

---

## Prioritized Backlog

### P0 - Critical (Current Sprint)
- [x] Fix "Analyse with AI" in Observations - DONE
- [x] Fix version management on Failure Modes - DONE (March 31, 2026)
- [x] Cascade delete for Investigations (optionally delete Actions) - DONE (March 31, 2026)
- [x] Cascade delete for Observations (optionally delete Actions & Investigations) - DONE (March 31, 2026)
- [x] Fix attaching files to forms (pending documents on new templates) - DONE (March 31, 2026)

### P1 - High (User's Priority List)
- [x] Equipment Manager restriction - only owner can add new installation - DONE (March 31, 2026)
- [x] Create Permissions page under User Management (Role-based Read/Write) - DONE (March 31, 2026)
- [x] Merge "Task Design" and "Plan" screens - DONE (March 31, 2026)
- [x] Allow voice recording for feedback - DONE (March 31, 2026)

### P2 - Medium
- [ ] Implement report generation (PowerPoint/PDF) for Causal Investigations
- [ ] Offline support with local storage for My Tasks execution
- [ ] Form execution flow in mobile My Tasks
- [ ] Bulk criticality assignment for equipment

### P3 - Low (Refactoring)
- [ ] Component refactoring: CausalEnginePage (1,905 lines)
- [ ] Component refactoring: ChatSidebar (833 lines)
- [ ] Component refactoring: ActionsPage (1,270 lines)
- [ ] Fix remaining React hook dependency warnings (97 total)
- [ ] Refactor TaskExecutionFrame extraction
- [ ] Add type hints to backend files with 0% coverage

---

## Architecture Notes

### Key Files
- `/app/backend/server.py` - Main FastAPI entry point with /health endpoint
- `/app/backend/tests/conftest.py` - Centralized test configuration
- `/app/backend/services/failure_modes_service.py` - Failure modes CRUD with versioning
- `/app/backend/scripts/seed_failure_modes.py` - Auto-seeds static library to MongoDB
- `/app/frontend/src/services/secureStorage.js` - Encrypted localStorage wrapper
- `/app/frontend/src/pages/FailureModesPage.js` - FMEA library with version history dialog

### Security Considerations
- Test credentials loaded from environment variables
- localStorage data encrypted with AES-GCM via Web Crypto API
- Session-scoped encryption keys stored in sessionStorage

### Deployment Requirements
- Health check endpoint: `GET /health` returns `{"status": "healthy"}`
- Backend runs on port 8001
- Frontend runs on port 3000
- MongoDB connection via MONGO_URL environment variable
