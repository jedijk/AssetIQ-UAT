# AssetIQ Functional Specification — Self-Service Client Onboarding Workspace

**Version:** 1.0  
**Module:** Administration  
**Status:** Functional Specification  

**Companion doc:** [`CLIENT_ONBOARDING_PLAYBOOK.md`](./CLIENT_ONBOARDING_PLAYBOOK.md) — operator/consultant runbook for tenant provisioning and technical implementation.

---

## Purpose

The AssetIQ Self-Service Onboarding Workspace enables new customers to configure their own AssetIQ environment with minimal assistance.

Rather than relying on implementation consultants or lengthy documentation, the platform guides customers through a structured onboarding journey that teaches them how AssetIQ works while simultaneously configuring their environment.

The objective is that every customer can successfully onboard themselves by following a series of guided steps supported by AI, interactive demonstrations, automatic validation, and best-practice recommendations.

Target implementation times:

- Small site: Less than 1 hour
- Medium site: 2–4 hours
- Enterprise rollout: Staged by installation

---

## Design Philosophy

The onboarding experience should feel like an intelligent implementation consultant rather than a setup wizard.

Users should never be presented with large blocks of documentation.

Every onboarding page follows exactly the same structure.

### 1. What is this?

A maximum of two simple sentences explaining what the feature is.

Example:

> "Equipment are the physical assets you maintain. Everything in AssetIQ connects back to equipment."

### 2. Why does it matter?

One sentence focused on business value.

Example:

> "Without equipment, observations, inspections, maintenance and reliability cannot be linked together."

### 3. Show Me

Every page contains a short interactive demonstration.

Never show PDFs.

Never show documentation.

Never require videos.

Instead, display a miniature working example with animations.

Example:

```
Factory
  ↓
Production Line
  ↓
Pump
  ↓
Motor
  ↓
Bearing
```

Then animate:

```
Observation
  ↓
Failure Mode
  ↓
Maintenance Strategy
  ↓
Scheduled Task
  ↓
Completed Task
  ↓
Risk Reduced
```

The user immediately understands why the feature exists.

### 4. Your Turn

Each step asks the user to perform exactly one action.

Examples:

- Import Equipment
- Create Site
- Invite Users
- Import PM Plan

Never present multiple tasks simultaneously.

### 5. Automatic Validation

Immediately after the action completes, AssetIQ validates the result.

Examples:

- ✓ 142 equipment imported
- ✓ No duplicate equipment tags
- ✓ Equipment hierarchy valid
- ✓ Maintenance strategy applied successfully

If validation fails, the user is shown exactly what must be corrected.

### 6. Need Help?

Every page contains four assistance buttons.

| Button | Purpose |
|--------|---------|
| **Explain Again** | Provides a shorter explanation. |
| **Show Example** | Launches an interactive demonstration. |
| **Best Practice** | Shows industry recommendations. |
| **Ask AI** | Opens the AI Coach already aware of the current onboarding step. |

### 7. Progress

Every page shows overall implementation progress.

Example:

```
Company ✔
Sites ✔
Equipment ✔
Users ✔
Failure Modes ●
Maintenance Strategy ○
Forms ○
Visual Boards ○
Go Live ○
```

Also display:

- Overall Progress
- Reliability Readiness
- Maintenance Readiness
- Go-Live Readiness
- Estimated Time Remaining

---

## Landing Dashboard

### Navigation

```
Settings
  ↓
Onboarding Workspace
```

Visible only for:

- Owner
- Admin

### Landing page displays

- Welcome to AssetIQ — Let's build your reliability system.
- Overall completion percentage
- Reliability Readiness
- Maintenance Readiness
- Data Quality
- Go-Live Readiness
- Estimated remaining time
- Outstanding actions

Each section displays:

- Completion percentage
- Current health
- Estimated effort
- Responsible role

---

## AI Coach

Every onboarding page contains a permanent AI Coach panel.

The AI can:

- Explain concepts
- Answer questions
- Generate examples
- Review imported files
- Validate uploaded data
- Recommend next steps
- Suggest best practices

The AI may never make changes without user confirmation.

---

## Build My Plant Wizard

Instead of asking users where to start, the onboarding begins with a simple question.

**How would you like to build your AssetIQ environment?**

Large selection cards are presented.

| Card | Action |
|------|--------|
| **I have an Equipment List** | Starts Equipment Import. |
| **I have PM Procedures** | Starts PM Import. |
| **I have P&IDs or Drawings** | Starts AI Process Import. |
| **I have Spare Parts** | Starts SpareIQ Import. |
| **I need Integrations** | Starts External API setup. |
| **Start From Scratch** | Starts the complete guided onboarding. |

The remaining onboarding adapts automatically based on the selected option.

---

## Phase 1 — Company Setup

**Purpose:** Configure company information.

**Simple Explanation:** "This is your company profile."

**Why It Matters:** "These settings are used throughout the entire platform."

**Interactive Demo:** Animated company profile.

**Your Task:** Enter:

- Company Name
- Logo
- Language
- Timezone

**Validation:** Company profile complete.

---

## Phase 2 — Sites

**Purpose:** Create physical locations.

**Simple Explanation:** "Sites represent the locations where your assets operate."

**Why It Matters:** "Everything inside AssetIQ belongs to a site."

**Interactive Demo:**

```
Company
  ↓
Site
  ↓
Plant
  ↓
Area
  ↓
Equipment
```

**Your Task:** Create your first Site.

**Validation:** At least one site exists.

---

## Phase 3 — Equipment

**Purpose:** Create the ISO 14224 equipment hierarchy.

**Simple Explanation:** "This is the structure of the assets you maintain."

**Why It Matters:** "All observations, inspections and maintenance are linked to equipment."

**Interactive Demo:**

```
Factory
  ↓
Line
  ↓
Pump
  ↓
Motor
  ↓
Bearing
```

Then show:

```
Observation
  ↓
Failure Mode
  ↓
Maintenance
  ↓
Task
  ↓
Completed
  ↓
Risk Reduced
```

**Your Task:** Import Equipment.

Supported methods:

- Excel
- AI Process Import
- Manual Creation

**Validation:**

- Duplicate tags
- Missing parents
- Hierarchy completeness
- Hierarchy health score

---

## Phase 4 — Users

**Purpose:** Invite the maintenance team.

**Simple Explanation:** "Users receive access based on their role."

**Why It Matters:** "Everyone only sees the equipment they are responsible for."

**Interactive Demo:**

- Operator
- Maintenance
- Planner
- Reliability Engineer
- Administrator

**Your Task:**

- Invite users.
- Assign roles.
- Assign installations.

**Validation:** All required users configured.

---

## Phase 5 — Criticality

**Purpose:** Define business impact.

**Simple Explanation:** "Criticality tells AssetIQ which equipment matters most."

**Why It Matters:** "AssetIQ uses this to prioritize work."

**Interactive Demo:**

| Equipment | Impact | Value | Rating |
|-----------|--------|-------|--------|
| Pump A | Production Loss | $1M | ★★★★★ |
| Pump B | Production Loss | $20k | ★★ |

Dashboard automatically changes priority.

**Your Task:** Review criticality settings.

**Validation:** Criticality configured.

---

## Phase 6 — Failure Modes

**Purpose:** Build the customer's reliability knowledge.

**Simple Explanation:** "Failure Modes describe how equipment can fail."

**Why It Matters:** "They drive maintenance strategy and AI recommendations."

**Interactive Demo:**

```
Failure Mode
  ↓
Symptoms
  ↓
Recommended Actions
  ↓
Maintenance Strategy
  ↓
Reduced Risk
```

**Your Task:** Import PM Plan.

**Validation:**

- Failure Modes imported.
- Duplicates identified.
- Coverage score calculated.

---

## Phase 7 — Maintenance Strategy

**Purpose:** Generate preventive maintenance.

**Simple Explanation:** "Maintenance Strategies tell AssetIQ what work should happen."

**Why It Matters:** "They automatically generate maintenance tasks."

**Interactive Demo:**

```
Failure Mode
  ↓
Inspection
  ↓
Monthly
  ↓
Scheduled Task
  ↓
Execution
```

**Your Task:** Apply Maintenance Strategy.

**Validation:**

- Maintenance Programs created.
- Coverage percentage displayed.

---

## Phase 8 — Spare Parts

**Purpose:** Link spare parts to equipment.

**Simple Explanation:** "Spare parts ensure technicians know what is required."

**Why It Matters:** "Linked spares reduce repair time."

**Interactive Demo:**

```
Motor
  ↓
Bearing
  ↓
Seal
  ↓
Lubricant
```

**Your Task:** Import Spare Parts.

**Validation:** Spare Parts linked successfully.

---

## Phase 9 — Digital Forms

**Purpose:** Digitize inspections.

**Simple Explanation:** "Forms standardize inspections."

**Why It Matters:** "Consistent inspections produce better reliability information."

**Interactive Demo:**

```
Inspection
  ↓
Submit
  ↓
Observation
  ↓
Action
  ↓
Closure
```

**Your Task:** Create your first inspection.

**Validation:** Form published.

---

## Phase 10 — Visual Management

**Purpose:** Publish shop-floor dashboards.

**Simple Explanation:** "Visual Boards keep everyone aligned."

**Why It Matters:** "Everyone sees the same priorities."

**Interactive Demo:**

Large TV showing:

- Today's Tasks
- Open Observations
- Overdue PM
- Production
- Risk

Auto-refresh animation.

**Your Task:** Publish your first board.

**Validation:** Board online.

---

## Phase 11 — External API

**Purpose:** Connect external systems.

**Simple Explanation:** "The External API allows other systems to exchange information with AssetIQ."

**Why It Matters:** "It prevents duplicate data entry."

**Interactive Demo:**

```
PLC
  ↓
API
  ↓
Observation
  ↓
AssetIQ
  ↓
Dashboard
```

**Your Task:** Generate API Key.

**Validation:** Connection tested successfully.

---

## Phase 12 — Go Live

**Purpose:** Verify production readiness.

**Simple Explanation:** "This confirms your AssetIQ environment is ready."

**Why It Matters:** "It ensures everything has been configured correctly."

**Interactive Demo:** Animated checklist.

- Equipment ✔
- Failure Modes ✔
- Users ✔
- Maintenance ✔
- Forms ✔
- Visual Boards ✔
- External API ✔

**Your Task:** Run Go-Live Validation.

**Validation:**

- Go Live Ready
- or Show remaining actions.

---

## Interactive Examples

Every onboarding page includes a "Show Example" button.

Selecting this opens a miniature working AssetIQ environment where users can interact with:

- Equipment
- Failure Modes
- Observations
- Investigations
- Actions
- Maintenance Strategies
- Digital Forms
- Visual Boards
- External API

The examples are fully interactive and reset automatically after closing.

---

## AI Import Assistant

Every import wizard is AI-assisted.

Examples:

**Equipment Import**

- "I found 842 assets."
- "I detected 27 duplicate tags."
- "I fixed 25 automatically."

**PM Import**

- "I matched 91% of your maintenance tasks with existing Failure Modes."

**Spare Parts Import**

- "I linked 96% of spare parts automatically."

**Translations**

- "I detected Dutch as your preferred language."

The user reviews all AI suggestions before they are applied.

---

## Automatic Validation

Each completed step is validated automatically.

Validation checks include:

- Equipment hierarchy integrity
- Duplicate equipment tags
- Missing parent equipment
- Failure Mode coverage
- Maintenance Strategy coverage
- Criticality completeness
- User permissions
- Forms
- Visual Boards
- External API connectivity
- Data quality

Each validation result displays:

- Passed
- Warning
- Action Required

Selecting an issue opens the appropriate configuration page.

---

## Progress Engine

Progress is based on implementation quality rather than simply completing pages.

Suggested weighting:

| Area | Weight |
|------|--------|
| Company Configuration | 2% |
| Users | 5% |
| Equipment Hierarchy | 20% |
| Failure Modes | 20% |
| Maintenance Strategy | 20% |
| Digital Forms | 5% |
| Spare Parts | 5% |
| External API | 5% |
| Visual Boards | 5% |
| Risk Configuration | 8% |
| Go-Live Validation | 5% |

The dashboard continuously displays:

- Overall Completion
- Reliability Readiness
- Maintenance Readiness
- Data Quality Score
- AI Readiness
- Commercial Readiness
- Go-Live Readiness
- Estimated Time Remaining

---

## Completion

When every mandatory onboarding phase has passed validation, AssetIQ performs a complete tenant health assessment.

If successful, the user is presented with:

**Congratulations!**

Your AssetIQ environment is ready for production.

The final report includes:

- Go-Live Readiness Score
- Reliability Readiness Score
- Equipment Coverage
- Failure Mode Coverage
- Maintenance Strategy Coverage
- Data Quality Score
- AI Readiness
- External API Status
- Visual Board Status
- Validation Summary

Available actions:

- Download Go-Live Report
- Download Implementation Summary
- Schedule Health Check
- Start Using AssetIQ

---

## Future Vision

The long-term goal is that onboarding becomes almost completely autonomous.

A customer should be able to upload:

- Equipment Register
- PM Plans
- P&IDs
- Inspection Forms
- Spare Parts Lists

Answer a handful of business questions, and AssetIQ will automatically:

- Build the equipment hierarchy
- Generate failure modes
- Create maintenance strategies
- Link spare parts
- Configure inspections
- Publish visual boards
- Configure integrations
- Validate the complete implementation

The objective is for AssetIQ to automatically configure 80–90% of a production-ready reliability management system, leaving only customer-specific decisions for manual review and approval.
