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

**BUG FIX - Double Equipment Prompt in AI Chat:**
- **Root Cause**: When user clicked on equipment with a specific tag (e.g., "Temperature Sensor (1TX-3003-0143)") that wasn't in the current suggestions list, the name-only matching would incorrectly match to a different equipment with the same name but different tag
- **Fix**: 
  1. If user input contains a tag, skip name-only and partial matching (which could match wrong equipment)
  2. Added exact tag lookup in database when user provides specific tag not in suggestions
  3. Now correctly finds equipment by exact tag match instead of re-prompting
- Files: `/app/backend/chat_handler_v2.py`

**FEATURE - Auto-Skip Context Prompt:**
- Added 60-second countdown timer for "add context" prompt after observation creation
- Visual countdown on Skip button: "Skip (55s)"
- Helper text: "Auto-skip in 55s"
- Auto-sends "skip" after 60 seconds of inactivity
- Timer clears when user manually sends message or clicks Skip
- Files: `/app/frontend/src/components/ChatSidebar.js`

---

## Prioritized Backlog

### P1
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution

### P2
- QR scan analytics dashboard

### P3
- Break down large pages (FormsPage.js, SettingsUserManagementPage.js, EquipmentManagerPage.js, DashboardPage.js) into smaller modular components
