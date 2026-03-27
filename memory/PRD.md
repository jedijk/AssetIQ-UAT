# ThreatBase - AI-Powered Threat Capture & Prioritization Platform

## Original Problem Statement
Build an AI-Powered Threat Capture & Prioritization Platform named "ThreatBase" (now AssetIQ). Includes user auth, chat-based threat capture, risk prioritization, Equipment Hierarchy FMEA Library, and Causal Engine.

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
- Form Designer
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

## Test Credentials
- Email: test@test.com / Password: test
