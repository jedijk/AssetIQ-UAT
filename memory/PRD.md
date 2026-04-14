# AssetIQ / ThreatBase - Product Requirements Document

## Original Problem Statement
Full-stack platform for AI-powered reliability intelligence featuring causal analysis, FMEA libraries, task scheduling, and user management. Robust full-stack platform optimized for multi-environment execution with dynamic database switching and accurate hierarchical equipment mapping.

## Tech Stack
- Frontend: React with React Query, Tailwind CSS, Shadcn/UI, Framer Motion, Recharts
- Backend: FastAPI with Motor (async MongoDB driver)
- Database: MongoDB Atlas
- Storage: MongoDB file storage (migrated from Emergent Object Storage)
- AI: OpenAI GPT-5.2, OpenAI Whisper via Emergent LLM Key

## Core Requirements
- Authentication with JWT
- Role-based access control (Owner, Admin, User, Custom roles)
- Equipment hierarchy management (ISO 14224)
- Threat/observation tracking with risk scoring
- Causal investigation engine
- Task planning and scheduling
- Form builder and submissions
- AI-powered risk analysis & chat assistant
- Production Dashboard for Line 90

---

## What's Been Implemented

### April 13, 2026 - Production Dashboard for Line 90 (COMPLETED)
**FEATURE - Full production analytics dashboard for Line 90 equipment:**

**Backend (`/app/backend/routes/production.py`):**
- `GET /api/production/dashboard` - Aggregates form submission data (Extruder settings, Mooney Viscosity, Big Bag Loading) into KPIs, time series, scatter data, and production log
- `GET /api/production/events` - Lists production actions/insights by date and type
- `POST /api/production/events` - Creates new production action or insight event
- `DELETE /api/production/events/{id}` - Deletes a production event
- `DELETE /api/production/seed-data` - Clears all seeded demo data (marked with `_seeded: True`)
- Data is queried from `form_submissions` collection filtered by template name and equipment name
- Events stored in `production_events` collection

**Frontend (`/app/frontend/src/pages/ProductionDashboardPage.js`):**
- Header with date selector (prev/next navigation), shift selector (Day/Night), refresh and Add Log buttons
- 6 KPI cards: Total Input, Waste, Yield, Avg Mooney Viscosity, RSD, Runtime
- Waste & Downtime Over Time composed chart (bars + line)
- Feed vs RPM vs Viscosity scatter chart
- Viscosity Trend line chart
- Actions panel with severity icons (critical/warning/success/info)
- Daily Insights panel
- Production Log table with search, anomaly row highlighting (amber)
- Add Event dialog (type, severity, title, description)

**Navigation:**
- Dashboard nav item converted to dropdown with "Overview" and "Production Line 90" sub-items
- Route: `/production`

**Seed Script (`/app/backend/scripts/seed_production_data.py`):**
- Seeds realistic Extruder, Viscosity, and Big Bag data for a given date
- Includes anomaly data point at 16:30 (sheet breaking, viscosity drop)
- Seeded data for 2026-04-12 and 2026-04-13
- Clear command: `curl -X DELETE "$API_URL/api/production/seed-data" -H "Authorization: Bearer $TOKEN"`

**Testing:** 19/19 backend, 17/17 frontend (100% pass rate - iteration 25)

**Files Created:**
- `/app/backend/routes/production.py`
- `/app/backend/scripts/seed_production_data.py`
- `/app/frontend/src/pages/ProductionDashboardPage.js`
- `/app/backend/tests/test_production_dashboard.py`

**Files Modified:**
- `/app/backend/routes/__init__.py` - Registered production router
- `/app/frontend/src/lib/api.js` - Added productionAPI methods
- `/app/frontend/src/components/Layout.js` - Dashboard dropdown with sub-items
- `/app/frontend/src/App.js` - Added /production route

---

### Previous Completed Work (Summary)
- Structural Code Audit & Refactor (unified API layer, fixed race conditions)
- Criticality quick info tooltips
- Risk score/RPN propagation (Equipment → Threats → Actions)
- AI Chat with language detection, voice-to-text, equipment tag matching
- Dynamic DB Environment Switching (Production vs UAT)
- MongoDB File Storage Migration
- QR Code Management Module
- Equipment Hierarchy Search Enhancement
- ISO 14224 Equipment Types and Failure Modes expansion
- Timezone Settings & Date Formatting
- Introduction Overlay / Onboarding Tour
- Server Performance & Security monitoring
- Excel Import for Equipment Hierarchy

### April 14, 2026 - Bug Fixes (COMPLETED)

**BUG FIX - Double Equipment Prompt in AI Chat (Phase 1 - Tag Matching):**
- **Root Cause**: When user clicked on equipment with a specific tag that wasn't in the current suggestions list, the name-only matching would incorrectly match to a different equipment with the same name but different tag
- **Fix**: If user input contains a tag, skip name-only/partial matching. Added exact tag lookup in database.
- Files: `/app/backend/chat_handler_v2.py`

**BUG FIX - Double Equipment Prompt Race Condition (Phase 2 - State Sync):**
- **Root Cause**: When user clicks an equipment suggestion rapidly, the frontend fires `POST /api/chat/send` before the backend finishes persisting the previous assistant message. `routes/chat.py` finds `active_state=None`, triggers the OpenAI intent classifier, and loops back asking for equipment again. This wasted LLM credits and frustrated users.
- **Fix**:
  1. `routes/chat.py` already detects `"Name (TAG)"` format via regex and forces `is_in_flow=True` — now also passes `forced_state=AWAITING_EQUIPMENT` to the handler when no prior assistant state exists in DB
  2. `chat_handler_v2.py` accepts `forced_state` parameter; if provided and DB state is `INITIAL`, overrides to the forced state
  3. The existing direct DB tag lookup (line ~320) then executes correctly, finding the equipment by exact tag without needing the previous suggestions list
- Files: `/app/backend/routes/chat.py`, `/app/backend/chat_handler_v2.py`

**BUG FIX - Context Message Treated as New Search (Phase 3 - AWAITING_CONTEXT Fallback):**
- **Root Cause**: After an observation is created, the system sets `chat_state=AWAITING_CONTEXT`. But the primary check uses `chat_conversations` collection which can be empty/stale. When this check fails, `AWAITING_CONTEXT` was NOT in the `is_in_flow` list, so the intent classifier fired on context messages. The `process_chat_message` state machine had no handler for `AWAITING_CONTEXT`, causing it to fall through to the INITIAL handler which treated the message as a new equipment search.
- **Fix**: Added a fallback check in `routes/chat.py` that reads `awaiting_context` state from `chat_messages` collection (always populated). If found, handles context saving inline (same logic as the primary `chat_conversations` path: saves user_context to threat, clears state, returns confirmation). Covers both "skip" and context-providing flows.
- Files: `/app/backend/routes/chat.py`

**FEATURE - Auto-Skip Context Prompt:**
- Added 60-second countdown timer for "add context" prompt after observation creation
- Visual countdown on Skip button: "Skip (55s)"
- Helper text: "Auto-skip in 55s"
- Auto-sends "skip" after 60 seconds of inactivity
- Timer clears when user manually sends message or clicks Skip
- Files: `/app/frontend/src/components/ChatSidebar.js`

**BUG FIX - Database Environment Mismatch in Chat:**
- **Root Cause**: When user switched database environments (UAT ↔ Production), chat history was cached from previous environment. Backend couldn't find chat state in new database, causing "double equipment" prompts.
- **Fix**:
  1. Clear chat history cache when switching database environments
  2. Force refetch chat history when chat sidebar opens
  3. Detect and warn user when state mismatch occurs (equipment selection returns equipment options again)
- Files: `/app/frontend/src/pages/SettingsDatabasePage.js`, `/app/frontend/src/components/ChatSidebar.js`

**FEATURE - Production Dashboard Mobile Compatibility:**
- Made period selector wrap on small screens
- Reduced chart height on mobile (250px vs 300px desktop)
- Made chart toggles smaller and wrap-friendly on mobile
- Reduced padding on panels (p-3 mobile, p-4 desktop)
- Export button shows icon-only on mobile
- Grid layouts adjusted for tablet breakpoint (md:grid-cols-2)
- Files: `/app/frontend/src/pages/ProductionDashboardPage.js`

**FEATURE - Hide Reliability & Production Tabs on Mobile:**
- Added `hidden sm:flex` to hide these tabs on screens < 640px
- Auto-redirect to "Operational" tab if user is on hidden tab when screen resizes
- Files: `/app/frontend/src/pages/DashboardPage.js`

---

## Prioritized Backlog

### P1
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution

### P2
- QR scan analytics dashboard

### P3
- Break down large pages (FormsPage.js, SettingsUserManagementPage.js, EquipmentManagerPage.js, DashboardPage.js) into smaller modular components
