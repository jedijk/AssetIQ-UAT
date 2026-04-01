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

### P1 - High (Completed)
- [x] Equipment Manager restriction - only owner can add new installation - DONE (March 31, 2026)
- [x] Create Permissions page under User Management (Role-based Read/Write) - DONE (March 31, 2026)
- [x] Merge "Task Design" and "Plan" screens - DONE (March 31, 2026)
- [x] Allow voice recording for feedback - DONE (March 31, 2026)
- [x] Custom Role Creation in Permission Manager - DONE (March 31, 2026)
- [x] Voice-to-Text for Feedback - DONE (March 31, 2026)
- [x] Improve navigation behavior (browser history) - DONE (March 31, 2026)
- [x] Bulk Complete action in Feedback - DONE (March 31, 2026)

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

### Deployment Requirements
- Health check endpoint: `GET /health` returns `{"status": "healthy"}`
- Backend runs on port 8001
- Frontend runs on port 3000
- MongoDB connection via MONGO_URL environment variable
- EMERGENT_LLM_KEY for AI features (GPT-5.2, Whisper)
