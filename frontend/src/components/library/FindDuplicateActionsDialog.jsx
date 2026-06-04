import { useState } from "react";
import { Loader2, ClipboardList, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
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

export default function FindDuplicateActionsDialog({
  open,
  onClose,
  failureModes = [],
  onSelectFailureMode,
}) {
  const [phase, setPhase] = useState("idle");
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);

  const handleClose = () => {
    setPhase("idle");
    setResults([]);
    setStats(null);
    onClose?.();
  };

  const runScan = async () => {
    if ((failureModes || []).length === 0) {
      toast.error("No failure modes in the library.");
      return;
    }
    setPhase("running");
    try {
      const data = await failureModesAPI.findDuplicateActions({
        ratio_threshold: 0.85,
      });
      setResults(data?.results || []);
      setStats(data);
      setPhase("done");
      const count = data?.failure_modes_with_duplicates || 0;
      if (count === 0) {
        toast.success("No duplicate actions found inside failure modes.");
      } else {
        toast.success(
          `Found duplicate actions in ${count} failure mode${count === 1 ? "" : "s"}.`,
        );
      }
    } catch (err) {
      console.error("Duplicate action scan failed", err);
      setPhase("idle");
      toast.error(
        err?.response?.data?.detail || "Failed to scan for duplicate actions",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" data-testid="find-duplicate-actions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-600" />
            Find Duplicate Actions
          </DialogTitle>
          <DialogDescription>
            Scans each failure mode&apos;s recommended actions for duplicate or
            near-duplicate tasks (same text, different wording). Equipment type is
            not considered.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
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
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
            <p className="text-sm text-slate-600">Scanning recommended actions…</p>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col flex-1 min-h-0 gap-2">
            {stats && (
              <p className="text-sm text-slate-700 px-1">
                {stats.failure_modes_with_duplicates} failure mode
                {stats.failure_modes_with_duplicates === 1 ? "" : "s"} with{" "}
                {stats.duplicate_group_count} duplicate group
                {stats.duplicate_group_count === 1 ? "" : "s"}
                {" "}
                (scanned {stats.failure_modes_scanned} modes,{" "}
                {stats.total_actions_scanned} actions)
              </p>
            )}
            <ScrollArea className="flex-1 border rounded-md" data-testid="duplicate-actions-results">
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
                            {row.equipment || "—"} · {row.action_count} actions ·{" "}
                            {row.duplicate_group_count} duplicate group
                            {row.duplicate_group_count === 1 ? "" : "s"}
                          </p>
                        </div>
                        {onSelectFailureMode && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              onSelectFailureMode(row.failure_mode_id);
                              handleClose();
                            }}
                          >
                            Open
                          </Button>
                        )}
                      </div>
                      {(row.duplicate_groups || []).map((group, gi) => (
                        <div
                          key={`${row.failure_mode_id}-${gi}`}
                          className="ml-2 mb-2 last:mb-0 rounded border border-amber-100 bg-amber-50/40 p-2"
                        >
                          <p className="text-xs text-amber-800 mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Similarity {group.avg_similarity_score}%
                          </p>
                          <ul className="space-y-1">
                            {(group.members || []).map((m) => (
                              <li
                                key={`${row.failure_mode_id}-${m.index}`}
                                className="text-xs text-slate-700 flex flex-wrap items-center gap-2"
                              >
                                <span className="text-slate-400">#{m.index + 1}</span>
                                <span>{m.label}</span>
                                {m.action_type && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {m.action_type}
                                  </Badge>
                                )}
                                {m.discipline && (
                                  <span className="text-slate-500">{m.discipline}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
