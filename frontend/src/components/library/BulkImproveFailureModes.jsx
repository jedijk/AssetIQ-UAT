import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Brain,
  CheckCircle,
  Sparkles,
  AlertTriangle,
  X,
  Pause,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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

const CONCURRENCY = 4;
const FIELD_KEYS = [
  "failure_mode",
  "category",
  "mechanism",
  "severity",
  "occurrence",
  "detectability",
  "keywords",
  "potential_effects",
  "potential_causes",
  "recommended_actions",
  "equipment_type_ids",
];

const actionsToStrings = (acts) =>
  (acts || [])
    .map((a) => (typeof a === "string" ? a : a?.action || a?.description || ""))
    .filter(Boolean);

const valEqual = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const A = (Array.isArray(a) ? a : []).map(String).sort();
    const B = (Array.isArray(b) ? b : []).map(String).sort();
    return A.length === B.length && A.every((v, i) => v === B[i]);
  }
  return String(a ?? "") === String(b ?? "");
};

const parseActionType = (txt) => {
  const m = String(txt || "").match(/\s*\((PDM|PM|CM)(?:[,)][^)]*)?\)\s*$/i);
  if (m) {
    return {
      actionType: m[1].toUpperCase(),
      cleaned: String(txt).slice(0, m.index).trim(),
    };
  }
  return { actionType: "PM", cleaned: String(txt || "").trim() };
};

const buildPatch = (fm, improved) => {
  // Mirrors the single-improve dialog logic.
  const current = {
    failure_mode: fm.failure_mode || "",
    category: fm.category || "",
    mechanism: fm.iso14224_mechanism || fm.mechanism || "",
    severity: fm.severity ?? null,
    occurrence: fm.occurrence ?? null,
    detectability: fm.detectability ?? null,
    keywords: fm.keywords || [],
    potential_effects: fm.potential_effects || [],
    potential_causes: fm.potential_causes || [],
    recommended_actions: actionsToStrings(fm.recommended_actions),
    equipment_type_ids: fm.equipment_type_ids || [],
  };

  const patch = {};
  let changedCount = 0;
  for (const k of FIELD_KEYS) {
    if (valEqual(current[k], improved[k])) continue;
    changedCount += 1;
    if (k === "recommended_actions") {
      const existingByAction = {};
      for (const a of fm.recommended_actions || []) {
        if (typeof a === "object") {
          const txt = (a.action || a.description || "").toString();
          if (txt) existingByAction[txt.toLowerCase()] = a;
        }
      }
      patch.recommended_actions = (improved.recommended_actions || []).map(
        (txt) => {
          const existing = existingByAction[String(txt).toLowerCase()];
          if (existing) return existing;
          const { actionType, cleaned } = parseActionType(txt);
          return {
            action: cleaned || String(txt).trim(),
            action_type: actionType,
            discipline: "mechanical",
          };
        },
      );
    } else if (k === "mechanism") {
      patch.iso14224_mechanism = improved.mechanism;
    } else {
      patch[k] = improved[k];
    }
  }
  return { patch, changedCount };
};

export function BulkImproveFailureModes({
  isOpen,
  onClose,
  failureModes = [],
  equipmentTypes = [],
  onCompleted,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    current: "",
    errors: [],
  });
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmed(false);
      setRunning(false);
      setDone(false);
      setProgress({
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        current: "",
        errors: [],
      });
      cancelRef.current = false;
    }
  }, [isOpen]);

  const total = failureModes.length;

  const processOne = async (fm, etPayload) => {
    const payload = {
      failure_mode: {
        id: fm.id,
        failure_mode: fm.failure_mode,
        category: fm.category || "",
        mechanism: fm.iso14224_mechanism || fm.mechanism || "",
        severity: fm.severity,
        occurrence: fm.occurrence,
        detectability: fm.detectability,
        keywords: fm.keywords || [],
        potential_effects: fm.potential_effects || [],
        potential_causes: fm.potential_causes || [],
        recommended_actions: actionsToStrings(fm.recommended_actions),
        equipment_type_ids: fm.equipment_type_ids || [],
      },
      equipment_types: etPayload,
    };

    const aiResp = await api.post(
      "/ai-suggestions/improve-failure-mode",
      payload,
      { timeout: 120000 },
    );
    const improved = aiResp.data;
    const { patch, changedCount } = buildPatch(fm, improved);

    if (changedCount === 0) {
      return { action: "skipped" };
    }

    // PATCH with merged data — include all required fields the backend expects.
    const baseData = {
      discipline: fm.discipline,
      failure_mode: fm.failure_mode,
      keywords: fm.keywords || [],
      severity: fm.severity,
      occurrence: fm.occurrence,
      detectability: fm.detectability,
      recommended_actions: fm.recommended_actions || [],
      equipment_type_ids: fm.equipment_type_ids || [],
      process: fm.process || "",
      potential_effects: fm.potential_effects || [],
      potential_causes: fm.potential_causes || [],
      iso14224_mechanism: fm.iso14224_mechanism || "",
      category: fm.category || "",
    };
    const merged = { ...baseData, ...patch };
    await api.patch(`/failure-modes/${fm.id}`, merged);
    return { action: "updated", changedCount };
  };

  const start = async () => {
    setConfirmed(true);
    setRunning(true);
    cancelRef.current = false;

    const etPayload = equipmentTypes.slice(0, 200).map((t) => ({
      id: t.id,
      name: t.name,
      discipline: t.discipline || "",
    }));

    // Pool-based concurrency without external deps.
    let cursor = 0;
    const stats = {
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      current: "",
      errors: [],
    };

    const flush = () => {
      setProgress({ ...stats });
    };

    const worker = async () => {
      while (cursor < failureModes.length && !cancelRef.current) {
        const idx = cursor;
        cursor += 1;
        const fm = failureModes[idx];
        stats.current = fm.failure_mode;
        flush();
        try {
          const res = await processOne(fm, etPayload);
          if (res.action === "updated") stats.updated += 1;
          else stats.skipped += 1;
        } catch (e) {
          stats.failed += 1;
          stats.errors.push({
            name: fm.failure_mode,
            detail:
              e.response?.data?.detail ||
              e.message ||
              "unknown error",
          });
        } finally {
          stats.processed += 1;
          flush();
        }
      }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    setRunning(false);
    setDone(true);

    if (cancelRef.current) {
      toast.info(
        `Cancelled at ${stats.processed}/${failureModes.length}. Updated ${stats.updated}, skipped ${stats.skipped}.`,
      );
    } else {
      toast.success(
        `Bulk improve done — updated ${stats.updated}, skipped ${stats.skipped}, failed ${stats.failed}.`,
      );
    }
    onCompleted?.();
  };

  const requestCancel = () => {
    cancelRef.current = true;
    toast.info("Cancelling after current batch finishes...");
  };

  const pct = total > 0 ? Math.round((progress.processed / total) * 100) : 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && running) {
          toast.warning("Cancel the current run before closing");
          return;
        }
        onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        data-testid="bulk-improve-fm-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Bulk Improve Failure Modes with AI
          </DialogTitle>
          <DialogDescription>
            Run the AI reliability engineer over every failure mode in the current
            view and auto-apply the suggested changes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {!confirmed && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold mb-1">This is a one-time bulk operation</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    <li>
                      Will run the AI improvement on{" "}
                      <span className="font-semibold">{total}</span> failure mode{total === 1 ? "" : "s"}.
                    </li>
                    <li>
                      Every suggested change will be applied automatically — no
                      per-field review.
                    </li>
                    <li>
                      A full version is saved on each update so individual changes
                      can be rolled back from the version history.
                    </li>
                    <li>
                      Estimated time:{" "}
                      <span className="font-semibold">
                        ~{Math.max(1, Math.round((total * 6) / CONCURRENCY / 60))} min
                      </span>{" "}
                      with {CONCURRENCY} parallel workers (cached results return instantly).
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-xs text-slate-700">
                  <span className="font-semibold">Scope: </span>
                  Operates on the current visible list. Apply any filters (e.g.{" "}
                  <em>High Severity</em>, discipline, search) before starting to
                  narrow the run.
                </p>
              </div>
            </div>
          )}

          {confirmed && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Progress
                  </span>
                  <span className="text-sm font-mono text-slate-900">
                    {progress.processed} / {total}{" "}
                    <span className="text-slate-500">({pct}%)</span>
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2 truncate">
                  {running ? (
                    <>
                      <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                      Current: {progress.current || "—"}
                    </>
                  ) : done ? (
                    <>
                      <CheckCircle className="w-3 h-3 inline text-green-600 mr-1" />
                      {cancelRef.current ? "Cancelled" : "Finished"}
                    </>
                  ) : (
                    "Ready"
                  )}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {progress.updated}
                  </p>
                  <p className="text-xs text-green-700">Updated</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-slate-700">
                    {progress.skipped}
                  </p>
                  <p className="text-xs text-slate-600">Already good</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {progress.failed}
                  </p>
                  <p className="text-xs text-red-700">Failed</p>
                </div>
              </div>

              {progress.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg max-h-32 overflow-auto">
                  <p className="text-xs font-semibold text-red-900 mb-1">
                    Errors
                  </p>
                  <ul className="text-xs text-red-800 space-y-0.5 list-disc list-inside">
                    {progress.errors.slice(0, 10).map((e, i) => (
                      <li key={`err-${i}`}>
                        <span className="font-medium">{e.name}:</span> {e.detail}
                      </li>
                    ))}
                    {progress.errors.length > 10 && (
                      <li>+{progress.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 flex-shrink-0">
          <div className="flex items-center justify-end w-full gap-2">
            {!confirmed && (
              <>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={start}
                  disabled={total === 0}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="bulk-improve-fm-start-btn"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start ({total})
                </Button>
              </>
            )}
            {confirmed && running && (
              <Button
                variant="outline"
                onClick={requestCancel}
                className="border-red-200 text-red-700 hover:bg-red-50"
                data-testid="bulk-improve-fm-cancel-btn"
              >
                <Pause className="w-4 h-4 mr-2" />
                Cancel after current
              </Button>
            )}
            {confirmed && done && (
              <Button
                onClick={onClose}
                className="bg-green-600 hover:bg-green-700"
                data-testid="bulk-improve-fm-close-btn"
              >
                <X className="w-4 h-4 mr-2" />
                Close
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkImproveFailureModes;
