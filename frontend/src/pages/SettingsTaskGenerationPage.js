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

      {/* Schedule placeholder (P3 will wire APScheduler) */}
      <SettingsCard
        title="Weekly Schedule"
        description="Automatic cron in plant-local time."
      >
        <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200 bg-slate-50/50">
          <Calendar className="w-4 h-4 text-slate-500" />
          <div className="text-sm">
            <div className="font-medium text-slate-700">
              Sunday 02:00 — Plant time
            </div>
            <div className="text-xs text-slate-500">
              Default cron `0 2 * * 0`. APScheduler trigger wires up in the next
              phase. Until then, run manually with the button above.
            </div>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Coming in P3
          </Badge>
        </div>
      </SettingsCard>

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
