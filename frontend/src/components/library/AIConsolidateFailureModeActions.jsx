import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  ClipboardList,
  ArrowRight,
  CheckCircle,
  GitMerge,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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

const TYPE_COLORS = {
  PM: "bg-blue-100 text-blue-700",
  CM: "bg-amber-100 text-amber-700",
  PDM: "bg-purple-100 text-purple-700",
};

export default function AIConsolidateFailureModeActions({
  isOpen,
  onClose,
  failureMode,
  onApplied,
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState(null);

  const actionCount = failureMode?.recommended_actions?.length || 0;

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setLoading(false);
      setApplying(false);
    }
  }, [isOpen]);

  const canConsolidate = useMemo(
    () => actionCount >= 4,
    [actionCount],
  );

  const runAnalysis = async () => {
    if (!failureMode?.id) return;
    setLoading(true);
    setPreview(null);
    try {
      const data = await failureModesAPI.consolidateFailureModeActions({
        failure_mode_id: failureMode.id,
        target_min: 3,
        target_max: 5,
        apply: false,
      });
      setPreview(data);
      if (data.actions_after >= data.actions_before) {
        toast.info("AI suggests minimal changes for this failure mode.");
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to analyze recommended actions",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!failureMode?.id || !preview?.consolidated_actions?.length) return;
    setApplying(true);
    try {
      const persistActions = preview.consolidated_actions.map((row) => {
        const {
          merged_from_indices: _merged,
          consolidation_rationale: _rationale,
          ...rest
        } = row;
        return rest;
      });
      await failureModesAPI.update(failureMode.id, {
        recommended_actions: persistActions,
        change_reason: "AI consolidated duplicate/overlapping recommended actions",
      });
      toast.success(
        `Consolidated ${preview.actions_before} → ${preview.actions_after} actions`,
      );
      onApplied?.(preview);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to apply consolidated actions",
      );
    } finally {
      setApplying(false);
    }
  };

  const originalByIndex = useMemo(() => {
    const map = {};
    (preview?.original_actions || []).forEach((a) => {
      map[a.index] = a;
    });
    return map;
  }, [preview]);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="consolidate-fm-actions-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" />
            Consolidate Actions with AI
          </DialogTitle>
          <DialogDescription>
            Merge duplicate and overlapping recommended actions into{" "}
            <strong>3–5 distinct maintenance tasks</strong> for this failure mode.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
          {failureMode && (
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-800">{failureMode.failure_mode}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {failureMode.equipment || "—"} · {actionCount} current action
                {actionCount === 1 ? "" : "s"}
              </p>
            </div>
          )}

          {!canConsolidate && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Add at least 4 recommended actions before consolidating.
            </p>
          )}

          {!preview && !loading && canConsolidate && (
            <div className="text-center py-6 text-sm text-slate-600">
              AI will detect duplicates and overlapping tasks, then propose a
              leaner action set while preserving PM / PDM / CM intent.
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-10 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
              <p className="text-sm text-slate-600">Analyzing recommended actions…</p>
            </div>
          )}

          {preview && (
            <>
              {preview.summary && (
                <p className="text-sm text-slate-700 italic border-l-2 border-violet-300 pl-3">
                  {preview.summary}
                </p>
              )}
              <div className="flex items-center justify-center gap-3 text-sm font-medium text-slate-700">
                <span>{preview.actions_before} actions</span>
                <ArrowRight className="w-4 h-4 text-violet-500" />
                <span className="text-violet-700">{preview.actions_after} actions</span>
              </div>

              <div className="space-y-3">
                {(preview.consolidated_actions || []).map((row, ci) => (
                  <div
                    key={`consolidated-${ci}`}
                    className="rounded-lg border border-violet-200 bg-violet-50/40 p-3"
                  >
                    <div className="flex flex-wrap items-start gap-2 mb-2">
                      <Badge className="bg-violet-600 text-white text-[10px]">
                        #{ci + 1}
                      </Badge>
                      <span className="text-sm font-medium text-slate-800 flex-1">
                        {row.description}
                      </span>
                      {row.action_type && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${TYPE_COLORS[row.action_type] || ""}`}
                        >
                          {row.action_type}
                        </Badge>
                      )}
                      {row.discipline && (
                        <span className="text-xs text-slate-500">{row.discipline}</span>
                      )}
                    </div>
                    {row.consolidation_rationale && (
                      <p className="text-xs text-slate-600 mb-2">{row.consolidation_rationale}</p>
                    )}
                    <ul className="space-y-1">
                      {(row.merged_from_indices || []).map((idx) => {
                        const orig = originalByIndex[idx];
                        return (
                          <li
                            key={`src-${ci}-${idx}`}
                            className="text-xs text-slate-500 flex items-center gap-2"
                          >
                            <GitMerge className="w-3 h-3 shrink-0 text-violet-400" />
                            <span className="line-through decoration-slate-300">
                              #{idx + 1} {orig?.label || `Action ${idx + 1}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-3 gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading || applying}>
            Cancel
          </Button>
          {!preview ? (
            <Button
              onClick={runAnalysis}
              disabled={!canConsolidate || loading}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="run-consolidate-fm-actions-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Analyze
            </Button>
          ) : (
            <Button
              onClick={handleApply}
              disabled={applying}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="apply-consolidate-fm-actions-btn"
            >
              {applying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Apply {preview.actions_after} actions
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
