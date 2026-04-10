# AssetIQ / ThreatBase - Product Requirements Document

## Original Problem Statement
Full-stack platform for AI-powered reliability intelligence featuring causal analysis, FMEA libraries, task scheduling, and user management.

---

### April 10, 2026 - Quick Form View Redesign Fix (COMPLETED)
**BUG FIX - Fixed Quick Form View dialog rendering errors:**

**Problem:**
- The Quick Form View dialog code had syntax errors and duplicate JSX blocks
- Missing icon imports (`ArrowLeft`, `ArrowRight`, `Check`, `CheckSquare`, `Lightbulb`, `Settings`, `Sparkles`) caused runtime errors
- Dialog was crashing with "Unexpected token, expected '}'" and "ArrowLeft is not defined" errors

**Solution:**
1. **Removed duplicate orphaned JSX code** (lines 1618-1629) that was left after a previous edit
2. **Added all missing lucide-react icon imports** to DashboardPage.js

**Files Modified:**
- `/app/frontend/src/pages/DashboardPage.js` - Syntax fix + icon imports

**Quick Form View Features:**
- Modern header with back arrow and assetIQ branding
- Form submission details (title, status, submitter, date)
- Info grid: Submitted by, Equipment, Task, Discipline
- Checklist with PASS/FAIL/WARNING badges
- AI-generated Insights summary
- AI Recommendation box
- Attachments with View Full/Download buttons
- Notes section
- Footer: Close, Export, View All Submissions buttons

---


### April 9, 2026 - Form Designer Document Viewer Fix (COMPLETED)
**BUG FIX - Fixed Form Designer document viewing with MongoDB storage:**

**Problem:**
- DocumentViewer was timing out when loading documents (~25s+ hang)
- Old documents uploaded before MongoDB migration were not migrated
- Storage service had overly long timeouts (120s socket timeout)

**Solution:**
1. **Reduced storage service timeouts** (`/app/backend/services/storage_service.py`)
   - Socket timeout: 120s → 30s
   - Server selection timeout: 30s → 10s
   - Connect timeout: 30s → 10s

2. **Added explicit timeout handling in `get_object_async()`**:
   - 10 second timeout for DB connection
   - 15 second timeout for the actual query
   - Returns 404 quickly for missing files instead of hanging

3. **Updated migration script** to include `form_templates.documents`:
   - Script now scans `form_templates` collection for document references
   - Migrates form designer documents alongside other attachments

**Current State:**
- ✅ Newly uploaded documents work correctly (~1s fetch time)
- ✅ Missing documents show proper error ("Document not found") in ~15s
- ⚠️ Old documents from before migration need to be re-uploaded

**Files Modified:**
- `/app/backend/services/storage_service.py` - Timeout improvements
- `/app/backend/scripts/migrate_to_mongodb_storage.py` - Added form_templates.documents

---


### April 9, 2026 - MongoDB File Storage Migration (COMPLETED)
**FEATURE - Migrated file storage from Emergent Object Storage to MongoDB:**

**Problem:**
- The app was dependent on Emergent Object Storage for file attachments
- On Railway/Vercel deployments, the `EMERGENT_LLM_KEY` was required for file access
- Users wanted to be independent of external storage dependencies

**Solution:**
1. **Implemented MongoDB-based file storage** (`/app/backend/services/storage_service.py`)
   - Files stored directly in MongoDB's `file_storage` collection as base64
   - No external dependencies - works on any deployment
   - Dedicated MongoDB connection with extended timeouts (120s) for large files
   - Async-first API with sync wrappers for backward compatibility

2. **Updated all storage endpoints to use MongoDB:**
   - `/api/storage/{path}` - Main file serving endpoint
   - `/api/tasks/upload-attachment` - Task attachments
   - `/api/form-templates/{id}/documents` - Form document uploads
   - `/api/form-documents/{path}` - Form document retrieval
   - `/api/investigations/{id}/files` - Investigation evidence
   - `/api/users/{id}/avatar` - User avatars

3. **Extended server timeout middleware** for file downloads:
   - Default timeout: 25 seconds
   - Storage/avatar endpoints: 120 seconds

4. **Added `file_storage` collection indexes**:
   - `path` (unique)
   - `created_at`
   - `content_type`

5. **Created migration script** (`/app/backend/scripts/migrate_to_mongodb_storage.py`)
   - Migrates existing files from Emergent storage to MongoDB
   - Run once on deployment to move existing files

**Files Modified:**
- `/app/backend/services/storage_service.py` - Complete rewrite for MongoDB storage
- `/app/backend/routes/assets.py` - Updated to use async MongoDB operations
- `/app/backend/routes/tasks.py` - Updated attachment upload
- `/app/backend/routes/forms.py` - Updated document upload/download
- `/app/backend/routes/investigations.py` - Updated evidence file handling
- `/app/backend/routes/users.py` - Updated avatar upload/retrieval
- `/app/backend/server.py` - Extended timeout for storage endpoints

**Performance:**
- Small files (<500KB): ~5-6 seconds
- Medium files (500KB-1MB): ~10-15 seconds
- Large files (>2MB): ~30-40 seconds

**Note:** Large file retrieval time is due to MongoDB network latency for base64 decoding. For production with high file volumes, consider GridFS or dedicated object storage.

---



### April 9, 2026 - Database Performance Optimization (COMPLETED)
**OPTIMIZATION - Speed optimization via database indexing and query caching:**

**Changes Applied:**
1. **Added 58 new database indexes** covering previously unindexed collections:
   - `qr_codes`: 8 indexes (id, equipment_id, status, created_at, installation_name, total_scans, compound indexes)
   - `decision_rules`: 4 indexes (rule_type, is_active, priority, created_at)
   - `decision_suggestions`: 4 indexes (rule_id, threat_id, status, created_at)
   - `failure_identifications`: 5 indexes (id, observation_id, failure_mode_id, equipment_id, created_at)
   - `failure_mode_versions`: 4 indexes (failure_mode_id, version, created_at, compound)
   - `maintenance_strategies`: 4 indexes (id, equipment_type_id, failure_mode_id, strategy_type)
   - `security_audit_log`: 6 indexes (timestamp, user_id, action, resource_type, compound indexes)
   - `custom_equipment_types`: 3 indexes (id, discipline, installation_name)
   - `adhoc_plans`: 6 indexes (task_template_id, equipment_id, installation_name, is_active, created_at)
   - `ai_usage`: 4 indexes (user_id, timestamp, model, feature, compound)
   - Additional indexes for `task_instances` and `form_submissions`

2. **Added in-memory caching for Failure Modes API**:
   - Implemented 5-minute TTL cache for unfiltered failure modes queries
   - Cache is invalidated on create/update/delete/validate/rollback operations
   - First request: ~7 seconds (cold), subsequent requests: ~0.3 seconds (cached)

3. **Optimized Failure Modes Query**:
   - Changed sequential count + fetch to parallel `asyncio.gather()` execution
   - Improved response time by ~40% for filtered queries

**Performance Results:**
- Total custom indexes: 242 across 36 collections
- `/api/failure-modes` cached response time: ~0.3 seconds (was ~1.2 seconds)
- Database ping latency: ~114ms (normal for cloud MongoDB)

**Files Modified:**
- `/app/backend/scripts/create_indexes.py` - Added 13 new collection index definitions
- `/app/backend/services/failure_modes_service.py` - Added TTL cache, parallel query execution, cache invalidation

---



### April 9, 2026 - QR Code Dialog Viewability Fix (COMPLETED)
**BUG FIX - QR Code dialog fields overflowing outside window on desktop:**

**Issue:**
- QR Code configuration dialog content exceeded viewport height when QR was generated
- Form fields (label, actions, print options) were cut off and inaccessible

**Fix Applied:**
- Added `max-h-[85vh] flex flex-col` to `DialogContent` - limits height to 85% viewport
- Added `flex-shrink-0` to `DialogHeader` and `DialogFooter` - keeps header/footer fixed
- Added `overflow-y-auto flex-1 pr-1` to main content div - enables scrolling for content
- Added `pt-4 border-t` to `DialogFooter` - visual separation when content scrolls

**File Modified:**
- `/app/frontend/src/components/equipment/QRCodeDialog.js`

---

### April 9, 2026 - Settings Page Viewability Fix (COMPLETED)
**BUG FIX - Settings page not using full viewport and incorrect height calculation:**

**Issue:**
- Settings page height calculation used wrong header height (64px instead of 48px)
- Content area was constrained by `max-w-5xl` limiting use of full screen
- Sidebar was narrower than optimal

**Fix Applied:**
- Fixed height from `h-[calc(100vh-64px)]` to `h-[calc(100vh-48px)]` (header is 48px/h-12)
- Increased sidebar width from `w-64 xl:w-72` to `w-72 xl:w-80` for better readability
- Removed `max-w-5xl` constraint on content panel - now uses full available width

**File Modified:**
- `/app/frontend/src/pages/SettingsPage.js`

---

### April 9, 2026 - Desktop Settings Page (COMPLETED)
**FEATURE - Full-page Settings interface replacing dropdown menu:**

**Implemented:**
- ✅ **SettingsPage.js** - Main settings layout with sidebar + content panel
  - Left sidebar with 12 navigation sections
  - Icons and descriptions for each section
  - Active section highlighting
  - Back button to dashboard
  - Role-based section visibility (owner/admin/engineer/technician)
  - "owner access level" footer indicator
  
- ✅ **SettingsGeneralPage.js** - General preferences section
  - Language selection
  - Timezone configuration
  - Date/Time format options
  - Theme settings (light/dark/system)
  - Notification preferences
  
- ✅ **SettingsQRPage.js** - QR Code management dashboard
  - Stats cards (total, active, inactive, scans)
  - QR codes table with search and filter
  - Bulk selection and actions
  - Print with template selection
  - Export as ZIP/CSV
  - View details dialog

**Behavior:**
- Desktop (>1024px): Gear icon navigates to /settings (full page)
- Mobile (<1024px): Gear icon shows dropdown menu (existing behavior)

**Files Created:**
- `/app/frontend/src/pages/SettingsPage.js`
- `/app/frontend/src/pages/SettingsGeneralPage.js`
- `/app/frontend/src/pages/SettingsQRPage.js`

**Files Modified:**
- `/app/frontend/src/App.js` - Added nested settings routes
- `/app/frontend/src/components/Layout.js` - Desktop navigation to /settings

---

### April 9, 2026 - QR Code Management Module (COMPLETED)
**FEATURE - Complete QR Code generation, assignment, and print/export system:**

**Backend Implementation:**
- ✅ `/api/qr/generate` - Generate single QR code with optional hierarchy linking
- ✅ `/api/qr/generate-bulk` - Bulk QR generation for multiple equipment items
- ✅ `/api/qr/list` - List all QR codes with filtering
- ✅ `/api/qr/{qr_id}` - Get QR code details with image
- ✅ `/api/qr/{qr_id}/image` - Direct QR image endpoint (PNG/SVG)
- ✅ `/api/qr/resolve/{qr_id}` - Scan resolution with action menu
- ✅ `/api/qr/print` - PDF generation with templates (single, A4 2x2, 3x3, 4x5)
- ✅ `/api/qr/export` - Export as PNG, SVG, PDF, ZIP, CSV
- ✅ `/api/qr/equipment/{id}` - Get/Generate QR for specific equipment

**Frontend Implementation:**
- ✅ `QRCodeDialog.js` - Full QR management dialog with:
  - QR code generation and display
  - Label editing
  - Action configuration (View Asset, Report Observation)
  - Default action selection
  - Print with template selection (size, layout)
  - Export dropdown (PNG, SVG, PDF)
  - Copy URL and open in new tab
- ✅ `BulkQRDialog.js` - Bulk generation for multiple selected items
- ✅ `QRScanPage.js` - Landing page when QR is scanned:
  - Login required for access
  - Action menu for multiple actions
  - Direct redirect for single default action
- ✅ Equipment Manager integration - "Generate/View QR Code" button in properties panel
- ✅ QR Code API in `api.js`

**Files Created:**
- `/app/backend/routes/qr_codes.py`
- `/app/frontend/src/components/equipment/QRCodeDialog.js`
- `/app/frontend/src/pages/QRScanPage.js`

**Files Modified:**
- `/app/backend/routes/__init__.py`
- `/app/frontend/src/lib/api.js`
- `/app/frontend/src/components/equipment/PropertiesPanel.js`
- `/app/frontend/src/App.js`

**Dependencies Added:**
- `qrcode[pil]` - QR code generation
- `reportlab` - PDF generation

---

### April 8, 2026 - Equipment Hierarchy Search Enhancement (COMPLETED)
**FEATURE - Enhanced search function prominently displayed at top of hierarchy:**

**Implemented:**
- ✅ **Equipment Manager Page** - Prominent search bar with gradient background (from-slate-50 to-blue-50)
  - Large search input (h-12) for better visibility
  - Blue search icon and placeholder "Search name, description, tag..."
  - Keyboard shortcut "/" to focus search, Escape to clear
  - "Press / to search" hint displayed on right side
  - Match count badge with blue background showing "X matches found"
  - Yellow highlighting on matching items with "Match" badge
  - Auto-expand hierarchy to reveal matching nested items
  - Clear button (X) restores original expanded state when search cleared
  - Toolbar buttons (Import, Export, Add Installation) remain visible below search
  
- ✅ **Sidebar Hierarchy** - Compact search bar in the side pane
  - Search input below Tree/Levels toggle
  - Placeholder "Search equipment..."
  - Match count displayed below input
  - Yellow highlighting with "Match" badge on matching items
  - Auto-expand tree to show matching nested items
  - Clear button to reset search

**Files Modified:**
- `/app/frontend/src/pages/EquipmentManagerPage.js` - Search UI enhancement and keyboard shortcuts
- `/app/frontend/src/components/EquipmentHierarchy.js` - Added search bar to sidebar

**Testing:** 12/12 tests passed for Equipment Manager (100% success rate)

---

### April 8, 2026 - Failure Mode Auto-Create Actions Feature (COMPLETED)
**NEW FEATURE - Enable actions to auto-create with observations:**

**Implemented:**
- ✅ Added `auto_create` checkbox to each recommended action in Failure Modes library
- ✅ Green visual indicator when action is enabled for auto-create
- ✅ When an observation is created using a failure mode, all actions with `auto_create: true` are automatically created
- ✅ Auto-created actions are linked to the observation with `auto_created_from_failure_mode: true` flag
- ✅ Context prompt after observation shows how many actions were auto-created

**UI Changes:**
- Failure Mode Edit view shows checkbox for each recommended action
- Enabled actions show green background and "Auto-create" badge
- View mode shows which actions will auto-create

**Backend Logic:**
- When observation is created via chat, system checks failure mode's `recommended_actions`
- For each action with `auto_create: true`, creates a linked action in the Actions collection
- Updates observation with `auto_created_action_ids` array

**Files Modified:**
- `/app/frontend/src/components/library/FailureModeViewPanel.jsx` - Added checkboxes and toggle function
- `/app/backend/routes/chat.py` - Added auto-action creation logic

---

### April 8, 2026 - Chat Context Prompt Feature (COMPLETED)
**NEW FEATURE - Ask for additional context after observation is recorded:**

**Implemented:**
- ✅ Added `AWAITING_CONTEXT` state to chat flow in `/app/backend/chat_handler_v2.py`
- ✅ After observation creation, chat prompts user for additional context:
  - Comments about what was observed
  - Temperature or measurement readings
  - Environmental conditions (weather, operating state)
  - Photo uploads
- ✅ User can provide context (text and/or image) which gets saved to the observation
- ✅ User can skip by typing "skip", "done", "no", etc.
- ✅ Updated `ChatResponse` model with `awaiting_context_for_threat` field
- ✅ Frontend shows context prompt with quick action buttons (Add Photo, Skip)

**Files Modified:**
- `/app/backend/routes/chat.py` - Added context state handling
- `/app/backend/chat_handler_v2.py` - Added `AWAITING_CONTEXT` state
- `/app/backend/models/api_models.py` - Updated `ChatResponse` model
- `/app/frontend/src/pages/ChatPage.js` - Added context prompt UI

**Flow:**
1. User reports issue → Equipment selection → Failure mode selection
2. Observation created → **Context prompt appears**
3. User provides context (temperature, conditions, photo) OR skips
4. Context saved to observation → Ready for next report

---

### April 8, 2026 - DateTime Formatting Propagation (P1 - COMPLETED)
**TASK - Propagate timezone-aware date/time formatting throughout the application:**

**Implemented:**
- ✅ Created centralized date formatting utilities in `/app/frontend/src/lib/dateUtils.js`
  - `formatDate()` - Date formatting respecting user timezone/format preferences
  - `formatTime()` - Time formatting respecting user timezone/format preferences
  - `formatDateTime()` - Combined date/time formatting
  - `formatDateRelative()` - Relative time (e.g., "2h ago")
  - `formatDateCompact()` - Short format for lists
  - User preferences caching via localStorage
- ✅ Updated 15+ pages/components to use centralized formatters:
  - `ActionsPage.js` - Action due dates and timestamps
  - `ActionDetailPage.js` - Created/updated timestamps
  - `CausalEnginePage.js` - Investigation dates, timeline events, action due dates
  - `ThreatDetailPage.js` - Observation metadata and attachment dates
  - `FormSubmissionsPage.js` - Submission timestamps (already done)
  - `DashboardPage.js` - Recent form submission dates (already done)
  - `InsightsPage.js` - Recommendations generated timestamp
  - `FeedbackPage.js` - Relative time for feedback items
  - `FailureModesPage.js` - Version history timestamps
  - `SettingsUserManagementPage.js` - User dates
  - `SettingsAIUsagePage.js` - AI usage dates
  - `SettingsServerPerformancePage.js` - Error logs and scan timestamps
  - `UserStatisticsPage.js` - User last active timestamps
  - `TaskSchedulerPage.js` - Task dates
  - `AIInsightsPanel.jsx` - Last analyzed timestamp
  - `SubmissionRow.jsx` - Submission details
  - `CausalNodeCard.jsx` - Node timestamps
  - `RecommendedActionsSection.jsx` - Action due dates
  - `FailureModeViewPanel.jsx` - Validation dates

**Files Modified:**
- `/app/frontend/src/lib/dateUtils.js` - NEW centralized date utilities
- Multiple page and component files (see list above)

---

### April 8, 2026 - Timezone Settings Feature (COMPLETED)
**NEW FEATURE - Timezone settings with auto-detection and manual override:**

**Implemented:**
- ✅ Created `/settings/preferences` page with timezone configuration
- ✅ Auto-detection of browser timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`
- ✅ Toggle to enable/disable auto-detection
- ✅ Manual timezone selector with 41 common timezones (searchable dropdown)
- ✅ Date format selector (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, etc.)
- ✅ Time format selector (12h/24h)
- ✅ Real-time clock display showing current time in selected timezone
- ✅ Backend endpoints: `GET/PUT /api/users/me/preferences`, `GET /api/timezones`
- ✅ Preferences stored in user document in MongoDB

**Files Created/Modified:**
- `/app/frontend/src/pages/SettingsPreferencesPage.js` - NEW preferences page
- `/app/backend/routes/users.py` - Added preferences endpoints
- `/app/frontend/src/App.js` - Added route
- `/app/frontend/src/components/Layout.js` - Added menu item

---

### April 8, 2026 - Attachment Viewing Complete Fix (P0)
**BUG FIX - Attachments not viewable in Dashboard Quick View and Form Submissions:**

**Issues Identified:**
1. Attachment URLs in database were relative paths (`attachments/xxx.jpg`) not full URLs
2. No backend endpoint existed to serve attachment files from object storage
3. Browser `<img>` tags cannot send Authorization headers, so token-based auth failed

**Fixes Applied:**
- ✅ **Created `/api/storage/{path}` endpoint** in `/app/backend/routes/forms.py` to serve files from object storage
- ✅ **Enhanced auth system** in `/app/backend/auth.py` to accept token via query parameter (`?token=xxx`) in addition to Authorization header - this allows browsers to load images with authentication
- ✅ **Updated frontend** (`DashboardPage.js`, `FormSubmissionsPage.js`) to construct full URLs with auth token: `${backendUrl}/api/storage/${att.url}?token=${localStorage.token}`

**Technical Details:**
- Object storage files are accessed via the Emergent storage API
- The `/api/storage/{path}` endpoint proxies requests to object storage with proper authentication
- Token in query parameter is validated the same way as Authorization header tokens

---

### April 8, 2026 - Equipment Hierarchy Move/Add Child Fix (P0)
**BUG FIX - "Invalid parent-child relationship" error when adding children to equipment nodes:**

**Root Cause:**
1. Frontend `LEVEL_ORDER` array included "site" level which doesn't exist in backend ISO 14224 hierarchy
2. Frontend `LEGACY_LEVEL_MAP` incorrectly mapped "unit" → "section_system", but backend maps "unit" → "plant_unit"
3. This mismatch caused the frontend to compute the wrong next level when adding children, resulting in backend validation rejecting the request

**Example of the bug:**
- User has a node with level `unit` (legacy level)
- Backend normalizes `unit` → `plant_unit`, so valid children are `section_system`
- But old frontend mapped `unit` → `section_system`, so when adding child it would try to add at wrong level
- Backend rejected with: "Invalid parent-child relationship. unit can only have ['section_system'] as children"

**Fixes Applied:**
- ✅ Removed "site" from `LEVEL_ORDER` - now matches backend: `["installation", "plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"]`
- ✅ Fixed `LEGACY_LEVEL_MAP` to match backend: `unit` → `plant_unit`, `site` → `installation`, `auxiliary` → `equipment_unit`
- ✅ Updated `LEVEL_CONFIG` icons and descriptions to reflect correct mappings
- ✅ Removed unused icon imports (MapPin, GitBranch, Layers)

**Files Modified:**
- `/app/frontend/src/pages/EquipmentManagerPage.js` - Fixed LEVEL_ORDER, LEGACY_LEVEL_MAP, LEVEL_CONFIG

---

### April 8, 2026 - Attachment Viewing Fix (P0)
**BUG FIX - Attachments not viewable in Dashboard Quick View and Form Submissions:**

**Root Cause:**
1. Legacy attachments were stored with massive base64 `data` fields (up to 7MB per attachment) instead of object storage URLs
2. When `get_submission_by_id()` fetched the full document, MongoDB had to transfer these huge payloads, causing 120+ second query timeouts
3. The `_serialize_submission()` method blindly returned `doc.get("attachments", [])` including the multi-MB base64 strings

**Fixes Applied:**
- ✅ **Optimized `get_submission_by_id()`** - Now uses MongoDB aggregation pipeline to process attachments without loading large base64 data into memory
  - If attachment has URL: returns URL only (no data)
  - If attachment has large data (>50KB): marks as `needs_migration` with error message
  - If attachment has small data (<50KB): includes data for inline display
  - Query time reduced from 74+ seconds to ~0.15 seconds (500x improvement)
- ✅ **Enhanced `_serialize_submission()`** - Processes attachments to strip large base64 data, preventing response payload bloat
- ✅ **Created migration script** - `/app/backend/scripts/migrate_attachments.py` uploads legacy base64 attachments to Object Storage and updates MongoDB documents
- ✅ **Migrated 14 legacy attachments** to Object Storage successfully
- ✅ **Updated frontend** - Both `DashboardPage.js` and `FormSubmissionsPage.js` now handle `att.error` and `att.needs_migration` gracefully, showing "Unavailable" warning icon for legacy attachments that couldn't be displayed

**Files Modified:**
- `/app/backend/services/form_service.py` - Optimized get_submission_by_id with aggregation, enhanced _serialize_submission
- `/app/backend/scripts/migrate_attachments.py` - NEW: Migration script for legacy base64 attachments
- `/app/frontend/src/pages/DashboardPage.js` - Added error handling for unavailable attachments
- `/app/frontend/src/pages/FormSubmissionsPage.js` - Added error handling for unavailable attachments

**Technical Notes:**
- Legacy attachments stored base64 data directly in MongoDB documents instead of object storage
- New attachments going forward will be uploaded to object storage via `task_service.py` and stored with `url` reference
- The aggregation pipeline uses `$strLenCP` to check data size and `$cond` to conditionally process attachments

---


### April 7, 2026 - Form Submission Bug Fix (P0)
**BUG FIX - Forms submitted via task execution not appearing in Form Submissions list:**

**Root Cause:**
1. `_serialize_submission()` in `form_service.py` was using `str(doc["_id"])` to get the ID, but:
   - Task service creates submissions with custom `id` field (UUID string)
   - The `get_submissions()` projection excluded `_id` (for performance), causing KeyError
2. `submit_form()` wasn't adding a custom `id` field, causing inconsistency
3. `get_submission_by_id()` only queried by MongoDB `_id`, not by custom `id`
4. Batch lookup queries in `get_submissions()` lacked timeouts, causing 5-second request timeouts

**Fixes Applied:**
- ✅ `_serialize_submission()` now uses `doc.get("id") or str(doc["_id"])` to handle both ID types
- ✅ `submit_form()` now adds a UUID `id` field for consistency with task service
- ✅ `get_submission_by_id()` now queries by custom `id` first, then falls back to `_id`
- ✅ All batch lookup queries now have 2-second timeouts to prevent cascading failures
- ✅ Fixed `UserResponse` datetime serialization (login/auth/me endpoints) - `created_at` was passing datetime object instead of ISO string

**Files Modified:**
- `/app/backend/services/form_service.py` - Fixed ID handling and added timeouts
- `/app/backend/routes/auth.py` - Fixed datetime-to-string conversion for UserResponse

**Testing:**
- API curl test confirmed 16 form submissions now visible
- UI dashboard shows "Recent Form Submissions" including task-created submissions
- Task completion with form_data successfully creates visible form submission record

---

### April 7, 2026 - Code Quality Fixes (Code Review)
**FIXES APPLIED:**

1. **Array Index as Key (React Anti-pattern) - Fixed 8 instances:**
   - `/app/frontend/src/pages/InsightsPage.js` - Fixed discipline performance tables and recommendation lists
   - `/app/frontend/src/pages/FormSubmissionsPage.js` - Fixed attachment keys and badge keys
   - `/app/frontend/src/pages/FailureModesPage.js` - Fixed version change history keys

2. **Console.log Removal - Removed 10 debug logs:**
   - `/app/frontend/src/components/DocumentViewer.js` - Removed URL debugging logs
   - `/app/frontend/src/components/Layout.js` - Removed avatar fetch debugging logs
   - `/app/frontend/src/components/forms/formAPI.js` - Removed template update debugging logs

3. **Python Function Complexity - Refactored:**
   - `/app/backend/ai_helpers.py` - Extracted `detect_audio_format()` helper function from `transcribe_audio_with_ai()` to reduce complexity and improve readability

**NOT APPLIED (Would require significant refactoring that could break functionality):**
- Hook dependency warnings (143 instances) - Need careful analysis per-case
- localStorage security changes - Would require session management overhaul
- Component splitting (ChatSidebar, Layout, etc.) - Major refactoring risk
- Full Python function decomposition - Needs thorough testing

---

### April 7, 2026 - Ad-hoc Form Execution Bug Fix
**BUG FIX:**
- ✅ **Fixed datetime serialization issue** in ad-hoc plan execution (`/api/adhoc-plans/{plan_id}/execute`)
  - When returning an existing in-progress task, datetime fields weren't being serialized properly
  - Now uses `serialize_task()` for proper JSON serialization
- ✅ **Improved error messages** in frontend API call to show backend error details

**Files Modified:**
- `/app/backend/routes/my_tasks.py` - Fixed `execute_adhoc_plan` to use `serialize_task()` for existing tasks
- `/app/frontend/src/pages/MyTasksPage.js` - Added error detail parsing in `executeAdhocPlan` API call

---

### April 7, 2026 - Backend Equipment Module Refactoring (P3)
**REFACTORING COMPLETED:**
- ✅ **Split equipment.py (2288 lines) into modular package** - Created `/app/backend/routes/equipment/` directory with 7 focused modules:
  - `equipment_types.py` - Equipment type CRUD (create, read, update, delete custom types)
  - `equipment_nodes.py` - Node CRUD operations (get, create, update, delete, export)
  - `equipment_operations.py` - Move, reorder, change level operations
  - `equipment_criticality.py` - Criticality and discipline assignment, stats
  - `equipment_utils.py` - Search, disciplines, ISO levels utilities
  - `equipment_history.py` - Equipment history timeline
  - `equipment_import.py` - Hierarchy import (Excel, JSON), unstructured items
  - `__init__.py` - Package init that combines all sub-routers

**Benefits:**
- Improved code maintainability and readability
- Easier navigation for developers working on specific features
- Better separation of concerns
- No functionality changes - all 33 routes preserved

**Files Created:**
- `/app/backend/routes/equipment/__init__.py`
- `/app/backend/routes/equipment/equipment_types.py`
- `/app/backend/routes/equipment/equipment_nodes.py`
- `/app/backend/routes/equipment/equipment_operations.py`
- `/app/backend/routes/equipment/equipment_criticality.py`
- `/app/backend/routes/equipment/equipment_utils.py`
- `/app/backend/routes/equipment/equipment_history.py`
- `/app/backend/routes/equipment/equipment_import.py`

**Files Deleted:**
- `/app/backend/routes/equipment.py` (replaced by package)

---

### April 7, 2026 - Version 2.6.5 Production Fixes
**BUG FIXES:**
- ✅ **Excel Export Fix** - Fixed failure modes export (`/api/failure-modes/export`) crashing when `potential_effects` and `potential_causes` fields are arrays. Now properly converts list fields to comma-separated strings before Excel generation.
- ✅ **Avatar URL Support for Production** - Added `avatar_url` field to UserResponse model and `/auth/me` endpoint. Frontend UserMenu now constructs authenticated URLs for avatar images using query param auth tokens, enabling avatars to work in Vercel/Railway production deployments.
- ✅ **Code Cleanup** - Removed unused variables in auth.py email functions to satisfy linter.

**Files Modified:**
- `/app/backend/routes/failure_modes_routes.py` - Fixed list-to-string conversion for potential_effects/causes in Excel export
- `/app/backend/models/api_models.py` - Added avatar_url field to UserResponse
- `/app/backend/routes/auth.py` - Updated /auth/me to return avatar_url, cleaned up unused variables
- `/app/frontend/src/components/layout/UserMenu.jsx` - Build authenticated avatar URL using token query param
- `/app/frontend/src/components/Layout.js` - Updated version to 2.6.5
- `/app/frontend/package.json` - Updated version to 2.6.5

---

### April 7, 2026 - Equipment Type Searchable Selector with Failure Mode Counts
**FEATURE COMPLETED:**
- ✅ **Searchable Equipment Type Selector** - Replaced dropdown with Command/Combobox pattern for searching equipment types by name, discipline, or ID
- ✅ **Failure Mode Counts per Equipment Type** - Shows "X FM" badge next to each equipment type indicating how many failure modes exist in library
- ✅ **New API endpoint** - `GET /api/failure-modes/counts-by-equipment-type` returns failure mode counts per equipment type ID

**UI Changes:**
- PropertiesPanel now uses Popover+Command for equipment type selection
- Search input filters equipment types in real-time
- Each type shows failure mode count badge (e.g., "8 FM" for pump_centrifugal)
- Selected type shows failure mode count hint below the selector

**Files Modified:**
- `/app/backend/routes/failure_modes_routes.py` - Added counts-by-equipment-type endpoint
- `/app/frontend/src/lib/api.js` - Added getCountsByEquipmentType method
- `/app/frontend/src/components/equipment/PropertiesPanel.js` - Complete rewrite of equipment type selector with search and FM counts

---

### April 7, 2026 - Equipment Types ISO 14224 Hierarchy Level Mapping
**FEATURE COMPLETED:**
- ✅ **Added `applicable_levels` field** to all equipment types defining which ISO hierarchy levels each type can be used at
- ✅ **Expanded Equipment Types from 62 → 113 types** (+51 subunit/maintainable item component types)
- ✅ **Level-based filtering** in Properties Panel - only shows equipment types appropriate for the current hierarchy level
- ✅ **Smart dual-filtering**: First by applicable_levels (hierarchy), then by compatible_systems (recommendations)
- ✅ **Expanded Failure Modes from 531 → 627** (+96 component-specific failure modes for 50 new types)
- ✅ **Enhanced ALL 627 failure modes with ISO 14224 data:**
  - `mechanism`: ISO 14224 failure mechanism code (WEA, LKG, FAT, COR, CAV, VIB, STK, etc.)
  - `mechanism_description`: Human-readable mechanism name
  - `potential_effects`: Array of consequences when failure occurs
  - `potential_causes`: Array of root causes for the failure

**ISO 14224 Failure Mechanisms Added:**
| Code | Description | Examples |
|------|-------------|----------|
| WEA | Wear - General | Bearing wear, Seal face wear |
| LKG | Leakage | Seal failure, Gasket blowout |
| FAT | Fatigue | Shaft fatigue, Bearing fatigue |
| COR | Corrosion | Internal/External corrosion, CUI |
| CAV | Cavitation | Pump cavitation |
| VIB | Vibration | Imbalance, Rotor rub |
| STK | Sticking | Valve stuck, Bearing seizure |
| OVH | Overheating | Motor overheating, Dry running |
| ERO | Erosion | Impeller erosion, Sand erosion |
| CRK | Cracking | Stress corrosion cracking |
| BRD | Breakdown | Actuator failure, General |
| INS | Insulation failure | Winding failure |
| DRF | Instrument drift | Sensor drift, Calibration |
| And 15+ more mechanisms... |

**New Component Types Added (51 types for Subunit/Maintainable Item levels):**
- **Bearings:** Radial Bearing, Thrust Bearing, Journal Bearing
- **Seals:** Mechanical Seal, Labyrinth Seal, Dry Gas Seal
- **Rotating Components:** Coupling, Impeller, Rotor, Shaft, Gear Set
- **Static Components:** Casing/Housing, Diaphragm, Piston, Cylinder/Liner, Packing, Gasket, O-Ring, Wear Ring
- **Auxiliary Systems:** Lubrication System, Cooling Jacket
- **Extrusion Components:** Screw Element, Barrel Section, Die/Die Head
- **Heat Transfer:** Heating Element, Cooling Coil, Tube Bundle, Baffle Plate
- **Vessel Components:** Vessel Internals, Tray/Column Packing
- **Drive Components:** Belt/Drive Belt, Chain/Sprocket
- **Electrical Components:** Stator, Winding, Brush/Commutator, Contactor/Relay, Circuit Breaker, Fuse, Capacitor, Resistor, Power Supply Unit
- **Instrumentation Components:** I/O Module, Communication Module, HMI Panel, Solenoid Valve, Limit Switch, Thermocouple, RTD, Orifice Plate, Pressure Gauge, Sight Glass

**Files Modified:**
- `/app/backend/iso14224_models.py` - Added applicable_levels field, 51 new component types
- `/app/backend/failure_modes.py` - Added 96 component failure modes (IDs 532-627)
- `/app/backend/scripts/enhance_failure_modes.py` - NEW: ISO 14224 enhancement mappings
- `/app/backend/scripts/seed_failure_modes.py` - Updated to apply enhancements during seeding
- `/app/backend/services/failure_modes_service.py` - Updated _serialize to include mechanism_description
- `/app/frontend/src/components/equipment/PropertiesPanel.js` - Added level-based filtering logic
- `/app/backend/routes/equipment.py` - Updated create_equipment_type to include applicable_levels
- MongoDB `failure_modes` collection re-seeded via `scripts/seed_failure_modes.py --force`

---

### December 2025 - FMEA Failure Modes Database Expansion (ISO 14224 Complete)
**FEATURE COMPLETED:**
- ✅ **Expanded Failure Modes Library from 215 → 531 modes** (+316 new failure modes)
- ✅ **Full coverage of all 62 Equipment Types** (40 previously missing types now covered)
- ✅ **7-8 failure modes per equipment type** following ISO 14224 standards
- ✅ **Complete field structure**: failure_mode, keywords, severity, occurrence, detectability, RPN, recommended_actions, equipment_type_ids

**Equipment Types Now Covered (40 newly added):**
- **Mechanical Rotating:** Pump Package, Screw Compressor, Gearbox, Blower/Fan, Mixer/Agitator, Conveyor, Crane/Hoist
- **Mechanical Valves:** Check Valve, Ball Valve, Gate Valve, Butterfly Valve
- **Electrical:** DC Motor, MCC, VFD, UPS, Battery System, Generator, Cable/Termination
- **Instrumentation:** Level Sensor, Valve Positioner, DCS, Gas Analyzer, Chemical Analyzer, Electric Actuator, Pneumatic Actuator
- **Static Equipment:** Air Cooler, Column/Tower, Reactor, Filter/Separator, Flange/Fitting, Boiler, Furnace/Heater
- **Safety Systems:** Rupture Disc, ESD, SIS, Fire & Gas (F&G), Fire Protection/Deluge, Flare System, Gas Detector, Flame Detector

**Failure Mode Fields (ISO 14224 Compliant):**
- `failure_mode`: Standard failure description (e.g., "IGBT Failure")
- `keywords`: Search terms for matching
- `severity`: Impact rating (1-10)
- `occurrence`: Frequency rating (1-10)
- `detectability`: Detection difficulty (1-10)
- `rpn`: Risk Priority Number (severity × occurrence × detectability)
- `recommended_actions`: Maintenance tasks with action_type (PM, PDM, CM) and discipline
- `equipment_type_ids`: Linked equipment types for smart filtering

**Files Modified:**
- `/app/backend/failure_modes.py` - Added 316 new failure modes
- Database seeded via `/app/backend/scripts/seed_failure_modes.py --force`

**API Testing:**
```bash
# Get failure modes by equipment type
GET /api/failure-modes?equipment_type_id=vfd&limit=10
GET /api/failure-modes?equipment_type_id=gas_detector&limit=10
GET /api/failure-modes?equipment_type_id=boiler&limit=10
```

---

### April 7, 2026 - Equipment Types Intelligent Hierarchy Mapping
**FEATURE COMPLETED:**
- ✅ **Added `compatible_systems` field** to all 62 equipment types for smart filtering
- ✅ **Added `is_system_level` flag** for system-level equipment (DCS, ESD, SIS, F&G, Fire Protection, Flare)
- ✅ **15 Standard System Categories** defined for compatibility mapping
- ✅ **Smart Equipment Type filtering** in Properties Panel based on parent system name
- ✅ **"Recommended for this system"** section with highlighted equipment types
- ✅ **"Show all types" toggle** to override filtering when needed

**System Categories:**
Pumping, Compression, Power Generation, Power Distribution, Cooling, Heating, Process Control, Separation, Storage, Material Handling, Safety, Fire Protection, Utility, Extrusion, Mixing

**System-Level Equipment Types (6):**
- Distributed Control System (DCS)
- Emergency Shutdown System (ESD)
- Safety Instrumented System (SIS)
- Fire & Gas System (F&G)
- Fire Protection / Deluge System
- Flare System

**Files Modified:**
- `/app/backend/iso14224_models.py` - Added compatible_systems, is_system_level, SYSTEM_CATEGORIES
- `/app/frontend/src/components/equipment/PropertiesPanel.js` - Smart filtering UI
- `/app/frontend/src/components/library/EquipmentTypeItem.jsx` - Display compatible systems

---

### April 7, 2026 - Equipment Types Module ISO 14224 Expansion
**FEATURE COMPLETED:**
- ✅ **Expanded Equipment Types from 22 → 62 types** covering all major industrial categories
- ✅ **5 Standardized Disciplines**: Mechanical, Electrical, Instrumentation, Static Equipment, Safety
- ✅ **5 Equipment Categories**: rotating, static, control, safety, electrical
- ✅ **Discipline-based UI grouping** with color-coded sections
- ✅ **Filter by discipline** in Equipment Types tab
- ✅ **Prepared for future FMEA integration** with `default_failure_modes` field

**Equipment Types by Discipline:**
- Mechanical: 20 types (pumps, compressors, turbines, gearbox, blower/fan, mixer, conveyor, valves)
- Electrical: 10 types (motors, transformers, switchgear, MCC, VFD, UPS, battery, generator)
- Instrumentation: 12 types (sensors, transmitters, control valves, positioners, PLC, DCS, analyzers, actuators)
- Static Equipment: 11 types (heat exchangers, vessels, tanks, columns, reactors, filters, piping, boilers)
- Safety: 9 types (PSV, ESD, SIS, F&G, fire protection, flare systems, detectors)

**Files Modified:**
- `/app/backend/iso14224_models.py` - Expanded EQUIPMENT_TYPES list, added category field
- `/app/frontend/src/components/library/EquipmentTypeItem.jsx` - Added DISCIPLINE_COLORS, EQUIPMENT_CATEGORIES
- `/app/frontend/src/pages/FailureModesPage.js` - Added discipline grouping and filtering UI

---

### December 7, 2026 - Tyromer Equipment Hierarchy Import with Criticality
**FEATURE COMPLETED:**
- ✅ **Equipment Hierarchy Import from Excel with Criticality Data**
- ✅ **Full-path tracking for unique item identification** (handles duplicate names under different parents)
- ✅ **Criticality data parsing** from Safety, Production, Environmental, Reputation columns
- ✅ **Auto-calculation of criticality level** (safety_critical, production_critical, medium, low)
- ✅ **Risk score calculation** with weighted dimensions

**Import Summary:**
- 135 unique equipment items imported
- 21 items with criticality data
- Hierarchy: 1 plant → 2 sections → 9 units → 26 subunits → 101 maintainable items

**API Endpoint:**
- `POST /api/equipment/import-hierarchy-excel` - Import from Excel URL with criticality

**Request Format:**
```json
{
  "installation_id": "5fb4f269-191f-47d1-b190-e865a6430c7e",
  "excel_url": "https://...",
  "replace_existing": true
}
```

**Files Modified:**
- `/app/backend/routes/equipment.py` - Added Excel import endpoint with criticality
- `/app/backend/scripts/tyromer_hierarchy_import.py` - Standalone import script

---

### April 7, 2026 - FastAPI Swagger Docs Fix
**BUG FIX (P0 - Recurring Issue):**
- ✅ **Fixed FastAPI Swagger UI `/docs` blank page issue**
- **Root Causes:**
  1. Routes without `/api` prefix get served by frontend (React) instead of backend
  2. Content Security Policy (CSP) was blocking external CDN resources (cdn.jsdelivr.net)
- **Solution:**
  - Moved docs URL from `/docs` → `/api/docs`
  - Moved redoc URL from `/redoc` → `/api/redoc`  
  - Moved openapi.json from `/openapi.json` → `/api/openapi.json`
  - Exempted docs routes from CSP headers

**Files Modified:**
- `/app/backend/server.py` - Updated FastAPI docs_url, redoc_url, openapi_url and CSP middleware

**Access:**
- Swagger UI: `https://[domain]/api/docs`
- ReDoc: `https://[domain]/api/redoc` (note: may have ORB blocking issues in some browsers)
- OpenAPI JSON: `https://[domain]/api/openapi.json`

---

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


### April 5, 2026 - Execution & Reliability Insights Page (NEW)
**NEW FEATURE:**
- ✅ **Execution & Reliability Insights** - Comprehensive analytics dashboard for reliability intelligence
- ✅ **7 Key Sections**:
  1. Key Insights Summary (4 stat cards)
  2. Execution Performance (action metrics)
  3. Task Execution Overview (recurring vs ad-hoc)
  4. Discipline Performance (good/average/bad actor classification)
  5. Data Completeness (criticality, FMEA, type coverage progress bars)
  6. Reliability Gaps (observations without actions, investigations without follow-up)
  7. AI Recommendations (GPT-5.2 powered suggestions with manual Generate button)

**Backend APIs Created:**
- `GET /api/insights/summary` - Key metrics overview
- `GET /api/execution/actions` - Action execution metrics
- `GET /api/execution/tasks` - Task execution comparison
- `GET /api/execution/disciplines` - Discipline performance with classification
- `GET /api/reliability/data-quality` - Data completeness metrics
- `GET /api/reliability/gaps` - Reliability gap identification
- `POST /api/ai/recommendations` - AI-generated recommendations

**Files Created:**
- `/app/backend/routes/insights.py` - All backend endpoints
- `/app/frontend/src/pages/InsightsPage.js` - Full analytics page

**Access:**
- All roles can access (desktop only)
- Navigate via Settings → Reliability Insights

---

### April 5, 2026 - Server Startup Detection
**NEW FEATURE:**
- ✅ **Server startup detection on login** - Auto-detects when server is unavailable
- ✅ **Auto-retry with visual feedback** - Retries every 3 seconds, up to 5 attempts
- ✅ **Clear UI overlay** - Shows "Server Starting Up" with progress bar
- ✅ **Manual retry option** - Cancel or Retry Now buttons

**Files Modified:**
- `/app/frontend/src/pages/LoginPage.js` - Added server startup state and overlay UI

---

### April 5, 2026 - Minor Updates
- ✅ Removed feedback button from header (desktop + mobile)
- ✅ Removed feedback from settings menu (use Help menu instead)
- ✅ Updated version to 2.5.2
- ✅ Fixed intro tour timing - only shows after password change for invited users
- ✅ Updated email branding to "Asset Management Intelligence Platform"
- ✅ Fixed role names in welcome emails to match RBAC
- ✅ Set `has_seen_intro: False` for new users created via admin

---


### April 5, 2026 - Mobile Intro Overlay Fix
**BUG FIX:**
- ✅ **Fixed mobile intro card overflow** - Card was extending beyond viewport, hiding "Next" button
- ✅ **Reduced progress dots size** - Changed from large circles to tiny 4px dots
- ✅ **Made spotlight rings smaller on mobile** - Reduced border width and pulsing effect
- ✅ **Made "Tap" arrow indicator more compact** - Smaller arrow and label

**ENHANCEMENT:**
- ✅ **Updated mobile intro to show menu items** - Tour now automatically opens hamburger menu
- ✅ **Shows only mobile-available features** - Dashboard, Observations, Actions, My Tasks
- ✅ **Removed desktop-only features from tour** - No more Causal Engine, Library, Equipment Manager in mobile intro
- ✅ **Added step-by-step menu navigation** - Each menu item is highlighted individually
- ✅ **Added "Close Menu" step** - Teaches users how to close the drawer
- ✅ **Final step mentions desktop features** - Users informed that advanced features are on desktop

**Technical Changes:**
- Updated `MOBILE_STEPS` array with 9 steps covering menu navigation
- Added `mobileAction` property to control menu open/close during tour
- Added `useEffect` hook to programmatically open/close mobile menu based on step
- Progress dots use inline styles for precise 4px sizing
- Mobile spotlight ring uses 2px border with smaller glow effect

**Files Modified:**
- `/app/frontend/src/components/IntroOverlay.js` - Complete mobile intro overhaul

---

## Changelog

### April 5, 2026 - User Management: Reset Intro Tour
**NEW FEATURE:**
- ✅ **Added "Reset Intro Tour" option in User Management**
- Owners/Admins can reset the intro tour for any user from the user actions dropdown
- Backend endpoint: `POST /api/rbac/users/{user_id}/reset-intro`
- Sets `has_seen_intro: false` in user record
- Toast notification confirms "Intro tour will show on next login"
- **Fixed sync between backend and frontend:**
  - Login response now includes `has_seen_intro` flag
  - Frontend syncs localStorage with backend on login
  - If backend says `has_seen_intro: false`, clears localStorage to trigger intro

**Files Modified:**
- `/app/backend/routes/users.py` - Added reset-intro and mark-intro-seen endpoints
- `/app/backend/routes/auth.py` - Added has_seen_intro to login and /auth/me responses
- `/app/backend/models/api_models.py` - Added `has_seen_intro` field to UserResponse
- `/app/frontend/src/pages/SettingsUserManagementPage.js` - Added Reset Intro Tour menu item
- `/app/frontend/src/components/IntroOverlay.js` - Added API call on tour completion
- `/app/frontend/src/contexts/AuthContext.js` - Syncs has_seen_intro with localStorage on login

---

### April 5, 2026 - Introduction Overlay / Onboarding Tour
**NEW FEATURE:**
- ✅ **Added step-by-step introduction overlay for new users**
- **Desktop tour (9 steps):** Welcome → Dashboard → Observations → Causal Engine → My Tasks → Hierarchy → Quick Add (+) → Settings → Complete
- **Mobile tour (7 steps):** Welcome → Navigation Menu → Dashboard → Observations → Quick Add → AI Chat → Complete
- Features:
  - Spotlight effect highlighting UI elements
  - Progress bar and step dots
  - Skip/Back/Next navigation
  - Stores completion in localStorage + database
  - Help menu with "Replay Tour" option
  - Auto-detects mobile vs desktop
  - Mobile-optimized compact card design
- Triggers automatically on first login

**Files Created:**
- `/app/frontend/src/components/IntroOverlay.js` - Main overlay component with desktop and mobile tour steps

**Files Modified:**
- `/app/frontend/src/components/Layout.js` - Integrated IntroOverlay and Help menu

---

### April 5, 2026 - Security Issues Fixed
**SECURITY FIX:**
- ✅ **Fixed all 8 security warnings - now all pass**
- **Password Policy**: Set `MIN_PASSWORD_LENGTH=8` for strong passwords
- **CORS Configuration**: Restricted to specific origins instead of wildcard `*`
- **Rate Limiting**: Enabled via `RATE_LIMIT_ENABLED=true`
- **Dependencies**: Installed pip-audit and configured proper path for scanning
- **Environment Variables**: Updated JWT secret to 50+ character secure key
- Overall status now shows **"Secure"** (all green)

**Files Modified:**
- `/app/backend/.env` - Updated security configuration variables
- `/app/backend/routes/system.py` - Fixed JWT_SECRET_KEY detection and pip-audit path

---

### April 5, 2026 - App Security Check in Server Performance
**NEW FEATURE:**
- ✅ **Added App Security monitoring to Server Performance page**
- Backend endpoint `GET /api/system/security` performs 8 security checks:
  1. **Authentication** - Verifies user auth is enabled
  2. **Password Policy** - Checks password length requirements
  3. **HTTPS** - Verifies secure connection
  4. **CORS Configuration** - Checks if CORS is restricted
  5. **Rate Limiting** - Checks if rate limiting is configured
  6. **Dependencies** - Scans for vulnerable packages
  7. **Database Access** - Verifies DB connection is secured
  8. **Environment Variables** - Checks JWT secret configuration
- Overall status: Secure (all pass), Warning (some warnings), Critical (any fail)
- Frontend displays:
  - Overall status badge (green/orange/red)
  - List of checks with status icons and messages
  - Manual refresh button
  - Last scan timestamp
- Responsive for desktop and mobile

**Files Modified:**
- `/app/backend/routes/system.py` - Added `GET /api/system/security` endpoint
- `/app/frontend/src/pages/SettingsServerPerformancePage.js` - Added App Security card

---

### April 5, 2026 - Database Storage in Server Performance
**NEW FEATURE:**
- ✅ **Added Database Storage monitoring to Server Performance page**
- Backend endpoint `GET /api/system/database` returns:
  - `used`: Current database size (MB or GB)
  - `capacity`: Total configured capacity (default 5GB, configurable via `DB_CAPACITY_GB` env var)
  - `unit`: "MB" or "GB" based on size
- Frontend displays:
  - Progress bar with percentage inside
  - Color states: Green (0-69%), Orange (70-89%), Red (90-100%)
  - Usage text: "{used} {unit} of {capacity} {unit} used"
  - Status badge (checkmark/warning/critical)
- Auto-refreshes every 30 seconds
- Handles loading, error, and empty states

**Files Created/Modified:**
- `/app/backend/routes/system.py` - Added `GET /api/system/database` endpoint
- `/app/frontend/src/pages/SettingsServerPerformancePage.js` - Added Database Storage card

---

### April 4, 2026 - Mobile Hierarchy Click Behavior Fix
**UX Enhancement:**
- ✅ **Fixed mobile hierarchy interaction behavior**
- **Arrow click** → Expands/collapses the hierarchy node (fold/unfold)
- **Equipment item click** → Shows context menu with options:
  - Filter on (navigate to filtered observations)
  - Show Details
  - Add Observation
- Removed confusing double-tap requirement for navigation
- Added larger touch targets for mobile (arrow button has 36px minimum tap area)
- Updated footer hint: "Tap item for options • Tap arrow to expand"

**Files Modified:**
- `/app/frontend/src/components/EquipmentHierarchy.js` - Separated arrow click from item click handlers
- `/app/frontend/src/mobile/MobileHierarchy.js` - Added context menu and separated expand/item interaction

---

### April 4, 2026 - Dashboard Recent Observations Compact Risk Score & RPN
**UI Enhancement:**
- ✅ **Added compact Risk Score and RPN badges to Recent Observations widget**
- Each observation row now displays:
  - Risk Score (gray badge with numeric value)
  - RPN (purple badge, only when available)
  - Status badge (colored by status)
- Badges use tabular-nums for consistent digit alignment
- Maintains compact, scannable layout

**Files Modified:**
- `/app/frontend/src/pages/DashboardPage.js` - Updated Recent Observations renderItem function

---

### April 3, 2026 - Database N+1 Query Optimization
**PERFORMANCE IMPROVEMENT:**
- ✅ **Eliminated N+1 queries in `/api/my-tasks` endpoint**
  - Previously: Each task triggered 4-5 individual DB queries (equipment, plans, templates, form_templates)
  - Now: Uses batch `$in` queries with in-memory dictionary lookups (O(1))
  - Result: Response time reduced from potential seconds to ~150ms average
- ✅ **Eliminated N+1 queries in `/api/adhoc-plans` endpoint**
  - Same batch lookup pattern applied
- ✅ **Fixed threat lookup N+1 in actions enrichment**
  - Batch fetches all threat risk data in single query
- ✅ **Eliminated N+1 queries in `/api/form-submissions` endpoint**
  - Previously: 4 individual queries per submission (users, equipment, tasks, templates)
  - Now: Uses asyncio.gather() to run count + fetch in parallel
  - All batch lookups (users, equipment, tasks, templates) run in parallel
  - Consolidated user avatar fetching into service (removed duplicate query from route)
  - Result: ~220ms local processing time (vs 580ms+ before)

**Technical Details:**
- Collect all unique IDs upfront before processing
- Batch queries using MongoDB `$in` operator
- Create lookup dictionaries for O(1) access during iteration
- Use `asyncio.gather()` for parallel query execution
- Fixed lint error: Changed `$ne: None, $ne: ""` to `$nin: [None, ""]`

**Files Modified:**
- `/app/backend/routes/my_tasks.py` - Complete rewrite of `get_my_tasks` and `get_adhoc_plans` data fetching
- `/app/backend/services/form_service.py` - Parallel batch queries with asyncio.gather
- `/app/backend/routes/forms.py` - Removed duplicate user fetching

---

### April 3, 2026 - Actions List UI Alignment Fix
**UX Enhancement:**
- ✅ **Fixed Risk Score and RPN column alignment in Actions list**
- Columns now align perfectly vertically from row to row regardless of action title length
- Fixed by restructuring flex container to place Score/RPN in fixed-width container

**Files Modified:**
- `/app/frontend/src/pages/ActionsPage.js` - Restructured flexbox layout for column alignment

---

### April 2, 2026 - Form Submissions Page (New Feature)
**NEW PAGE:**
- ✅ **Created Form Submissions page to view all submitted forms**
- Features:
  - Stats cards: Total, Today, Warnings, Critical counts
  - Search by form name, equipment, task, or user
  - Filter by Discipline and Status (warnings/critical)
  - List view showing: Form name, date/time, user, discipline, equipment, task
  - Detail dialog showing: Full submission info with all form responses
  - Support for attachments (images, PDFs, documents)
  - Color-coded threshold status (Normal/Warning/Critical)
  - Mobile-responsive design

**Backend Enhancement:**
- Updated `form_service.py` to include equipment name, task template name, and discipline

**Files Created:**
- `/app/frontend/src/pages/FormSubmissionsPage.js` - New page

**Files Modified:**
- `/app/frontend/src/App.js` - Added route `/form-submissions`
- `/app/frontend/src/components/Layout.js` - Added navigation link in Settings menu
- `/app/backend/services/form_service.py` - Enhanced submission data with equipment/task info

---

### April 2, 2026 - Hide Completed Tasks from My Tasks
**UX Enhancement:**
- ✅ **Completed tasks are now hidden from My Tasks view**
- **Backend:** Updated action query to only fetch `open` and `in_progress` actions
- **Frontend:** Added filter to exclude `completed` and `completed_offline` status from all views

**Files Modified:**
- `/app/backend/routes/my_tasks.py` - Changed action status filter
- `/app/frontend/src/pages/MyTasksPage.js` - Added completed task filter

---

### April 2, 2026 - Fix Adhoc Task Completion (UUID vs ObjectId)
**BUG FIX:**
- ✅ **Fixed "Failed to complete task" error for adhoc tasks**
- **Root Cause:** Adhoc tasks have a UUID `id` field, but `complete_task` and `start_task` methods only looked up by ObjectId `_id`
- **Solution:** Updated both methods to search by ObjectId first, then fall back to UUID `id` field
- Also fixed `_serialize_instance` to handle missing `equipment_id` and `status` fields gracefully

**Files Modified:**
- `/app/backend/services/task_service.py` - Fixed `start_task`, `complete_task`, and `_serialize_instance` methods

---

### April 2, 2026 - Fix Word File Mobile Viewing (Right Side Cutoff)
**BUG FIX:**
- ✅ **Fixed DOCX right side content not visible on mobile**
- **Problem:** First page of Word documents had right side cut off on mobile
- **Solution:** Updated DOCX viewer container with proper mobile scrolling and sizing

**Changes:**
- Added `overflow-x-auto` for horizontal scrolling on mobile
- Added `WebkitOverflowScrolling: 'touch'` for smooth iOS scrolling  
- Made container width adaptive (`isMobile` ? full width : max 896px)
- Added `wordBreak: 'break-word'` and `overflowWrap: 'break-word'` for text wrapping

**Files Modified:**
- `/app/frontend/src/components/DocumentViewer.js` - DOCX viewer mobile layout fix

---

### April 2, 2026 - Enhanced Form Execution with Attachment Display & Draft Persistence
**UX ENHANCEMENT:**
- ✅ **Show attachments visually during form execution**
  - Image attachments now show thumbnail previews in a grid layout
  - Non-image files show file type icon with extension badge
  - Delete button appears on hover for each attachment
  - File count badge shown next to "Attachments" label

- ✅ **Remember form information even if not submitted**
  - Auto-saves form data, completion notes, and attachments to localStorage
  - Debounced save (1 second) to avoid excessive writes
  - "Draft saved" indicator shows when data is persisted
  - Toast notification "Restored your previous draft" when reopening task
  - "Clear" button in header to discard draft and start fresh
  - Drafts expire after 24 hours
  - Draft cleared automatically on successful task completion

**Files Modified:**
- `/app/frontend/src/components/task-execution/TaskExecutionFrame.js` - Added draft persistence, enhanced attachment display

---

### April 2, 2026 - Show Attachments in Action Detail Page (Mobile Compatible)
**UX ENHANCEMENT:**
- ✅ **Show attachments in action detail view with ability to open**
  - Grid display with thumbnail previews for images
  - File type icons for PDFs, DOCs, and other files
  - Click to open: images open in new tab, documents open in DocumentViewer
  - Eye button for preview, delete button on hover
  - File count badge next to "Attachments" label
  - "Add Attachment" button to upload new files
  - Fully responsive design works on both desktop and mobile

**Files Modified:**
- `/app/frontend/src/pages/ActionDetailPage.js` - Added attachments section with viewer integration

---

### April 2, 2026 - Fix Runtime Error When Editing Causal Actions
**BUG FIX:**
- ✅ **Fixed runtime error in causal engine when editing actions**
- **Root Cause 1:** `SearchableSelect` component's filter logic called `.toLowerCase()` on `opt.value` which could be non-string (null, number, etc.)
- **Root Cause 2:** Action form fields like `description` and `priority` weren't getting default values when undefined
- **Solution:** 
  - Added type check in SearchableSelect: `typeof opt.value === 'string'`
  - Added fallback values when setting action form: `description: action.description || ""`
  - Added fallback for Priority select: `value={form.priority || "medium"}`

**Files Modified:**
- `/app/frontend/src/components/ui/searchable-select.jsx` - Fixed filter logic for non-string values
- `/app/frontend/src/pages/CausalEnginePage.js` - Added default values when loading action form for editing
- `/app/frontend/src/components/causal-engine/InvestigationDialogs.js` - Added fallback for priority select value

---

### April 2, 2026 - Form Execution Field Types Fix
**UX Enhancement:**
- ✅ **Fixed form field types not rendering correctly in Task Execution**
- **Problem:** Dropdown and multi_select fields were rendering incorrectly (not as actual dropdowns/checkboxes)
- **Solution:** Added proper handlers for all field types in `TaskExecutionFrame.js`

**Field Types Now Supported:**
- `dropdown` - Proper Select dropdown component
- `multi_select` - Checkbox list with selected badges
- `date` - Native date picker input
- `datetime` - Native datetime-local picker
- `range` - Slider with min/max/step and value display
- `file` - File upload with preview
- `image` - Image upload with preview thumbnail
- `signature` - Signature placeholder (capture coming soon)
- All existing types (text, textarea, numeric, boolean, checklist, equipment)

**Files Modified:**
- `/app/frontend/src/components/task-execution/TaskExecutionFrame.js` - Added proper rendering for dropdown, multi_select, date, datetime, range, file, image, signature field types

**Testing:**
- Verified multi_select shows as checkboxes with selection badges
- Verified selections highlight correctly and display selected values

---

### April 2, 2026 - Mobile PDF Page Navigation Fix
**UX Enhancement:**
- ✅ **Fixed PDF page navigation on mobile devices**
- **Problem:** PDFs rendered via `<iframe>` couldn't be navigated on mobile browsers (no page flip controls)
- **Solution:** Implemented custom PDF viewer using `pdfjs-dist` directly with canvas rendering
- Added page navigation controls (Previous/Next) with "Page X of Y" indicator
- PDF pages render correctly on both mobile (350px width) and desktop (700px width)

**Dependencies Added:**
- `pdfjs-dist@4.8.69` (via `react-pdf@9.2.1` dependency)

**Files Modified:**
- `/app/frontend/src/components/DocumentViewer.js` - Added `MobilePdfViewer` component with canvas-based PDF rendering and page navigation

**Testing:**
- Verified page navigation works on mobile (Page 1 → 2 → 3 etc.)
- Verified PDF renders correctly on desktop with navigation controls
- Confirmed Download and Open buttons still work

---

### April 2, 2026 - Task Execution Document Viewer Authentication Fix (P0)
**CRITICAL Fix:**
- ✅ **Fixed "Not authenticated" error when viewing documents during Task Execution**
- **Root Cause:** `TaskExecutionFrame.js` had an inline document viewer using raw `<img>` and `<iframe>` tags with direct URLs that bypassed JWT authentication
- **Solution:** Replaced inline viewer (lines 783-835) with the authenticated `DocumentViewer` component that fetches files using JWT tokens and renders them as blob URLs
- Documents now load correctly with proper authentication through the storage proxy endpoint

**Files Modified:**
- `/app/frontend/src/components/task-execution/TaskExecutionFrame.js` - Added `DocumentViewer` import, replaced inline document viewer with authenticated component

**Testing:**
- Verified PDF documents load correctly in Task Execution view
- Confirmed Back button, Download, and Open buttons work correctly
- No authentication errors in browser console

---

### April 2, 2026 - Form Designer Bug Fixes (3 Issues)
**CRITICAL Fix:**
1. ✅ **Template Edit Save/Update Fixed** - Fixed `formAPI.updateTemplate` to accept `{ id, data }` object format (was expecting separate args). Added payload cleaning to remove non-serializable fields. Enhanced error propagation to surface backend error messages in UI.

**HIGH Priority Fix:**
2. ✅ **Document View Page Blank Issue Fixed** - Added missing `Sparkles` import to `FormsPage.js`. Enhanced `DocumentViewer` component to show proper error UI when document is null (instead of blank page). Added data-testid attributes for testing.

**MEDIUM Priority Fix:**
3. ✅ **AI Analysis Timeout Issue Fixed** - Created dedicated `aiApi` axios instance with 2-minute timeout (120000ms) for AI operations. Updated error handling to differentiate between timeouts and actual failures. Shows "AI analysis taking longer than expected" message on timeout instead of "ai.analysisFailed".

**Files Modified:**
- `/app/frontend/src/components/forms/formAPI.js` - Enhanced updateTemplate with object param support, payload cleaning, logging
- `/app/frontend/src/pages/FormsPage.js` - Added Sparkles import, improved Documents tab with data-testid attributes
- `/app/frontend/src/components/DocumentViewer.js` - Added proper null document error state UI
- `/app/frontend/src/lib/api.js` - Added aiApi instance with 2-min timeout, AI-specific error handling
- `/app/frontend/src/components/AIInsightsPanel.jsx` - Enhanced error handling for timeouts
- `/app/frontend/src/components/CausalIntelligencePanel.jsx` - Enhanced error handling for timeouts
- `/app/backend/routes/forms.py` - Added enhanced logging for template update endpoint

**Tests Added:**
- `/app/backend/tests/test_form_designer_fixes.py` - Comprehensive pytest tests for template CRUD, document operations, AI endpoints

---

### April 2, 2026 - Settings Menu Cleanup
**Quick Fix:**
- ✅ Verified Permissions page is functioning correctly (roles displayed, permission toggles working)
- ✅ Removed "Permissions" menu item from Settings dropdown per user request
- Settings menu now contains: Equipment Manager, Task Planner, Form Designer, Decision Engine, User Management, AI Usage, User Statistics, Definitions, Feedback

**Files Modified:**
- `/app/frontend/src/components/Layout.js` - Removed permissions menu item from `allSettingsMenuItems`

---


### April 2, 2026 - P3 Refactoring Complete
**Code Quality Improvements:**

**Frontend Refactoring:**
- ✅ Extracted `TaskExecutionFrame` component (1154 lines) → `/app/frontend/src/components/task-execution/TaskExecutionFrame.js`
- ✅ Extracted `TaskCard` component (170 lines) → `/app/frontend/src/components/task-execution/TaskCard.js`
- ✅ Reduced `MyTasksPage.js` from **2163 lines → 843 lines** (61% reduction)

**Backend Organization:**
- ✅ Added section documentation to `routes/equipment.py` (1889 lines)
- ✅ Organized into 7 logical sections with clear markers:
  1. Equipment Types CRUD
  2. Search & Utilities
  3. Node CRUD Operations
  4. Node Operations (Change Level, Reorder, Move)
  5. Discipline & Criticality Assignment
  6. Stats & Unstructured Items
  7. Equipment History Timeline

**Files Created:**
- `/app/frontend/src/components/task-execution/TaskExecutionFrame.js`
- `/app/frontend/src/components/task-execution/TaskCard.js`

**Files Modified:**
- `/app/frontend/src/pages/MyTasksPage.js` - Removed embedded components
- `/app/backend/routes/equipment.py` - Added section documentation and TODO for future split

---

### April 2, 2026 - P3 Refactoring: TaskExecutionFrame Extraction
**Code Quality Improvement:**
- ✅ Extracted `TaskExecutionFrame` component from `MyTasksPage.js` (1154 lines)
- ✅ Created new file: `/app/frontend/src/components/task-execution/TaskExecutionFrame.js`
- ✅ Reduced `MyTasksPage.js` from 2163 lines to 1009 lines (53% reduction)

**Benefits:**
- Improved maintainability and testability
- Cleaner separation of concerns
- Easier to add new task execution features
- Reusable component for other contexts

**Files Modified:**
- `frontend/src/pages/MyTasksPage.js` - Removed embedded TaskExecutionFrame, added import
- `frontend/src/components/task-execution/TaskExecutionFrame.js` - New file with extracted component

---

### April 1, 2026 - Major Bug Fixes and Feature Improvements (8 Items)
**CRITICAL Fixes:**
1. ✅ **Causal Intelligence Fixed** - AI engine now normalizes probability levels (medium→possible, high→very_likely) to avoid enum validation errors
2. ✅ **Form Completion Improved** - Form validation no longer blocks submission on threshold violations (warnings only), added better error messages

**HIGH Priority Fixes:**
3. ✅ **Equipment Deletion Cascade** - Added impact analysis modal showing affected tasks, actions, investigations, and task plans before deletion. Cascade clears references and deactivates plans.
4. ✅ **Observations Timeline Refresh** - Added `threatTimeline` and `equipmentHistory` query invalidation on deletion
5. ✅ **Task/Action Execution Results** - Action completion now stores `form_data`, `attachments`, and `completed_by_name`

**MEDIUM Priority Features:**
6. ✅ **Dashboard Quick View** - Clicking form submissions in dashboard opens read-only preview modal instead of navigating to Form Designer
7. ✅ **Feedback View/Edit Parity** - Already consistent layout (verified)

**LOW Priority:**
8. ⚪ **Observation fixed plan z-index** - No issue found (z-index values appropriate)

**Files Modified:**
- `backend/ai_risk_engine.py` - Added `_normalize_probability_level()` and `_normalize_confidence_level()` methods
- `backend/routes/equipment.py` - Added `/equipment-hierarchy/nodes/{id}/deletion-impact` endpoint, updated delete with cascade
- `backend/routes/my_tasks.py` - Action completion stores form_data/attachments
- `frontend/src/pages/MyTasksPage.js` - Form validation simplified
- `frontend/src/pages/EquipmentManagerPage.js` - Delete confirmation with impact dialog
- `frontend/src/pages/DashboardPage.js` - Quick View modal for form submissions
- `frontend/src/pages/ThreatsPage.js` - Timeline query invalidation
- `frontend/src/lib/api.js` - Added `getDeletionImpact()` API method
- `frontend/src/contexts/LanguageContext.js` - Added equipment deletion and dashboard translations

**Test Report:** `/app/test_reports/iteration_21.json` - 100% pass rate

---

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

---

### April 6, 2026 - OpenAI API Migration
**COMPLETED: Migrated from Emergent LLM Key to User's Own OpenAI API Key**

**What was changed:**
- Replaced `emergentintegrations` library with direct `openai` SDK (v1.99.9)
- Added `OPENAI_API_KEY` to backend `.env`
- Updated all AI-powered features to use the official OpenAI SDK

**Files Modified:**
1. `/app/backend/.env` - Added OPENAI_API_KEY
2. `/app/backend/ai_helpers.py` - Updated chat, vision, and whisper calls
3. `/app/backend/ai_risk_engine.py` - Updated AI risk analysis engine
4. `/app/backend/routes/ai_routes.py` - Updated AI route configurations
5. `/app/backend/routes/feedback.py` - Updated transcription and prompt generation
6. `/app/backend/routes/insights.py` - Updated AI recommendations
7. `/app/backend/routes/forms.py` - Updated document search AI
8. `/app/backend/routes/reports.py` - Updated report AI summaries
9. `/app/backend/routes/maintenance.py` - Updated maintenance strategy generation
10. `/app/backend/routes/equipment.py` - Removed unused imports
11. `/app/backend/routes/image_analysis.py` - Updated health check
12. `/app/backend/maintenance_strategy_generator.py` - Updated strategy generator
13. `/app/backend/services/image_analysis_service.py` - Updated damage detection
14. `/app/backend/services/openai_service.py` - NEW: Centralized OpenAI service helper

**Model Mapping:**
- `gpt-5.2` → `gpt-4o` (Latest GPT-4 model)
- `gpt-4o-mini` → `gpt-4o-mini` (No change)
- `whisper-1` → `whisper-1` (No change)

**Features Using Your OpenAI Key:**
- AI Risk Analysis (threat analysis, forecasting, recommendations)
- Causal Intelligence (root cause analysis, bow-tie models, fault trees)
- Voice Transcription (Whisper for voice-to-text)
- AI Recommendations (insights generation)
- AI Chat assistance
- Maintenance Strategy Generation
- Image Damage Detection
- Report AI Summaries
- Document Search AI

**Verified Working:**
- AI Risk Analysis endpoint returns valid results with forecasts and recommendations
- OpenAI API calls logged as "HTTP/1.1 200 OK"
