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
import { maintenanceStrategyV2API } from "../../lib/api";
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
      className={`flex min-w-[3rem] flex-col items-center gap-px rounded-md border px-1 py-0.5 transition-colors ${
        node.active
          ? `border-violet-300 bg-violet-50 shadow-sm ring-1 ${meta.ring}`
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      data-testid={`strategy-flow-node-${node.key}`}
      data-active={node.active ? "true" : "false"}
      title={label}
    >
      <Icon className={`h-2.5 w-2.5 ${meta.color}`} />
      <span className="max-w-[3.5rem] truncate text-[8px] font-medium leading-none text-slate-600 text-center">
        {label}
      </span>
      <span className="text-[11px] font-semibold leading-none tabular-nums text-slate-900">
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
      <HoverCardContent side="top" className="w-52 p-2">
        <p className="mb-1 text-[10px] font-semibold text-slate-700">{label}</p>
        <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[10px] text-slate-600">
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
  strategyItemsOverride,
  strategy,
  failureModeItems = [],
  selectedFailureModeId,
  selectedFailureModeIds = [],
  selectedTask,
  scheduleTaskItems = [],
  enabled = true,
  className = "",
}) {
  const { t } = useLanguage();

  const hasFailureModeSelection =
    selectedFailureModeIds.length > 0 || !!selectedFailureModeId;

  const { data: fetchedStrategyData } = useQuery({
    queryKey: ["maintenance-strategy-v2", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getStrategy(equipmentTypeId),
    enabled: enabled && !!equipmentTypeId && !strategy && hasFailureModeSelection,
    staleTime: 30_000,
  });

  const { data: strategiesListData } = useQuery({
    queryKey: ["maintenance-strategies-v2-list"],
    queryFn: () => maintenanceStrategyV2API.listStrategies(),
    enabled,
    staleTime: 60_000,
  });

  const resolvedStrategy = strategy || fetchedStrategyData?.strategy;

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
        strategyItemsOverride,
        strategy: resolvedStrategy,
        failureModeItems,
        selectedFailureModeId,
        selectedFailureModeIds,
        selectedTask,
        scheduleTaskItems,
        strategiesList: strategiesListData?.strategies || [],
      }),
    [
      stats,
      activeStep,
      equipmentTypeId,
      equipmentTypeName,
      equipmentTypeItems,
      strategyItemsOverride,
      resolvedStrategy,
      failureModeItems,
      selectedFailureModeId,
      selectedFailureModeIds,
      selectedTask,
      scheduleTaskItems,
      strategiesListData?.strategies,
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
      className={`mt-2 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 ${className}`}
      data-testid="strategy-intelligence-flow-bar"
    >
      <div className="flex items-center gap-1.5">
        <div className="flex shrink-0 items-center gap-1">
          {isLoading ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-400" />
          ) : (
            <GitBranch className="h-2.5 w-2.5 text-slate-500" />
          )}
          <span className="whitespace-nowrap text-[9px] font-medium text-slate-600">
            {t("strategyIntelligenceFlow.title")}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-0.5 overflow-x-auto">
          {nodes.map((node, index) => (
            <div key={node.key} className="flex min-w-fit flex-1 items-center">
              <FlowNode
                node={node}
                label={labels[node.key]}
                isLoading={isLoading}
              />
              {index < nodes.length - 1 && (
                <div
                  className={`mx-0.5 h-px min-w-[4px] flex-1 ${
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
