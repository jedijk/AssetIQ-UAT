/**
 * Reliability graph evidence — compact trigger button + modal (no inline space).
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GitBranch, Loader2, Network } from "lucide-react";
import { rilDashboardAPI } from "../../lib/apis/rilAPI";
import { mergeTracePayload } from "../../lib/reliabilityTraceUtils";
import { ReliabilityTraceView } from "./ReliabilityTraceView";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

async function fetchTraceEvidence({ equipmentId, anchorNodeType, anchorNodeId }) {
  let equipmentPayload = null;
  let nodePayload = null;

  if (equipmentId) {
    equipmentPayload = await rilDashboardAPI.getEquipmentReliabilityChain(equipmentId, {
      depth: 5,
      limit: 120,
    });
  }

  if (anchorNodeType && anchorNodeId) {
    nodePayload = await rilDashboardAPI.getNodeReliabilityTrace(anchorNodeType, anchorNodeId);
    if (!equipmentPayload && nodePayload?.equipment_id) {
      equipmentPayload = await rilDashboardAPI.getEquipmentReliabilityChain(nodePayload.equipment_id, {
        depth: 5,
        limit: 120,
      });
    }
  }

  if (!equipmentPayload && !nodePayload) {
    return null;
  }

  return mergeTracePayload(equipmentPayload, nodePayload);
}

export function ReliabilityEvidencePanel({
  equipmentId,
  equipmentName = null,
  anchorNodeType = null,
  anchorNodeId = null,
  anchorLabel = null,
  labelHints = {},
  title = "Reliability Graph Evidence",
  buttonLabel = null,
  className = "",
  buttonVariant = "outline",
  buttonSize = "sm",
}) {
  const [open, setOpen] = useState(false);
  const canLoad = Boolean(equipmentId || (anchorNodeType && anchorNodeId));

  const mergedLabelHints = {
    ...labelHints,
    ...(equipmentId && equipmentName ? { [`equipment:${equipmentId}`]: equipmentName } : {}),
    ...(anchorNodeType && anchorNodeId && anchorLabel
      ? { [`${anchorNodeType}:${anchorNodeId}`]: anchorLabel }
      : {}),
  };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["reliability-trace-evidence", equipmentId, anchorNodeType, anchorNodeId],
    queryFn: () => fetchTraceEvidence({ equipmentId, anchorNodeType, anchorNodeId }),
    enabled: open && canLoad,
    staleTime: 60_000,
  });

  if (!canLoad) return null;

  const resolvedEquipmentId = data?.equipment_id || equipmentId;
  const triggerLabel = buttonLabel || title;

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={className}
        onClick={() => setOpen(true)}
      >
        <GitBranch className="w-4 h-4 mr-2 text-indigo-600" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <GitBranch className="w-5 h-5 text-indigo-600 shrink-0" />
                  {title}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Graph-backed chain from this record to equipment, failure modes, and related work.
                </DialogDescription>
              </div>
              {resolvedEquipmentId && (
                <Button asChild variant="outline" size="sm" className="shrink-0 h-8 text-xs">
                  <Link to={`/equipment/${resolvedEquipmentId}/trace`} onClick={() => setOpen(false)}>
                    <Network className="w-3.5 h-3.5 mr-1" />
                    Full trace
                  </Link>
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-6 py-4">
              {isLoading || (isFetching && !data) ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading graph evidence…
                </div>
              ) : (
                <ReliabilityTraceView
                  traceData={data}
                  isLoading={false}
                  error={error}
                  compact
                  showRiskSummary={Boolean(resolvedEquipmentId)}
                  equipmentId={resolvedEquipmentId}
                  equipmentName={equipmentName}
                  anchorNodeType={anchorNodeType}
                  anchorNodeId={anchorNodeId}
                  labelHints={mergedLabelHints}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ReliabilityEvidencePanel;
