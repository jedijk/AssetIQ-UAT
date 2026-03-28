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

### March 28, 2026
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
- [ ] Offline support with local storage for My Tasks execution
- [ ] Form execution flow in mobile My Tasks

### P2 (Medium)
- [ ] Bulk criticality assignment for equipment

### P3 (Low)
- [ ] Module detail panel for User Statistics page
- [ ] Refactor `TaskExecutionDialog` from `MyTasksPage.js`
- [ ] Refactor `FormsPage.js` and `TaskSchedulerPage.js` (>1000 lines each)

---

## Test Credentials
- Email: `test@test.com`
- Password: `test`

## Key Files
- `/app/backend/routes/threats.py` - Threat/Observation endpoints including timeline
- `/app/frontend/src/components/EquipmentTimeline.js` - Timeline UI component
- `/app/frontend/src/pages/ThreatDetailPage.js` - Observation detail view
