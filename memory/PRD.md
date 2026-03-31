# ThreatBase (AssetIQ) - Product Requirements Document

## Latest Updates (March 31, 2026)

### Database Stability & Bug Fixes Session
- **Fixed Null ID Index Errors:** Created cleanup script (`/app/backend/scripts/fix_null_ids.py`) that fixed 107 documents with `id: null` across 7 collections
  - Collections fixed: observations, task_templates, task_plans, task_instances, form_templates, form_submissions, equipment_failure_modes
  - All 7 `id_1` indexes now created successfully
- **Fixed Observation "Not Found" Bug:** Updated `get_observation_by_id` in `observation_service.py` to handle both ObjectId (`_id`) and string UUID (`id`) lookups
- **Database Connection Pooling:** Added MongoDB connection pooling settings to `database.py`:
  - `maxPoolSize=50`, `minPoolSize=10`
  - `serverSelectionTimeoutMS=10000`, `socketTimeoutMS=30000`
  - `retryWrites=True`, `retryReads=True`
- **Caching for Equipment Queries:** Added LRU caching to `get_descendants` in `installation_filter_service.py`

### Previous Session (March 30, 2026)
- **Code Refactoring & Cleanup:** Fixed import errors in backend routes
- **Linting:** Fixed 7 auto-fixable issues across backend routes
- **Testing:** All 13 core features passed comprehensive testing

### Earlier Updates
- **Task Planner Fixes:** Date picker in dialogs, plan CRUD operations, translation fixes
- **User Approval:** Fixed installation assignment during user approval
- **Password Reset:** Added admin reset password option in User Management
- **Form Builder:** Fixed dropdown interactions in dialogs (Radix UI portal issues)

## Original Problem Statement
Build an AI-Powered Threat Capture & Prioritization Platform with features including:
- User authentication and role-based access control
- Chat-based threat capture system with AI-powered risk analysis
- Risk prioritization engine
- Equipment Hierarchy FMEA Library (ISO 14224 compliant)
- User Statistics and Analytics
- Causal Engine for root cause analysis
- Mobile-optimized interfaces
- Task management and scheduling
- Form-based inspections and data collection

## Tech Stack
- **Frontend:** React with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **AI Integration:** OpenAI GPT-5.2 via Emergent LLM Key
- **File Storage:** Emergent Object Storage
- **Email:** Resend (requires domain verification for production)

## Core User Personas
1. **Admin** - Full system access, user management, configuration
2. **Reliability Engineer** - Risk analysis, equipment management, investigations
3. **Maintenance** - Task execution, observations, actions
4. **Operations** - Daily operations, observations
5. **Viewer** - Read-only access

---

## Completed Features (as of March 2026)

### Authentication & Authorization
- [x] JWT-based authentication
- [x] Role-based access control (RBAC)
- [x] User registration with approval workflow
- [x] Email notifications for approval/rejection (Resend)
- [x] Multi-installation assignment for users
- [x] Mobile-compatible User Management

### Dashboard
- [x] Overview statistics (Observations, Actions, Investigations, Equipment)
- [x] Risk level visualizations with correct color mapping
- [x] Deep linking to specific observations/actions/investigations
- [x] Avatar hover cards showing user name and position
- [x] Filtering by Owner, Discipline, Plant/Unit

### Observations (Threats)
- [x] AI-powered threat capture via chat
- [x] Risk prioritization with scoring
- [x] Equipment linking
- [x] Owner assignment
- [x] Action plan creation
- [x] Status tracking (Open, In Progress, Closed)

### Actions
- [x] Central action repository
- [x] Priority levels and due dates
- [x] Assignment to users
- [x] Completion tracking
- [x] Closure notification when all actions complete

### Causal Engine (Investigations)
- [x] Investigation creation and management
- [x] AI-generated summaries
- [x] Lead assignment from user directory
- [x] Investigation editing
- [x] PDF/PPTX report generation
- [x] Closure notification when all actions complete

### Equipment Hierarchy
- [x] ISO 14224 compliant structure
- [x] Criticality assessment (4-dimension model)
- [x] Equipment Failure Modes (EFM) library
- [x] Drag-and-drop reordering
- [x] Excel export
- [x] Equipment history timeline

### Tasks & Forms
- [x] Task scheduling and assignment
- [x] Form templates with dynamic fields
- [x] Task execution tracking
- [x] Mobile-optimized My Tasks page

### AI Features
- [x] GPT-5.2 powered threat analysis
- [x] AI document search
- [x] AI-generated investigation summaries
- [x] Intelligent risk scoring

---

## Latest Changes (March 30, 2026)
- **Task Creation Fix:** Fixed `'str' object has no attribute 'isoformat'` error in `task_service.py` by adding `_safe_isoformat()` helper function
  - Handles datetime fields that may already be stringified from MongoDB
  - Applied to `_serialize_template`, `_serialize_plan`, and `_serialize_instance` methods
- **Duration Input Improvement:** Changed task duration field from minutes-only input to Hours:Minutes format
  - Two separate number inputs for hours and minutes
  - Clearer UX with "Hours : Minutes" helper text
  - Works for both recurring and ad-hoc task templates
- **Form Builder Dropdown Fix:** Fixed Radix UI issue where Select dropdowns inside Dialogs would instantly close the parent modal
  - Updated `DialogContent` component to handle `onPointerDownOutside` and `onInteractOutside` events
  - Detects clicks on Radix portal elements (`data-radix-select-content`, `data-radix-popper-content-wrapper`)
  - Both Discipline dropdown and Field Type dropdown now work correctly in Form Designer
- **Installation-Based Data Filtering:** Implemented comprehensive data filtering across all pages based on user's assigned installations
  - Users with no assigned installations see NO data (zeros everywhere)
  - Both admins and regular users are filtered by their assignments
  - Equipment, Threats, Actions, Stats all respect installation filtering
- **User Management Enhancements:**
  - Added "Installations" column to user table showing assigned installations
  - Shows proper installation names (not UUIDs)
  - "No access" badge for users without installations
- **Data Sharing Model:** Changed from per-user data ownership to installation-based sharing
  - Anyone with installation access can see all equipment/threats/actions under that installation
  - Removed `created_by` filter from equipment, threats, and actions queries
- **Bug Fixes:**
  - Fixed hierarchy showing "No equipment hierarchy" for users
  - Fixed duplicate installation assignments (both UUID and name)
  - Fixed orphaned equipment nodes by linking section_systems to Tyromer

---

## Backlog

### P1 - High Priority
- [ ] Offline support with local storage for My Tasks execution
- [ ] Form execution flow in mobile My Tasks

### P2 - Medium Priority
- [ ] Bulk criticality assignment for equipment

### P3 - Low Priority / Tech Debt
- [ ] Refactor `MyTasksPage.js` (~1850 lines) - Extract TaskExecutionFrame
- [ ] Refactor `CausalEnginePage.js` (~1900 lines)
- [ ] Refactor `SettingsUserManagementPage.js` (~1750 lines)
- [ ] Module detail panel for User Statistics page

---

## Known Limitations
- **Resend Email:** Requires domain verification to send emails to external addresses
- **Offline Mode:** Not yet implemented for task execution

## Test Credentials
- **Owner Account:** `jedijk@gmail.com` / `admin123`
- **Admin Account:** `test@test.com` / `test`
