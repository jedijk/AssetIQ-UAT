import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  GitBranch,
  Layers,
  Loader2,
  Wrench,
} from "lucide-react";
import { intelligenceMapAPI } from "../../lib/apis/intelligenceMap";
import { useLanguage } from "../../contexts/LanguageContext";
import { buildStrategyFlowNodes } from "../../lib/strategyIntelligenceFlow";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

const STEP_META = {
  failure_modes: { icon: AlertTriangle, color: "text-blue-600", ring: "ring-blue-400" },
  equipment_types: { icon: Layers, color: "text-green-600", ring: "ring-green-400" },
  strategies: { icon: Wrench, color: "text-violet-600", ring: "ring-violet-400" },
  programs: { icon: ClipboardList, color: "text-indigo-600", ring: "ring-indigo-400" },
  schedules: { icon: Calendar, color: "text-teal-600", ring: "ring-teal-400" },
};

function FlowNode({ node, label, isLoading }) {
  const meta = STEP_META[node.key] || STEP_META.failure_modes;
  const Icon = meta.icon;

  const trigger = (
    <div
      className={`flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 transition-colors ${
        node.active
          ? `border-violet-300 bg-violet-50 shadow-sm ring-2 ${meta.ring}`
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      data-testid={`strategy-flow-node-${node.key}`}
      data-active={node.active ? "true" : "false"}
    >
      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums text-slate-900">
        {isLoading ? "…" : (node.count ?? 0).toLocaleString()}
      </span>
    </div>
  );

  if (!node.items?.length) {
    return trigger;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className="cursor-default rounded-lg text-left">
          {trigger}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-64 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">{label}</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
          {node.items.map((item) => (
            <li key={`${node.key}-${item.id}`} className="truncate">
              {item.name}
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function StrategyIntelligenceFlowBar({
  activeStep,
  equipmentTypeId,
  equipmentTypeName,
  equipmentTypeItems = [],
  strategy,
  failureModeItems = [],
  selectedFailureModeId,
  selectedTask,
  scheduleTaskItems = [],
  enabled = true,
  className = "",
}) {
  const { t } = useLanguage();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["strategy-intelligence-flow", equipmentTypeId || "all"],
    queryFn: () =>
      intelligenceMapAPI.getStats({
        equipmentTypeId: equipmentTypeId || undefined,
        showLinkedOnly: !!equipmentTypeId,
      }),
    enabled,
    staleTime: 30_000,
  });

  const nodes = useMemo(
    () =>
      buildStrategyFlowNodes({
        stats,
        activeStep,
        equipmentTypeId,
        equipmentTypeName,
        equipmentTypeItems,
        strategy,
        failureModeItems,
        selectedFailureModeId,
        selectedTask,
        scheduleTaskItems,
      }),
    [
      stats,
      activeStep,
      equipmentTypeId,
      equipmentTypeName,
      equipmentTypeItems,
      strategy,
      failureModeItems,
      selectedFailureModeId,
      selectedTask,
      scheduleTaskItems,
    ],
  );

  const labels = {
    failure_modes: t("strategyIntelligenceFlow.failureModes"),
    equipment_types: t("strategyIntelligenceFlow.equipmentTypes"),
    strategies: t("strategyIntelligenceFlow.strategies"),
    programs: t("strategyIntelligenceFlow.programs"),
    schedules: t("strategyIntelligenceFlow.schedules"),
  };

  if (!enabled) return null;

  return (
    <div
      className={`mt-4 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 ${className}`}
      data-testid="strategy-intelligence-flow-bar"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-1.5">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
          ) : (
            <GitBranch className="h-3 w-3 text-slate-500" />
          )}
          <span className="text-[11px] font-medium text-slate-700">
            {t("strategyIntelligenceFlow.title")}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-1 overflow-x-auto">
          {nodes.map((node, index) => (
            <div key={node.key} className="flex min-w-fit flex-1 items-center">
              <FlowNode
                node={node}
                label={labels[node.key]}
                isLoading={isLoading}
              />
              {index < nodes.length - 1 && (
                <div
                  className={`mx-1 h-px min-w-[8px] flex-1 ${
                    node.active ? "bg-violet-200" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
