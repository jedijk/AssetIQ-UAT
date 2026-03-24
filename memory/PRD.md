# AssetIQ - AI-Powered Reliability Intelligence Platform

## Product Requirements Document (PRD)

### Original Problem Statement
Build an AI-Powered Reliability Intelligence Platform named "ReliabilityOS" (formerly ThreatBase) that enables reliability engineers to capture failures via chat, have them automatically structured, and receive a clear prioritized risk decision.

### Latest Update (Mar 24, 2026)
- **Linked Forms with Execution Plans** (Mar 24, 2026):
  - **New Field**: Added "Linked Form (Optional)" dropdown to plan creation dialog
  - **Form Template Selection**: Plans can now be associated with form templates
  - **Visual Indicator**: Plan cards show linked form with blue icon when a form is assigned
  - **Backend Support**: `form_template_id` and `form_template_name` stored in task plans
  - **Files Modified**: 
    - `/app/frontend/src/pages/TaskSchedulerPage.js` - Added form template dropdown
    - `/app/backend/models/task_models.py` - Added form_template_id to TaskPlanCreate/Update
    - `/app/backend/services/task_service.py` - Lookup and store form template name

- **Renamed "Task" to "Execution" Across App** (Mar 24, 2026):
  - **Navigation Menu**: Settings dropdown now shows "Execution" instead of "Tasks"
  - **Page Header**: "Execution" with subtitle "Manage maintenance execution and schedules"
  - **Stats Cards**: "Total Executions", "Overdue Executions"
  - **Tabs**: "Executions" tab (previously "Task Instances")
  - **Table Headers**: "Execution" column
  - **Toast Messages**: "Execution started", "Execution completed"
  - **Dialogs**: "Complete Execution" dialog title
  - **Analytics**: "Execution Compliance", "Overdue Executions"
  - **Translations**: Updated EN/NL for task→execution (uitvoering)
  - **Files Modified**: `Layout.js`, `TaskSchedulerPage.js`, `AnalyticsDashboardPage.js`, `LanguageContext.js`

- **FMEA Recommended Actions Enhanced** (Mar 24, 2026):
  - **Discipline Field**: Added dropdown with options (Mechanical, Electrical, Instrumentation, Process, Civil/Structural, Operations)
  - **Action Type Field**: Added dropdown for PM (Preventive - blue), CM (Corrective - amber), PDM (Predictive - purple)
  - **Visual Badges**: Actions now display color-coded type badges and discipline labels
  - **Backward Compatible**: Old string-format actions still display correctly, new actions use the enhanced object format
  - **File Modified**: `/app/frontend/src/pages/FailureModesPage.js`

- **Causal Engine List View Redesigned** (Mar 24, 2026):
  - **Improved Investigation Cards**: Card-based design with rounded corners, subtle borders, and shadows
  - **Color-coded Status Badges**: Draft (gray), In Progress (amber), Completed (green), Closed (blue)
  - **Better Typography**: Case numbers in monospace with background pill, prominent titles
  - **Enhanced Metadata Display**: Asset name and incident date with icons
  - **Investigation Count**: Header now shows total count (e.g., "17 investigations")
  - **Improved Spacing**: More breathing room between cards for better readability
  - **File Modified**: `/app/frontend/src/pages/CausalEnginePage.js`

- **Status Options & Multi-Select Filter Added** (Mar 24, 2026):
  - **New Status Options**: Added "Parked" (gray) and "Canceled" (red) to both the list filter and detail page dropdown
  - **Multi-Select Filter**: Status filter now supports selecting multiple statuses simultaneously
    - Shows "2 selected", "3 selected", etc. when multiple statuses chosen
    - "Clear all filters" option appears when any status is selected
    - Checkmarks indicate selected statuses
    - Click outside to close dropdown
  - **Files Modified**: 
    - `/app/frontend/src/pages/ThreatsPage.js` - Multi-select dropdown, STATUS_OPTIONS constant
    - `/app/frontend/src/pages/ThreatDetailPage.js` - Added Parked/Canceled to STATUS_OPTIONS

- **Observation Attachments Feature Added** (Mar 24, 2026):
  - **Backend Changes** (`/app/backend/server.py`):
    - Added `session_id` and `attachments` fields to threat documents
    - When creating a threat from chat, automatically captures images from the chat session
    - Updated `ThreatResponse` model to include `session_id` and `attachments`
  - **Frontend Changes** (`/app/frontend/src/pages/ThreatDetailPage.js`):
    - Added "Attachments" section that displays images in a responsive grid (2-4 columns)
    - Images show thumbnails with date overlay and click-to-expand functionality
    - Full-screen image viewer modal with close button
    - Section only appears when attachments exist (no empty state)
  - **Note**: Existing observations created before this feature won't have attachments. New observations created via chat with image uploads will display their images.

- **Observations List Enhanced** (Mar 24, 2026):
  - **RPN Display**: Each observation item now shows both Business Risk Score and RPN (color-coded by severity)
  - **Sort Options**: New "Sort By" dropdown to switch between Business Risk (default) and RPN (FMEA) sorting
  - **Delete Per Item**: Trash icon appears on hover, with confirmation dialog before deletion
  - **Status Badges**: Status now shown as colored badges (Open=blue, Mitigated=green, Closed=gray)
  - **File Modified**: `/app/frontend/src/pages/ThreatsPage.js`

- **Sticky Header Position Fixed** (Mar 24, 2026):
  - **Problem**: The sticky header on Observation Detail view appeared at the very top of the viewport, overlapping the main navigation header.
  - **Fix**: Changed `top-0` to `top-16` and `z-50` to `z-30` in `/app/frontend/src/pages/ThreatDetailPage.js` (line 507).
  - **Result**: Sticky header now appears directly below the main navigation, creating a cohesive layered experience when scrolling.

- **Task Scheduler Plans & Templates Delete Fixed** (Mar 24, 2026):
  - **Problem**: Could not delete "Pump Seal Inspection" template - also couldn't delete plans.
  - **Root Causes**:
    1. Plan API endpoints were wrong (`/api/tasks/plans` → `/api/task-plans`)
    2. Plan cards had no delete button
    3. Template delete error message was generic, not showing actual reason
  - **Fixes Applied** (`/app/frontend/src/pages/TaskSchedulerPage.js`):
    - Fixed plan API endpoints: getPlans, createPlan, deletePlan
    - Added 3-dot menu with "Delete Plan" option to plan cards
    - Added `deletePlanMutation` with proper error handling
    - Improved error messages to show backend error details
  - **Result**: Can now delete plans first, then delete templates. Error messages are informative.

- **Chat Equipment Type Storage Fixed** (Mar 24, 2026):
  - **Problem**: Observations were storing the equipment name (e.g., "strainer") as the equipment_type instead of the FMEA equipment type (e.g., "Heat Exchanger").
  - **Root Cause**: When creating observations from failure mode selection, the code wasn't using the FMEA's equipment type field.
  - **Fix**: Updated equipment selection handler in `/app/backend/server.py` (lines 1143-1162) to:
    - Use `fm_matches[0].get("equipment")` when single FM match exists
    - Set `equipment_type` from FMEA library data in all code paths
  - **Result**: New observations now show correct FMEA equipment type (e.g., "Heat Exchanger" for Fouling).

- **Task Template Creation Fixed** (Mar 24, 2026):
  - **Problem**: Could not create and save task templates - API returning validation errors.
  - **Root Cause**:
    1. Frontend using wrong API endpoint (`/api/tasks/templates` vs correct `/api/task-templates`)
    2. Frontend discipline values ("mechanical", "electrical") didn't match backend enum ("operations", "maintenance", "lab", "inspection", "engineering")
    3. Frontend mitigation strategy "condition_based" didn't match backend "detective"
  - **Fixes Applied**:
    - Fixed API endpoints in `TaskSchedulerPage.js` to use `/api/task-templates`
    - Updated discipline dropdown options to: Operations, Maintenance, Lab, Inspection, Engineering
    - Updated strategy dropdown to: Preventive, Predictive, Detective, Corrective
    - Fixed DisciplineBadge colors for new discipline values
  - **Result**: Task templates can now be created and saved successfully.

- **Chat Disambiguation Improvements** (Mar 24, 2026):
  - **Changes Made**:
    1. Switched back to GPT-5.2 for better analysis quality (was using GPT-4o-mini for speed)
    2. Added "strainer", "filter", "tank", "vessel", "pipe", "sensor", "turbine" to generic equipment terms for disambiguation
    3. After equipment selection, system now checks if the failure mode matches multiple FMEA entries and asks user to select
    4. Added `user_selected_failure_mode` flag to prevent re-asking after user makes selection
  - **Flow Now Works**:
    - "strainer fouling" → asks "which strainer?" (shows options)
    - User selects strainer → asks "which type of fouling?" (Fouling, Material Buildup/Fouling)
    - User selects failure type → "Observation recorded successfully"
  - **Files Modified**: `/app/backend/server.py`

- **Chat Failure Mode Selection Loop Fixed** (Mar 24, 2026):
  - **Problem 1**: When user typed specific failure modes like "fouling", system showed irrelevant equipment-based fallback suggestions.
  - **Problem 2**: After selecting a failure mode, the chat would loop back asking for equipment/failure mode endlessly.
  - **Root Cause**: 
    1. `user_has_vague_failure` flag was overriding matched results with equipment-type fallbacks
    2. No handler existed for when user clicks a failure mode suggestion button
  - **Fixes Applied** (`/app/backend/server.py`):
    1. Improved scoring: exact name match +50pts, keyword match +30pts, equipment boost +15pts
    2. Confidence-based filtering: high (≥30pts), medium (≥10pts) thresholds
    3. Added failure mode selection handler (lines 1092-1158) that detects "Failure mode: X" pattern from frontend
    4. Handler extracts equipment context from conversation history and creates complete observation
  - **Result**: Chat flow now completes correctly: report → select equipment → select failure mode → "Observation recorded"

- **App Icon Updated** (Mar 24, 2026):
  - Generated new professional icon: gear/shield with checkmark on deep blue gradient
  - Created all required sizes: logo.png (128), logo192.png, logo512.png, apple-touch-icon.png (180), favicon-32x32.png, favicon-16x16.png
  - Updated index.html with proper favicon links
  - Updated manifest.json with matching dark background color (#1e3a5f)

- **PWA Offline Sync Complete** (Mar 24, 2026):
  - **New Files**:
    - `/app/frontend/src/lib/offlineQueue.js` - IndexedDB utility for offline data queue
    - `/app/frontend/src/hooks/useOfflineSync.js` - React hook for offline sync
  - **Features**:
    - IndexedDB stores for: pending_observations, pending_tasks, pending_forms, pending_threats, cached_data
    - Automatic network status detection (online/offline)
    - Queue functions for observations, tasks, forms, and threat reports
    - Background sync registration when back online
    - Manual sync trigger with visual feedback
  - **UI Integration**:
    - Offline status indicator in header (WiFi icon)
    - Green = online & synced, Amber = pending items, Red = offline
    - Badge showing pending item count
    - Click to manually sync pending items
  - Updated service-worker.js with forms and threats sync handlers

- **Form Designer UI Complete** (Mar 24, 2026):
  - **New Page**: `/forms` - Form Designer for creating and managing data collection forms
  - **Features**:
    - Template management with CRUD operations
    - Stats cards (Templates, Submissions, Warnings, Critical counts)
    - Two tabs: Templates and Submissions
    - Search and discipline filter
    - Create form template dialog with:
      - Basic info (name, description, discipline)
      - Signature requirement toggle
      - Allow partial submission toggle
      - Dynamic field builder with 12 field types:
        - Numeric (with thresholds: warning/critical low/high)
        - Text, Textarea, Dropdown, Multi-select
        - Boolean, Range slider, Date, DateTime
        - File upload, Image upload, Signature
    - Field preview with drag handle, edit/delete actions
    - Form submission viewer with expandable value details
    - Threshold status badges (Normal, Warning, Critical)
  - New file: `/app/frontend/src/pages/FormsPage.js`

- **Decision Engine UI Complete** (Mar 24, 2026):
  - **New Page**: `/decision-engine` - AI Engine for automated learning rules and suggestions
  - **Features**:
    - Dashboard stats (Pending, Approved, Executed, High Priority, Rules Active)
    - Two tabs: Suggestions and Rules
    - Status and priority filters for suggestions
    - Suggestion cards with:
      - Title and description
      - Status badge (Pending, Approved, Rejected, Executed)
      - Priority badge (High, Medium, Low)
      - Expandable recommended action JSON
      - Approve/Reject/Execute action buttons
    - Rule cards with:
      - Rule name, description
      - Category and trigger type badges
      - Enable/disable toggle
      - Auto-execute badge for automatic rules
      - Configure button for settings
    - Rule configuration dialog with enable/auto-execute toggles
    - Approve/Reject dialogs with notes/reason fields
    - "Evaluate Rules" button to generate new suggestions
  - New file: `/app/frontend/src/pages/DecisionEnginePage.js`

- **Navigation Updated**:
  - Added "Forms" tab (FileText icon) between Tasks and AI Engine
  - Added "AI Engine" tab (Brain icon) between Forms and Analytics
  - Routes added: `/forms` and `/decision-engine`

- **Voice & Image Input Enabled** (Mar 24, 2026):
  - **Voice Input**: Users can record voice messages using the microphone button
    - Uses OpenAI Whisper (`whisper-1`) via emergentintegrations library
    - Supports webm audio format from browser MediaRecorder
    - Transcribed text auto-fills the chat input
    - Visual recording indicator with pulse animation
  - **Image Input**: Users can attach photos of equipment failures
    - Supports JPEG, PNG, WebP formats (max 5MB)
    - AI analyzes images using GPT-5.2 vision capabilities
    - Image context merged with text description for threat analysis
  - **Enhanced UI**:
    - Added quick tips showing "Attach photo" and "Voice input" labels
    - Tooltips on hover for all action buttons
    - Updated placeholder text: "Describe the issue or use voice/image..."
    - Improved recording state with animated pulse indicator
  - Files modified: `/app/frontend/src/components/ChatSidebar.js`, `/app/backend/server.py`

- **Phase 6 Complete: Analytics Dashboard & RBAC** (Mar 24, 2026):
  - **Analytics Dashboard** (`/analytics`):
    - Risk Overview: Total threats, critical risks, high risk EFMs, avg RPN
    - Task Compliance: Compliance rate, overdue tasks, issues found rate
    - Form Submissions: Total, warning/critical rates
    - Top Risks by RPN: Equipment Failure Modes ranked by risk
    - Failure Mode Pareto: Most observed failure modes with cumulative percentage
    - Equipment Risk Ranking: Equipment by aggregated failure mode risk
    - Detection Effectiveness: Effective vs ineffective tasks by detection rate
    - Task Workload: 7-day calendar view of scheduled tasks
    - Under-controlled risks, Over-maintained assets analysis
  - **RBAC (Role-Based Access Control)** (`Settings → User Management`):
    - 5 User Roles: Admin, Reliability Engineer, Maintenance, Operations, Viewer
    - Role stats cards showing user distribution
    - User table with name, email, role, department, last login, status
    - Edit profile dialog (name, department, position, phone)
    - Change role dialog with role descriptions
    - Activate/Deactivate user functionality
    - Role filtering and user search
  - New files: `/app/backend/services/analytics_service.py`, `/app/backend/services/rbac_service.py`
  - New pages: `AnalyticsDashboardPage.js`, `SettingsUserManagementPage.js`, `TaskSchedulerPage.js`
  - 15+ new API endpoints for analytics and user management
- **Phase 7 Started: Mobile & Offline PWA** (Mar 24, 2026):
  - PWA manifest.json with app metadata and shortcuts
  - Service worker for offline caching (static assets, API responses)
  - Offline.html fallback page
  - IndexedDB structure for pending observations and tasks
  - Background sync registration for offline data submission
- **Frontend Navigation Updated**:
  - Added "Tasks" and "Analytics" tabs to main navigation
  - Settings menu now leads to User Management (implemented) and Statistics (links to Analytics)

### Previous Update (Mar 23, 2026)
- **Phase 5 Complete: Decision Engine (Closed-Loop Learning)** (Mar 23, 2026):
  - **5 Built-in Rules**:
    1. **Task Frequency Adjustment**: Suggests increasing frequency when observation rate is high
    2. **Detection Gap**: Suggests new detection task when failures occur without prior warning
    3. **EFM Likelihood Update**: Auto-increases EFM likelihood based on observations (AUTO-EXECUTE)
    4. **New Failure Mode Suggestion**: Suggests creating new FM for recurring unlinked observations
    5. **Task Effectiveness Review**: Flags tasks with low detection rates despite high observation rates
  - **Suggestion Workflow**: Pending → Approve/Reject → Execute
  - **Configurable Rules**: Enable/disable, auto-execute, custom thresholds
  - **Dashboard**: Stats for pending/approved/executed suggestions
  - New file: `/app/backend/services/decision_engine.py`
  - 8 API endpoints for rules, suggestions, and execution
- **Phase 4 Complete: Observation Engine** (Mar 23, 2026):
  - **Chat Integration**: Observations auto-created when threats captured via chat
  - **AI Failure Mode Suggestions**: Keyword-based matching with relevance scoring (Bearing Failure matched at 77.2% for vibration+noise+bearing description)
  - **Structured Observations**: Manual creation with equipment, severity, measured values, tags
  - **Link to EFMs**: Observations can be linked to specific Equipment Failure Modes
  - **Combined View**: See observations from all sources (manual, chat, form threshold breaches)
  - **Unlinked Queue**: Observations without failure mode get AI suggestions automatically
  - **Trends & Analytics**: By severity, failure mode, equipment over configurable time periods
  - New file: `/app/backend/services/observation_service.py`
  - 10+ API endpoints for observation CRUD, suggestions, linking, trends
- **Phase 3 Complete: Form Designer & Data Capture** (Mar 23, 2026):
  - **Form Templates**: Reusable forms with versioning, discipline tagging, equipment/failure mode linkage
  - **Field Types**: Numeric (with units), Text, Textarea, Dropdown, Multi-select, Boolean, Range, Date, File, Image, Signature
  - **Threshold System**: Warning/Critical thresholds with automatic evaluation
  - **Failure Indicators**: Dropdown options can mark failure, numeric fields can trigger on above/below/outside range
  - **Auto-Observations**: Critical threshold breaches automatically create observations in the database
  - **Analytics**: Field statistics (avg/min/max), warning/critical rates per form
  - New files: `/app/backend/models/form_models.py`, `/app/backend/services/form_service.py`
  - 15+ API endpoints for templates, fields, submissions, and analytics
- **Phase 2 Complete: Task Management System** (Mar 23, 2026):
  - **Task Templates**: Reusable task definitions with discipline, mitigation strategy, procedure steps, safety requirements, tools, and spare parts
  - **Task Plans**: Equipment-specific schedules with interval overrides (time/usage/condition-based)
  - **Task Instances**: Individual scheduled tasks with full lifecycle (planned → in_progress → completed)
  - **Auto-Scheduling**: Generate instances from plans with configurable horizon
  - **Execution Tracking**: Start/complete tasks with duration, issues found, follow-up flags
  - **Calendar View**: Date-range query for task visualization
  - **Statistics**: Dashboard metrics (by status, due this week, completed)
  - New files: `/app/backend/models/task_models.py`, `/app/backend/services/task_service.py`
  - 20+ API endpoints for complete CRUD + workflow operations
- **Phase 1B Complete: Equipment Failure Modes (EFM) Layer** (Mar 23, 2026):
  - Created `equipment_failure_modes` MongoDB collection
  - New service: `/app/backend/services/efm_service.py`
  - **Auto-generation**: EFMs auto-created when equipment linked to equipment type
  - **Sync on type change**: EFMs updated/deactivated when equipment type changes
  - **Override capability**: Per-equipment likelihood/detectability/severity overrides
  - **Risk calculation**: Equipment risk aggregation from EFMs
  - **API Endpoints**:
    - `GET /equipment/{id}/efms` - Get EFMs for equipment
    - `GET /equipment/{id}/efms/summary` - EFM statistics
    - `GET /equipment/{id}/risk` - Aggregated risk calculation
    - `POST /equipment/{id}/efms/generate` - Manual EFM generation
    - `PATCH /efms/{id}` - Update EFM (override template)
    - `POST /efms/{id}/reset` - Reset to template values
    - `GET /efms/high-risk` - High-risk EFMs across equipment
  - Template propagation: Changes to failure mode library propagate to non-overridden EFMs
- **Phase 1A Complete: Migrated Failure Modes to MongoDB** (Mar 23, 2026):
  - Created `failure_modes` MongoDB collection with 215 seeded failure modes
  - Added **ISO 14224 Mechanism** field to each failure mode (e.g., "SHC - Electrical - Short Circuit")
  - New service layer: `/app/backend/services/failure_modes_service.py` (async MongoDB operations)
  - Migration script: `/app/backend/migrations/seed_failure_modes.py`
  - All CRUD operations now persist to MongoDB (previously in-memory only)
  - Created indexes: `legacy_id`, `category`, `equipment`, `failure_mode`, `equipment_type_ids`, `mechanism`
  - Fallback to static library if MongoDB is empty (backward compatible)
  - Updated UI to display ISO 14224 Mechanism badge in failure mode detail panel
  - Added EN/NL translations for mechanism label
- **Renamed "Root Cause" to "Probable Cause"** (Mar 23, 2026):
  - Updated ThreatDetailPage.js section header from "Root Cause" to "Probable Cause"
  - Updated placeholder text from "Enter root cause analysis..." to "Enter probable cause analysis..."
  - Updated LanguageContext.js translations for both EN ("Probable Cause") and NL ("Waarschijnlijke Oorzaak")
  - Per user request to align terminology across the application
- **Backend Refactoring - Route Modules Created** (Mar 23, 2026):
  - Created modular route files in `/app/backend/routes/`:
    - `equipment.py` (853 lines): Equipment hierarchy management, ISO 14224 compliance
    - `investigations.py` (738 lines): Causal Engine, root cause analysis
    - `actions.py` (263 lines): Centralized action management, overdue tracking
    - `deps.py` (88 lines): Shared dependencies, auth, utilities
    - `auth.py` (110 lines): Authentication routes
    - `threats.py` (184 lines): Threat CRUD operations
    - `stats.py` (251 lines): Statistics and dashboard data
  - Total route modules: 2,505 lines
  - Main `server.py` still at 5,562 lines (to be gradually migrated)
  - Refactoring follows incremental approach to avoid breaking changes
- **Recalibrated Full FMEA Database RPN with New Definitions** (Mar 23, 2026):
  - Recalibrated all 215 failure modes in the FMEA library with new realistic values
  - **New Severity Scale (Repair Complexity)**: 
    - 1-3: Quick fix (minor repair, simple swap)
    - 4-6: Moderate (some downtime, skilled labor)
    - 7-9: Significant (major work, extended downtime)
    - 10: Full replacement (catastrophic, complete rebuild)
  - **New Occurrence Scale (Expected Interval)**:
    - 1-3: Every 10-20 years (rare events)
    - 4-6: Every 1-5 years (occasional)
    - 7-8: Monthly to yearly (frequent)
    - 9-10: Every few weeks (very frequent)
  - Applied intelligent calibration rules by failure type and category
  - RPN Distribution: 0-50 (3), 51-100 (17), 101-150 (96), 151-200 (91), 201+ (8)
  - Triggered recalculation of all 8 existing threats with new FMEA values
- **FMEA Score Change Propagation to Threats** (Mar 23, 2026):
  - When FMEA scores (Severity, Occurrence, Detectability) are changed in the Library, all linked threats recalculate their risk scores
  - Fixed `recalculate_threat_scores_for_failure_mode` function to use correct formula: `(Criticality × 0.75) + (Likelihood × 0.25)` (was incorrectly averaging)
  - Updated `GET /api/threats/{threat_id}` to also auto-sync FMEA score from the linked failure mode
  - API response includes `threats_updated` count when FMEA scores change
- **Auto-Sync Criticality on Threat Open** (Mar 23, 2026):
  - When opening a threat detail page, the system now automatically syncs the criticality from the linked equipment
  - Modified `GET /api/threats/{threat_id}` to:
    - Look up linked equipment by `linked_equipment_id` or asset name
    - Recalculate and update `risk_score`, `criticality_score`, `risk_level` if they've changed
    - Auto-link the equipment if found by name but not yet linked
  - Frontend ThreatDetailPage now uses `refetchOnMount: "always"` and `staleTime: 0` to ensure fresh data
  - This ensures threats always show the latest criticality even if changed in Equipment Manager
- **Criticality Change Propagation to Threats** (Mar 23, 2026):
  - When criticality is changed in Equipment Manager, all linked threats are automatically recalculated
  - Updated `recalculate_threat_scores_for_asset` function to use the correct formula: `Risk Score = (Criticality × 0.75) + (Likelihood Score × 0.25)`
  - Threats are found by both asset name AND `linked_equipment_id` for comprehensive coverage
  - Updated fields on propagation: `risk_score`, `criticality_score`, `fmea_score`, `risk_level`, `equipment_criticality`, `equipment_criticality_data`
  - API response includes `threats_updated` count
- **Human Validation Feature for Failure Modes** (Mar 23, 2026):
  - Added validation status tracking for each failure mode in the FMEA Library
  - New fields: `is_validated`, `validated_by_name`, `validated_by_position`, `validated_at`
  - Visual indicators in the failure mode list (✓ green checkmark for validated, ⚠ amber warning for not validated)
  - Validation section in the detail panel showing:
    - "Not Yet Validated" amber warning with "Validate" button for unvalidated modes
    - "Validated" green box showing validator name, position, and date for validated modes
    - "X" button to remove validation if needed
  - Validate dialog with name and position input fields
  - New API endpoints: `POST /api/failure-modes/{id}/validate`, `POST /api/failure-modes/{id}/unvalidate`
  - Full EN/NL translations for all validation-related UI text
- **Terminology Update - Failure Modes "Risk Score" → "Likelihood Score"** (Mar 23, 2026):
  - Changed "Risk Score" label to "Likelihood Score" in the Failure Modes Library detail panel
  - Updated both English and Dutch translations in LanguageContext.js
  - Updated variable name from `riskScore` to `likelihoodScore` in FailureModesPage.js
  - Updated code comments to reflect the terminology change

### Previous Update (Mar 22, 2026)
- **NEW Risk Score Methodology** (Mar 22, 2026):
  - Changed formula from multiplier-based to averaging: **Risk Score = (Criticality Score + FMEA Score) / 2**
  - Criticality Score = (Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5 (0-100)
  - FMEA Score = (Severity × Occurrence × Detectability) / 10 (0-100)
  - Updated all backend endpoints: link-equipment, link-failure-mode, recalculate-scores
  - Updated frontend Score Calculation popup to display the new formula
  - Updated Risk Methodology Info Dialog with new documentation
  - Full EN/NL translations for all new labels
- **Better Failure Mode Linking during Threat Creation** (Mar 22, 2026):
  - Updated AI system prompt to explicitly extract failure mode names from chat text
  - Implemented multi-priority fuzzy matching against the FMEA library
  - Auto-assigns `failure_mode_id` and `failure_mode_data` to new threats
  - Added new API endpoint: `POST /api/threats/{threat_id}/link-failure-mode`
  - Added "Link Failure Mode" dialog in Threat Detail page with searchable FMEA list
- **4-Dimension Criticality System** (Mar 22, 2026): Safety, Production, Environmental, Reputation impacts
- Added Reliability Performance Dashboard with snowflake/radar chart visualization
- Implemented deep linking from dashboard numbers to related app sections

### Risk Score Calculation (Current Methodology)
```
Criticality Score = (Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5
FMEA Score = (Severity × Occurrence × Detectability) / 10

Final Risk Score = (Criticality × 0.7) + (FMEA × 0.3)
  - Criticality weighted at 70%
  - FMEA weighted at 30%

Risk Levels:
- Critical: ≥70
- High: 50-69
- Medium: 30-49
- Low: <30
```

### Codebase Architecture (Dec 2025 Cleanup)

#### Backend Structure
```
/app/backend/
├── server.py              # Main API server (4,364 lines - to be further split)
├── routes/                # NEW: Modular API routes
│   ├── __init__.py
│   ├── deps.py           # Shared dependencies (db, auth, utils)
│   ├── auth.py           # Authentication endpoints
│   ├── threats.py        # Threat management endpoints  
│   └── stats.py          # Statistics & reliability scores
├── ai_risk_engine.py
├── maintenance_strategy_generator.py
├── maintenance_strategy_models.py
├── investigation_models.py
├── iso14224_models.py
└── failure_modes.py
```

#### Frontend Structure  
```
/app/frontend/src/
├── components/
│   ├── maintenance/       # NEW: Extracted maintenance components
│   │   ├── index.js
│   │   ├── constants.js
│   │   ├── CollapsibleSection.jsx
│   │   ├── EditableItem.jsx
│   │   └── FailureModesDisplay.jsx
│   ├── MaintenanceStrategiesPanel.jsx
│   ├── BackButton.jsx     # NEW: Navigation back button
│   └── ...
├── pages/
└── contexts/
```

### Core Modules

#### 1. Chat Interface (Completed)
- AI-powered chat sidebar for threat reporting
- Conversational follow-up questions for detail gathering
- In-chat threat summary cards
- Mobile-responsive design

#### 2. AI Structuring Engine (Completed)
- Natural language parsing using GPT-5.2
- Automatic risk classification
- Action recommendation generation

#### 3. Risk & Prioritization Engine (Completed)
- Risk scoring algorithm
- Priority ranking
- Criticality assessment

#### 4. Threat Database (Completed)
- MongoDB storage for threats
- User authentication (JWT)
- Full CRUD operations

#### 5. Equipment Hierarchy & Criticality Manager - ISO 14224 (Updated Mar 22, 2026)
- **Three-panel UI**: Libraries (left), Hierarchy Canvas (center), Properties (right)
- **ISO 14224 Hierarchy Levels** (Updated Mar 18, 2026):
  - Installation (Level 1: Offshore platform, Onshore plant)
  - Plant/Unit (Level 2: Production unit, Utility unit)
  - Section/System (Level 3: Gas compression, Water injection)
  - Equipment Unit (Level 4: Compressor, Pump, Heat exchanger)
  - Subunit (Level 5: Driver, Driven unit, Control system) - NEW
  - Maintainable Item (Level 6: Bearing, Seal, Impeller)
- **4-Dimension Criticality Assignment** (Mar 22, 2026):
  - Safety Impact (1-5, red color scale)
  - Production Impact (1-5, orange color scale)
  - Environmental Impact (1-5, green color scale)
  - Reputation Impact (1-5, purple color scale)
  - Overall Criticality = max of all dimensions
  - Backwards compatible level mapping: safety_critical, production_critical, medium, low
- **Discipline Mapping**: Mechanical, Electrical, Instrumentation, Process
- **Equipment Type Library**: 20+ ISO-compliant equipment types with icons
- **Custom Equipment Types**: Add/edit/delete custom types
- **Unstructured Import**: 
  - Parse equipment lists from text (paste)
  - Upload files (Excel, PDF, CSV, TXT)
  - Auto-detect equipment types from names/tags
- **Move Mode**: Click-based node repositioning (select node → click "Move" → click valid parent)

#### 6. Equipment Navigation Sidebar - ISO 14224 (Updated Mar 18, 2026)
- **Tree View**: Hierarchical tree showing equipment structure from DB
- **Levels View**: ISO 14224 taxonomy summary with counts per level
- **Legacy Support**: Maps old level names (unit, system, equipment) to ISO 14224 equivalents
- **Threat Counts**: Shows number of threats per equipment node
- **Quick Navigation**: Click to navigate to Equipment Manager with node selected

### Technical Architecture

```
/app/
├── backend/
│   ├── server.py           # FastAPI server with all endpoints
│   ├── iso14224_models.py  # ISO 14224 data models and validation
│   ├── failure_modes.py    # Failure modes library
│   └── services/
│       └── ai_service.py   # OpenAI GPT-5.2 integration
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.js               # Main layout with Settings menu
│   │   │   ├── ChatSidebar.jsx         # AI chat interface
│   │   │   └── EquipmentHierarchy.js   # ISO 14224 navigation sidebar
│   │   ├── pages/
│   │   │   ├── ThreatsPage.js
│   │   │   ├── EquipmentManagerPage.js # ISO 14224 module
│   │   │   └── FailureModesPage.js
│   │   └── lib/
│   │       └── api.js      # API client
└── memory/
    └── PRD.md
```

### ISO 14224 Level Configuration

| Level Key | ISO 14224 Label | Description | Icon |
|-----------|-----------------|-------------|------|
| installation | Installation | Offshore platform, Onshore plant | Building2 |
| plant_unit | Plant/Unit | Production unit, Utility unit | Factory |
| section_system | Section/System | Gas compression, Water injection | Settings |
| equipment_unit | Equipment Unit | Compressor, Pump, Heat exchanger | Cog |
| subunit | Subunit | Driver, Driven unit, Control system | Box |
| maintainable_item | Maintainable Item | Bearing, Seal, Impeller | Wrench |

**Legacy Level Mapping:**
- `unit` → `plant_unit`
- `system` → `section_system`
- `equipment` → `equipment_unit`

### Key API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

#### Threats
- `GET /api/threats` - List all threats
- `GET /api/threats/{id}` - Get threat details
- `POST /api/chat/send` - Send chat message (creates threats)
- `POST /api/threats/{id}/investigate` - Create investigation from threat

#### Causal Investigations
- `GET /api/investigations` - List all investigations
- `POST /api/investigations` - Create investigation
- `GET /api/investigations/{id}` - Get investigation details
- `PATCH /api/investigations/{id}` - Update investigation
- `DELETE /api/investigations/{id}` - Delete investigation
- `POST /api/investigations/{id}/events` - Add timeline event
- `POST /api/investigations/{id}/failures` - Add failure identification
- `POST /api/investigations/{id}/causes` - Add causal node
- `POST /api/investigations/{id}/actions` - Add corrective action

#### Equipment Hierarchy (ISO 14224)
- `GET /api/equipment-hierarchy/iso-levels` - Get ISO 14224 levels with labels and hierarchy
- `GET /api/equipment-hierarchy/types` - Get equipment types (merged default + custom)
- `POST /api/equipment-hierarchy/types` - Create custom type
- `PATCH /api/equipment-hierarchy/types/{id}` - Update type
- `DELETE /api/equipment-hierarchy/types/{id}` - Delete custom type
- `GET /api/equipment-hierarchy/nodes` - Get hierarchy nodes
- `POST /api/equipment-hierarchy/nodes` - Create node
- `PATCH /api/equipment-hierarchy/nodes/{id}` - Update node
- `DELETE /api/equipment-hierarchy/nodes/{id}` - Delete node (cascades)
- `POST /api/equipment-hierarchy/nodes/{id}/move` - Move node to new parent
- `POST /api/equipment-hierarchy/nodes/{id}/reorder` - Reorder node up/down among siblings
- `POST /api/equipment-hierarchy/nodes/{id}/reorder-to` - Reorder node to specific position (for drag-drop)
- `POST /api/equipment-hierarchy/nodes/{id}/change-level` - Promote/demote node level
- `POST /api/equipment-hierarchy/nodes/{id}/criticality` - Assign criticality
- `POST /api/equipment-hierarchy/nodes/{id}/discipline` - Assign discipline

#### Unstructured Import
- `GET /api/equipment-hierarchy/unstructured` - Get unassigned items
- `POST /api/equipment-hierarchy/parse-list` - Parse text list
- `POST /api/equipment-hierarchy/parse-file` - Parse uploaded file
- `POST /api/equipment-hierarchy/unstructured/{id}/assign` - Assign to hierarchy
- `DELETE /api/equipment-hierarchy/unstructured/{id}` - Delete item

### Test Credentials
- Email: test@test.com
- Password: test

### Completed Features (Mar 19, 2026)
- [x] Full-stack MVP with React, FastAPI, MongoDB
- [x] JWT authentication
- [x] AI chat interface with GPT-5.2
- [x] Threat management and prioritization
- [x] Failure Modes Library (100+ modes)
- [x] Equipment Hierarchy navigator sidebar
- [x] Mobile-responsive design
- [x] Equipment Manager module (ISO 14224)
- [x] Three-panel hierarchy editor
- [x] Drag-drop unstructured list import
- [x] Auto-detection of equipment types
- [x] Editable ISO 14224 equipment type library
- [x] Direct drag-drop assignment (no confirmation)
- [x] Click-based "Move Mode" for hierarchy repositioning
- [x] **ISO 14224 Aligned Hierarchy** (Mar 18, 2026):
  - Added "Subunit" level between Equipment Unit and Maintainable Item
  - Updated terminology to match ISO 14224 standard
  - Left sidebar now shows ISO 14224 taxonomy levels with counts
  - Legacy level support for backward compatibility
- [x] **Causal Engine Module** (Mar 19, 2026):
  - Investigation cases creation and management
  - Event timeline with categories
  - Failure mode identification
  - Causal tree building with root cause flagging
  - Corrective action tracking
  - Integration with threat detail page ("Start Investigation" button)
- [x] **Drag-and-Drop Hierarchy Reordering** (Mar 19, 2026):
  - Fixed critical bug with undefined `movingNode` state
  - New backend endpoint `POST /api/equipment-hierarchy/nodes/{id}/reorder-to` for position-based reordering
  - Drag nodes to reorder among siblings (drop on top/bottom edge)
  - Drag nodes to become children of other nodes (drop in center)
  - Visual feedback during drag operations (blue highlight, drop indicators)
  - Toast notifications for successful moves
- [x] **Persistent Hierarchy Expansion State** (Mar 19, 2026):
  - Equipment Manager page remembers expanded nodes via localStorage
  - Sidebar hierarchy remembers expanded nodes separately
  - Expansion state persists across page navigation and refreshes
- [x] **Libraries Moved to FMEA Page** (Mar 19, 2026):
  - Equipment Types and Criticality now in Library page under "Equipment & Criticality" tab
  - Equipment Manager simplified to two-panel layout
- [x] **FMEA Library Enhancements** (Mar 19, 2026):
  - Search functionality fixed (searches across all fields)
  - CRUD operations for Failure Modes (Create, Read, Update, Delete)
  - Auto-link to Equipment Types based on equipment name
  - Manual equipment type linking via dropdown
  - Keywords and Recommended Actions editable with add/remove
  - Live RPN calculation in dialog
  - Built-in modes can be edited but not deleted
- [x] **Custom FMEA Data Integration** (Mar 19, 2026):
  - Integrated failure modes from user-provided FMEA 2022-2023.xlsx (rubber recycling plant)
  - Library expanded from original ~100 modes to **200 failure modes**
  - **8 new categories added**: Extruder (38 modes), Material Handling (10), Quality Control (12), Dosing (6), Ventilation (6), Cutting (5), Packaging (11), Cooling (6)
  - New modes include: Screw Wear, Material Out of Spec, Metal Detector issues, Hopper Bridging, Knife Wear, CO2 dosing, etc.
  - All data searchable and properly categorized with RPN values
- [x] **Global Undo System** (Mar 19, 2026):
  - Undo button in header on every page (amber colored when active)
  - Tracks up to 5 most recent actions
  - Shows tooltip with action description and count
  - Badge counter shows number of undoable actions
  - Supported undo operations:
    - Edit threat (reverts all field changes)
    - Delete failure mode (recreates the deleted mode)
    - Delete equipment node (recreates the deleted node)
    - Delete investigation (recreates the deleted investigation)
  - UndoContext.js provides pushUndo, undo, canUndo functions
  - Tests: 8/8 undo feature tests passed
- [x] **Hierarchical Threat Filtering** (Mar 19, 2026):
  - Clicking parent node in hierarchy filters threats from that node AND all descendants
  - Filter banner shows "(including X items below)" when filtering by parent
  - URL params: assets (comma-separated), assetName (display name)
- [x] **Centralized Actions Management** (Mar 19, 2026):
  - New "Actions" tab in navigation between Threats and Causal Engine
  - Dedicated ActionsPage.js with stats cards (Total, Open, In Progress, Completed, Overdue)
  - Filters: Status, Priority, Source Type (Threat/Investigation)
  - Search by title, description, assignee, action number
  - "Act" button on threat recommended actions (hover to reveal)
  - "Act" button on investigation corrective actions
  - Actions store: title, description, source_type, source_id, source_name, priority, status
  - Edit dialog: title, description, status, priority, assignee, discipline, due date, completion notes
  - Quick status toggle by clicking status icon
  - Backend: /api/actions CRUD endpoints with filtering
  - Backend tests: 20/20 passed
- [x] **UI/UX Consistency Redesign** (Mar 20, 2026):
  - ActionsPage.js redesigned to match ThreatsPage.js layout
  - FailureModesPage.js (Library) redesigned with consistent style
  - CausalEnginePage.js redesigned with:
    - Compact stats row at top (Events, Failures, Causes, Root Causes, Actions)
    - Tab navigation matching other pages
    - Card-based metadata display (Asset, Date, Lead)
    - Section tabs for Timeline, Failures, Causes, Actions
    - priority-list component styling for all item lists
  - Floating Action Button (+) for threat reporting (replaces header button)
  - Equipment Manager sidebar auto-collapses when navigating to page
  - Equipment Manager only shows Equipment Type/Discipline for lower hierarchy levels
- [x] **ThreatBase v2 - AI Risk Engine (Phase 1)** (Mar 21, 2026):
  - Dynamic Risk Scoring (0-100) replacing static labels
  - Failure Probability calculation (0-100%)
  - Time-to-Failure prediction with confidence scores
  - Risk Trend Tracking with visual indicators (↑ ↓ →)
  - Risk Forecast for 7/14/30 days ahead
  - Key Risk Factors identification
  - AI Recommendations generation
  - AIInsightsPanel component with circular risk gauge
  - Backend: /api/ai/analyze-risk/{threat_id}, /api/ai/risk-insights/{threat_id}, /api/ai/top-risks
  - MongoDB caching in ai_risk_insights collection
  - All tests passed: 17/17
- [x] **ThreatBase v2 - Causal Intelligence Engine (Phase 2)** (Mar 21, 2026):
  - Auto-generate Top 3-5 probable causes per threat
  - "Why is this happening?" explainability feature
  - Cause categories: technical, human_factor, maintenance, design, organizational, external
  - Probability ranking with supporting evidence
  - Recommended mitigations per cause
  - Fault Tree generation (auto-generated hierarchical structure)
  - Bow-Tie model generation with preventive/mitigative barriers
  - Action Optimization with ROI analysis (risk reduction per EUR)
  - CausalIntelligencePanel component with expandable cause cards
  - Backend: /api/ai/generate-causes, /api/ai/explain, /api/ai/fault-tree, /api/ai/bow-tie, /api/ai/optimize-actions
  - MongoDB caching in ai_causal_analysis, ai_fault_trees, ai_bow_ties, ai_action_optimization collections
  - GPT-5.2 LLM integration via emergentintegrations

### ThreatBase v2 Architecture Update

```
/app/
├── backend/
│   ├── server.py               # Main API with AI endpoints
│   ├── ai_risk_engine.py       # NEW: AI Risk Engine service (GPT-5.2)
│   ├── ai_risk_models.py       # NEW: Pydantic models for AI features
│   ├── iso14224_models.py
│   ├── investigation_models.py
│   └── failure_modes.py        
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AIInsightsPanel.jsx        # NEW: AI Risk Analysis UI
│       │   ├── CausalIntelligencePanel.jsx # NEW: Causal Intelligence UI
│       │   └── ...existing components
│       ├── pages/
│       │   ├── ThreatDetailPage.js  # Updated with AI panels
│       │   └── ...existing pages
│       └── lib/
│           └── api.js              # NEW: aiRiskAPI methods
```

### New AI Collections (MongoDB)
- `ai_risk_insights` - Cached risk analysis results
- `ai_causal_analysis` - Cached causal analysis
- `ai_fault_trees` - Cached fault tree structures
- `ai_bow_ties` - Cached bow-tie models
- `ai_action_optimization` - Cached action recommendations

### Future Tasks (Backlog)
- [ ] P1: Complete Multi-Language (EN/NL) translations for all pages
- [ ] P2: Voice input for chat interface
- [ ] P2: Image analysis for damage detection
- [ ] P2: Report generation (PowerPoint/PDF) for Causal Investigations
- [ ] P2: AI Alerting System (proactive alerts when risk crosses thresholds)
- [ ] P2: Risk Timeline Graph visualization
- [ ] P2: Data Integration Layer (SCADA/CMMS/IoT)
- [ ] P3: Cross-Asset Learning Engine (pattern detection)
- [ ] P3: Export hierarchy to PDF/Excel
- [ ] P3: Bulk criticality assignment
- [ ] P3: Equipment template library
- [ ] P3: Migrate FMEA library from Python file to MongoDB for better scalability
- [ ] P3: Break down FailureModesPage.js into smaller components

### Changelog

#### Mar 22, 2026 - Maintenance Strategy Module
- [x] **Maintenance Strategy Database & Auto-Generation** (Mar 22, 2026):
  - NEW: Complete Maintenance Strategy data model combining ALL 4 criticality levels per equipment type:
    - Safety Critical, Production Critical, Medium, Low - each with tailored strategies
    - Operator Rounds (frequency-based: shift/daily/weekly/monthly)
    - Detection Systems (vibration, temperature, pressure, etc. with alarm thresholds)
    - Scheduled Maintenance Tasks (preventive, predictive, condition-based)
    - Corrective Actions with response times and priorities
    - Emergency Procedures (for safety-critical equipment)
    - Spare Parts inventory recommendations
    - Failure Mode Mappings linking FMEA to maintenance actions
  - NEW: AI-powered strategy generation from FMEA failure modes
  - NEW: "Generate All" button to create strategies for all equipment types at once
  - NEW: Search functionality across strategies, spare parts, and failure modes
  - NEW: **Full editing capability** with dialogs for each component type:
    - Add/Edit/Delete operator rounds with checklist items
    - Add/Edit/Delete detection systems with alarm thresholds
    - Add/Edit/Delete scheduled maintenance tasks
    - Add/Edit/Delete corrective actions
    - Add/Edit/Delete emergency procedures
    - Add/Edit/Delete spare parts
    - All changes auto-increment strategy version
  - NEW: Strategy versioning (auto-increments on changes)
  - NEW: Tabbed UI showing all criticality levels in one card
  - NEW: "Maintenance" tab added to Library page
  - Backend files: `maintenance_strategy_models.py`, `maintenance_strategy_generator.py`
  - Frontend file: `MaintenanceStrategiesPanel.jsx`
  - API endpoints: `/api/maintenance-strategies/*`, `/api/maintenance-strategies/generate-all`

#### Mar 21, 2026 - AI Risk Score Alignment
- [x] **AI Risk Analysis Score Aligned with Threat Score** (Mar 21, 2026):
  - Fixed confusion where AI Risk Analysis showed a different score than the threat's actual Risk Score
  - AI Risk Analysis now uses the threat's FMEA-calculated risk score (Likelihood × Detectability × 10)
  - Updated RiskGauge component to use FMEA thresholds: Critical ≥150, High ≥100, Medium ≥50, Low <50
  - Updated ForecastChart to use 250-point FMEA scale
  - Backend `ai_risk_engine.py` now always returns threat's actual risk_score for consistency
  - Forecasts are now properly scaled to FMEA range (10-250)
  - Updated files: `/app/frontend/src/components/AIInsightsPanel.jsx`, `/app/backend/ai_risk_engine.py`

#### Mar 21, 2026 - Missing Library Data Warning
- [x] **Missing Library Data Warning in AI Risk Analysis** (Mar 21, 2026):
  - Added automatic detection of missing Equipment Types and Failure Modes from the FMEA library
  - When a threat's equipment type or failure mode is not found in the library, a prominent amber warning box appears
  - Warning shows exactly which items are missing with their values
  - "Go to Library" button navigates directly to the Library page for easy addition
  - Full EN/NL translation support for warning messages
  - Updated files: `/app/frontend/src/components/AIInsightsPanel.jsx`, `/app/frontend/src/contexts/LanguageContext.js`

#### Mar 21, 2026 - Searchable Dropdowns for Threat Editing
- [x] **Searchable Combobox for Asset, Equipment Type, Failure Mode** (Mar 21, 2026):
  - Created reusable `SearchableCombobox.jsx` component using Radix UI Command + Popover primitives
  - When editing a threat, Asset, Equipment Type, and Failure Mode fields now show searchable dropdowns
  - Asset dropdown populated from Equipment Hierarchy nodes (flattened tree with level descriptions)
  - Equipment Type dropdown populated from Equipment Types library (shows discipline as description)
  - Failure Mode dropdown populated from FMEA library (shows equipment category as description)
  - All dropdowns support:
    - Real-time search/filter functionality
    - Custom value entry (users can type a value not in the list)
    - Descriptions under each option for context
    - Checkmark indicating currently selected value
  - Fixed API response handling for nested data structures ({nodes: [...]}, {equipment_types: [...]}, {failure_modes: [...]})
  - Component located at: `/app/frontend/src/components/SearchableCombobox.jsx`
  - Updated file: `/app/frontend/src/pages/ThreatDetailPage.js`



#### Dec 2025 - Complete Dutch (NL) Localization
- [x] **Full Application Localization** (Dec 2025):
  - Extended `LanguageContext.js` with comprehensive translation dictionaries
  - Updated `FailureModesPage.js` with Dutch translations for:
    - Tab labels (Failure Modes, Equipment Types, Maintenance)
    - Form labels (Category, Equipment, Severity, Occurrence, etc.)
    - Dialog titles (Add/Edit Failure Mode, Add/Edit Equipment Type)
    - Button labels (Add, Cancel, Save, Create)
    - Empty states and search placeholders
  - Updated `EquipmentManagerPage.js` with Dutch translations for:
    - Toolbar buttons (Import List, Add Installation, Add Child)
    - Search placeholder and match counts
    - Empty state messages
    - Dialog titles and form labels
    - Move mode banner text
  - Updated `CausalEnginePage.js` with Dutch translations for:
    - Investigation sidebar (title, search, empty state)
    - Tab labels (Overview, Timeline, Failures, Causal Tree, Actions)
    - Dialog forms (Event, Failure, Cause, Action dialogs)
    - Form labels and button text
  - Added URL parameter handling in `FailureModesPage.js` for FMEA linkage from Maintenance Strategies
  - All pages now support seamless EN/NL language toggle


#### Dec 2025 - FMEA Linkage Bug Fix
- [x] **Fixed Missing FMEA Linkages in Maintenance Strategies** (Dec 2025):
  - Bug: Clickable FMEA failure mode badges were not visible in Maintenance Strategy cards
  - Root cause: `onFailureModeClick` handler was not being passed to `StrategyCard` component in the strategies mapping loop
  - Fix: Added `onFailureModeClick={handleFailureModeClick}` prop to `StrategyCard` in `MaintenanceStrategiesPanel.jsx` (line 1220)
  - The FMEA linkages now properly display as amber-colored clickable badges showing:
    - "Checks for:" (Operator Rounds - from checklist failure_modes_addressed)
    - "Detects:" (Detection Systems - from failure_modes_detected)
    - "Prevents:" (Scheduled Maintenance - from failure_modes_addressed)
    - "Addresses:" (Corrective Actions - from failure_modes)
  - Clicking a badge navigates to Library → Failure Modes with pre-filled search
  - Toast notification confirms the navigation action
  - File updated: `/app/frontend/src/components/MaintenanceStrategiesPanel.jsx`

#### Dec 2025 - Reliability Performance Dashboard
- [x] **Reliability Snowflake Dashboard** (Dec 2025):
  - Created `ReliabilitySnowflake.jsx` component with SVG radar/snowflake chart
  - 6 reliability dimensions: Criticality, Incidents, Investigations, Maintenance, Reactions, Threats
  - Visual profile with yellow filled area and dimension labels
  - Dynamic scoring based on actual equipment data
  - Created `ReliabilityPerformancePage.js` with:
    - Equipment hierarchy tree with mini score bars
    - Per-item and aggregated scoring
    - Level summary cards (Plant, Installation, Unit, System, etc.)
    - Dimension details panel with progress bars
    - Quick stats panel (dark theme)
  - Added backend API `/api/reliability-scores`:
    - Calculates scores for each of 6 dimensions per equipment
    - Aggregates scores up the hierarchy tree
    - Supports filtering by node_id or level
    - Returns global scores and summary statistics
  - Integrated into Dashboard page with tabs: "Operational" | "Reliability Performance"
  - Added Dutch (NL) translations for all new dashboard features
  - Files: `/app/frontend/src/components/ReliabilitySnowflake.jsx`, `/app/frontend/src/pages/ReliabilityPerformancePage.js`

- [x] **App Renamed to AssetIQ** (Dec 2025):
  - Renamed application from "PlantOS" to "AssetIQ" across all files
  - Updated: LoginPage.js, RegisterPage.js, Layout.js, LanguageContext.js, offlineQueue.js, index.html, manifest.json, service-worker.js, offline.html, server.py

- [x] **Failure Mode Matching with Selection** (Dec 2025):
  - Implemented failure mode suggestions similar to equipment matching
  - When AI detects multiple potential failure modes (score >= 40), shows selection UI
  - Backend changes to `server.py`:
    - Added `failure_mode_suggestions` field to ChatResponse model
    - Implemented scoring algorithm for failure mode matching (exact=100, containment=80, keyword=60, word overlap=40+)
    - Returns top 5 matching failure modes with id, name, category, equipment, severity, rpn, score
  - Frontend changes to `ChatSidebar.js`:
    - Added amber-colored failure mode suggestion buttons (distinct from blue equipment buttons)
    - Each button shows failure mode name, category badge, equipment type, and RPN score
    - Clicking a button directly submits the selected failure mode
    - "None of these / Describe differently" cancel option
  - Files: `/app/backend/server.py`, `/app/frontend/src/components/ChatSidebar.js`
