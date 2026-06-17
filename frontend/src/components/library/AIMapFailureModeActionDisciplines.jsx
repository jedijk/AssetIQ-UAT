import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  CheckCircle,
  Tags,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";
import { failureModesAPI } from "../../lib/apis/failureModes";
import { useDisciplines } from "../../hooks/useDisciplines";

export default function AIMapFailureModeActionDisciplines({
  isOpen,
  onClose,
  failureMode,
  onApplied,
}) {
  const { selectOptions, getLabel, getColor } = useDisciplines();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState(null);
  const [rowState, setRowState] = useState({});

  const actionCount = failureMode?.recommended_actions?.length || 0;

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setLoading(false);
      setApplying(false);
      setRowState({});
    }
  }, [isOpen]);

  const changedResults = useMemo(
    () => (preview?.results || []).filter((r) => r.changed),
    [preview],
  );

  const selectedCount = useMemo(
    () =>
      changedResults.filter((r) => {
        const key = `${r.action_index}`;
        return rowState[key]?.selected !== false;
      }).length,
    [changedResults, rowState],
  );

  const runAnalysis = async () => {
    if (!failureMode?.id) return;
    setLoading(true);
    setPreview(null);
    try {
      const data = await failureModesAPI.mapFailureModeActionDisciplines({
        failure_mode_id: failureMode.id,
        apply: false,
      });
      setPreview(data);
      const initial = {};
      (data.results || []).forEach((r) => {
        if (r.changed) {
          initial[`${r.action_index}`] = {
            selected: true,
            override: r.suggested_discipline,
          };
        }
      });
      setRowState(initial);
      if (!data.changes_suggested) {
        toast.info("All actions already match Settings disciplines.");
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to map action disciplines",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!failureMode?.id || !preview?.results?.length) return;
    const selected = changedResults.filter((r) => {
      const key = `${r.action_index}`;
      return rowState[key]?.selected !== false;
    });
    if (selected.length === 0) {
      toast.error("No changes selected.");
      return;
    }

    setApplying(true);
    try {
      const nextActions = (failureMode.recommended_actions || []).map((a) =>
        typeof a === "string" ? { action: a } : { ...a },
      );
      selected.forEach((r) => {
        const key = `${r.action_index}`;
        const discipline = rowState[key]?.override || r.suggested_discipline;
        if (nextActions[r.action_index]) {
          nextActions[r.action_index] = {
            ...nextActions[r.action_index],
            discipline,
          };
        }
      });
      await failureModesAPI.update(failureMode.id, {
        recommended_actions: nextActions,
        change_reason: "AI mapped action disciplines to Settings taxonomy",
      });
      toast.success(`Updated disciplines on ${selected.length} action(s).`);
      onApplied?.(preview);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to apply discipline mapping",
      );
    } finally {
      setApplying(false);
    }
  };

  const actionLabel = (idx) => {
    const act = failureMode?.recommended_actions?.[idx];
    if (!act) return `Action ${idx + 1}`;
    if (typeof act === "string") return act;
    return act.action || act.description || `Action ${idx + 1}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="map-fm-action-disciplines-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-purple-600" />
            Map Action Disciplines (AI)
          </DialogTitle>
          <DialogDescription>
            Classify each recommended action into your{" "}
            <strong>Settings → Disciplines</strong> taxonomy using the action text.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
          {failureMode && (
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-800">{failureMode.failure_mode}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {actionCount} recommended action{actionCount === 1 ? "" : "s"}
              </p>
            </div>
          )}

          {!preview && !loading && (
            <div className="text-center py-6 text-sm text-slate-600">
              AI reads your configured disciplines and assigns the crew that should
              perform each maintenance action.
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-10 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <p className="text-sm text-slate-600">Mapping disciplines…</p>
            </div>
          )}

          {preview && (
            <>
              <p className="text-sm text-slate-700">
                {preview.changes_suggested} of {preview.actions_before} actions
                need a discipline update.
              </p>
              <div className="space-y-2">
                {(preview.results || []).map((r) => {
                  const key = `${r.action_index}`;
                  const row = rowState[key] || {};
                  const disciplineCls = getColor(row.override || r.suggested_discipline);
                  return (
                    <div
                      key={key}
                      className={`rounded-lg border p-3 text-sm ${
                        r.changed ? "border-amber-200 bg-amber-50/40" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {r.changed ? (
                          <Checkbox
                            className="mt-1"
                            checked={row.selected !== false}
                            onCheckedChange={(v) =>
                              setRowState((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], selected: !!v },
                              }))
                            }
                          />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 line-clamp-2">
                            {actionLabel(r.action_index)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[10px]">
                              {getLabel(r.current_discipline) || "—"}
                            </Badge>
                            {r.changed && (
                              <>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <Select
                                  value={row.override || r.suggested_discipline}
                                  onValueChange={(v) =>
                                    setRowState((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        override: v,
                                        selected: true,
                                      },
                                    }))
                                  }
                                >
                                  <SelectTrigger className={`h-7 text-xs w-40 ${disciplineCls}`}>
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
                              </>
                            )}
                          </div>
                          {r.reason && (
                            <p className="text-xs text-slate-500 mt-1">{r.reason}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
              disabled={!actionCount || loading}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="run-map-fm-action-disciplines-btn"
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
              disabled={applying || selectedCount === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="apply-map-fm-action-disciplines-btn"
            >
              {applying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Apply {selectedCount} change{selectedCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
