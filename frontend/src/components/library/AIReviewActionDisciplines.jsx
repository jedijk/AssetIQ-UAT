import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, CheckCircle, ArrowRight, X, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import api from "../../lib/api";
import { failureModesAPI } from "../../lib/apis/failureModes";
import { useDisciplines } from "../../hooks/useDisciplines";

const BATCH_SIZE = 8; // Small batches to stay under proxy timeouts

/**
 * Dialog that asks AI to re-classify the `discipline` field of every
 * recommended_action in the FMEA library. Lets the user review and selectively
 * apply suggested changes per row.
 */
export default function AIReviewActionDisciplines({ open, onClose, failureModes = [], onApplied }) {
  const { selectOptions, getLabel, getColor } = useDisciplines();

  const DisciplineBadge = ({ value }) => {
    const v = (value || "").toLowerCase();
    const cls = `${getColor(v)} border-slate-200`;
    const label = getLabel(v) || value || "—";
    return (
      <Badge variant="outline" className={`${cls} text-[11px] font-medium`}>
        {label}
      </Badge>
    );
  };

  // ----- phase: idle | running | done -----
  const [phase, setPhase] = useState("idle");
  // Progress
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState(0);
  // Aggregated results from AI: array of { fm_id, action_index, current_discipline, suggested_discipline, reason, changed }
  const [results, setResults] = useState([]);
  // Per-row state: { selected: bool, override: string } keyed by `${fm_id}:${action_index}`
  const [rowState, setRowState] = useState({});
  const [applying, setApplying] = useState(false);
  // Filter view: 'changed' | 'all'
  const [viewMode, setViewMode] = useState("changed");
  const cancelRef = useRef(false);

  // Build the flat list of actions to classify on every open (fresh per session).
  const flatActions = useMemo(() => {
    const out = [];
    (failureModes || []).forEach((fm) => {
      (fm.recommended_actions || []).forEach((act, idx) => {
        if (!act) return;
        const description =
          typeof act === "string" ? act : act.action || act.description || "";
        if (!description) return;
        out.push({
          fm_id: fm.id,
          action_index: idx,
          description,
          action_type: typeof act === "object" ? act.action_type || "" : "",
          current_discipline: typeof act === "object" ? act.discipline || "" : "",
          failure_mode: fm.failure_mode || "",
          fm_discipline: fm.discipline || fm.category || "",
        });
      });
    });
    return out;
  }, [failureModes]);

  // Reset everything when dialog opens.
  useEffect(() => {
    if (open) {
      cancelRef.current = false;
      setPhase("idle");
      setDone(0);
      setErrors(0);
      setTotal(flatActions.length);
      setResults([]);
      setRowState({});
      setViewMode("changed");
    }
  }, [open, flatActions.length]);

  const runReview = async () => {
    if (flatActions.length === 0) {
      toast.error("No recommended actions found in the library.");
      return;
    }
    cancelRef.current = false;
    setPhase("running");
    setDone(0);
    setErrors(0);
    setResults([]);
    setRowState({});

    const batches = [];
    for (let i = 0; i < flatActions.length; i += BATCH_SIZE) {
      batches.push(flatActions.slice(i, i + BATCH_SIZE));
    }

    const collected = [];
    for (let b = 0; b < batches.length; b++) {
      if (cancelRef.current) break;
      const batch = batches[b];
      try {
        const data = await failureModesAPI.reviewActionDisciplines(batch);
        const items = data?.results || [];
        collected.push(...items);
        setResults((prev) => {
          const next = [...prev, ...items];
          return next;
        });
        // Initialise rowState for the new rows (only auto-select changed ones)
        setRowState((prev) => {
          const next = { ...prev };
          items.forEach((it) => {
            const key = `${it.fm_id}:${it.action_index}`;
            if (!next[key]) {
              next[key] = {
                selected: !!it.changed,
                override: it.suggested_discipline,
              };
            }
          });
          return next;
        });
        setDone((d) => d + batch.length);
      } catch (err) {
        console.error("Batch failed", err);
        setErrors((e) => e + batch.length);
        setDone((d) => d + batch.length);
        const msg = err?.response?.data?.detail || err?.message || "AI call failed";
        toast.error(`Batch ${b + 1}/${batches.length}: ${msg}`);
      }
    }

    setPhase("done");
    const changed = collected.filter((r) => r.changed).length;
    toast.success(
      `AI review complete — ${changed} suggested change(s) out of ${collected.length} actions.`,
    );
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  // Toggle row selection + override
  const setRow = (key, patch) =>
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const changedResults = useMemo(() => results.filter((r) => r.changed), [results]);
  const visibleResults = viewMode === "changed" ? changedResults : results;

  const selectedCount = useMemo(() => {
    return changedResults.filter((r) => {
      const key = `${r.fm_id}:${r.action_index}`;
      return rowState[key]?.selected;
    }).length;
  }, [changedResults, rowState]);

  const toggleAll = (next) => {
    setRowState((prev) => {
      const out = { ...prev };
      changedResults.forEach((r) => {
        const key = `${r.fm_id}:${r.action_index}`;
        out[key] = { ...out[key], selected: next };
      });
      return out;
    });
  };

  // Apply selected changes: group by fm_id, build full recommended_actions
  // array (preserving non-changed entries), PATCH each FM.
  const applyChanges = async () => {
    const selected = changedResults.filter((r) => {
      const key = `${r.fm_id}:${r.action_index}`;
      return rowState[key]?.selected;
    });
    if (selected.length === 0) {
      toast.error("No changes selected.");
      return;
    }
    setApplying(true);
    // Group by fm_id
    const byFm = new Map();
    selected.forEach((r) => {
      const key = `${r.fm_id}:${r.action_index}`;
      const override = rowState[key]?.override || r.suggested_discipline;
      if (!byFm.has(r.fm_id)) byFm.set(r.fm_id, []);
      byFm.get(r.fm_id).push({ idx: r.action_index, discipline: override });
    });

    const fmIndex = new Map((failureModes || []).map((fm) => [fm.id, fm]));
    let okCount = 0;
    let failCount = 0;

    for (const [fmId, changes] of byFm.entries()) {
      const fm = fmIndex.get(fmId);
      if (!fm) {
        failCount += changes.length;
        continue;
      }
      // Clone actions and mutate selected indices.
      const nextActions = (fm.recommended_actions || []).map((a) =>
        typeof a === "string" ? { action: a } : { ...a },
      );
      changes.forEach(({ idx, discipline }) => {
        if (nextActions[idx]) {
          nextActions[idx] = { ...nextActions[idx], discipline };
        }
      });
      try {
        await api.patch(`/failure-modes/${fmId}`, {
          recommended_actions: nextActions,
        });
        okCount += changes.length;
      } catch (err) {
        console.error("Apply failed for FM", fmId, err);
        failCount += changes.length;
      }
    }

    setApplying(false);
    if (okCount > 0) {
      toast.success(`Applied discipline changes to ${okCount} action(s).`);
      onApplied?.();
    }
    if (failCount > 0) {
      toast.error(`${failCount} action(s) failed to update.`);
    }
    if (failCount === 0) onClose?.();
  };

  const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Review Action Disciplines (AI)
          </DialogTitle>
          <DialogDescription>
            Classify each recommended action into your configured Settings disciplines.
            Review the suggestions before applying.
          </DialogDescription>
        </DialogHeader>

        {/* Idle state */}
        {phase === "idle" && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {flatActions.length} recommended actions across {failureModes.length} failure modes
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Estimated time: ~{Math.ceil(flatActions.length / BATCH_SIZE) * 6}s. Runs in
                batches of {BATCH_SIZE}.
              </p>
            </div>
            <Button
              onClick={runReview}
              className="bg-purple-600 hover:bg-purple-700"
              disabled={flatActions.length === 0}
              data-testid="run-action-discipline-review-btn"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Run AI Review
            </Button>
          </div>
        )}

        {/* Running state */}
        {phase === "running" && (
          <div className="flex flex-col items-center justify-center py-6 px-4 gap-3">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            <p className="text-sm text-slate-700">
              Classifying {done} / {total} actions...
            </p>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {errors > 0 && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors} action(s) failed (will keep current discipline)
              </p>
            )}
            <Button variant="outline" size="sm" onClick={cancel}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        )}

        {/* Done state — results table */}
        {phase === "done" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-3 px-1 py-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-slate-700">
                  {results.length} actions reviewed · {changedResults.length} suggested change(s)
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="changed">Changes only ({changedResults.length})</SelectItem>
                    <SelectItem value="all">All actions ({results.length})</SelectItem>
                  </SelectContent>
                </Select>
                {viewMode === "changed" && changedResults.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto" data-testid="action-discipline-results">
              {visibleResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  {results.length === 0
                    ? "No results yet."
                    : "No changes suggested — all current disciplines look correct."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left w-10"></th>
                      <th className="px-3 py-2 text-left">Failure Mode / Action</th>
                      <th className="px-3 py-2 text-left w-32">Current</th>
                      <th className="px-3 py-2 text-left w-10"></th>
                      <th className="px-3 py-2 text-left w-44">Suggested</th>
                      <th className="px-3 py-2 text-left">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map((r) => {
                      const key = `${r.fm_id}:${r.action_index}`;
                      const row = rowState[key] || {};
                      const fm = failureModes.find((f) => f.id === r.fm_id);
                      const action = fm?.recommended_actions?.[r.action_index];
                      const desc =
                        typeof action === "string"
                          ? action
                          : action?.action || action?.description || "(no description)";
                      return (
                        <tr
                          key={key}
                          className={`border-b border-slate-100 ${
                            r.changed ? "bg-amber-50/40" : ""
                          }`}
                          data-testid={`row-${r.fm_id}-${r.action_index}`}
                        >
                          <td className="px-3 py-2">
                            {r.changed ? (
                              <Checkbox
                                checked={!!row.selected}
                                onCheckedChange={(v) => setRow(key, { selected: !!v })}
                                data-testid={`select-row-${r.fm_id}-${r.action_index}`}
                              />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[340px]">
                            <p className="font-medium text-slate-800 text-xs truncate">
                              {fm?.failure_mode || r.fm_id}
                            </p>
                            <p className="text-xs text-slate-500 line-clamp-2">{desc}</p>
                          </td>
                          <td className="px-3 py-2">
                            <DisciplineBadge value={r.current_discipline} />
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            <ArrowRight className="w-4 h-4" />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={row.override || r.suggested_discipline}
                              onValueChange={(v) => setRow(key, { override: v, selected: true })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {selectOptions.map((d) => (
                                  <SelectItem key={d.value} value={d.value}>
                                    {d.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">{r.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Close
          </Button>
          {phase === "done" && (
            <Button
              onClick={applyChanges}
              disabled={applying || selectedCount === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="apply-action-discipline-changes-btn"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Apply {selectedCount} change{selectedCount === 1 ? "" : "s"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
