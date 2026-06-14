/**
 * Compact graph evidence panel for embedding in detail pages.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GitBranch, Loader2, Network } from "lucide-react";
import { rilDashboardAPI } from "../../lib/apis/rilAPI";
import { mergeTracePayload } from "../../lib/reliabilityTraceUtils";
import { ReliabilityTraceView } from "./ReliabilityTraceView";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

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
  anchorNodeType = null,
  anchorNodeId = null,
  title = "Graph Evidence",
  className = "",
}) {
  const enabled = Boolean(equipmentId || (anchorNodeType && anchorNodeId));

  const { data, isLoading, error } = useQuery({
    queryKey: ["reliability-trace-evidence", equipmentId, anchorNodeType, anchorNodeId],
    queryFn: () => fetchTraceEvidence({ equipmentId, anchorNodeType, anchorNodeId }),
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  const resolvedEquipmentId = data?.equipment_id || equipmentId;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-600" />
            {title}
          </CardTitle>
          {resolvedEquipmentId && (
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to={`/equipment/${resolvedEquipmentId}/trace`}>
                <Network className="w-3.5 h-3.5 mr-1" />
                Full trace
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
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
          />
        )}
      </CardContent>
    </Card>
  );
}

export default ReliabilityEvidencePanel;
