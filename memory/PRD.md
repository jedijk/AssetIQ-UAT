# AssetIQ - Product Requirements Document

## Original Problem Statement
Create a robust full-stack platform optimized for multi-environment execution with dynamic database switching, advanced form capabilities, seamless AI integrations, GDPR compliance, version-controlled PWAs, comprehensive log ingestion, and automated data processing.

## Current Version
**v3.7.3** (Updated: May 2026)

## Recent Changes
- [Feb 2026] **Chat — fix: "skip" being processed as a new observation (VERIFIED)**:
  - Bug: When the chat was in INITIAL state, sending "skip" (from auto-skip-on-close, the 60-second timer, or a manual click after the conversation ended) caused the AI to start a new issue_confirm flow with "skip" as the parsed issue ("Here's what I understood: skip").
  - **Backend guard** (`/api/chat/send`): in INITIAL state, command words (`skip`, `cancel`, `yes`, `no`, `ok`, `okay`, `revise`, `ja`, `nee`, `klopt`, `akkoord`) are ignored and bounce back "What would you like to report?" instead of being parsed as observations.
  - **Frontend cooldown** (`ChatSidebar.js`): a `lastSkipFiredAtRef` 5-second cooldown is shared across all skip sources (auto-close handler, 60s timer, manual Skip / Done buttons) preventing race conditions where the close handler fires another skip before the message list has refetched.
  - Verified via curl: "skip"/"yes"/"no"/"cancel"/"ok" → "What would you like to report?" (no issue_confirm); real text → normal flow.

- [Feb 2026] **Chat — Cancel button on "Here is what I understood" (VERIFIED)**:
  - Added a red Cancel button next to Yes / Revise on the `issue_confirm` summary card.
  - Calls existing `POST /api/chat/cancel` which resets the conversation state and posts "Cancelled. What would you like to report?" (auto-translated to NL when the chat is in Dutch). Invalidates `chatHistory` + `threats` queries.

- [Feb 2026] **Chat — auto-skip on close: only when Skip is the active option (VERIFIED)**:
  - Tightened `handleCloseWithAutoSkip` to fire only when the last assistant message is in `awaiting_context` AND no competing prompt is shown (`issue_confirm`, equipment suggestions, failure-mode suggestions, multi-match). Otherwise the close is plain — no signal sent.

- [Feb 2026] **Chat — hide the literal "skip" signal from history (VERIFIED)**:
  - When the chat sends `skip` to advance the conversation (auto-skip on close, 60s timer, or the Skip button), the user bubble showing the word "skip" is now filtered from the rendered history. The word remains a backend signal but never appears as user-visible content.

- [Feb 2026] **Chat sidebar — auto-skip on close (VERIFIED)**:
  - When the user closes the Report Observation chat (X button or backdrop click) while the assistant is in `awaiting_context` state, the chat now fires a background `skip` message so the conversation is finalized instead of being left in limbo.
  - Wrapped `onClose` in a new `handleCloseWithAutoSkip` handler inside `ChatSidebar.js`. Fire-and-forget call to `chatAPI.sendMessage("skip", ...)` then invalidates `chatHistory`, `threats`, `stats` queries.

- [Feb 2026] **PM Import — bug fix: matchers were overwritten on review (VERIFIED)**:
  - Root cause: `ensure_equipment_impacts` (called by review/get-session paths) was using its own legacy tag-only matcher and *overwrote* the rich hierarchy+type matches produced by `_process_file` during upload. End result: `equipment_matches: []` even though upload matched correctly.
  - Fix: refactored `ensure_equipment_impacts` to call the same `_match_equipment_to_hierarchy` + `_match_equipment_types` methods used by the upload pipeline. Both code paths now stay consistent.
  - Backfill: ran a one-time DB script across existing sessions — `Add pm.xlsx` now shows **11–12 / 19 hierarchy** and **2 / 19 equipment-type** matches (was 0/19 before fix).
  - Verified live: Temperature Control Unit → `1F-3001-0126` + `Control Unit`; Electromotor → `3P-1005-0731`; Gearbox → `1F-3001-0123`; etc.

- [Feb 2026] **PM Import — Hierarchy / Equipment Type / Failure Mode mapping (VERIFIED)**:
  - On upload, the pipeline now runs three matchers in addition to AI extraction:
    - `_match_equipment_to_hierarchy`: maps tasks to `equipment_nodes` by tag (exact) and by name (exact/partial).
    - `_match_equipment_types`: maps to `custom_equipment_types` library (exact/partial name match).
    - `_match_with_library` (existing): hardened — also writes `library_failure_mode_ids` (strict, score ≥ 80) and `ai_only_failure_modes` (pending approval).
  - 3 new columns in PM Import table: **Hierarchy Tag**, **Equipment Type**, **Failure Modes**. Matched cells show coloured chips; unmatched cells show amber "Unmatched" button.
  - Click any chip to open a unified search dialog (`PMMappingDialog`) for manual override. FM dialog is multi-select (library-only, strict).
  - New endpoints: `PATCH /api/pm-import/session/{sid}/task/{tid}/mapping`, `GET /api/pm-import/lookup/equipment`, `…/equipment-types`, `…/failure-modes`.
  - **Verified live**: Brabender → 1T-2001 + Brabender type + 2 lib FMs; Wet Scrubber → 1F-3001-0123 + Wet Scrubber type + 1 lib FM; XYZ-Unknown → Unmatched (correctly).

- [Feb 2026] **PM Import — Task Type mapped to PM/CM/PDM (VERIFIED)**:
  - Task Type column now renders the **action_type** (PM, CM, PDM) with color-coded badges (green/red/purple) instead of the granular sub-type (Inspection/Lubrication/etc.).
  - Edit dialog: Task Type is now a Select with three options (PM — Preventive, CM — Corrective, PDM — Predictive).
  - **Backend**: `TaskUpdateRequest` accepts `action_type` so the dropdown choice persists.

- [Feb 2026] **PM Import tab — actions: edit, delete, accept/reject + Tag column (VERIFIED)**:
  - Added **Tag** column (asset name) alongside Equipment.
  - Added **Actions** column with inline buttons: ✓ Accept, ✗ Reject, ✎ Edit, 🗑 Delete.
  - **Edit dialog** allows editing Equipment, Tag, Task description, Task Type, Discipline, Frequency.
  - **Backend**: extended `TaskUpdateRequest` with `asset`, `original_task`, `discipline`; added `DELETE /api/pm-import/session/{sid}/task/{tid}` and `PMImportService.delete_task()` which removes the task and recalculates stats.
  - **Verified live**: edit + accept + delete curl tests pass; UI dialog renders with all fields prefilled.

- [Feb 2026] **PM Import tab — flat task table (VERIFIED)**:
  - **User request**: Replace the "uploaded files / sessions" view with a flat table of all imported tasks showing Equipment, Task, Task Type, Discipline, Frequency.
  - **Backend**: Added `GET /api/pm-import/tasks` that flattens `tasks_extracted` across all sessions for the current user, returning normalized fields (`equipment`, `task`, `task_type`, `discipline`, `frequency`, `review_status`).
  - **Frontend**: Rewrote `CustomPMImportTab` in `FailureModesPage.js` to consume the new endpoint, render the 5 required columns + status, with search + Discipline/Frequency filters.
  - **Fix root cause**: The original code read `extracted_tasks` while the DB stores `tasks_extracted` — caused 0 tasks across 26 sessions. Now displays 464 tasks across 26 sessions for the test owner.

- [Feb 2026] **Equipment Unit filter on global Maintenance Schedule + MyTasks discipline auto-seed (VERIFIED iteration_38)**:
  - **MaintenanceScheduleManager.jsx**: Added Equipment Unit filter dropdown (`data-testid='equipment-unit-filter'`) that lists all `equipment_unit` level nodes (CLU, EXU, FPU, etc.). Selection computes the unit's descendant equipment_ids and filters Timeline (Gantt), Tasks list, and Planner views (daily/weekly/14-day/90-day). Clear button restores the full view. Filter is also applied to `timeline.timeline` (the rendered Gantt rows) — earlier version only filtered `timeline.equipment` which the Gantt didn't read from.
  - **MyTasksPage.js**: Auto-seeds the `discipline-filter` dropdown from the logged-in user's `discipline` (or `department`/`position` fallback) via `normalizeDiscipline()`. Users matching the regex `/maintenance|onderhoud|wartung/` are treated as a wildcard and keep the dropdown at "All Disciplines" since maintenance covers all 7 technical disciplines.
  - **i18n**: Added `maintenance.equipmentUnit`, `maintenance.allEquipmentUnits`, `common.clear` to EN/NL/DE. Removed duplicate `Select` import that would have broken the JSX build.
  - **Backend**: `/api/my-tasks?discipline=...` continues to filter case-insensitively via `$regex`. 6/6 pytest PASS, 9/9 frontend review items PASS.

- [Feb 2026] **P1: Translation Management Dashboard + Dictionary Validation (NEW, VERIFIED iteration_37)**:
  - New page `/settings/translations` (owner/admin only) with two tabs:
    - **Coverage tab**: per-entity-type translation stats (Failure Modes, Equipment Types, Equipment Hierarchy, Maintenance Tasks, Observations, Investigations, Form Templates), progress bars, per-row "Translate missing" bulk-generate button, Refresh, and Recent Jobs list (auto-refreshes every 5s).
    - **Dictionary tab**: CRUD on `translation_dictionary` (Add/Edit/Delete + Seed defaults), search + category filter, and **"Validate translations against dictionary"** — calls new backend endpoint `POST /api/translations/dictionary/validate?language_code=…` that scans `entity_translations` and flags rows whose translated value still contains the English source term (untranslated technical leak).
  - **Backend addition**: `POST /api/translations/dictionary/validate` — O(rows × terms) scan returns `{issues: [...], terms_checked, total_issues}`. NL currently surfaces 19 real inconsistencies, DE surfaces 2.
  - 6/6 pytest PASS + 9/9 frontend review items PASS.

- [Feb 2026] **Multi-Language Translation Framework expansion (P0+P1, VERIFIED iteration_36)**:
  - **P0 ThreatDetailPage**: Added ~30 new UI keys (tryAgain, riskPriorityNumber, fmeaScore, criticalityScore, probableCause, fieldNotes, deleteObservation, shareObservation, etc.) + status enums (Open/In Progress/Parked/Mitigated/Closed/Canceled) + risk level enums (Critical/High/Medium/Low) across EN/NL/DE. Composed translated title via `buildTranslatedTitle()` (e.g. "Condensation Vessel - Sludge Build up" → "Condensatievat - Slibopbouw"). Wired status dropdown + popup risk-level pills through `translateEnum()`.
  - **P1 Hierarchy descriptions**: Added new hook `useEquipmentNodeIdMap()` (returns `{nodeId: {name, description}}`). Wired into: (a) `EquipmentHierarchy.TreeNode` (sidebar), (b) `EquipmentManagerPage.TreeNode` (main page), (c) `PropertiesPanel` for both header title + description. Closed the inconsistency where sidebar showed Dutch names but /equipment-manager showed English.
  - **Bonus translations**: Related Activity section title + 'All' filter button (EquipmentTimeline). Recommended Actions title + Add button + Act button + Added badge (RecommendedActionsSection).
  - **Verified** via testing_agent iteration_35 (P0 PASS in NL+DE+EN regression) and iteration_36 (P1 PASS — /equipment-manager tree shows Lijn-90/Nutvoorzieningen/Vorkheftruck etc., PropertiesPanel header uses translatedName).

- [Feb 2026] **Recurring task occurrences visible on Gantt (BUG FIX, VERIFIED)**:
  - **Bug**: User couldn't see "every quarter" recurrence — only ONE bar per task because (a) scheduler horizon was 90 days (≈ same as quarterly cadence so only 1 occurrence generated), and (b) the Gantt rendered every scheduled_task as a SEPARATE row instead of grouping occurrences of the same program.
  - **Fix part 1 (backend)**: Bumped scheduler `DEFAULT_HORIZON_DAYS` from 90 → **365** with `MAX_OCCURRENCES_PER_PROGRAM=52`. Quarterly tasks now generate ~4 occurrences, monthly ~12.
  - **Fix part 2 (frontend)**: Refactored `GanttRow` into `GanttRow` + `GanttBar`. Rows now grouped by `maintenance_program_id` so the same task on the same equipment displays as ONE row with N bars (one per occurrence). Off-window bars are skipped for performance.
  - **Verified live**: Fork Lift now shows 48 scheduled tasks across 14 unique program rows (vs 14 rows × 1 bar before). At Month zoom, scrolling right reveals quarterly occurrences extending out to May 2027. Drag-to-reschedule still works on each individual bar.
- [Feb 2026] **Gantt timeline pan controls (VERIFIED)**:
  - Decoupled the timeline window from task data — now controlled by a `viewStart` state independent of where tasks live.
  - Three buttons: **◀** (back), **Today**, **▶** (forward). Pan distance scales with zoom (Day=7d, Week=28d, Month=90d).
  - Visible-window indicator chip shows `start → end` next to the controls.
  - View span is also zoom-aware: Day=30d, Week=84d (12 weeks), Month=365d.
  - Backend timeline query now fetches a wide range (−30d to +365d) so panning anywhere in the visible window always finds tasks.
  - **Side fix**: re-enabled the two FMs (`Imbalance`, `Rotor Crack`) that earlier testing left disabled, restoring 14 active fork-lift programs and 18 scheduled tasks.
  - Verified live: panned forward 2× from W21–W26 → W29–W34, "Today" button instantly jumps back.
- [Feb 2026] **Equipment Types sidebar fold/hide + reactive task filter (VERIFIED)**:
  - Added a **collapse button** in the Maintenance tab's equipment-types sidebar (`PanelLeftClose` icon, top-right of the pane).
  - When collapsed, the pane shrinks from 320px to a 40px vertical rail with a re-open button (`PanelLeftOpen`) and a vertical "Equipment Types" label. Click to expand back.
  - Net effect: in the screenshots, collapsing the pane extends the Gantt visible range from W26 → W29 (3 more weeks visible at Week zoom).
  - **Reactive task filter**: reactive/corrective tasks are now stripped at query time from `/tasks`, `/tasks/daily-planner`, `/tasks/weekly-planner`, `/timeline`, and `/dashboard` (in addition to the existing apply-strategy and scheduler exclusions). Ran a one-off cleanup that cancelled 1 stale reactive scheduled_task and deactivated 1 reactive program. Verified `/tasks` now returns only `condition_based`, `predictive`, `preventive` types.
- [Feb 2026] **Horizontal Gantt Timeline + drag-to-reschedule (VERIFIED)**:
  - Rebuilt `TimelineView` as a proper horizontal Gantt:
    - Sticky left column (task name + equipment tag); scrollable timeline grid on the right.
    - **Three zoom levels**: Day (40px/day), Week (16px/day, weeks labelled W21..W26), Month (6px/day, compact).
    - Date range auto-derived from earliest planned_date to latest, padded ±7 days, min 30-day span.
    - Per-row bar positioned by `planned_date`, width based on `ceil(estimated_hours / 8)` days, status-driven colour (blue/amber/purple/red/green) and priority badge on the bar.
    - Vertical red "Today" line with label; weekend tinting; ISO-week labels.
  - **Drag-to-reschedule**:
    - Pointer-down on a bar → cursor-grabbing + ring; pointer-move shows live `+Nd / -Nd` delta floater above the bar.
    - Pointer-up commits via `PATCH /maintenance-scheduler/tasks/{id}` with the new `planned_date`; React-Query invalidates so the bar lands at the persisted position.
    - Pointer-up without drag → opens the existing `TaskDetailsDialog`.
  - Verified live: 18 forklift tasks render in all three zooms; live reschedule `2026-05-31 → 2026-06-05` round-trips successfully.
- [Feb 2026] **Schedule fully synced with active/inactive tasks & FMs + human-readable version history (VERIFIED)**:
  - **Bug A**: Toggling a task off via `is_mandatory` (per-task switch) saved on the strategy but did NOT touch maintenance_programs or scheduled_tasks — the Planner kept showing tasks that had been "deactivated".
  - **Bug B**: Existing `maintenance_programs` had `failure_mode_id = None` because `apply-strategy` was matching `task.failure_mode_ids[0]` (library FM id) against `fm_strategies.failure_mode_id` (strategy-minted id), so they never matched. Result: FM enable/disable did not cascade to the schedule for already-applied equipment.
  - **Bug C**: `version_history` entries were terse codes (`task:<uuid>:duration_hours`) — useless to humans.
  - **Fix** (`backend/routes/maintenance_strategy_v2.py`):
    - Added `_resync_programs_with_strategy(equipment_type_id)` — single source-of-truth that re-derives `is_active` on every program from the live strategy (task removed, `is_mandatory=false`, or all linking FMs disabled → inactive) and cancels any open scheduled_tasks for newly-inactive programs.
    - Wired into `update_task_template`, `update_failure_mode_strategy`, and the `apply-strategy` route. Multi-FM tasks are now handled correctly (disabling one FM doesn't deactivate the program if another FM still references the task).
    - Added `_describe_task_change(task, fields, action)` and `_describe_fm_change(fm, request)` helpers; all version_history entries now read like `"Edited task 'Balance rotor' (duration, frequency matrix)"`, `"Failure mode 'Imbalance' disabled"`, `"Added task 'New PM'"`, `"Deleted task 'Old check'"`.
  - **Fix** (`backend/routes/maintenance_scheduler/programs.py`):
    - Rebuilt FM linkage on programs using the **reverse map** `FM-strategy.task_ids → task.id` (the actual source of truth on the strategy), instead of trying to match library FM ids.
    - `apply-strategy` now also **backfills** `failure_mode_id` + `failure_mode_name` on existing programs (previously only set on insert).
  - **Default criticality** for equipment without a criticality assessment changed from `medium` → `low` (most conservative interval).
  - **Verified live**:
    - is_mandatory toggle: `programs_deactivated: 2, scheduled_tasks_cancelled: 3` → open tasks dropped to 0; toggle back on → `programs_activated: 2`.
    - FM linkage repopulated: 10 Imbalance + 8 Rotor Crack programs (vs 0 before).
    - FM disable → `programs_toggled: 10, scheduled_tasks_cancelled: 10`. FM enable → `programs_toggled: 10` back.
    - Version history reads cleanly: `"Failure mode 'Imbalance' disabled"`, `"Edited task 'Balance rotor' (active state)"`.
  - **pytest 18/18 passing**.
- [Feb 2026] **Frequency Matrix respects active/inactive task state (BUG FIX, VERIFIED)**:
  - **Bug**: The Frequency Matrix tab listed *every* task on the strategy regardless of whether its parent failure mode was enabled — disabled FM tasks polluted the matrix.
  - **Fix** (`MaintenanceStrategyManager.jsx`):
    - Added `isTaskActive(task, fmStrategies)` helper using the actual reverse linkage (`FM.task_ids → task.id`); a task is active iff at least one referencing FM strategy is enabled, OR if no FM references it (standalone task).
    - Default Matrix view hides inactive tasks and shows `"N inactive tasks hidden (linked failure mode disabled). Show"` info row with an inline action.
    - "Show inactive" Switch toggles full view; inactive rows are rendered with `opacity-50` + an `Inactive` badge.
    - Empty-state copy adapts: "No active tasks. Toggle 'Show inactive' to see disabled ones." when only inactive tasks exist.
  - **Notes**: First attempt used `task.failure_mode_ids → FM.failure_mode_id` linkage but those IDs don't match (each strategy mints its own FM-strategy id different from the library FM id used inside task templates). Switched to the FM-side `task_ids` array which IS the populated linkage.
  - **Verified live**: Fork Lift screenshot shows all 9 active tasks with proper frequency badges (`Balance rotor: Annual/Quarterly/Monthly`, etc.). Disabling an FM correctly hides its tasks; toggle restores them.
- [Feb 2026] **Strategy → Scheduled Tasks cascade (VERIFIED)**:
  - **Bug**: When the underlying strategy changed (task deleted, FM disabled, strategy deleted), already-generated **scheduled_tasks** in the Planner stayed open — Planner showed stale tasks pointing at sources that no longer existed.
  - **Fix** (`backend/routes/maintenance_strategy_v2.py`):
    - Added `_sync_metadata_to_open_scheduled_tasks` — PATCH on a task now propagates `task_name, task_description, task_type, estimated_hours` into all OPEN scheduled_tasks (status not in completed/cancelled).
    - Added `_cancel_open_scheduled_tasks_for_task` — DELETE on a task cancels its open scheduled_tasks with audit note `"Auto-cancelled: source task removed from strategy"`.
    - Added `_cancel_open_scheduled_tasks_for_failure_mode` — FM disable cancels open scheduled_tasks for that FM with note `"Auto-cancelled: failure mode disabled on strategy"`.
    - Added `_cancel_open_scheduled_tasks_for_strategy` — DELETE strategy cancels every open scheduled_task for the strategy and deactivates all programs.
    - Completed/cancelled tasks are preserved as historical record (filter `{"$nin": ["completed","cancelled"]}`).
    - All four mutation endpoints now return `scheduled_tasks_synced` or `scheduled_tasks_cancelled` counts.
  - **Verified live**: created throwaway task → applied strategy → ran scheduler (2 scheduled_tasks) → DELETE task → response `scheduled_tasks_cancelled: 2`, both tasks now `status=cancelled` with audit note. PATCH name → `scheduled_tasks_synced: 3`, all open tasks show the new name and duration.
  - **Regression tests added**: `test_task_template_patch_syncs_open_scheduled_tasks` + `test_task_delete_cancels_open_scheduled_tasks` — **pytest 18/18 passing**.
- [Feb 2026] **Strategy version auto-increment on every mutation (BUG FIX, VERIFIED)**:
  - **Bug**: Editing/adding/deleting tasks or toggling failure-mode strategies did NOT bump the strategy version. Only the broad `PATCH /maintenance-strategies-v2/{id}` endpoint bumped it. The propagated `strategy_version` on `maintenance_programs` therefore stayed identical even after meaningful edits.
  - **Fix** (`backend/routes/maintenance_strategy_v2.py`):
    - Added `_bump_strategy_version(strategy, changes, user_id)` helper that increments the minor version (e.g. `1.0 → 1.1`) and pushes an entry to `version_history` with the change list and updater.
    - Wired into `add_task_template`, `update_task_template`, `delete_task_template`, `update_failure_mode_strategy`.
    - All four endpoints now return `version` in their response. The propagation helper now also stamps the *new* version onto every linked `maintenance_program`.
  - **Verified live**: PATCH task duration → `version: 1.1` returned, programs synced with `strategy_version=1.1`. FM toggle → `version: 1.2`. `version_history` shows both entries with their change descriptors.
  - **Regression test added**: `test_task_template_patch_bumps_strategy_version` — pytest 16/16 passing.
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

## 2026-05-31 — Multi-Language Translation Coverage Expansion (P0 + P1)
**Status: COMPLETE & VERIFIED**

### Resolved P0 — Failure Mode Translation Rendering
- Root cause: newly-created failure modes were stored with UUID as `entity_id`
  while library failure modes used the NAME as `entity_id`, causing the
  frontend hook (`useTranslatedEntities.js → useTranslatedFailureModes`,
  which keys lookups by `fm.failure_mode`) to miss user-created FMs.
- Fix: `routes/failure_modes_routes.py` POST and PATCH now pass
  `data.failure_mode` (the NAME) to `auto_translate_failure_mode` for both
  create and update flows, matching the library scheme.
- Verified: `/library` page in NL renders translated failure modes
  ("Filter geblokkeerd", "Verkeerd Materiaal in Bunker", "Kortsluiting",
  "Schroefbreuk", "Onevenwicht", etc.) and translated UI labels.

### P1 — Auto-Translate Extended to More Entity Types
- **Observations**: `POST /api/observations` and `PATCH /api/observations/{id}`
  now register BackgroundTasks → `translate_observation` (which uses
  `EntityType.OBSERVATION`, not the previous bug of `EQUIPMENT_NODE`).
- **Threats**: `PATCH /api/threats/{id}` registers BackgroundTasks for
  translation when title/description changes. Added `description: Optional[str]`
  to `ThreatUpdate` Pydantic model (`models/api_models.py`).
- **Form templates**: `POST /api/form-templates` and `PATCH /api/form-templates/{id}`
  now register BackgroundTasks → `translate_form_template`.
- **Investigations**: already wired in `routes/investigations.py` (no change).
- **Equipment nodes/types**: already wired in `routes/equipment/*` (no change).
- **Maintenance task templates**: already wired in
  `routes/maintenance_strategy_v2.py` (no change).

### New Endpoint — Bulk Legacy Translation
- `POST /api/translations/generate-all/{entity_type}?target_languages=nl&target_languages=de&only_missing=true`
  Translates ALL existing entities of the given type. Skips entities that
  already have both target languages when `only_missing=true`.
- Supports: `failure_mode`, `equipment_type`, `equipment_node`,
  `observation`, `investigation`, `maintenance_task_template`,
  `form_template`.
- Sync if ≤5 entities; queued via FastAPI BackgroundTasks otherwise
  (previously the >5 path silently dropped jobs — also fixed).

### Coverage Endpoint Fix
- `GET /api/translations/coverage` now includes `form_template` total count
  (was missing).

### Data-testids Added
- `data-testid="language-switcher"` (trigger), `language-switcher-menu`,
  and `language-option-{en|nl|de}` items in `components/Layout.js`.
- Same on the standalone `LanguageSwitcher.jsx` for any future usage.

### Backend Coverage (current snapshot)
- failure_mode: 25 of 542 translated (user can click "Generate Translations" UI)
- equipment_type: 23 of 23 ✅
- maintenance_task_template: 24 of 759
- observation: 11 of 11 ✅
- form_template: 13 of N (legacy bulk in progress)
- equipment_node: 0 of 239 (user-triggered bulk recommended due to OpenAI cost)
- investigation: 4 of 4 ✅ (auto-translated after this release)

### Backlog (Future)
- **P1**: Translation Management Dashboard (admin view of coverage, missing
  translations, bulk regenerate actions per entity type)
- **P1**: Technical Dictionary enforcement (already seeded; need validator)
- **P2**: Multilingual PDF/Excel/CSV exports
- **P2**: Import with multi-language support
- **P2**: Global multilingual search

### Files Touched
- `/app/backend/routes/translations.py` (generate-all endpoint, coverage fix)
- `/app/backend/routes/observations.py` (BackgroundTasks)
- `/app/backend/routes/threats.py` (BackgroundTasks + import)
- `/app/backend/routes/forms.py` (BackgroundTasks)
- `/app/backend/routes/failure_modes_routes.py` (NAME-based entity_id)
- `/app/backend/utils/auto_translate.py` (fixed translate_observation)
- `/app/backend/models/api_models.py` (added description to ThreatUpdate)
- `/app/frontend/src/components/Layout.js` (testids on lang switcher)
- `/app/frontend/src/components/layout/LanguageSwitcher.jsx` (testids)

### Tests
- `/app/backend/tests/test_translations_localization.py` — 10/10 pass
- Test reports: `/app/test_reports/iteration_33.json` (backend),
  `/app/test_reports/iteration_34.json` (frontend)

