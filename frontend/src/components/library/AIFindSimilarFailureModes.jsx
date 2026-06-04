import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  Zap,
  CheckCircle,
  X,
  AlertTriangle,
  ArrowDown,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { toast } from "sonner";
import api from "../../lib/api";
import { failureModesAPI } from "../../lib/apis/failureModes";

/**
 * Scans all equipment types in the FM library, asks the AI to identify
 * groups of near-duplicate failure modes per equipment type, then lets the
 * user review and selectively merge them.
 */
export default function AIFindSimilarFailureModes({
  open,
  onClose,
  failureModes = [],
  equipmentTypes = [],
  onApplied,
}) {
  const [scanMode, setScanMode] = useState("lexical"); // lexical | ai
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [scanned, setScanned] = useState(0);
  const [totalEts, setTotalEts] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  // groups: [{ et_id, et_name, member_ids, canonical_name, reason, selected }]
  const [groups, setGroups] = useState([]);
  const [applying, setApplying] = useState(false);
  const cancelRef = useRef(false);

  // Map fmId -> failure mode object for fast lookup
  const fmById = useMemo(() => {
    const m = new Map();
    (failureModes || []).forEach((fm) => m.set(fm.id, fm));
    return m;
  }, [failureModes]);

  const etById = useMemo(() => {
    const m = new Map();
    (equipmentTypes || []).forEach((et) => m.set(et.id, et));
    return m;
  }, [equipmentTypes]);

  // Group FMs by equipment_type_id (frontend builds the per-ET payload so the
  // backend doesn't have to re-load the library each call)
  const fmsByEt = useMemo(() => {
    const map = new Map();
    (failureModes || []).forEach((fm) => {
      (fm.equipment_type_ids || []).forEach((eid) => {
        if (!map.has(eid)) map.set(eid, []);
        map.get(eid).push({ id: fm.id, failure_mode: fm.failure_mode });
      });
    });
    return map;
  }, [failureModes]);

  useEffect(() => {
    if (open) {
      cancelRef.current = false;
      setPhase("idle");
      setScanned(0);
      setErrorCount(0);
      setGroups([]);
      setTotalEts(
        [...fmsByEt.values()].filter((arr) => (arr?.length || 0) >= 2).length,
      );
    }
  }, [open, fmsByEt]);

  const mapLexicalGroups = (etId, etName, groups) =>
    (groups || []).map((g) => ({
      et_id: etId,
      et_name: etName,
      member_ids: g.member_ids || [],
      canonical_name: g.suggested_canonical_name || g.member_names?.[0] || "",
      reason:
        g.reason ||
        (g.avg_similarity_score != null
          ? `Avg similarity ${g.avg_similarity_score}%`
          : ""),
      scan_source: "lexical",
      selected: false,
    }));

  const runLexicalScan = async () => {
    cancelRef.current = false;
    setPhase("running");
    setScanned(0);
    setErrorCount(0);
    setGroups([]);

    const ets = [...fmsByEt.entries()].filter(([, arr]) => (arr?.length || 0) >= 2);
    const collected = [];

    for (let i = 0; i < ets.length; i++) {
      if (cancelRef.current) break;
      const [etId] = ets[i];
      const etName = etById.get(etId)?.name || etId;
      try {
        const data = await failureModesAPI.scanSimilar({
          equipment_type_id: etId,
        });
        const newGroups = mapLexicalGroups(etId, etName, data?.groups);
        if (newGroups.length) {
          collected.push(...newGroups);
          setGroups((prev) => [...prev, ...newGroups]);
        }
      } catch (err) {
        console.error("Lexical ET scan failed", etId, err);
        setErrorCount((e) => e + 1);
      }
      setScanned((s) => s + 1);
    }

    setPhase("done");
    toast.success(
      `Fast scan complete — found ${collected.length} candidate group(s) across ${ets.length} equipment type(s).`,
    );
  };

  const runAiScan = async () => {
    cancelRef.current = false;
    setPhase("running");
    setScanned(0);
    setErrorCount(0);
    setGroups([]);

    const ets = [...fmsByEt.entries()].filter(([, arr]) => (arr?.length || 0) >= 2);
    const collected = [];

    for (let i = 0; i < ets.length; i++) {
      if (cancelRef.current) break;
      const [etId, fms] = ets[i];
      const etName = etById.get(etId)?.name || etId;
      try {
        const resp = await api.post("/ai-suggestions/find-similar-failure-modes", {
          equipment_type_id: etId,
          equipment_type_name: etName,
          failure_modes: fms,
        });
        const newGroups = (resp?.data?.groups || []).map((g) => ({
          et_id: etId,
          et_name: etName,
          member_ids: g.member_ids,
          canonical_name: g.canonical_name || "",
          reason: g.reason || "",
          scan_source: "ai",
          selected: false,
        }));
        if (newGroups.length) {
          collected.push(...newGroups);
          setGroups((prev) => [...prev, ...newGroups]);
        }
      } catch (err) {
        console.error("ET scan failed", etId, err);
        setErrorCount((e) => e + 1);
      }
      setScanned((s) => s + 1);
    }

    setPhase("done");
    toast.success(
      `AI scan complete — found ${collected.length} candidate group(s) across ${ets.length} equipment type(s).`,
    );
  };

  const runScan = () => (scanMode === "ai" ? runAiScan() : runLexicalScan());

  const cancel = () => {
    cancelRef.current = true;
  };

  const updateGroup = (idx, patch) =>
    setGroups((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));

  const toggleSelectAll = (next) =>
    setGroups((prev) => prev.map((g) => ({ ...g, selected: next })));

  const selectedCount = groups.filter((g) => g.selected).length;

  // Apply selected merges. For each selected group, pick the "winner" = the
  // failure mode whose name best matches the canonical (case-insensitive
  // exact match preferred, otherwise the most "complete" record), then call
  // /merge. The same FM can appear in multiple groups across equipment types
  // (it's linked to several ETs), so after each merge we track:
  //   - `deletedIds`: losers from previous merges (now gone)
  //   - `renamedIds`: winners whose name was renamed by a previous merge
  // and re-derive each group's member list before calling /merge.
  const applyMerges = async () => {
    const selected = groups.filter((g) => g.selected);
    if (!selected.length) {
      toast.error("Select at least one group to merge.");
      return;
    }
    setApplying(true);

    const deletedIds = new Set();
    const renamedTo = new Map(); // fm_id -> canonical name applied
    let okCount = 0;
    let skippedCount = 0;
    let failCount = 0;
    const errorSamples = []; // first few real error messages for user feedback

    for (const g of selected) {
      // Drop any members that were deleted by a previous merge.
      const liveIds = g.member_ids.filter((id) => !deletedIds.has(id));
      if (liveIds.length < 2) {
        skippedCount += 1;
        continue;
      }
      const memberFms = liveIds.map((id) => fmById.get(id)).filter(Boolean);
      if (memberFms.length < 2) {
        skippedCount += 1;
        continue;
      }
      // Pick winner: name closest to canonical (after renames), else most "complete"
      const canonical = (g.canonical_name || "").trim().toLowerCase();
      let winner = memberFms.find((fm) => {
        const currentName = (renamedTo.get(fm.id) || fm.failure_mode || "")
          .trim()
          .toLowerCase();
        return currentName === canonical;
      });
      if (!winner) {
        winner = memberFms.reduce((best, fm) => {
          const score = (fm.recommended_actions?.length || 0) * 3
            + (fm.keywords?.length || 0) * 2
            + (fm.potential_effects?.length || 0)
            + (fm.potential_causes?.length || 0)
            + (fm.is_validated ? 50 : 0);
          if (!best || score > best._score) return { ...fm, _score: score };
          return best;
        }, null);
      }
      const losers = memberFms.filter((fm) => fm.id !== winner.id);
      try {
        await failureModesAPI.merge({
          winner_id: winner.id,
          loser_ids: losers.map((l) => l.id),
          canonical_name: g.canonical_name || winner.failure_mode,
        });
        okCount += 1;
        losers.forEach((l) => deletedIds.add(l.id));
        if (g.canonical_name) renamedTo.set(winner.id, g.canonical_name);
      } catch (err) {
        console.error("Merge failed for group", g, err);
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail || err?.message || "";
        // 404 means a referenced FM was already deleted (race / overlap) —
        // treat as a benign skip, not a hard failure.
        if (status === 404 || /not found/i.test(detail)) {
          skippedCount += 1;
        } else {
          failCount += 1;
          if (errorSamples.length < 3) {
            errorSamples.push(`"${g.canonical_name}" (${g.et_name}): ${detail || status || "unknown"}`);
          }
        }
      }
    }

    setApplying(false);
    if (okCount) toast.success(`Merged ${okCount} group(s).`);
    if (skippedCount) {
      toast.info(
        `${skippedCount} group(s) skipped — members were already part of an earlier merge.`,
      );
    }
    if (failCount) {
      toast.error(
        `${failCount} group(s) failed to merge. ${errorSamples.length ? `e.g. ${errorSamples[0]}` : ""}`,
        { duration: 8000 },
      );
      // Also log all samples to console for easier debugging
      errorSamples.forEach((s) => console.warn("merge-fail sample:", s));
    }
    onApplied?.();
    if (failCount === 0 && okCount > 0) onClose?.();
  };

  const progressPct = totalEts > 0 ? Math.min(100, Math.round((scanned / totalEts) * 100)) : 0;

  // Group results by equipment-type for nicer display
  const groupsByEt = useMemo(() => {
    const map = new Map();
    groups.forEach((g, idx) => {
      const k = g.et_name;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ ...g, _idx: idx });
    });
    return [...map.entries()];
  }, [groups]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {scanMode === "ai" ? (
              <Sparkles className="w-5 h-5 text-purple-600" />
            ) : (
              <Zap className="w-5 h-5 text-amber-600" />
            )}
            Find Similar Failure Modes
          </DialogTitle>
          <DialogDescription>
            Scans each equipment type for near-duplicate failure modes (e.g.
            &quot;Bearing Failure&quot; + &quot;Bearing Damage&quot;). Different ISO 14224
            mechanisms (Wear vs Seizure) are penalized in the fast scan. Review each
            group before merging — nothing is merged automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Idle state */}
        {phase === "idle" && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                scanMode === "ai" ? "bg-purple-100" : "bg-amber-100"
              }`}
            >
              {scanMode === "ai" ? (
                <Sparkles className="w-7 h-7 text-purple-600" />
              ) : (
                <Zap className="w-7 h-7 text-amber-600" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                Will scan {totalEts} equipment type{totalEts === 1 ? "" : "s"} that have 2+ failure modes
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {scanMode === "ai"
                  ? `Estimated time: ~${Math.max(20, totalEts * 2)}s. Uses gpt-4o-mini.`
                  : "Fast lexical scan (name tokens + similarity). Usually completes in seconds."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                variant={scanMode === "lexical" ? "default" : "outline"}
                onClick={() => setScanMode("lexical")}
                className={scanMode === "lexical" ? "bg-amber-600 hover:bg-amber-700" : ""}
                data-testid="find-similar-mode-lexical"
              >
                <Zap className="w-4 h-4 mr-2" />
                Fast scan
              </Button>
              <Button
                variant={scanMode === "ai" ? "default" : "outline"}
                onClick={() => setScanMode("ai")}
                className={scanMode === "ai" ? "bg-purple-600 hover:bg-purple-700" : ""}
                data-testid="find-similar-mode-ai"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI scan
              </Button>
            </div>
            <Button
              onClick={runScan}
              className={
                scanMode === "ai"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }
              disabled={totalEts === 0}
              data-testid="run-find-similar-fm-btn"
            >
              {scanMode === "ai" ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Run AI Scan
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run Fast Scan
                </>
              )}
            </Button>
          </div>
        )}

        {/* Running state */}
        {phase === "running" && (
          <div className="flex flex-col items-center justify-center py-6 px-4 gap-3">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            <p className="text-sm text-slate-700">
              Scanning {scanned} / {totalEts} equipment types... found {groups.length} group(s) so far
            </p>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {errorCount > 0 && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errorCount} equipment type(s) failed (kept unchanged)
              </p>
            )}
            <Button variant="outline" size="sm" onClick={cancel}>
              <X className="w-4 h-4 mr-1" />
              Stop
            </Button>
          </div>
        )}

        {/* Done state — grouped results */}
        {phase === "done" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-wrap items-center gap-3 px-1 py-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-slate-700">
                  {groups.length} candidate group(s) across {groupsByEt.length} equipment type(s)
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={() => toggleSelectAll(true)}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleSelectAll(false)}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2" data-testid="similar-fm-results">
              {groups.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No similar failure modes found. Library looks clean.
                </div>
              ) : (
                groupsByEt.map(([etName, etGroups]) => (
                  <div key={etName} className="mb-4 last:mb-0">
                    <div className="sticky top-0 bg-slate-50 px-3 py-1.5 border-y border-slate-200 text-xs font-semibold text-slate-700 uppercase">
                      {etName}
                      <span className="ml-2 text-slate-400 font-normal normal-case">
                        ({etGroups.length} group{etGroups.length === 1 ? "" : "s"})
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {etGroups.map((g) => {
                        const memberFms = g.member_ids
                          .map((id) => fmById.get(id))
                          .filter(Boolean);
                        return (
                          <div
                            key={`${g.et_id}-${g._idx}`}
                            className={`p-3 ${g.selected ? "bg-purple-50/30" : ""}`}
                            data-testid={`similar-group-${g._idx}`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={g.selected}
                                onCheckedChange={(v) =>
                                  updateGroup(g._idx, { selected: !!v })
                                }
                                className="mt-1"
                                data-testid={`select-similar-${g._idx}`}
                              />
                              <div className="flex-1 min-w-0">
                                {/* Canonical name (editable) */}
                                <div className="flex items-center gap-2 mb-2">
                                  <label className="text-xs font-medium text-slate-600">
                                    Merge into:
                                  </label>
                                  <Input
                                    value={g.canonical_name}
                                    onChange={(e) =>
                                      updateGroup(g._idx, {
                                        canonical_name: e.target.value,
                                        selected: true,
                                      })
                                    }
                                    className="h-7 text-sm font-medium max-w-md"
                                    data-testid={`canonical-${g._idx}`}
                                  />
                                </div>
                                {/* Members */}
                                <div className="space-y-1">
                                  {memberFms.map((fm) => (
                                    <div
                                      key={fm.id}
                                      className="flex items-center gap-2 text-xs text-slate-600"
                                    >
                                      <ArrowDown className="w-3 h-3 text-slate-300" />
                                      <span className="font-medium text-slate-700">
                                        {fm.failure_mode}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0"
                                      >
                                        RPN {(fm.severity || 0) * (fm.occurrence || 0) * (fm.detectability || 0)}
                                      </Badge>
                                      <span className="text-slate-400">
                                        · {fm.recommended_actions?.length || 0} actions ·{" "}
                                        {fm.keywords?.length || 0} keywords
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {/* AI reason */}
                                {g.reason && (
                                  <p className="text-xs text-slate-500 italic mt-2">
                                    {g.scan_source === "ai" ? "AI" : "Match"}: {g.reason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Close
          </Button>
          {phase === "done" && groups.length > 0 && (
            <Button
              onClick={applyMerges}
              disabled={applying || selectedCount === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="apply-similar-fm-merges-btn"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Merge {selectedCount} group{selectedCount === 1 ? "" : "s"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
