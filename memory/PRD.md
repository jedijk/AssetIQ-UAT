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

## Completed in This Session (Mar 26, 2026)

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

### P1 (High Priority)
- Image analysis for damage detection
- Report generation (PowerPoint/PDF) for Causal Investigations

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
