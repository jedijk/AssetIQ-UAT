/**
 * Equipment Reliability Trace — /equipment/:id/trace
 */
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2, Shield } from "lucide-react";
import { rilDashboardAPI } from "../lib/apis/rilAPI";
import { equipmentHierarchyAPI } from "../lib/apis/equipment";
import { ReliabilityTraceView } from "../components/reliability/ReliabilityTraceView";
import { Button } from "../components/ui/button";

export default function EquipmentReliabilityTracePage() {
  const { id: equipmentId } = useParams();
  const navigate = useNavigate();

  const { data: equipment, isLoading: equipmentLoading } = useQuery({
    queryKey: ["equipment-node", equipmentId],
    queryFn: () => equipmentHierarchyAPI.getNode(equipmentId),
    enabled: Boolean(equipmentId),
    staleTime: 5 * 60_000,
  });

  const {
    data: traceData,
    isLoading: traceLoading,
    error,
  } = useQuery({
    queryKey: ["reliability-trace", equipmentId],
    queryFn: () =>
      rilDashboardAPI.getEquipmentReliabilityChain(equipmentId, { depth: 6, limit: 200 }),
    enabled: Boolean(equipmentId),
    staleTime: 60_000,
  });

  const { data: stateResponse } = useQuery({
    queryKey: ["equipment-reliability-state", equipmentId],
    queryFn: () => rilDashboardAPI.getEquipmentReliabilityState(equipmentId),
    enabled: Boolean(equipmentId),
    staleTime: 60_000,
  });

  const liveState = stateResponse?.state;
  const openSignalCount =
    liveState?.open_observation_count ?? liveState?.open_threat_count;

  const equipmentName = equipment?.name || equipment?.tag || equipmentId;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Building2 className="w-4 h-4" />
                Equipment
              </div>
              <h1 className="text-xl font-bold text-slate-900 truncate">
                {equipmentLoading ? "Loading…" : equipmentName}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild variant="outline" size="sm">
                <Link to={`/equipment/${equipmentId}/reliability`}>
                  <Shield className="w-4 h-4 mr-1.5" />
                  Profile
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/equipment-manager">Equipment Manager</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-6">
        {openSignalCount != null && (
          <p className="text-sm text-slate-600 mb-4">
            Open reliability signals: <span className="font-semibold text-slate-900">{openSignalCount}</span>
            {liveState?.status ? (
              <span className="text-slate-500"> · {liveState.status}</span>
            ) : null}
          </p>
        )}
        {traceLoading || equipmentLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Building reliability trace…
          </div>
        ) : (
          <ReliabilityTraceView
            traceData={traceData}
            isLoading={false}
            error={error}
            equipmentId={equipmentId}
            equipmentName={equipmentName}
            showRiskSummary
          />
        )}
      </div>
    </div>
  );
}
