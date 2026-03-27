# ThreatBase - AI-Powered Threat Capture & Prioritization Platform

## Original Problem Statement
Build an AI-Powered Threat Capture & Prioritization Platform named "ThreatBase" (now AssetIQ). Includes user auth, chat-based threat capture, risk prioritization, Equipment Hierarchy FMEA Library, and Causal Engine.

## Deployment Status: READY FOR DEPLOYMENT ✅
Last Health Check: March 27, 2026
- All environment variables properly externalized
- No hardcoded secrets or URLs in source code
- CORS configured for production
- Database queries optimized with limits
- Supervisor configuration valid
- Frontend and backend services running correctly

## Architecture
- **Frontend**: React + Shadcn UI + TanStack Query + Framer Motion
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB
- **AI**: GPT-5.2 via Emergent LLM Key (risk analysis, causal analysis, chat)

## What's Been Implemented

### Core Features (Complete)
- User Authentication (JWT)
- Chat-based Threat Capture with voice/image support
- Risk Prioritization (FMEA scoring, RPN, AI-powered)
- Equipment Hierarchy Manager with drag-and-drop
- FMEA Failure Mode Library with recommended actions
- Causal Engine for root cause investigations
- AI Risk Insights (GPT-5.2)
- Causal Intelligence Analysis
- Action Tracker with central management
- Decision Engine with automated rules
- Form Designer with document attachments and AI search
- Task/Execution Scheduler
- Analytics Dashboard
- Reliability Performance tracking
- Multi-language support (EN/NL)
- Mobile-responsive UI

### Structured Recommended Actions
All recommended actions (manual, FMEA library, AI-generated) use structured format:
- `action` (string): Action description
- `action_type` (CM/PM/PDM): Corrective/Preventive/Predictive Maintenance
- `discipline` (string): e.g., Mechanical, Electrical

## Completed in This Session (Mar 27, 2026)

### Feature: User Feedback System (Enhanced)
Implemented a comprehensive User Feedback system per the functional spec:

**Backend:**
- New `feedback` MongoDB collection for storing user feedback
- Submit feedback API: `POST /api/feedback`
- Get user's feedback: `GET /api/feedback/my`
- Get feedback detail: `GET /api/feedback/{id}`
- Update feedback: `PUT /api/feedback/{id}` (edit message, type, severity, status)
- Delete feedback: `DELETE /api/feedback/{id}`
- Screenshot upload: `POST /api/feedback/upload-screenshot` (uses Object Storage)
- Admin endpoints (backend-only for v1): `GET /api/feedback/admin/all`, `PUT /api/feedback/admin/{id}`, `DELETE /api/feedback/admin/{id}`

**Frontend Components:**
- `FeedbackPage.js` - Full feedback review page with submission modal
- Accessible via Settings dropdown → "Feedback"

**Features:**
- **Feedback Types**: Issue (red icon), Improvement (amber icon), General (blue icon)
- **Status Tracking**: New (grey dot), In Review (orange), Resolved (green check), Planned, Won't Fix
- **Severity** (for Issues only): Low, Medium, High, Critical
- **Relative Timestamps**: "Just now", "2m ago", "3d ago", etc.
- **Screenshot Upload**: Optional image attachment via Object Storage
- **Bottom Sheet Detail View**: Click feedback item to see full message, status, severity, screenshot, and system response
- **Submission Modal**: Type selector, severity dropdown (for issues), message textarea, screenshot upload
- **Edit/Delete**: Users can edit or delete their own feedback
- **Status Change**: Users can mark feedback as "New" or "Resolved"
- **Automatic User Recording**: System automatically records who submitted feedback (user_name)
- **i18n Support**: Full EN/NL translations

### Feature: Device Type Tracking in User Statistics
Added device tracking (Desktop/Mobile/Tablet) to User Statistics:

**Backend:**
- Updated event tracking to store `device_type` field
- New endpoint: `GET /api/user-stats/devices` - Get device usage breakdown
- Updated `_get_device_usage()` method with aggregation pipeline
- Device stats included in overview response

**Frontend:**
- `useAnalyticsTracking.js` - Added `getDeviceType()` function for device detection
- All tracked events now include device_type
- New "Devices" tab in User Statistics page with:
  - Three device cards (Desktop, Mobile, Tablet) with gradient backgrounds
  - Views, Users, Sessions breakdown per device
  - Percentage badges
  - Device Distribution pie chart

### Feature: Mobile-Friendly Task Execution Forms
Enhanced the My Tasks page to provide optimal mobile experience:

**New Hook:**
- Created `useIsMobile.js` hook for responsive device detection

**Mobile Optimizations:**
- **Full-screen Sheet**: Task execution uses bottom Sheet on mobile (95% height) instead of Dialog
- **Larger Touch Targets**: All inputs, buttons, and checkboxes increased in size (h-12, h-14)
- **Touch-friendly selectors**: Multiple choice options stack vertically with checkmarks
- **Collapsible context**: Asset/location info collapses to save space, expandable on tap
- **Fixed footer**: Cancel/Complete buttons fixed at bottom for thumb-friendly access
- **Camera capture**: Photo fields use `capture="environment"` for direct camera access
- **Responsive spacing**: Increased padding and margins for touch accuracy
- **Large text**: Form labels and inputs use text-base (16px) on mobile

**Form Field Improvements:**
- Boolean: Larger checkbox with tap-friendly container
- Checklist: Full-width items with larger checkboxes
- Numeric: Number keyboard with `inputMode="decimal"`
- Select/Multiple Choice: Vertical stacking with selection indicators
- Photo: Larger camera icon, "Take photo" prompt on mobile
- Issue Toggle: Full-width Yes/No buttons with icons

### Feature: AI-Powered Image Analysis for Damage Detection
Implemented AI vision analysis for equipment photos:

**Backend:**
- New service: `/app/backend/services/image_analysis_service.py`
- Uses OpenAI GPT Vision via emergentintegrations
- Structured JSON response with damage findings

**API Endpoints:**
- `POST /api/image-analysis/analyze` - Analyze single image
- `POST /api/image-analysis/analyze-multiple` - Analyze up to 5 images
- `GET /api/image-analysis/health` - Service health check

**Analysis Capabilities:**
- Detects: corrosion, cracks, wear, dents, leaks, discoloration, misalignment
- Returns: severity (none/minor/moderate/severe/critical), confidence level
- Provides: findings list, recommended actions, immediate attention flag

**Frontend Integration:**
- Added "AI Analyze" button to photo fields in task execution
- Shows analysis results with color-coded severity
- Auto-sets "Issue Found" flag when damage detected
- Toast notifications for analysis results

### Feature: New Failure Mode Label & Create Action
When an observation has a new/custom failure mode not in the FMEA library:

**Backend Changes:**
- Added `is_new_failure_mode` field to threats model
- Set automatically when creating observations with custom failure modes
- Added fields to ThreatUpdate/ThreatResponse: `is_new_failure_mode`, `fmea_rpn`, `failure_mode_data`
- Extended failure mode create endpoint with `description`, `source`, `linked_threat_id` fields

**Frontend - ThreatDetailPage:**
- Shows green **"NEW"** badge next to Failure Mode when `is_new_failure_mode` is true
- Located in the info items section

**Frontend - RecommendedActionsSection:**
- Added prominent "Create Failure Mode in FMEA Library" action card when `is_new_failure_mode` is true
- Card includes: sparkles icon, "NEW FAILURE MODE" badge, description, "+ Create" button
- Clicking "Create" opens RPN Scoring dialog with:
  - Severity slider (1-10)
  - Occurrence slider (1-10)
  - Detection slider (1-10)
  - Live RPN calculation display
  - Recommended actions list builder
- On save: Creates failure mode in FMEA library, links it to observation, clears the `is_new_failure_mode` flag

**Files Modified:**
- `/app/backend/routes/chat.py` - Set `is_new_failure_mode` on threat creation
- `/app/backend/models/api_models.py` - Added new fields to ThreatUpdate/ThreatResponse
- `/app/backend/routes/failure_modes_routes.py` - Extended FailureModeCreate model
- `/app/frontend/src/pages/ThreatDetailPage.js` - Added NEW badge to failure mode display
- `/app/frontend/src/components/threat-detail/RecommendedActionsSection.jsx` - Added Create FM action and dialog

**Files Created:**
- `/app/backend/models/feedback_models.py` - Pydantic models for feedback
- `/app/backend/services/feedback_service.py` - Feedback service layer
- `/app/backend/routes/feedback.py` - API endpoints
- `/app/frontend/src/pages/FeedbackPage.js` - Full page component

**Files Modified:**
- `/app/backend/routes/__init__.py` - Added feedback_router
- `/app/frontend/src/App.js` - Added route `/settings/feedback`
- `/app/frontend/src/components/Layout.js` - Added Feedback to settings menu
- `/app/frontend/src/lib/api.js` - Added feedbackAPI methods
- `/app/frontend/src/contexts/LanguageContext.js` - Added EN/NL translations for feedback

---

### Feature: User Statistics Page
Implemented a comprehensive User Statistics page per the functional spec:

**Backend:**
- New `user_events` MongoDB collection for event tracking
- Event ingestion API: `POST /api/user-stats/track` and batch `POST /api/user-stats/track/batch`
- Statistics retrieval APIs with date filtering and role-based access
- Session management with 15-minute inactivity timeout
- Pre-aggregation support for daily stats

**Frontend Components:**
- `UserStatisticsPage.js` - Full page with KPIs, charts, and tables
- `useAnalyticsTracking.js` - Hook for automatic page view tracking

**Features:**
- **KPI Summary**: Active Users, Total Sessions, Total Views, Avg Duration, Most/Least Used Module
- **Module Usage Tab**: Bar chart, pie chart, detailed table with views/unique users/percentage/avg time
- **User Activity Tab**: User table with role, last active, sessions, actions, most used module
- **Actions Tab**: Feature usage tracking with total count and unique users
- **Daily Trends**: Area chart for daily active users, line chart for daily views
- **Date Filters**: Today, Last 7 days, Last 30 days
- **Role-Based Access**: Admin (full), Manager (limited), Operator (no access)
- **Automatic Tracking**: Page views tracked automatically via Layout integration

**Files Created:**
- `/app/backend/models/user_stats_models.py` - Event tracking models
- `/app/backend/services/user_stats_service.py` - Statistics service
- `/app/backend/routes/user_stats.py` - API endpoints
- `/app/frontend/src/pages/UserStatisticsPage.js` - Full page component
- `/app/frontend/src/hooks/useAnalyticsTracking.js` - Tracking hook

**Files Modified:**
- `/app/backend/routes/__init__.py` - Added user_stats_router
- `/app/frontend/src/App.js` - Added routes `/settings/statistics` and `/user-statistics`
- `/app/frontend/src/components/Layout.js` - Integrated usePageTracking hook
- `/app/frontend/src/contexts/LanguageContext.js` - Added EN/NL translations for userStatistics

---

## Previously Completed (Mar 27, 2026)

### UI: Settings Menu Label Update
Changed "Forms" to "Form Designer" in the Settings menu. Also ensured all menu items use proper i18n translation keys instead of hardcoded strings.

**Files Modified:**
- `/app/frontend/src/components/Layout.js` - Updated settings menu to use `t("forms.title")`, `t("taskScheduler.execution")`, `t("decisionEngine.title")` instead of hardcoded labels

### Feature: Enhanced Document Viewer (PDF, DOCX, XLS/XLSX Support)
Added in-app document viewing support for multiple file formats:
- **PDF** - Rendered via iframe with native browser PDF viewer
- **DOCX/DOC** - Parsed using `mammoth` library and rendered as styled HTML with proper heading, list, and table formatting
- **XLS/XLSX/CSV** - Parsed using `xlsx` (SheetJS) library and displayed as interactive tables with:
  - Row numbers for easy reference
  - Sheet navigation for multi-sheet workbooks
  - Proper cell formatting and alternating row colors
  - Empty sheet handling

**Dependencies Added:**
- `mammoth@1.12.0` - Word document to HTML conversion
- `xlsx@0.18.5` - Excel/CSV file parsing

**Files Modified:**
- `/app/frontend/src/components/DocumentViewer.js` - Complete rewrite with loading states, error handling, and file-specific renderers
- `/app/frontend/src/index.css` - Added `.docx-content` styling for proper document appearance

### UI: Renamed "Execution Scheduler" to "Task Planner"
Updated the page title and translations for better clarity:
- English: "Execution Scheduler" → "Task Planner"
- Dutch: "Uitvoeringsplanner" → "Taakplanner"

**Files Modified:**
- `/app/frontend/src/contexts/LanguageContext.js` - Updated `taskScheduler.title` for both EN and NL

### Feature: Ad-hoc Template Support in Plan Creation
Enhanced the Plan Dialog to properly support ad-hoc task templates:
- Templates marked as ad-hoc now show an **Ad-hoc** badge in the dropdown
- When an ad-hoc template is selected, a message displays: "This is an ad-hoc template - no recurring schedule needed"
- **Interval becomes optional** for ad-hoc templates (label changes to "Interval (Optional for ad-hoc)")
- Backend updated to handle plans without intervals for ad-hoc tasks

**Files Modified:**
- `/app/frontend/src/components/task-scheduler/PlanDialog.js` - Added ad-hoc template detection, badge display, and optional interval handling
- `/app/frontend/src/contexts/LanguageContext.js` - Added `adhocPlanDesc` and `intervalOptional` translations
- `/app/backend/services/task_service.py` - Updated `create_plan()` to handle ad-hoc templates with optional intervals, added `is_adhoc` to plan serialization

### Feature: Plan Card Editing
Added full edit functionality for execution plans:
- **Edit button** added to plan card dropdown menu
- **Edit dialog** opens with pre-filled plan data
- Editable fields: Interval, Begin/End dates, Linked form, Notes, Plan status (Active/Inactive toggle)
- Non-editable fields: Template and Equipment (grayed out in edit mode)
- Backend PATCH endpoint already existed at `/api/task-plans/{plan_id}`

**Files Modified:**
- `/app/frontend/src/pages/TaskSchedulerPage.js` - Added `updatePlan` API, `updatePlanMutation`, `handleEditPlan`, `handlePlanSubmit` functions, Edit menu item
- `/app/frontend/src/components/task-scheduler/PlanDialog.js` - Added `editingPlan` prop, edit mode UI (disabled fields, status toggle, Save Changes button)
- `/app/frontend/src/contexts/LanguageContext.js` - Added `editPlan`, `editPlanDesc`, `planStatus`, `planStatusDesc` translations (EN/NL)

### Feature: Ad-hoc Plans in My Tasks with Execution
Added ability to view and execute ad-hoc plans directly from the My Tasks page:
- **Adhoc tab** now shows active ad-hoc plans (not task instances)
- Each plan card displays: Title, Equipment, Discipline, Form badge, Execution count, Last executed date
- **Execute button** creates a new task instance and opens the execution dialog immediately
- Backend endpoints: `GET /api/adhoc-plans` (fetch active ad-hoc plans), `POST /api/adhoc-plans/{id}/execute` (create and start task)

**Files Modified:**
- `/app/backend/routes/my_tasks.py` - Added `get_adhoc_plans` and `execute_adhoc_plan` endpoints
- `/app/frontend/src/pages/MyTasksPage.js` - Added `getAdhocPlans` and `executeAdhocPlan` API functions, query for adhoc plans, conditional rendering for adhoc tab with plan cards

---

## Completed in Previous Session (Mar 27, 2026)

### P0 Fix: ThreatDetailPage Layout Reordering
Reordered the Observation Details page (`ThreatDetailPage.js`) per user request:
- **Moved Info Grid** (Equipment Type, Failure Mode, Impact, Frequency, Likelihood, Detectability, Location) to appear **above** the AI Risk Analysis / Causal Intelligence panels
- Maintains visual hierarchy: Risk Score Card → Equipment Card → **Info Grid** → AI Panels → Attachments → Cause → Actions

**Files Modified:**
- `/app/frontend/src/pages/ThreatDetailPage.js` - Swapped order of Info Grid and AI sections

### P0 Fix: Task Execution Form Saving & Observation Creation
Completed the missing backend logic for My Tasks task completion:
- **Form Data Persistence**: Task completion endpoint now properly saves `form_data` to task instances
- **Observation Creation**: When `Issue = YES` is toggled during task completion:
  - User can choose: Create follow-up task / Log observation / Ignore
  - If observation is created, a new threat is generated with:
    - Title from issue description
    - Risk level mapped from severity (low/medium/high)
    - Source tracking (`source: "action_execution"` or `source: "task_execution"`)
    - Linked back to source task/action via `source_task_id` or `source_action_id`

**Files Modified:**
- `/app/backend/models/task_models.py` - Added `create_observation`, `issue_severity` fields to `TaskExecutionSubmit`
- `/app/backend/services/task_service.py` - Added `_create_observation_from_task()` method, updated `complete_task()` to call it
- `/app/backend/routes/my_tasks.py` - Updated action completion endpoint to accept full body with `form_data`, `create_observation`, etc.

**API Updates:**
- `POST /api/task-instances/{id}/complete` - Now accepts: `form_data`, `create_observation`, `issue_severity`
- `POST /api/my-tasks/action/{id}/complete` - Now accepts full completion payload with observation creation

### Feature: Ad-hoc Task Execution
Added ability to execute task templates without a recurring schedule:
- **New API Endpoint**: `POST /api/task-instances/adhoc` creates one-time task instances from templates
- **UI Integration**: Added "Execute Now" option in template dropdown menu
- **Ad-hoc Dialog**: Modal form allowing selection of:
  - Equipment (optional)
  - Priority (low/medium/high)
  - Notes
- **Task Properties**: Created tasks have `is_adhoc: true` and `source: "adhoc"` flags

**Files Modified:**
- `/app/backend/models/task_models.py` - Added `AdhocTaskCreate` model, `ADHOC` frequency type
- `/app/backend/services/task_service.py` - Added `create_adhoc_instance()` method
- `/app/backend/routes/tasks.py` - Added `POST /api/task-instances/adhoc` endpoint
- `/app/frontend/src/pages/TaskSchedulerPage.js` - Added adhoc dialog, mutation, and menu option
- `/app/frontend/src/contexts/LanguageContext.js` - Added EN/NL translations for adhoc UI

### Feature: Ad-hoc Template Creation
Added ability to create templates specifically designed for ad-hoc execution:
- **"Ad-hoc Only" Toggle**: New switch in template creation dialog that:
  - Hides the interval/frequency fields when enabled
  - Sets `frequency_type: "adhoc"` and `default_interval: 0`
  - Shows only Duration field for ad-hoc templates
- **Template Card Display**: Ad-hoc templates show:
  - Amber "Ad-hoc" badge with lightning icon instead of interval
  - "Execute manually via 'Execute Now'" hint instead of plan count
- **Backend Support**: Templates store `is_adhoc: true` flag

**Files Modified:**
- `/app/backend/models/task_models.py` - Added `is_adhoc` field to `TaskTemplateCreate` and `TaskTemplateUpdate`
- `/app/backend/services/task_service.py` - Updated `create_template()` and `_serialize_template()` to handle `is_adhoc`
- `/app/frontend/src/components/task-scheduler/TemplateDialog.js` - Added ad-hoc toggle with conditional interval fields
- `/app/frontend/src/pages/TaskSchedulerPage.js` - Updated template card display for ad-hoc templates
- `/app/frontend/src/contexts/LanguageContext.js` - Added EN/NL translations for ad-hoc template UI

## Completed in Previous Session (Mar 26, 2026)

### New Feature: My Tasks Page - Task Execution Front-End
Implemented a comprehensive mobile-first task execution interface per the functional spec:

**Screen 1: My Tasks (Task List)**
- Header with Equipment filter, Date picker, and Search
- Quick filter tabs: Today, Overdue, Recurring, Adhoc
- Task cards showing: Title, Equipment, Task Type, Priority, Due Time, Recurring indicator, Source
- **Open Actions integrated** - Shows actions from central_actions alongside task instances
- Action cards have distinct indigo styling with "Action" badge
- Stats summary: Total, In Progress, Overdue, Due Today
- Sorting: Overdue → High Priority → Due Soon → Others
- Empty state with "View upcoming tasks" button

**Screen 2: Task Execution Dialog**
- Context block: Asset/Location, Last completed, Task type, Frequency
- Dynamic form renderer supporting: Checklist, Numeric (with thresholds), Text, Photo upload, Multiple choice
- Issue toggle (Yes/No) with auto-detect from threshold violations
- Decision prompt when Issue=YES: Create follow-up task / Log observation / Ignore

**Backend API:**
- `GET /api/my-tasks` - Combined task instances + open actions with serialization
- `GET /api/my-tasks/{id}` - Task details with form fields
- `POST /api/my-tasks/{id}/start` - Mark task as in-progress
- `POST /api/my-tasks/action/{id}/complete` - Complete action from My Tasks
- `POST /api/my-tasks/action/{id}/start` - Start action from My Tasks

**Files Created:**
- `/app/frontend/src/pages/MyTasksPage.js` - Full task list and execution UI
- `/app/backend/routes/my_tasks.py` - My Tasks API endpoints

**Files Modified:**
- `/app/frontend/src/App.js` - Added route `/my-tasks`
- `/app/frontend/src/components/Layout.js` - Added "My Tasks" to main navigation
- `/app/backend/routes/__init__.py` - Registered my_tasks_router
- `/app/frontend/src/contexts/LanguageContext.js` - Added EN/NL translations for myTasks

### Mobile Dashboard Fix
Fixed "Reliability Performance" tabs overlapping on mobile:
- Changed tabs from `grid grid-cols-3` to `inline-flex` with scroll support
- Shortened "Reliability Performance" to "Reliability" on mobile
- Made snowflake radar chart responsive with proper viewBox scaling

### New Feature: "New Failure Mode" Option in Chat
When creating observations via chat, users can now specify custom failure modes:
- Added clickable "New Failure Mode" button with green styling when failure mode suggestions are shown
- Users can click to open an input field to type a custom failure mode name
- Minimum 3 characters required for validation
- Works in both scenarios: when failure modes are suggested OR when no matches found
- Backend handles "New failure mode: [name]" messages to create observations with custom failure modes
- Multi-language support added (EN/NL translations)

**Files Modified:**
- `/app/backend/chat_handler_v2.py` - Added AWAITING_NEW_FAILURE_MODE state, handles custom failure mode input
- `/app/backend/routes/chat.py` - Added `show_new_failure_mode_option` to response
- `/app/backend/models/api_models.py` - Added `show_new_failure_mode_option` field to ChatResponse
- `/app/frontend/src/components/ChatSidebar.js` - Added UI for New Failure Mode button and input form
- `/app/frontend/src/contexts/LanguageContext.js` - Added translation keys for newFailureMode, specifyFailureMode, enterFailureModeName

### Previous Session Fixes
- **Fixed "Objects not valid as React child" error**: `CausalIntelligencePanel.jsx` was rendering structured `{action, action_type, discipline}` objects directly in JSX. Fixed to extract `.action` property for display.
- **Fixed `handleAddRecommendation` in CausalIntelligencePanel**: Was passing entire action object as description string to investigation actions.

### Backend Route Deduplication
- Removed duplicate `/actions` endpoints from `routes/investigations.py` (canonical endpoints remain in `routes/actions.py`)
- Fixed unused import lint errors in `investigations.py`

### Multi-Language Translations (EN/NL)
Added translation keys and wrapped hardcoded English strings with `t()` calls:
- `TaskSchedulerPage.js` — 0 hardcoded remaining (was 73)
- `ChatPage.js` — Added `useLanguage`, translated all strings
- `ActionsPage.js` — Translated dialog labels, buttons, filters
- `FormsPage.js` — Translated form designer labels
- `DecisionEnginePage.js` — Translated filters, labels
- `AnalyticsDashboardPage.js` — Translated chart descriptions, filters
- `SettingsUserManagementPage.js` — Translated user management labels

### Frontend Code Segmentation
Extracted large components into modular files:
- **TaskSchedulerPage** (1361→992 lines, -27%):
  - `/components/task-scheduler/TemplateDialog.js`
  - `/components/task-scheduler/PlanDialog.js`
  - `/components/task-scheduler/ExecutionDialogs.js`
- **EquipmentManagerPage** (1141→904 lines, -21%):
  - `/components/equipment/PropertiesPanel.js`
- **CausalEnginePage** (1054→1001 lines, -5%):
  - `/components/causal-engine/InvestigationDialogs.js`

## Prioritized Backlog

### P0 (Critical)
- Image analysis for damage detection
- Report generation (PowerPoint/PDF) for Causal Investigations

### P1 (High Priority)
- My Tasks: Offline support with local storage
- My Tasks: Form template integration for task execution
- My Tasks: Photo upload during task execution
- Recurring task auto-generation on completion

### P2 (Medium Priority)
- User Statistics: Workflow funnel analysis (optional feature from spec)
- User Statistics: Module detail slide-over panel (deferred from MVP)
- Export equipment hierarchy to PDF/Excel
- Bulk criticality assignment for equipment
- Complete remaining multi-language coverage (CausalEnginePage, ReliabilityPerformancePage still have some hardcoded strings)

### P3 (Low Priority)
- Further frontend segmentation of remaining large pages
- Additional analytics and reporting features

## Key Database Collections
- `users`, `threats`, `central_actions`, `equipment_nodes`, `equipment_types`
- `investigations`, `task_templates`, `execution_plans`, `task_instances`
- `form_templates`, `form_submissions`, `decision_rules`, `decision_suggestions`
- `failure_modes` (in failure_modes_db)
- `user_events`, `user_stats_daily` (User Statistics tracking)
- `feedback` (User Feedback system)

## Test Credentials
- Email: test@test.com / Password: test
