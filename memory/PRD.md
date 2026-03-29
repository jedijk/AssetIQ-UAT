# ThreatBase (AssetIQ) - Product Requirements Document

## Overview
AI-Powered Threat Capture & Prioritization Platform for industrial asset management and reliability engineering.

## Core Features

### 1. User Authentication
- JWT-based authentication
- Role-based access (admin/user)
- Password reset via email (Resend integration)

### 2. Equipment Manager
- Hierarchical equipment structure
- Equipment nodes with criticality ratings
- Equipment-failure mode linking

### 3. Chatbot Threat Capture
- AI-powered threat/observation capture
- Voice input (Whisper integration)
- Image analysis (GPT-4o Vision)

### 4. Risk Prioritization
- AI Risk Analysis using GPT-5.2
- Risk scoring with FMEA methodology
- Trend analysis and forecasting

### 5. Equipment History Timeline
- Shows related activity for equipment
- Displays observations, actions, and tasks
- Cross-observation visibility (actions from sibling observations)

### 6. Causal Intelligence
- Causal diagram generation
- Root cause analysis
- Fault tree and bow-tie analysis

### 7. Task Management
- Task scheduling and execution
- Form-based task completion
- Task history tracking

---

## Completed Work

### March 29, 2026 (Session 3)
- **Added:** Offline support for My Tasks (P1)
  - New `OfflineStorageService` using IndexedDB with 3 stores: tasks, pending_completions, sync_queue
  - Tasks automatically cached when fetched for offline access
  - Completed tasks saved locally when offline
  - Auto-sync when connection restored + manual "Sync Now" button
  - Offline banner shows when disconnected with pending count
  - Sync banner shows when online with pending items to sync
  - Files: `/app/frontend/src/services/offlineStorage.js`, `/app/frontend/src/pages/MyTasksPage.js`

- **Added:** Mobile form execution flow (P1)
  - Full form rendering on mobile (390x844 viewport)
  - Supports all field types: checkboxes, numeric inputs with range validation, text areas
  - Attachments section with file upload
  - Cancel and Complete action buttons
  - Back navigation to task list
  - File: `/app/frontend/src/pages/MyTasksPage.js`

- **Added:** AI Prompt Generation for Feedback
  - Select multiple feedback items in Feedback page
  - Generate AI-powered prompt using GPT-5.2
  - Copy generated prompt to clipboard for Emergent Agent
  - Files: `/app/frontend/src/pages/FeedbackPage.js`, `/app/backend/routes/feedback.py`

- **Fixed:** User Statistics page not showing all users
  - Modified `_get_user_activity()` to query actual business data (threats, actions, investigations)
  - Now shows all users with their real activity counts
  - Fixed datetime timezone comparison issues
  - File: `/app/backend/services/user_stats_service.py`

- **Fixed:** Feedback textarea typing issue
  - Changed from component function to render function to prevent re-mount on keystroke
  - File: `/app/frontend/src/pages/FeedbackPage.js`

- **Fixed:** Dashboard mobile tab buttons
  - Equal-width buttons, larger touch targets, centered content
  - File: `/app/frontend/src/pages/DashboardPage.js`

- **Removed:** Analytics page and Decision Engine page
  - Analytics page deleted, tab removed from Dashboard
  - Decision Engine now shows "Under Development" placeholder
  - Files: `/app/frontend/src/App.js`, `/app/frontend/src/pages/DashboardPage.js`

### March 29, 2026 (Session 2)
- **Added:** Edit Investigation feature in Causal Engine
  - Edit button on investigation overview opens dialog with all editable fields
  - Title, description, asset, location, incident date, lead, and status
  - Files: `/app/frontend/src/components/causal-engine/InvestigationDialogs.js`, `/app/frontend/src/pages/CausalEnginePage.js`

- **Added:** Lead selection mapped to User Management
  - New and Edit investigation dialogs show user dropdown
  - Dropdown displays user names with their positions from RBAC users
  - Fallback to text input if no users available
  - Files: Same as above

- **Fixed:** Dashboard Avatar Popover for investigations
  - Clicking lead avatar in Recent Investigations shows popover with name and role
  - Added `stopPropagation()` to prevent navigation when clicking avatar
  - File: `/app/frontend/src/pages/DashboardPage.js`

- **Fixed:** Dashboard Investigations Count Mismatch
  - Root cause: `queryFn: investigationAPI.getAll` was receiving React Query context object as `status` param
  - Solution: Wrapped in arrow function `queryFn: () => investigationAPI.getAll()`
  - Dashboard now correctly shows investigation count (was showing 0)
  - File: `/app/frontend/src/pages/DashboardPage.js`

- **Added:** Dashboard Avatar Hover Popovers for All Item Types
  - Observations, Actions, and Investigations now show creator/lead popover with name and position
  - Updated `UserAvatar` component to support optional popover with `showPopover` prop
  - Backend updated to return `creator_position` for threats and actions
  - Files: `/app/frontend/src/pages/DashboardPage.js`, `/app/backend/routes/threats.py`, `/app/backend/routes/actions.py`

- **Added:** Dashboard Deep Linking
  - Clicking on individual observation items navigates to `/threats/{id}` detail page
  - Clicking on individual action items navigates to `/actions/{id}` detail page
  - Clicking on individual investigation items navigates to `/causal-engine?inv={id}` with auto-selection
  - File: `/app/frontend/src/pages/DashboardPage.js`

### March 29, 2026
- **Changed:** Task/Form execution UI from popup dialogs to frame view
  - Replaced modal dialog with full-page frame view
  - Added back button (←) in header to return to task list
  - Cancel button now also returns to task list
  - Works on both desktop and mobile viewports
  - File: `/app/frontend/src/pages/MyTasksPage.js` - `TaskExecutionFrame` component

- **Added:** "Create Recurring Task" button for PM Actions in ActionDetailPage
  - Button appears only when action type is "PM - Preventive"
  - Clicking navigates to Task Designer (`/tasks`) with prefilled data (name, description, discipline)
  - Toast notification guides user to configure schedule
  - File: `/app/frontend/src/pages/ActionDetailPage.js`
  - Fixed route path from `/task-scheduler` to `/tasks` in ActionsPage.js

- **Optimized:** Mobile UI for My Tasks and Task Execution
  - My Tasks header: Hides description, inline stats badge, icon-only filter tabs, hidden stats grid
  - Task Execution frame: Compact back header, smaller gradient header, compact context block
  - Footer buttons use shorter labels on mobile
  - File: `/app/frontend/src/pages/MyTasksPage.js`

### March 28, 2026
- **Added:** Investigations to Equipment History Timeline
  - Shows investigations linked to threats, sibling observations, or same equipment
  - Purple-colored cards with Draft/Review/In Progress status badges
  - Filter button to show only investigations
  - Backend: `/app/backend/routes/threats.py`
  - Frontend: `/app/frontend/src/components/EquipmentTimeline.js`

- **Added:** Equipment History Timeline to Causal Engine page
  - Shows related activity when investigation is linked to a threat
  - File: `/app/frontend/src/pages/CausalEnginePage.js`
  
- **Fixed:** Equipment History Timeline missing actions bug
  - Root cause: Query only looked for actions with direct `source_id` match or `linked_equipment_id`
  - Solution: Extended query to include actions from sibling observations (same equipment)
  - File: `/app/backend/routes/threats.py` - `get_threat_timeline` endpoint
  - Verified: "Screw Breakage" now shows 4 actions (was 0)

### Previous Sessions
- Full-stack React/FastAPI/MongoDB architecture
- Light/dark theming with CSS variables
- AI integrations (GPT-5.2, Whisper, Vision)
- Object storage for file uploads
- Equipment hierarchy FMEA library
- User statistics dashboard

---

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, React Query
- **Backend:** FastAPI, Motor (async MongoDB)
- **Database:** MongoDB
- **AI:** OpenAI GPT-5.2, GPT-4o Vision, Whisper (via Emergent LLM Key)
- **Storage:** Emergent Object Storage
- **Email:** Resend

---

## Prioritized Backlog

### P0 (Critical)
- [ ] Report generation (PowerPoint/PDF) for Causal Investigations

### P1 (High)
- [x] Offline support with local storage for My Tasks execution ✅ (Completed March 29, 2026)
- [x] Form execution flow in mobile My Tasks ✅ (Completed March 29, 2026)

### P2 (Medium)
- [ ] Bulk criticality assignment for equipment

### P3 (Low)
- [ ] Module detail panel for User Statistics page
- [x] ~~Refactor `TaskExecutionDialog` from `MyTasksPage.js`~~ (Completed - Now `TaskExecutionFrame` with frame view)
- [ ] Refactor `FormsPage.js` and `TaskSchedulerPage.js` (>1000 lines each)

---

## Test Credentials
- Email: `test@test.com`
- Password: `test`

## Key Files
- `/app/backend/routes/threats.py` - Threat/Observation endpoints including timeline
- `/app/frontend/src/components/EquipmentTimeline.js` - Timeline UI component
- `/app/frontend/src/pages/ThreatDetailPage.js` - Observation detail view
