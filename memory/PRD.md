# AssetIQ - Product Requirements Document

## Original Problem Statement
Create a robust full-stack platform optimized for multi-environment execution with dynamic database switching, advanced form capabilities, seamless AI integrations, GDPR compliance, version-controlled PWAs, comprehensive log ingestion, and automated data processing.

## Current Version
**v3.7.1** (Updated: May 2026)

## Recent Changes
- [Feb 2026] **Strategy → Schedule auto-propagation (BUG FIX, VERIFIED)**:
  - **Bug**: Editing a task template on a maintenance strategy (name, duration, freq matrix, discipline, skills, etc.) saved on the strategy itself but **never updated the existing `maintenance_programs`**, so the schedule kept showing stale data.
  - **Fix**:
    - `PATCH /maintenance-strategies-v2/{id}/tasks/{task_id}` now auto-propagates `task_name, task_description, task_type, estimated_duration_hours, discipline, skills_required, frequency (per-equipment-criticality lookup → frequency_days), strategy_version` to every `maintenance_program` referencing that task. Returns `programs_updated: N`.
    - `DELETE /tasks/{task_id}` deactivates programs that came from the removed task. Returns `programs_deactivated: N`.
    - `PATCH /failure-modes/{fm_id}` (enable/disable) toggles `is_active` on all programs whose `failure_mode_id` matches.
    - PATCH whitelist extended with `tools_required, spare_parts, estimated_cost_eur`.
    - Frontend mutations now invalidate the `["maintenance-scheduler"]` query family, so the Planner / Timeline / Dashboard refresh automatically. Toasts now show "Task updated · N programs synced".
    - Removed dead `failure_mode_impact` field from `TaskDialog` (never rendered, never accepted by backend).
  - **Regression test added**: `TestStrategyPropagation.test_task_template_patch_propagates_to_programs` — 15/15 pytest passing.
- [Feb 2026] **TaskDetailsDialog — click-through editing (VERIFIED)**:
  - Clicking any task card in the **Daily** or **Weekly** Planner views (and existing Timeline / Tasks views) opens a `TaskDetailsDialog`
  - Three modes inside the dialog: **Details** (edit planned_date, status, priority, assigned technician, notes) · **Complete** (actual hours, findings, observations, failure-observed toggle) · **Defer** (new due date + reason)
  - Surfaces saved **AI reasoning** for tasks that came from the AI Planner (purple panel)
  - Wired to `PATCH /tasks/{id}`, `POST /tasks/{id}/complete`, `POST /tasks/{id}/defer` with React-Query cache invalidation so dashboards/KPIs refresh on save
  - Verified live: PATCH notes round-trip through dialog works
- [Feb 2026] **Daily/Weekly/14-day/90-day Planner UI (VERIFIED)**:
  - New **Planner** tab inside `MaintenanceScheduleManager.jsx` alongside Timeline / Tasks / Programs
  - Horizon selector: **Daily** (overdue/today/tomorrow buckets) · **Weekly** (7-day grid with capacity bars) · **14 Days** (daily mini-cards) · **90 Days** (weekly buckets, ~13 cards)
  - Each day/bucket shows: planned hours vs **total daily technician capacity**, colour-coded utilisation bar (green ≤80%, amber 80-100%, red over-capacity), task count
  - Daily & Weekly reuse existing `/tasks/daily-planner` and `/tasks/weekly-planner` endpoints; 14/90-day reuse `/tasks?from_date=…&to_date=…` with frontend bucketing
  - Header chip shows technician count + total daily capacity hours
  - Verified live (Fork Lift): Daily shows 17 tasks in Today bucket; 14-day shows 19 tasks distributed across daily cards with 3.0h/40h green utilisation bars
- [Feb 2026] **Maintenance Scheduler — Code review follow-up (VERIFIED)**:
  - **Modularised** `routes/maintenance_scheduler.py` (1019 lines) into a package with one router per concern: `programs.py`, `scheduler.py`, `tasks.py`, `timeline.py`, `dashboard.py`, `technicians.py`, `ai_planner.py`, plus `_shared.py` for helpers and request models
  - **Pydantic validation** on `POST /ai-plan/apply` — now takes `{recommendations: [AIPlanRecommendation, ...]}` (frontend updated accordingly)
  - **`response_format={"type": "json_object"}`** on the gpt-4o call for stricter JSON contract
  - End-to-end exercised live: applied Fork Lift strategy → 18 programs → Run Scheduler created 18 tasks → AI Planner assigned tech + planned_date + reasoning to every one → Apply updated all 18 tasks to assigned
  - Backend pytest suite: **14/14 passing** (test fixture updated to send the new schema)
- [Feb 2026] **Maintenance Scheduler & Planning Engine — Phase 1d (VERIFIED)**:
  - New backend module `/api/maintenance-scheduler/*` with full Phase 1 surface:
    - Equipment Maintenance Programs (apply-strategy, list, summary)
    - Scheduler engine (`POST /run-scheduler`) generating ScheduledTasks within criticality-based planning horizon (7/14/30 days)
    - Scheduled Task lifecycle: list, daily-planner, weekly-planner, PATCH update, complete (writes MaintenanceHistory), defer
    - Timeline view grouped by equipment; Dashboard KPIs (open / overdue / upcoming / compliance / priority breakdown)
    - Technician Capacity registry (daily/weekly hours, disciplines, skills)
  - **AI Maintenance Planner** (`POST /ai-plan` + `POST /ai-plan/apply`):
    - OpenAI gpt-4o via Emergent LLM key (emergentintegrations)
    - Takes open scheduled tasks + technician capacity, returns assignment + planned_date with explicit reasoning per task
    - Apply step writes back `ai_scheduled=true`, `ai_reasoning`, `planned_date`, `assigned_technician_*`, status → assigned
  - **Frontend** `MaintenanceScheduleManager.jsx`:
    - Dashboard KPI cards, Timeline / Tasks / Programs sub-tabs
    - Apply Strategy dialog (select equipment, bulk create programs)
    - Run Scheduler button
    - AI Planner button + dialog with summary + selectable recommendations (each shows AI reasoning)
  - Wired into `MaintenanceStrategyManager` as a top-level Strategy ↔ Schedule toggle (in addition to the existing global Schedule tab in `/library`)
  - Models: `EquipmentMaintenanceProgram`, `ScheduledTask`, `TechnicianCapacity`, `MaintenanceHistory`
  - Backend tests: 13/14 pytest passed (1 skipped due to no seed tasks)
- [Feb 2026] **CM tasks no longer have frequency** (VERIFIED): Corrective tasks bypass `frequency_matrix` in `TaskDialog` and `TaskTemplateCard`
- [Feb 2026] **Maintenance Strategy V2 — Stability Fix (VERIFIED)**:
  - Resolved the React runtime crash on `TaskTemplateCard` ("Element type is invalid... but got: undefined") — the page now renders the full Strategy Overview, Failure Modes, Task Templates, Frequency Matrix, and Version History tabs without errors.
  - Patched `Badge` (`/app/frontend/src/components/ui/badge.jsx`) with `React.forwardRef` to silence the "Function components cannot be given refs" warning emitted by Radix `<TooltipTrigger asChild>` around the RPN badge inside `FailureModeStrategyRow`.
  - Verified live (Library → Maintenance → Battery Charger): all four tabs render, expanding TaskTemplateCard works, Add Task dialog opens, console is clean.
- [May 26, 2026] **AI Suggest New Equipment Types** in Library → Equipment Types (VERIFIED):
  - New "Suggest New Types" button in the Equipment Types tab (Library)
  - Backend endpoint `POST /api/ai-suggestions/new-equipment-types` scans the user's plant hierarchy nodes, compares against the existing catalog, and proposes NEW equipment types that should be added (with id, name, discipline, rationale, example nodes, node_count). Conservative — at most 15 high-quality suggestions.
  - Mongo-backed deterministic cache (temp=0, seed=42) so identical inputs always produce identical results.
  - Frontend dialog `AINewEquipmentTypeSuggestions.jsx` lets the user review, edit name/id/discipline inline, deselect noisy items, and bulk-create the selected types via the existing `POST /equipment-hierarchy/types` endpoint.
  - Verified live: returned 5 high-quality suggestions (Motor Reductor, Screw Motor Reductor, Brabender, Wet Scrubber, Water Bath) with sensible rationale + example node names. Cache hit reduced latency from 9.3s → 0.5s.
- [May 26, 2026] **AI Equipment Type Mapping** in Equipment Manager (VERIFIED):
  - New "AI Map Types" button in the Equipment Manager toolbar (owners/admins)
  - Backend endpoint `POST /api/ai-suggestions/equipment-type-mappings` suggests an equipment type for each equipment node (equipment_unit / subunit / maintainable_item) using OpenAI GPT-4o
  - Conservative confidence scoring (≥0.70 only), best_match + up to 2 alternatives per node, deduplicated
  - Reuses the same Mongo-backed deterministic cache as the failure-mode AI feature → identical inputs always return identical results
  - Frontend dialog `AIEquipmentTypeMappingSuggestions.jsx` with Without Type / All / Selected modes, search, pre-selected best matches, and bulk Accept that PATCHes `equipment_type_id` (+ discipline) on each node
  - Verified: backend returned 92% match for "Motor" → Electric Motor, 88% for "Strainer" → Filter/Separator, "No match" for ambiguous items. Cache hit reduced latency from 11.2s → 0.4s.
- [May 26, 2026] **AI Failure Mode Suggestions — Deterministic Output (VERIFIED)**:
  - Persistent Mongo-backed cache (`ai_fm_suggestion_cache`) layered on top of in-memory cache in `/app/backend/routes/ai_fm_suggestions.py`
  - Identical inputs now return identical AI suggestions across server restarts (OpenAI's `seed` alone is best-effort and was not bit-exact in practice)
  - Deduplicated `failure_mode_id` within each equipment type's suggestions list (no more duplicate "Bearing Failure" entries)
  - `POST /api/ai-suggestions/clear-cache` now also purges the persisted Mongo collection
  - Verified: 4 calls (incl. backend restart) all returned identical MD5 hashes; first call 14.8s, cached calls 0.4s
- [Apr 25, 2026] **Reprint Label from Form Submissions** (VERIFIED):
  - Each submission row in `/form-submissions` and `/tasks?tab=forms` now shows a printer icon when (and only when) the source form template has `label_print_config.enabled` and a `label_template_id`
  - Clicking the icon reprints the label for that submission via the existing `printLabel` flow (PDF on desktop, HTML on iOS/mobile)
  - `SubmissionRow.jsx` now accepts `labelConfig` as a prop (parent passes from templates lookup) so the icon visibility decision is instant — no extra API roundtrip on render
  - **Investigation Complete**: Both original print and reprint use identical API payloads (`template_id`, `submission_id`, `copies`) and fetch the same label template from the database. Any layout differences between original and reprint are due to template version changes (label templates can be updated post-creation)
- [Apr 25, 2026] **Smart Label 3mm Safety Margin**:
  - Enforced a minimum 3mm internal safety margin on every label (PDF + HTML print) so logo/QR/text never get clipped by printers or cutters
  - PDF: `SAFETY_MARGIN_MM = 3.0` (was 2mm); HTML: `.label` padding `3mm` (was 1.5mm); logo absolute positioning offsets bumped from 1.5mm → 3mm
- [Apr 25, 2026] **Smart Label Settings Propagation Fix**:
  - Fixed logo, position, QR toggle, and font size settings not being applied during actual label printing
  - Issue was templates loaded without new fields weren't being merged with defaults
  - Frontend now properly merges template with `emptyTemplate` defaults for all nested objects
- [Apr 25, 2026] **Smart Label Enhancements**:
  - **Logo Position Selector**: Choose where to place the AssetIQ logo (Top Left, Top Right, Bottom Left, Bottom Right)
  - **Font Size Presets**: Small/Medium/Large options for field binding text
  - **QR Code Toggle**: Hide/show QR code to use full label space for text fields
  - **AssetIQ Logo**: Toggle to add logo + "AssetIQ" text on labels (grayscale for thermal printers)
- [Apr 24, 2026] Removed UAT/Prod database switcher badge from top header
- [Apr 2026] Sprint 1 of Smart Labeling System shipped:
  - Preset-based label designer (standard / compact / qr_only / with_logo)
  - Template CRUD + duplicate + soft-archive + versioning
  - PDF preview & print endpoints (reportlab + qrcode, cap 500 assets/job)
  - QR target configurable per template (asset_page / inspection_form / maintenance_request / custom_url with {asset_id} substitution)
  - Print job history; cache invalidated after print
  - New route `/labels`; menu link added
  - 22/22 backend pytest cases green; frontend flow verified
- [Apr 2026] Input Material card — production date now visible on mobile.
- [Apr 2026] Observation Related Activity timeline: Tasks removed (shows only Observations, Actions, Investigations).
- [Apr 2026] UAT environment provisioning complete:
  - MongoDB `assetiq` → `assetiq-UAT` cloned (32,472 documents)
  - Cloudflare R2 `assetiq-files` → `assetiq-files-uat` mirrored (2,230 objects / 242 MB)
  - Created `/app/scripts/r2_copy_to_uat.py` as reusable sync tool
- [Apr 2026] Observation Related Activity timeline: Tasks removed (now shows only Observations, Actions, Investigations per requirements). Fixed task-title field lookup and completed_at display for any downstream task views.
- [Dec 2025] Removed Total Input fallback - now calculated ONLY from End of Shift entries (no longer sums FEED from ingested logs)
- [Dec 2025] Added registration spam protection:
  - Rate limiting (3/minute per IP)
  - Honeypot field detection
  - Disposable email blocking (400+ domains)
  - reCAPTCHA v3 ready (disabled by default)
  - Auto-cleanup of pending accounts after 48 hours

## Core Features Implemented

### Production Dashboard
- Dual-source rendering merging `form_submissions` and `production_logs`
- Inline editing for both manual forms and ingested CSV logs
- Mobile-optimized cards showing: RPM, Feed, MP4, T Product IR, Viscosity
- Mobile editing support for Mooney Viscosity values

### Form Designer
- Universal AI Vision data capture with photo extraction
- Date type support with automatic normalization
- Auto-pairing: Mooney Viscosity forms automatically sync timestamps with latest unpaired Extruder Settings

### AI Chat
- Conversational UI with auto-skip timer (fixed infinite reset bug)
- Smart equipment matching with full word boundary detection
- Auto-selection bypass when exact equipment name/tag matches

### GDPR Compliance Suite
- User data management
- Consent tracking
- Data export/deletion capabilities

### PWA Support
- Offline-capable progressive web app
- Version-controlled cache keys

## Technical Architecture

```
/app/
├── backend/
│   ├── routes/
│   │   ├── ai_extract.py (AI Vision extraction & normalization)
│   │   ├── production.py (Dashboard patching & log aggregation)
│   │   ├── chat.py (AI chat endpoints)
│   │   ├── forms.py (Form templates & submissions CRUD)
│   ├── services/
│   │   ├── form_service.py (Auto-pairing viscosity logic)
│   ├── chat_handler_v2.py (AI Chat state machine)
│   ├── tests/ (Pytest regression suite)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ProductionDashboardPage.js (Dashboard UI)
│   │   │   ├── FormsPage.js (Form Designer)
│   │   ├── components/
│   │   │   ├── ChatSidebar.js (AI chat UI)
```

## Key API Endpoints
- `PATCH /api/production/submission/{submission_id}` - Edit forms/logs
- `POST /api/ai/extract` - AI Vision extraction
- `POST /api/form-submissions` - Submit forms with auto-pairing

## Database Collections
- `form_submissions`: Manual form entries with `auto_paired_to_extruder_id`
- `production_logs`: Ingested CSV data with editable metrics

## 3rd Party Integrations
- OpenAI GPT-4o / Vision (User API Key)
- Cloudflare R2 Storage (User API Keys)
- Resend Emails (User API Key)

## Completed Work (Recent)
- [Dec 2025] v3.5.8 version bump
- [Dec 2025] Mobile Mooney Viscosity editing
- [Dec 2025] Auto-pairing viscosity to extruder samples
- [Dec 2025] Mobile dashboard metric display optimization
- [Dec 2025] Production log inline editing fix
- [Dec 2025] Chat equipment auto-selection
- [Dec 2025] Chat auto-skip timer fix
- [Dec 2025] AI Vision date extraction fix

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- Report generation (PowerPoint/PDF) for Causal Investigations
- Offline support with local storage for My Tasks execution
- Claude 4.5 migration (pending user direction)

### P2 (Medium Priority)
- QR scan analytics dashboard

### P3 (Low Priority)
- Code refactoring: Break down large pages into modular components
  - `ProductionDashboardPage.js` (2200+ lines)
  - `DashboardPage.js` (1900+ lines)
  - `FormsPage.js`
  - `SettingsUserManagementPage.js`
- Advanced event detection rule engine for log ingestion

## 2026-05-27 — UI & Action Plan fixes
- **Failure Modes toolbar (FailureModesPage.js):** Split into two rows so the
  search bar stays visible and AI action buttons no longer push off-screen on
  smaller laptops. Row 1 = Search + Discipline + Type + High Severity +
  Not-improved toggle. Row 2 = Export, Import PM Plan, Suggest Failure Modes,
  Bulk Improve, Add Failure Mode (right-aligned).
- **Action numbering (backend `routes/actions.py`):** Replaced racy
  `count_documents()` with an atomic global counter stored in
  `action_counters` (single doc `_id: "central_actions"` with `$inc seq`).
  Existing actions renumbered globally via `/tmp/renumber_actions_global.py`
  (one-shot migration). Duplicate `ACT-0001` across users is gone.
- **Action delete (RecommendedActionsSection.jsx):** Switched the delete
  mutation from raw `fetch()` + localStorage token to the shared `actionsAPI.delete()`
  (axios) so it works under both bearer and cookie auth modes.

## 2026-05-27 — AI Review Action Disciplines
- **New AI tool (`Review Disciplines` button on FM toolbar):** Lets the user
  bulk re-classify the maintenance discipline (mechanical / electrical /
  instrumentation / process / civil / operations / laboratory) of every
  `recommended_actions[*].discipline` in the FMEA library, based on the
  action's text + action_type.
- **Backend (`ai_fm_suggestions.py::review_action_disciplines`):** New
  `POST /api/ai-suggestions/review-action-disciplines` endpoint. Accepts up
  to 60 actions per batch, returns suggested discipline + short reason for
  each. Uses `gpt-4o-mini` (cheaper for classification) + the existing 429
  retry helper. Falls back to current discipline on any parsing error.
- **Frontend (`AIReviewActionDisciplines.jsx`):** Dialog that streams all
  ~2700 library actions in batches of 25 with a progress bar, then shows a
  diff table (current → suggested + AI reason). User can toggle individual
  rows, override the suggested discipline via dropdown, and apply changes —
  patches are grouped per FM so each FM gets a single update.
- **2026-05-27 update — discipline taxonomy aligned with the rest of the app:**
  Backend `ACTION_DISCIPLINES` and frontend dropdowns now use the 8 canonical
  disciplines from `/app/frontend/src/constants/disciplines.js` — Rotating,
  Static, Piping, Electrical, Instrumentation, Civil, Operations, Laboratory.
  Legacy values like `mechanical`, `process`, `lab` are mapped server-side so
  existing records get flagged for re-tagging.

## 2026-05-27 — Failure-Mode Dedupe (one-off)
- **Issue:** 35 (equipment_type, failure_mode) pairs had duplicate records
  attached to the same equipment_type (e.g. two "Bearing Failure" linked to
  `pump_centrifugal`, three "Communication Failure" linked to `plc`).
- **One-off script (`/tmp/fm_dedupe.py`):** Grouped FMs by normalised name
  AND any shared equipment_type_id, picked the most complete representative
  per group (highest score on keywords + actions + effects + causes +
  validated flag + RPN), merged all loser fields (union of
  equipment_type_ids, keywords, actions, effects, causes) into the winner,
  then deleted the losers.
- **Result:** 25 winners updated, 29 duplicates deleted. Library is now
  649 → 620 FMs. 0 remaining (ET, name) duplicates.
- **Backup:** Full snapshot of the 29 deleted docs at
  `/app/memory/fm_dedupe_backup_2026-05-27.json` (and `/tmp/fm_dedupe_backup.json`).

## 2026-05-27 — AI Find Similar Failure Modes (interactive)
- **New backend endpoint:** `POST /api/ai-suggestions/find-similar-failure-modes`
  — accepts ONE equipment_type at a time + its FM list. Uses local
  token-overlap (Jaccard ≥0.5) + Levenshtein (≥0.8) to build candidate
  clusters, then asks GPT-4o-mini to confirm which clusters are genuine
  semantic duplicates while keeping ISO-14224 distinct mechanisms separate
  (Bearing Wear ≠ Bearing Seizure ≠ Bearing Fatigue).
- **New backend endpoint:** `POST /api/failure-modes/merge` — accepts
  `{winner_id, loser_ids, canonical_name?}`. Merges loser fields (union of
  equipment_type_ids, keywords, recommended_actions, potential_effects,
  potential_causes) into the winner, backs up loser docs to the new
  `fm_merge_log` collection, then deletes them. Invalidates the FM service
  cache.
- **New frontend dialog (`AIFindSimilarFailureModes.jsx`):** Opened by a
  new "Find Similar" button on the FM toolbar. Iterates per-equipment-type
  with a progress bar, then displays grouped results with editable canonical
  name + AI reason per group. User ticks the groups to merge, clicks Apply,
  and the dialog calls `/failure-modes/merge` once per selected group.
- Verified end-to-end via curl: "Belt Slippage" successfully merged into
  "Belt Slip" with equipment_type_ids union and audit-log row created.


## Testing
- Backend: Pytest suite at `/app/backend/tests/`
- Test files: `test_chat_full_match.py`, `test_production_patch.py`, `test_viscosity_pairing.py`

## Test Credentials
See `/app/memory/test_credentials.md`
