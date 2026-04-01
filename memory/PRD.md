# AssetIQ / ThreatBase - Product Requirements Document

## Original Problem Statement
Full-stack platform for AI-powered reliability intelligence featuring causal analysis, FMEA libraries, task scheduling, and user management.

## Core Requirements
- Authentication with JWT
- Role-based access control (Owner, Admin, User, Custom roles)
- Equipment hierarchy management
- Threat/observation tracking
- Causal investigation engine
- Task planning and scheduling
- Form builder and submissions
- AI-powered risk analysis

## Tech Stack
- Frontend: React with React Query, Tailwind CSS, Shadcn/UI, Framer Motion
- Backend: FastAPI with Motor (async MongoDB driver)
- Database: MongoDB
- Storage: Emergent Object Storage
- AI: OpenAI GPT-5.2, OpenAI Whisper via Emergent LLM Key

---

## Changelog

### April 1, 2026 - Form Integration with Task Execution
**New Feature:**
1. ✅ **Form Opens When Executing Task** - When opening/executing a task that has a form template linked, the form fields automatically display in the task execution view

**Implementation:**
- Task templates can be linked to form templates via `form_template_id`
- When executing an ad-hoc task, form fields are fetched from the linked form template
- Form fields display with proper input types (numeric with min/max, dropdowns, text areas)
- Fixed stale `form_template_id` references in task plans

**Backend Changes:**
- `routes/my_tasks.py`: Added logic to fetch form_fields for ad-hoc tasks without plans (lines 287-305)
- `routes/my_tasks.py`: `execute_adhoc_plan()` now properly populates `form_fields`, `form_template_name`, `form_documents`
- Updated task plans with correct form_template_id references

**Files Modified:**
- `/app/backend/routes/my_tasks.py` - Added form field fetching for ad-hoc tasks

---

### April 1, 2026 - App-Wide Permission Enforcement
**Bug Fixes:**
1. ✅ **Permission System Fixed** - Fixed `PermissionsContext.js` calling non-existent `getMyPermissions()` (changed to `getMy()`)
2. ✅ **Nav Items Filtered by Permissions** - Navigation items now correctly show/hide based on user's role permissions
3. ✅ **Settings Menu Filtered by Permissions** - Settings dropdown items filtered based on feature access
4. ✅ **Direct URL Access Protection** - Users redirected to /dashboard when accessing routes they don't have permission for
5. ✅ **Missing Translation** - Added `nav.definitions` translation key for English and Dutch

**Permission Mapping:**
- `investigations` → /causal-engine, /investigations
- `equipment` → /definitions, /equipment-manager, /equipment
- `forms` → /forms
- `users` → /settings/user-management
- `settings` → /settings/criticality-definitions

**Test Results:**
- Viewer user (restricted) correctly sees limited nav items
- Owner user sees all nav items and settings
- Direct URL access properly redirects unauthorized users

**Files Modified:**
- `frontend/src/contexts/PermissionsContext.js` - Fixed API method name
- `frontend/src/contexts/LanguageContext.js` - Added nav.definitions translations

**Test Report:** `/app/test_reports/iteration_20.json` - 100% pass rate (6/6 permission tests)

### April 1, 2026 - Major Feature Improvements (7 Items)
**New Features:**
1. ✅ **Dashboard Form Submissions Widget** - Added widget showing last 10 form submissions with submitter, date, and status
2. ✅ **User Management Permissions Tab** - Moved Permissions to dedicated tab in User Management page
3. ✅ **AI Usage Logging** - Added `log_ai_usage()` helper to track all AI feature invocations

**Bug Fixes:**
4. ✅ **Form Designer Error Handling** - Added error states with retry buttons for failed API calls
5. ✅ **AI Causal Intelligence** - Improved error handling with specific messages for rate limits and config errors
6. ✅ **Feedback Mobile Click** - Made entire feedback card clickable with proper event propagation
7. ✅ **Missing Translations** - Added `recentFormSubmissions`, `noFormSubmissions` to LanguageContext

**Files Modified:**
- `frontend/src/pages/FormsPage.js` - Error states, retry buttons, fixed missing imports
- `frontend/src/pages/DashboardPage.js` - Added form submissions widget (4-column grid)
- `frontend/src/pages/SettingsUserManagementPage.js` - Added Users/Permissions tabs
- `frontend/src/pages/SettingsPermissionsPage.js` - Added `embedded` prop support
- `frontend/src/pages/FeedbackPage.js` - Made cards fully clickable
- `frontend/src/components/forms/formAPI.js` - Added error throwing for failed requests
- `frontend/src/components/CausalIntelligencePanel.jsx` - Improved error messages
- `backend/routes/ai_routes.py` - Added `log_ai_usage()` calls to AI endpoints
- `frontend/src/contexts/LanguageContext.js` - Added missing translations

**Test Report:** `/app/test_reports/iteration_19.json` - 100% pass rate (backend 9/9, frontend 7/7)

### April 1, 2026 - My Tasks Deletion Bug Fix
**Bug Fixes:**
1. ✅ Tasks/Actions Not Removed Instantly When Deleted
   - **Root Cause**: Frontend `deleteTask` API was only calling `/api/task-instances/{id}` for ALL deletions, but Actions require `/api/actions/{id}` endpoint
   - **Fix**: Updated `deleteTask` function to accept `isAction` parameter and route to correct endpoint
   - **Fix**: Updated `deleteMutation` to pass `source_type` info from task object
   - **Fix**: Updated `handleDeleteTask` to store full task object (not just id/name)
   - **Fix**: Extended `canDelete` logic to allow deletion of in_progress tasks OR any non-completed action
   - **Result**: Items now disappear from My Tasks list instantly after deletion

**Files Modified:**
- `frontend/src/pages/MyTasksPage.js`:
  - `deleteTask` API function now routes to `/api/actions/{id}` for actions, `/api/task-instances/{id}` for tasks
  - `deleteMutation` now passes `{ taskId, isAction }` and shows correct toast message type
  - `handleDeleteTask` stores full task object to preserve `source_type` for routing
  - Delete confirmation dialog shows "Delete Action" or "Delete Task" based on type
  - React Query invalidates `["actions"]` cache in addition to existing queries

**Test Report:** `/app/test_reports/iteration_18.json` - 100% pass rate (7/7 backend tests, all frontend Playwright tests passed)

### April 1, 2026 - AI Security Enhancements
**Security Features:**
1. ✅ Input Sanitization for AI Prompts
   - Created `/app/backend/services/ai_security_service.py`
   - Sanitizes all user-provided data before embedding in AI prompts
   - Detects and filters 30+ prompt injection patterns
   - Includes: instruction override, role hijacking, system message injection, delimiter injection

2. ✅ Rate Limiting
   - Added `slowapi` rate limiter to all AI endpoints (20/minute standard, 10/minute heavy)
   - Added rate limiting to auth endpoints (5/minute for login, password reset)
   - Prevents brute-force attacks and AI cost abuse

3. ✅ Token Limits
   - AI responses capped at 2000-2500 tokens per request type
   - Configured in `ai_risk_engine.py` TOKEN_LIMITS dict
   - Prevents excessive API costs

**Files Modified:**
- `backend/server.py` - Added rate limiter initialization
- `backend/routes/ai_routes.py` - Added rate limiting decorators to all 12 AI endpoints
- `backend/routes/auth.py` - Added rate limiting to auth endpoints
- `backend/ai_risk_engine.py` - Added sanitization and token limits
- `backend/services/ai_security_service.py` - NEW: Prompt injection detection and sanitization

### April 1, 2026 - Equipment Hierarchy Search Fix
**Bug Fixes:**
1. ✅ Equipment Search Now Returns Full Hierarchy
   - Fixed `/api/equipment-hierarchy/search` endpoint in `equipment.py`
   - Was failing because filter required `installation_id` field that nodes don't have
   - Now traces parent chain to verify equipment belongs to user's assigned installations
   - Returns full hierarchy path: `Tyromer > The Netherlands - Arnhem > Extruder System > ...`

2. ✅ Added Translations
   - Added `common.view` = "View" / "Bekijken"
   - Added `common.desktop` = "Desktop"
   - Added `common.mobile` = "Mobile" / "Mobiel"

### April 1, 2026 - Form Designer Fixes
**Bug Fixes:**
1. ✅ Field Type Sub-options
   - Added sub-options UI for all field types in `FormsPage.js`:
     - Numeric: Unit input + Threshold settings (warning/critical low/high)
     - Dropdown/Multi-select: Options list with Add Option button and Failure toggle
     - Range: Min/Max/Step number inputs
     - File/Image: Max file size (MB) and Allowed extensions inputs
     - Equipment: Hierarchy preview (5 levels) and test search input
   - Field type change now clears previous type's sub-options to prevent data contamination
   - Added color-coded sections (slate, blue, purple, green, indigo) for visual clarity

2. ✅ Upload Pending State
   - Enhanced upload state machine: idle → uploading (spinner) → success/error
   - Error state shows error message with retry button (RefreshCw icon)
   - Retry clears error and re-attempts upload
   - Remove button available when not actively uploading

3. ✅ Equipment Hierarchy in Form Designer
   - Added Equipment Selection Settings section for equipment field type
   - Shows hierarchy levels preview: Installation → System → Unit → Subunit → Equipment
   - Test search input verifies equipment data exists
   - Search results show equipment name, path, and level

**Tests Added:**
- `/app/backend/tests/test_form_designer.py` - 18 unit tests covering:
  - Field type sub-options validation
  - Form persistence with mixed field types
  - Equipment hierarchy data structure
  - Upload state transitions

### April 1, 2026 - Bug Fixes: Notification Clearing, Definitions Page & Causal Intelligence
**Bug Fixes:**
1. ✅ Notification Clearing
   - Added `dismissedNotifications` state to Layout.js (was used but never declared)
   - Users can now click "Clear" to dismiss notifications
   - Shows "Notifications cleared" message with "Show notifications" link to restore
   - Added translation keys: `notifications.clearAll`, `notifications.cleared`, `notifications.showAgain`

2. ✅ Definitions Page Desktop Installations
   - Fixed `/api/definitions/installations` endpoint to return ALL installations
   - Removed `created_by` filter that was excluding installations created by other users
   - Now matches behavior of `/api/equipment-hierarchy/installations`
   - Desktop users can now see and select installations in the dropdown

3. ✅ Causal Intelligence Display After Generation
   - Fixed rendering logic in `CausalIntelligencePanel.jsx`
   - Reordered conditions: check mutation pending first, then check for display data
   - `displayData` now correctly uses `generateMutation.data || causalData` 
   - Results now display immediately after AI analysis completes (no page reload needed)

### April 1, 2026 - Premium Animation System
**New Features:**
1. ✅ Framer Motion Animation System
   - Installed framer-motion v12.38.0
   - Created `/app/frontend/src/components/animations/` with reusable animation components
   - AnimatedLayout: Page transitions with fade + slide
   - AnimatedDrawer: Spring-animated sliding side menu
   - AnimatedModal: Scale + fade modal with backdrop blur
   - AnimatedButton: Micro-interactions (hover scale 1.03, tap scale 0.97)
   - AnimatedCard: Hover lift effect with shadow
   - AnimatedList: Staggered children animations
   - Animation constants with spring presets (snappy, smooth, gentle, bouncy)

2. ✅ Mobile Navigation Upgrade
   - Replaced static hamburger menu with AnimatedDrawer
   - Smooth slide-in from left with spring physics (stiffness: 260, damping: 30)
   - Semi-transparent backdrop with blur
   - Staggered menu item animations
   - Click outside to close

3. ✅ FAB Button Enhancement
   - Upgraded to motion.button with hover/tap animations
   - Scale up to 1.08 on hover with enhanced shadow
   - Scale down to 0.92 on tap

### March 31, 2026 - Custom Roles, Voice-to-Text & Navigation Improvements
**New Features:**
1. ✅ Custom Role Creation in Permission Manager
   - Backend: `POST /api/permissions/roles` creates custom roles with permissions copied from base role
   - Backend: `DELETE /api/permissions/roles/{role_name}` deletes custom roles (with user assignment check)
   - Frontend: "Create Role" dialog with role name, display name, description, and base role selector
   - Custom roles show "Custom" badge and have delete button
   
2. ✅ Voice-to-Text for Feedback
   - Backend: `POST /api/feedback/transcribe` using OpenAI Whisper via emergentintegrations
   - Frontend: Auto-transcription after recording stops, text added to message field
   - Supports WebM, MP3, WAV, and other audio formats (max 25MB)
   
3. ✅ Improved Navigation Behavior
   - BackButton now uses browser history (navigate(-1)) with fallback to dashboard
   - Checks window.history.length > 2 before using history navigation
   
4. ✅ Bulk Status Update in Feedback
   - Backend: `POST /api/feedback/bulk-status` for batch status updates
   - Frontend: "Bulk Status" dropdown in selection mode with status options
   - Options: Implemented, Resolved, In Review, Parked, Rejected

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

### P0 - Critical (Completed)
- [x] Fix "Analyse with AI" in Observations - DONE
- [x] Fix version management on Failure Modes - DONE (March 31, 2026)
- [x] Cascade delete for Investigations (optionally delete Actions) - DONE (March 31, 2026)
- [x] Cascade delete for Observations (optionally delete Actions & Investigations) - DONE (March 31, 2026)
- [x] Fix attaching files to forms (pending documents on new templates) - DONE (March 31, 2026)
- [x] Allow clearing notifications for user - DONE (April 1, 2026)
- [x] Fix Definitions page not showing installations on desktop - DONE (April 1, 2026)
- [x] Fix Causal Intelligence not displaying results after generation - DONE (April 1, 2026)
- [x] Fix My Tasks deletion not syncing UI instantly - DONE (April 1, 2026)

### P1 - High (Completed)
- [x] Equipment Manager restriction - only owner can add new installation - DONE (March 31, 2026)
- [x] Create Permissions page under User Management (Role-based Read/Write) - DONE (March 31, 2026)
- [x] Merge "Task Design" and "Plan" screens - DONE (March 31, 2026)
- [x] Allow voice recording for feedback - DONE (March 31, 2026)
- [x] Custom Role Creation in Permission Manager - DONE (March 31, 2026)
- [x] Voice-to-Text for Feedback - DONE (March 31, 2026)
- [x] Improve navigation behavior (browser history) - DONE (March 31, 2026)
- [x] Bulk Complete action in Feedback - DONE (March 31, 2026)

### P2 - Medium (Completed)
- [x] Implement report generation (PowerPoint/PDF) for Causal Investigations - DONE
- [x] Offline support with local storage for My Tasks execution - DONE
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
- `/app/backend/routes/permissions.py` - Custom role CRUD and permissions management
- `/app/backend/routes/definitions.py` - FMEA Definitions CRUD with installation-agnostic access
- `/app/backend/routes/feedback.py` - Feedback with audio transcription endpoint
- `/app/backend/tests/conftest.py` - Centralized test configuration
- `/app/backend/services/failure_modes_service.py` - Failure modes CRUD with versioning
- `/app/backend/scripts/seed_failure_modes.py` - Auto-seeds static library to MongoDB
- `/app/frontend/src/services/secureStorage.js` - Encrypted localStorage wrapper
- `/app/frontend/src/pages/SettingsPermissionsPage.js` - Role management with create/delete
- `/app/frontend/src/pages/FeedbackPage.js` - Feedback with voice-to-text transcription
- `/app/frontend/src/pages/DefinitionsPage.js` - FMEA SOD definitions with installation selector
- `/app/frontend/src/components/Layout.js` - Main layout with notification clearing
- `/app/frontend/src/components/BackButton.jsx` - Browser history navigation

### Security Considerations
- Test credentials loaded from environment variables
- localStorage data encrypted with AES-GCM via Web Crypto API
- Session-scoped encryption keys stored in sessionStorage
- Custom roles cannot override system roles

### AI Security (Added April 1, 2026)
- **Input Sanitization**: All user-provided data sanitized before AI prompts via `ai_security_service.py`
- **Prompt Injection Protection**: Detects and filters 30+ injection patterns (instruction override, role hijacking, system message injection)
- **Rate Limiting**: 
  - AI endpoints: 20 requests/minute per IP (standard), 10/minute (heavy operations like fault tree)
  - Auth endpoints: 5 requests/minute for login/password reset
- **Token Limits**: AI responses capped at 2000-2500 tokens per request type
- **All AI endpoints require authentication** via JWT token

### Deployment Requirements
- Health check endpoint: `GET /health` returns `{"status": "healthy"}`
- Backend runs on port 8001
- Frontend runs on port 3000
- MongoDB connection via MONGO_URL environment variable
- EMERGENT_LLM_KEY for AI features (GPT-5.2, Whisper)
