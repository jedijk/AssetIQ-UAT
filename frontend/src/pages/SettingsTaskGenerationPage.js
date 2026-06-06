/**
 * Settings → Task Generation (P2).
 * - Manual trigger ("Run Now") with optional dry-run preview
 * - History table of recent runs
 * - Cron schedule placeholder (configured in P3)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Loader2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { SettingsSection, SettingsCard } from "./SettingsPage";
import { getBackendUrl } from "../lib/apiConfig";

const API_BASE_URL = getBackendUrl();
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer";

function authHeaders(extra = {}) {
  const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: authHeaders(options.headers),
    credentials: AUTH_MODE === "cookie" ? "include" : "omit",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTs(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function SettingsTaskGenerationPage() {
  const qc = useQueryClient();
  const [dryRunPreview, setDryRunPreview] = useState(null);

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["task-generation-runs"],
    queryFn: () => fetchJson("/api/admin/task-generation/runs?limit=20"),
    staleTime: 30 * 1000,
  });
  const runs = runsData?.runs || [];
  const lastLiveRun = runs.find((r) => !r.dry_run);

  const runMutation = useMutation({
    mutationFn: ({ dryRun }) =>
      fetchJson("/api/admin/task-generation/run", {
        method: "POST",
        body: JSON.stringify({ dry_run: dryRun }),
      }),
    onSuccess: (data) => {
      if (data.dry_run) {
        setDryRunPreview(data);
      } else {
        toast.success(
          `Generated ${data.created} task instance(s) across ${
            Object.keys(data.by_discipline || {}).length
          } disciplines`,
        );
        qc.invalidateQueries({ queryKey: ["task-generation-runs"] });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SettingsSection
      title="Task Generation"
      description="Convert maintenance task templates into actual tasks visible in My Tasks. Runs weekly (cron in P3) or manually here. Idempotent — re-runs never duplicate."
    >
      {/* Manual trigger */}
      <SettingsCard
        title="Run Now"
        description="Generates task instances for the upcoming Monday → Sunday window from the current scheduled_tasks. The dry-run option previews counts without writing."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate({ dryRun: false })}
            data-testid="task-gen-run-btn"
          >
            {runMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Generate next week
          </Button>
          <Button
            variant="outline"
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate({ dryRun: true })}
            data-testid="task-gen-dryrun-btn"
          >
            <FlaskConical className="w-4 h-4 mr-2" />
            Dry-run preview
          </Button>
        </div>

        {lastLiveRun && (
          <div className="mt-4 text-xs text-slate-500 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Last live run: {formatTs(lastLiveRun.started_at)} · created{" "}
            <strong className="text-slate-700">{lastLiveRun.created}</strong>,
            skipped {lastLiveRun.skipped}
            {lastLiveRun.errors?.length ? `, ${lastLiveRun.errors.length} errors` : ""}
          </div>
        )}
      </SettingsCard>

      {/* History */}
      <SettingsCard
        title={`Run History (${runs.length})`}
        description="Most recent 20 task generation runs (cron + manual)."
      >
        {runsLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="text-sm text-slate-500">
            No runs yet. Trigger one with &quot;Generate next week&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm" data-testid="task-gen-history-table">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="py-2 pr-3">Run</th>
                  <th className="py-2 pr-3">Window</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Skipped</th>
                  <th className="py-2 pr-3">By discipline</th>
                  <th className="py-2 pr-3">Trigger</th>
                  <th className="py-2 pr-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {r.dry_run ? (
                          <FlaskConical className="w-3 h-3 text-amber-600" />
                        ) : r.errors?.length ? (
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        )}
                        <span className="text-xs">{formatTs(r.started_at)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {r.week_start} → {r.week_end}
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {r.created.toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{r.skipped}</td>
                    <td className="py-2 pr-3 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.by_discipline || {}).map(
                          ([disc, count]) => (
                            <Badge
                              key={disc}
                              variant="outline"
                              className="text-[10px] py-0"
                            >
                              {disc}: {count}
                            </Badge>
                          ),
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {r.triggered_by}
                      {r.dry_run && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                        >
                          dry
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {formatDuration(r.duration_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {/* Schedule editor (P3) */}
      <ScheduleEditor />

      {/* Dry-run preview dialog */}
      <Dialog open={!!dryRunPreview} onOpenChange={() => setDryRunPreview(null)}>
        <DialogContent className="max-w-md" data-testid="task-gen-preview-dialog">
          <DialogHeader>
            <DialogTitle>Dry-run Preview</DialogTitle>
            <DialogDescription>
              {dryRunPreview?.week_start} → {dryRunPreview?.week_end} · would
              create <strong>{dryRunPreview?.created || 0}</strong> task
              instance(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 py-1">
              <span className="text-slate-500">Candidates in window</span>
              <span className="font-mono">{dryRunPreview?.candidate_total || 0}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-1">
              <span className="text-slate-500">Already generated (skipped)</span>
              <span className="font-mono">{dryRunPreview?.skipped || 0}</span>
            </div>
            <div className="font-medium text-slate-700 pt-2">By discipline</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(dryRunPreview?.by_discipline || {}).map(
                ([disc, count]) => (
                  <Badge key={disc} variant="outline" className="text-xs">
                    {disc}: {count}
                  </Badge>
                ),
              )}
              {!Object.keys(dryRunPreview?.by_discipline || {}).length && (
                <span className="text-xs text-slate-400">Nothing to create</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDryRunPreview(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setDryRunPreview(null);
                runMutation.mutate({ dryRun: false });
              }}
              data-testid="task-gen-apply-preview-btn"
            >
              <Play className="w-4 h-4 mr-2" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

// ---------- Schedule Editor ----------
const COMMON_TIMEZONES = [
  "Europe/Amsterdam",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const CRON_PRESETS = [
  { label: "Sunday 02:00", expression: "0 2 * * sun" },
  { label: "Sunday 06:00", expression: "0 6 * * sun" },
  { label: "Monday 02:00", expression: "0 2 * * mon" },
  { label: "Daily 02:00", expression: "0 2 * * *" },
  { label: "Every 4 hours", expression: "0 */4 * * *" },
];

function ScheduleEditor() {
  const qc = useQueryClient();
  const { data: schedule, isLoading } = useQuery({
    queryKey: ["task-generation-schedule"],
    queryFn: () => fetchJson("/api/admin/task-generation/schedule"),
  });

  const [draftCron, setDraftCron] = useState("");
  const [draftTz, setDraftTz] = useState("");
  const [draftLookAhead, setDraftLookAhead] = useState(7);
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const hydrated = useMemo(() => {
    if (!schedule) return false;
    if (draftCron === "") {
      setDraftCron(schedule.cron_expression);
      setDraftTz(schedule.timezone);
      setDraftLookAhead(schedule.look_ahead_days);
      setDraftEnabled(schedule.enabled);
      return true;
    }
    return true;
  }, [schedule, draftCron]);

  const previewMutation = useMutation({
    mutationFn: (body) =>
      fetchJson("/api/admin/task-generation/schedule/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewError(null);
    },
    onError: (e) => {
      setPreviewError(e.message);
      setPreview(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (body) =>
      fetchJson("/api/admin/task-generation/schedule", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("Schedule updated — scheduler reloaded");
      qc.invalidateQueries({ queryKey: ["task-generation-schedule"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const hasChanges =
    hydrated &&
    schedule &&
    (draftCron !== schedule.cron_expression ||
      draftTz !== schedule.timezone ||
      draftLookAhead !== schedule.look_ahead_days ||
      draftEnabled !== schedule.enabled);

  if (isLoading) {
    return (
      <SettingsCard title="Weekly Schedule" description="Loading…">
        <div className="text-sm text-slate-500">Loading…</div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Weekly Schedule"
      description="Automatic cron for the weekly task-generation run. Time zone is plant-local."
    >
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600">
            Cron expression
          </label>
          <input
            value={draftCron}
            onChange={(e) => setDraftCron(e.target.value)}
            className="mt-1 w-full font-mono text-sm border border-slate-300 rounded-md px-2 py-1.5"
            placeholder="0 2 * * sun"
            data-testid="cron-expression-input"
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.expression}
                type="button"
                onClick={() => setDraftCron(p.expression)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 hover:bg-slate-100 text-slate-600"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Time zone</label>
          <select
            value={draftTz}
            onChange={(e) => setDraftTz(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            data-testid="cron-timezone-select"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">
            Look-ahead (days)
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={draftLookAhead}
            onChange={(e) => setDraftLookAhead(parseInt(e.target.value || "7", 10))}
            className="mt-1 w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
          />
        </div>
        <div className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 mt-5">
          <div>
            <div className="text-sm font-medium">Cron enabled</div>
            <div className="text-xs text-slate-500">
              Disable to pause automatic generation.
            </div>
          </div>
          <input
            type="checkbox"
            checked={draftEnabled}
            onChange={(e) => setDraftEnabled(e.target.checked)}
            className="w-4 h-4"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button
          variant="outline"
          onClick={() =>
            previewMutation.mutate({
              cron_expression: draftCron,
              timezone: draftTz,
            })
          }
          disabled={previewMutation.isPending}
          data-testid="cron-preview-btn"
        >
          <Calendar className="w-4 h-4 mr-2" />
          Preview next runs
        </Button>
        <Button
          onClick={() =>
            saveMutation.mutate({
              cron_expression: draftCron,
              timezone: draftTz,
              look_ahead_days: draftLookAhead,
              enabled: draftEnabled,
            })
          }
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="cron-save-btn"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          )}
          Save & reload scheduler
        </Button>
      </div>

      {previewError && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {previewError}
        </div>
      )}

      {/* Active fire times card */}
      <div className="mt-4 p-3 rounded-md border border-slate-200 bg-slate-50/40">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <div className="text-sm font-medium text-slate-700">
            Next runs ({preview ? "preview" : "active"})
          </div>
          {schedule?.scheduler?.running && (
            <Badge
              variant="outline"
              className="ml-auto text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
            >
              Scheduler running
            </Badge>
          )}
          {schedule?.scheduler?.running === false && (
            <Badge
              variant="outline"
              className="ml-auto text-[10px] bg-rose-50 text-rose-700 border-rose-200"
            >
              Scheduler stopped
            </Badge>
          )}
        </div>
        <ul className="text-sm space-y-0.5">
          {(preview?.next_fire_times || schedule?.next_fire_times || []).map(
            (t) => (
              <li
                key={t}
                className="font-mono text-xs text-slate-700 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {formatTs(t)}
              </li>
            ),
          )}
        </ul>
      </div>
    </SettingsCard>
  );
}
