import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle,
  ArrowRight,
  X,
  AlertTriangle,
  Clock,
} from "lucide-react";
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
import { useLanguage } from "../../contexts/LanguageContext";
import ActionDowntimeBadge from "../failure-modes/ActionDowntimeBadge";

const BATCH_SIZE = 8; // Match review-action-disciplines; one OpenAI call per batch on backend

const isGatewayTimeout = (err) => {
  const status = err?.response?.status;
  return status === 502 || status === 504;
};

const isBatchSizeRejected = (err) => {
  const status = err?.response?.status;
  const detail = String(err?.response?.data?.detail || "");
  return status === 400 && /at most \d+ actions per batch/i.test(detail);
};

const reviewDowntimeBatch = async (batch) => {
  if (!batch?.length) return { results: [] };

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await failureModesAPI.reviewActionDowntime(batch);
    } catch (err) {
      if (isBatchSizeRejected(err) && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        const left = await reviewDowntimeBatch(batch.slice(0, mid));
        const right = await reviewDowntimeBatch(batch.slice(mid));
        return {
          results: [...(left?.results || []), ...(right?.results || [])],
        };
      }
      if (!isGatewayTimeout(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  return { results: [] };
};

export default function AIReviewActionDowntime({
  open,
  onClose,
  failureModes = [],
  onApplied,
}) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState(0);
  const [results, setResults] = useState([]);
  const [rowState, setRowState] = useState({});
  const [applying, setApplying] = useState(false);
  const [viewMode, setViewMode] = useState("changed");
  const cancelRef = useRef(false);

  const downtimeLabel = (value) =>
    value ? t("library.downtimeRequired") : t("library.downtimeNotRequired");

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
          action_type:
            typeof act === "object" ? String(act.action_type || "") : "",
          current_requires_downtime:
            typeof act === "object" ? !!act.requires_downtime : false,
          failure_mode: fm.failure_mode || "",
          equipment: fm.equipment || "",
        });
      });
    });
    return out;
  }, [failureModes]);

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
      toast.error(t("library.noRecommendedActionsInLibrary"));
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
        const data = await reviewDowntimeBatch(batch);
        const items = data?.results || [];
        collected.push(...items);
        setResults((prev) => [...prev, ...items]);
        setRowState((prev) => {
          const next = { ...prev };
          items.forEach((it) => {
            const key = `${it.fm_id}:${it.action_index}`;
            if (!next[key]) {
              next[key] = {
                selected: !!it.changed,
                override: it.suggested_requires_downtime,
              };
            }
          });
          return next;
        });
        setDone((d) => d + batch.length);
      } catch (err) {
        console.error("Downtime batch failed", err);
        setErrors((e) => e + batch.length);
        setDone((d) => d + batch.length);
        const msg = err?.response?.data?.detail || err?.message || "AI call failed";
        toast.error(`Batch ${b + 1}/${batches.length}: ${msg}`);
      }
    }

    setPhase("done");
    const changed = collected.filter((r) => r.changed).length;
    toast.success(
      t("library.reviewActionDowntimeComplete", {
        changed,
        total: collected.length,
      }),
    );
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  const setRow = (key, patch) =>
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const changedResults = useMemo(() => results.filter((r) => r.changed), [results]);
  const visibleResults = viewMode === "changed" ? changedResults : results;

  const selectedCount = useMemo(
    () =>
      changedResults.filter((r) => {
        const key = `${r.fm_id}:${r.action_index}`;
        return rowState[key]?.selected;
      }).length,
    [changedResults, rowState],
  );

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

  const applyChanges = async () => {
    const selected = changedResults.filter((r) => {
      const key = `${r.fm_id}:${r.action_index}`;
      return rowState[key]?.selected;
    });
    if (selected.length === 0) {
      toast.error(t("library.noChangesSelected"));
      return;
    }
    setApplying(true);
    const byFm = new Map();
    selected.forEach((r) => {
      const key = `${r.fm_id}:${r.action_index}`;
      const override =
        rowState[key]?.override ?? r.suggested_requires_downtime;
      if (!byFm.has(r.fm_id)) byFm.set(r.fm_id, []);
      byFm.get(r.fm_id).push({ idx: r.action_index, requires_downtime: override });
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
      const nextActions = (fm.recommended_actions || []).map((a) =>
        typeof a === "string" ? { action: a } : { ...a },
      );
      changes.forEach(({ idx, requires_downtime }) => {
        if (nextActions[idx]) {
          nextActions[idx] = { ...nextActions[idx], requires_downtime };
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
      toast.success(
        t("library.reviewActionDowntimeApplied", { count: okCount }),
      );
      onApplied?.();
    }
    if (failCount > 0) {
      toast.error(t("library.reviewActionDowntimeFailed", { count: failCount }));
    }
    if (failCount === 0) onClose?.();
  };

  const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="review-action-downtime-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            {t("library.reviewActionDowntimeTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("library.reviewActionDowntimeDesc")}
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {t("library.reviewActionDowntimeSummary", {
                  actions: flatActions.length,
                  modes: failureModes.length,
                })}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {t("library.reviewActionDowntimeEstimate", {
                  seconds: Math.ceil(flatActions.length / BATCH_SIZE) * 6,
                  batchSize: BATCH_SIZE,
                })}
              </p>
            </div>
            <Button
              onClick={runReview}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={flatActions.length === 0}
              data-testid="run-action-downtime-review-btn"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {t("library.reviewActionDowntimeRun")}
            </Button>
          </div>
        )}

        {phase === "running" && (
          <div className="flex flex-col items-center justify-center py-6 px-4 gap-3">
            <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
            <p className="text-sm text-slate-700">
              {t("library.reviewActionDowntimeProgress", { done, total })}
            </p>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {errors > 0 && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t("library.reviewActionDowntimeErrors", { count: errors })}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={cancel}>
              <X className="w-4 h-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-wrap items-center gap-3 px-1 py-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-slate-700">
                  {t("library.reviewActionDowntimeDoneSummary", {
                    reviewed: results.length,
                    changed: changedResults.length,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="changed">
                      {t("library.reviewActionDowntimeChangesOnly", {
                        count: changedResults.length,
                      })}
                    </SelectItem>
                    <SelectItem value="all">
                      {t("library.reviewActionDowntimeAll", { count: results.length })}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {viewMode === "changed" && changedResults.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>
                      {t("common.clear")}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto" data-testid="action-downtime-results">
              {visibleResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  {results.length === 0
                    ? t("library.reviewActionDowntimeNoResults")
                    : t("library.checkDowntimeNoChanges")}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left w-10" />
                      <th className="px-3 py-2 text-left">
                        {t("library.reviewActionDowntimeColumnAction")}
                      </th>
                      <th className="px-3 py-2 text-left w-32">
                        {t("library.reviewActionDowntimeColumnCurrent")}
                      </th>
                      <th className="px-3 py-2 text-left w-10" />
                      <th className="px-3 py-2 text-left w-44">
                        {t("library.reviewActionDowntimeColumnSuggested")}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t("library.reviewActionDowntimeColumnWhy")}
                      </th>
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
                      const suggested =
                        row.override ?? r.suggested_requires_downtime;
                      return (
                        <tr
                          key={key}
                          className={`border-b border-slate-100 ${
                            r.changed ? "bg-amber-50/40" : ""
                          }`}
                          data-testid={`downtime-row-${r.fm_id}-${r.action_index}`}
                        >
                          <td className="px-3 py-2">
                            {r.changed ? (
                              <Checkbox
                                checked={!!row.selected}
                                onCheckedChange={(v) =>
                                  setRow(key, { selected: !!v })
                                }
                              />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[340px]">
                            <p className="font-medium text-slate-800 text-xs truncate">
                              {fm?.failure_mode || r.failure_mode || r.fm_id}
                            </p>
                            <p className="text-xs text-slate-500 line-clamp-2">{desc}</p>
                          </td>
                          <td className="px-3 py-2">
                            <ActionDowntimeBadge
                              requiresDowntime={r.current_requires_downtime}
                              showLabel
                            />
                            {!r.current_requires_downtime && (
                              <span className="text-xs text-slate-500">
                                {downtimeLabel(false)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            <ArrowRight className="w-4 h-4" />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setRow(key, {
                                  override: !suggested,
                                  selected: true,
                                })
                              }
                            >
                              <Badge
                                className={`cursor-pointer text-[10px] ${
                                  suggested
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-green-100 text-green-800 border-green-200"
                                }`}
                              >
                                {downtimeLabel(suggested)}
                              </Badge>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {r.reasoning}
                          </td>
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
            {t("common.close")}
          </Button>
          {phase === "done" && (
            <Button
              onClick={applyChanges}
              disabled={applying || selectedCount === 0}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="apply-action-downtime-changes-btn"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {selectedCount === 1
                    ? t("library.checkDowntimeApply", { count: selectedCount })
                    : t("library.checkDowntimeApplyPlural", { count: selectedCount })}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
