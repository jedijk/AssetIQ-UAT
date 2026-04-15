# AssetIQ — AI-Powered Asset Management Intelligence Platform

## What is AssetIQ?

AssetIQ is a full-stack reliability and asset management platform that helps industrial operations teams detect, track, and resolve equipment failures before they cause downtime. It combines real-time field data collection with AI-powered risk analysis to turn every observation into actionable intelligence.

Built for reliability engineers, maintenance teams, and plant operators — accessible from desktop and mobile.

---

## Key Features

### AI Chat Assistant
Report equipment issues by voice or text. The AI identifies the equipment from your hierarchy, matches the failure mode from your FMEA library, creates a risk-scored observation, and generates recommended actions — all in one conversation. Attach a photo and the AI analyzes visible damage and creates follow-up actions automatically.

### Equipment Hierarchy (ISO 14224)
Manage your full asset hierarchy from installation down to individual components. Import from Excel, search by name or tag, and drill into any level. Every observation, action, and task links back to the hierarchy.

### Risk-Scored Observations
Every observation gets an automatic risk score combining equipment criticality and FMEA data. The dashboard shows your Top 10 highest-risk items ranked in real-time. Risk scores propagate through to actions and investigations.

### Causal Investigation Engine
Run structured root cause analyses linked to observations. Build cause-and-effect chains, assign investigation tasks, and track progress to resolution.

### Task Scheduler & Planner
Design recurring maintenance tasks with configurable intervals. Assign tasks to specific equipment with a searchable dropdown. Generate execution schedules and track completion through My Tasks on mobile.

### Production Dashboard (Line 90)
Live operational dashboard with KPIs (Total Input, Waste, Yield, Viscosity), trend charts, and a full production log table. Inline editing, delete with confirmation, cumulative waste tracking, and form execution — all from one screen.

### Form Builder & Submissions
Create custom inspection and data collection forms with field types including numeric, text, date, dropdowns, images, signatures, and equipment selectors. Threshold monitoring flags warnings and critical values automatically.

### FMEA Library
627+ failure modes with severity, occurrence, detectability ratings, and RPN scores. Auto-matched during observation creation. Extendable with custom failure modes.

### Multi-Environment Support
Switch between Production and UAT databases on the fly. All data — equipment, observations, forms — is isolated per environment.

### Mobile-First Design
Full functionality on phone: report observations via chat, execute tasks, fill forms, scan QR codes, and review the dashboard — all optimized for field use.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Tailwind CSS, Shadcn/UI, Recharts |
| Backend | FastAPI (Python), async MongoDB |
| Database | MongoDB Atlas |
| AI | OpenAI GPT-4o (text + vision), Whisper (voice) |
| Auth | JWT with role-based access control |
| Email | Resend (password reset, notifications) |

---

## Who Is It For?

- **Reliability Engineers** — Track failures, run investigations, manage FMEA libraries
- **Maintenance Teams** — Execute scheduled tasks, report issues from the field
- **Plant Operators** — Log production data, monitor KPIs, flag anomalies
- **Operations Managers** — Dashboard overview of risk, completion rates, and trends

---

*AssetIQ — From observation to action, powered by AI.*
