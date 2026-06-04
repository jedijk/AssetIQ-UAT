import { useState, useMemo } from "react";
import {
  Loader2,
  ClipboardList,
  AlertTriangle,
  GitMerge,
  CheckCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "sonner";
import { failureModesAPI } from "../../lib/apis/failureModes";

const groupKey = (row, gi) => `${row.failure_mode_id}:${gi}`;

export default function FindDuplicateActionsDialog({
  open,
  onClose,
  failureModes = [],
  onSelectFailureMode,
  onApplied,
}) {
  const [phase, setPhase] = useState("idle");
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState({});
  const [merging, setMerging] = useState(false);

  const handleClose = () => {
    setPhase("idle");
    setResults([]);
    setStats(null);
    setSelected({});
    onClose?.();
  };

  const allGroups = useMemo(() => {
    const list = [];
    (results || []).forEach((row) => {
      (row.duplicate_groups || []).forEach((group, gi) => {
        list.push({ row, group, gi, key: groupKey(row, gi) });
      });
    });
    return list;
  }, [results]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const applyScanData = (data, showToast = false) => {
    const rows = data?.results || [];
    setResults(rows);
    setStats(data);
    const initial = {};
    rows.forEach((row) => {
      (row.duplicate_groups || []).forEach((group, gi) => {
        initial[groupKey(row, gi)] = true;
      });
    });
    setSelected(initial);
    if (showToast) {
      const count = data?.failure_modes_with_duplicates || 0;
      if (count === 0) {
        toast.success("No duplicate actions found inside failure modes.");
      } else {
        toast.success(
          `Found ${data?.duplicate_group_count || 0} merge suggestion(s) in ${count} failure mode(s).`,
        );
      }
    }
  };

  const refreshResults = async () => {
    const data = await failureModesAPI.findDuplicateActions({
      ratio_threshold: 0.85,
    });
    applyScanData(data, false);
  };

  const runScan = async () => {
    if ((failureModes || []).length === 0) {
      toast.error("No failure modes in the library.");
      return;
    }
    setPhase("running");
    setSelected({});
    try {
      const data = await failureModesAPI.findDuplicateActions({
        ratio_threshold: 0.85,
      });
      applyScanData(data, true);
      setPhase("done");
    } catch (err) {
      console.error("Duplicate action scan failed", err);
      setPhase("idle");
      toast.error(
        err?.response?.data?.detail || "Failed to scan for duplicate actions",
      );
    }
  };

  const mergeOneGroup = async (row, group) => {
    const keep = group.suggested_keep_index;
    const remove =
      group.suggested_remove_indices ||
      (group.action_indices || []).filter((i) => i !== keep);
    if (keep == null || !remove?.length) {
      toast.error("No merge suggestion for this group");
      return false;
    }
    const result = await failureModesAPI.mergeDuplicateActions({
      failure_mode_id: row.failure_mode_id,
      keep_index: keep,
      remove_indices: remove,
    });
    return result?.success;
  };

  const handleMergeGroup = async (row, group, gi) => {
    setMerging(true);
    try {
      const ok = await mergeOneGroup(row, group);
      if (ok) {
        toast.success(`Merged actions on "${row.failure_mode}"`);
        onApplied?.();
        await refreshResults();
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  const handleMergeSelected = async () => {
    const toMerge = allGroups.filter((g) => selected[g.key]);
    if (!toMerge.length) {
      toast.error("Select at least one group to merge");
      return;
    }
    setMerging(true);
    let ok = 0;
    let fail = 0;
    for (const { row, group, gi } of toMerge) {
      try {
        if (await mergeOneGroup(row, group)) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }
    setMerging(false);
    if (ok) toast.success(`Merged ${ok} duplicate action group(s).`);
    if (fail) toast.error(`${fail} group(s) failed to merge`);
    if (ok) {
      onApplied?.();
      try {
        await refreshResults();
      } catch {
        toast.info("Merged — run scan again to refresh the list.");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-6"
        data-testid="find-duplicate-actions-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-600" />
            Find Duplicate Actions
          </DialogTitle>
          <DialogDescription>
            Scans recommended actions for duplicates and suggests merging them into
            one action (keeps type, discipline, and the most complete text).
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="flex flex-col items-center py-8 gap-3 text-center flex-shrink-0">
            <p className="text-sm text-slate-600">
              Will scan recommended actions across {failureModes.length} failure
              mode{failureModes.length === 1 ? "" : "s"}.
            </p>
            <Button
              onClick={runScan}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={failureModes.length === 0}
              data-testid="run-find-duplicate-actions-btn"
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              Scan for duplicate actions
            </Button>
          </div>
        )}

        {phase === "running" && (
          <div className="flex flex-col items-center py-10 gap-3 flex-shrink-0">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
            <p className="text-sm text-slate-600">Scanning recommended actions…</p>
          </div>
        )}

        {phase === "done" && (
          <>
            <div className="flex-shrink-0 flex flex-wrap items-center gap-2 py-2 border-b border-slate-100">
              {stats && (
                <span className="text-sm text-slate-700">
                  {stats.duplicate_group_count} merge suggestion
                  {stats.duplicate_group_count === 1 ? "" : "s"} in{" "}
                  {stats.failure_modes_with_duplicates} failure mode
                  {stats.failure_modes_with_duplicates === 1 ? "" : "s"}
                </span>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = {};
                    allGroups.forEach((g) => { next[g.key] = true; });
                    setSelected(next);
                  }}
                >
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
                  Clear
                </Button>
              </div>
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain border rounded-md mt-2"
              data-testid="duplicate-actions-results"
            >
              {results.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">
                  No duplicate actions found.
                </p>
              ) : (
                <div className="divide-y">
                  {results.map((row) => (
                    <div key={row.failure_mode_id} className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-medium text-slate-800">{row.failure_mode}</p>
                          <p className="text-xs text-slate-500">
                            {row.equipment || "—"} · {row.action_count} actions
                          </p>
                        </div>
                        {onSelectFailureMode && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onSelectFailureMode(row.failure_mode_id);
                              handleClose();
                            }}
                          >
                            Open FM
                          </Button>
                        )}
                      </div>
                      {(row.duplicate_groups || []).map((group, gi) => {
                        const key = groupKey(row, gi);
                        const preview = group.merged_action_preview;
                        const keepIdx = group.suggested_keep_index;
                        return (
                          <div
                            key={key}
                            className={`mb-3 last:mb-0 rounded border p-3 ${
                              selected[key] ? "border-amber-300 bg-amber-50/50" : "border-amber-100 bg-amber-50/30"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={!!selected[key]}
                                onCheckedChange={(v) =>
                                  setSelected((prev) => ({ ...prev, [key]: !!v }))
                                }
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-amber-800 mb-2 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  {group.avg_similarity_score}% similar — merge into action #
                                  {(keepIdx ?? 0) + 1}
                                </p>
                                <ul className="space-y-1 mb-2">
                                  {(group.members || []).map((m) => (
                                    <li
                                      key={`${key}-${m.index}`}
                                      className={`text-xs flex flex-wrap items-center gap-2 ${
                                        m.index === keepIdx
                                          ? "text-emerald-800 font-medium"
                                          : "text-slate-600 line-through decoration-slate-300"
                                      }`}
                                    >
                                      <span>#{m.index + 1}</span>
                                      <span>{m.label}</span>
                                      {m.action_type && (
                                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                                          {m.action_type}
                                        </Badge>
                                      )}
                                      {m.discipline && (
                                        <span className="text-slate-500">{m.discipline}</span>
                                      )}
                                      {m.index === keepIdx && (
                                        <Badge className="text-[10px] bg-emerald-100 text-emerald-800">
                                          keep
                                        </Badge>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                                {preview && (
                                  <div className="rounded bg-white border border-slate-200 px-2 py-1.5 text-xs">
                                    <span className="text-slate-500">After merge: </span>
                                    <span className="font-medium text-slate-800">
                                      {preview.label}
                                    </span>
                                    {preview.action_type && (
                                      <Badge variant="outline" className="ml-2 text-[10px]">
                                        {preview.action_type}
                                      </Badge>
                                    )}
                                    {preview.discipline && (
                                      <span className="ml-2 text-slate-500">
                                        {preview.discipline}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                className="bg-amber-600 hover:bg-amber-700 shrink-0"
                                disabled={merging}
                                onClick={() => handleMergeGroup(row, group, gi)}
                                data-testid={`merge-dup-actions-${key}`}
                              >
                                {merging ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <GitMerge className="w-4 h-4 mr-1" />
                                    Merge
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="flex-shrink-0 border-t border-slate-100 pt-3 mt-2">
          <Button variant="outline" onClick={handleClose} disabled={merging}>
            Close
          </Button>
          {phase === "done" && results.length > 0 && (
            <Button
              onClick={handleMergeSelected}
              disabled={merging || selectedCount === 0}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="merge-selected-dup-actions-btn"
            >
              {merging ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Merge {selectedCount} selected
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
