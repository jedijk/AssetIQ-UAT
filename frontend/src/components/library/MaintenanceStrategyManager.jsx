/**
 * Maintenance Strategy Manager Component
 * Equipment Type Level Strategy Management with Task Generation
 * Based on Functional Specification v2
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Wrench,
  Shield,
  AlertTriangle,
  Clock,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Sparkles,
  Trash2,
  Zap,
  CheckCircle2,
  Calendar,
  Activity,
  Search,
  Edit2,
  Plus,
  X,
  Save,
  Link2,
  ExternalLink,
  FileWarning,
  RefreshCw,
  Target,
  Gauge,
  Eye,
  EyeOff,
  Play,
  BarChart3,
  Layers,
  ListChecks,
  Copy,
  MoreVertical,
  Info,
  AlertCircle,
  History,
  GitBranch,
  User,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Progress } from "../ui/progress";
import { Switch } from "../ui/switch";
import { maintenanceStrategyV2API } from "../../lib/api";
import { DISCIPLINES as FM_DISCIPLINES, DISCIPLINE_COLORS } from "./EquipmentTypeItem";

// ============= Constants =============

const CRITICALITY_LEVELS = [
  { value: "low", label: "Low", color: "bg-green-100 text-green-700 border-green-200", description: "Non-critical equipment" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-700 border-yellow-200", description: "Operationally important" },
  { value: "high", label: "High", color: "bg-red-100 text-red-700 border-red-200", description: "Production or safety critical" },
];

const FREQUENCY_OPTIONS = [
  { value: "not_required", label: "Not Required" },
  { value: "continuous", label: "Continuous" },
  { value: "hourly", label: "Hourly" },
  { value: "shift", label: "Per Shift" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi_weekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-Annual" },
  { value: "annual", label: "Annual" },
  { value: "biennial", label: "Every 2 Years" },
  { value: "on_condition", label: "On Condition" },
];

const DETECTION_METHODS = [
  { value: "vibration", label: "Vibration Analysis" },
  { value: "temperature", label: "Temperature Monitoring" },
  { value: "pressure", label: "Pressure Monitoring" },
  { value: "flow", label: "Flow Monitoring" },
  { value: "level", label: "Level Monitoring" },
  { value: "acoustic", label: "Acoustic Analysis" },
  { value: "oil_analysis", label: "Oil Analysis" },
  { value: "thermography", label: "Thermography" },
  { value: "ultrasonic", label: "Ultrasonic Testing" },
  { value: "visual", label: "Visual Inspection" },
  { value: "electrical", label: "Electrical Testing" },
  { value: "process", label: "Process Parameters" },
  { value: "operator_rounds", label: "Operator Rounds" },
];

const DISCIPLINES = [
  { value: "", label: "Select Discipline" },
  ...FM_DISCIPLINES.map((d) => ({ value: d, label: d })),
];

// Normalize discipline value to canonical case (matches Failure Modes module)
const normalizeDiscipline = (value) => {
  if (!value) return "";
  const match = FM_DISCIPLINES.find((d) => d.toLowerCase() === String(value).toLowerCase());
  return match || value;
};

// ============= Helper Functions =============

const getFrequencyLabel = (value) => {
  return FREQUENCY_OPTIONS.find((f) => f.value === value)?.label || value;
};

const getCriticalityConfig = (level) => {
  return CRITICALITY_LEVELS.find((c) => c.value === level) || CRITICALITY_LEVELS[1];
};

// Task type config for display (used in task templates)
const TASK_TYPES = [
  { value: "preventive", label: "PM (Preventive)", color: "bg-blue-100 text-blue-700", icon: Calendar },
  { value: "predictive", label: "PdM (Predictive)", color: "bg-purple-100 text-purple-700", icon: BarChart3 },
  { value: "reactive", label: "CM (Corrective)", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  { value: "condition_based", label: "CBM (Condition-Based)", color: "bg-cyan-100 text-cyan-700", icon: Activity },
  { value: "inspection", label: "Inspection", color: "bg-teal-100 text-teal-700", icon: Eye },
  { value: "calibration", label: "Calibration", color: "bg-orange-100 text-orange-700", icon: Gauge },
  { value: "lubrication", label: "Lubrication", color: "bg-yellow-100 text-yellow-700", icon: Settings },
  { value: "reliability_centered", label: "RCM", color: "bg-green-100 text-green-700", icon: Target },
  { value: "risk_based", label: "RBM (Risk-Based)", color: "bg-amber-100 text-amber-700", icon: Shield },
  { value: "other", label: "Other", color: "bg-slate-100 text-slate-700", icon: ListChecks },
];

const getTaskTypeConfig = (type) => {
  return TASK_TYPES.find((t) => t.value === type) || TASK_TYPES[0];
};

/**
 * Get RPN (Risk Priority Number) configuration
 * RPN = Severity × Occurrence × Detectability (range: 1-1000)
 */
const getRPNConfig = (rpn) => {
  if (rpn >= 250) {
    return { level: "critical", color: "bg-red-500 text-white", textColor: "text-red-600" };
  } else if (rpn >= 180) {
    return { level: "high", color: "bg-orange-500 text-white", textColor: "text-orange-600" };
  } else if (rpn >= 100) {
    return { level: "medium", color: "bg-yellow-500 text-white", textColor: "text-yellow-600" };
  } else {
    return { level: "low", color: "bg-green-500 text-white", textColor: "text-green-600" };
  }
};

// ============= Sub-Components =============

/**
 * Strategy Overview Card
 */
const StrategyOverviewCard = ({ strategy, onToggleStrategy, isUpdating }) => {
  const hasStrategy = strategy?.exists && strategy?.strategy;
  const data = strategy?.strategy;

  if (!hasStrategy) {
    return (
      <Card className="border-dashed border-2 border-slate-300">
        <CardContent className="p-8 text-center">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No Strategy Defined</h3>
          <p className="text-sm text-slate-500 mb-4">
            Create a maintenance strategy template for this equipment type to automatically generate tasks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isActive = data.status === "active";

  return (
    <Card className={!isActive ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
            <CardTitle className="text-lg">Strategy Overview</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              v{data.version || "1.0"}
            </Badge>
            {/* Strategy Enable/Disable Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100">
                    <span className={`text-xs font-medium ${isActive ? "text-green-700" : "text-slate-500"}`}>
                      {isActive ? "Active" : "Disabled"}
                    </span>
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) => onToggleStrategy(checked ? "active" : "disabled")}
                      disabled={isUpdating}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {isActive 
                    ? "Disable this strategy to stop generating tasks for this equipment type" 
                    : "Enable this strategy to resume generating tasks"
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {data.description && (
          <CardDescription className="mt-2">{data.description}</CardDescription>
        )}
        {!isActive && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-700 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Strategy is disabled. No maintenance tasks will be generated for this equipment type.
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-900">{data.total_failure_modes || 0}</div>
            <div className="text-xs text-slate-500">Failure Modes</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-900">{data.total_tasks || 0}</div>
            <div className="text-xs text-slate-500">Task Templates</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className={`text-2xl font-bold ${(data.coverage_score || 0) >= 80 ? 'text-green-600' : (data.coverage_score || 0) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {data.coverage_score || 0}%
            </div>
            <div className="text-xs text-slate-500">
              Coverage ({data.active_failure_modes ?? data.total_failure_modes ?? 0}/{data.total_failure_modes || 0} active)
            </div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <Badge className={isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>
              {data.status || "draft"}
            </Badge>
            <div className="text-xs text-slate-500 mt-1">Status</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Failure Mode Strategy Row
 */
const FailureModeStrategyRow = ({ 
  fmStrategy, 
  isExpanded, 
  onToggle, 
  onUpdate,
  onUpdateTask,
  onEditTask,
  taskTemplates,
  onViewInFMEA 
}) => {
  const linkedTasks = taskTemplates?.filter((t) => 
    fmStrategy.task_ids?.includes(t.id)
  ) || [];
  
  // RPN data
  const rpn = fmStrategy.rpn || (fmStrategy.severity || 5) * (fmStrategy.occurrence || 5) * (fmStrategy.detectability || 5);
  const rpnConfig = getRPNConfig(rpn);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className={`w-1.5 h-8 rounded-full ${fmStrategy.enabled ? "bg-green-500" : "bg-slate-300"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium text-sm truncate ${!fmStrategy.enabled ? "text-slate-400" : ""}`}>
                {fmStrategy.failure_mode_name}
              </span>
              {!fmStrategy.enabled && (
                <Badge variant="outline" className="text-xs bg-slate-100">Disabled</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {/* RPN Badge */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={`text-[10px] ${rpnConfig.color}`}>
                      RPN: {rpn}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p className="font-medium">Risk Priority Number</p>
                      <p>Severity: {fmStrategy.severity || 5}</p>
                      <p>Occurrence: {fmStrategy.occurrence || 5}</p>
                      <p>Detectability: {fmStrategy.detectability || 5}</p>
                      <p className="pt-1 border-t">Risk Level: <span className="capitalize">{rpnConfig.level}</span></p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-[10px] text-slate-400">
                {linkedTasks.length} task{linkedTasks.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Failure Mode Toggle Switch */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={fmStrategy.enabled}
                    onCheckedChange={(checked) => onUpdate({ enabled: checked })}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {fmStrategy.enabled ? "Disable failure mode" : "Enable failure mode"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewInFMEA(fmStrategy.failure_mode_name);
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View in FMEA Library</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-4 border-t bg-white space-y-4">
              {/* Failure Mode Active Toggle */}
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <Label className="text-xs text-slate-600">Failure Mode Active</Label>
                <Switch
                  checked={fmStrategy.enabled}
                  onCheckedChange={(checked) => onUpdate({ enabled: checked })}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>

              {/* RPN Score Display */}
              <div className="p-3 rounded-lg border bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">Risk Priority Number (RPN)</Label>
                  <Badge className={`${rpnConfig.color}`}>
                    {rpnConfig.level.toUpperCase()} RISK
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-slate-700">{fmStrategy.severity || 5}</div>
                    <div className="text-[10px] text-slate-500">Severity</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-slate-700">{fmStrategy.occurrence || 5}</div>
                    <div className="text-[10px] text-slate-500">Occurrence</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-lg font-bold text-slate-700">{fmStrategy.detectability || 5}</div>
                    <div className="text-[10px] text-slate-500">Detectability</div>
                  </div>
                  <div className={`text-center p-2 rounded border-2 ${rpnConfig.color.includes('red') ? 'border-red-300 bg-red-50' : rpnConfig.color.includes('orange') ? 'border-orange-300 bg-orange-50' : rpnConfig.color.includes('yellow') ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
                    <div className={`text-lg font-bold ${rpnConfig.textColor}`}>{rpn}</div>
                    <div className="text-[10px] text-slate-500">RPN Score</div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  RPN = Severity × Occurrence × Detectability (Range: 1-1000)
                </p>
              </div>

              {/* Potential Effects (from Failure Mode Library) */}
              <div>
                <Label className="text-xs flex items-center gap-1.5">
                  Potential Effects
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Effects of this failure mode on safety, production, environment, 
                        and asset condition (from FMEA Library).
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border">
                  {fmStrategy.potential_effects && fmStrategy.potential_effects.length > 0 ? (
                    <ul className="space-y-1.5">
                      {fmStrategy.potential_effects.map((effect, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span>{effect}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400 italic">
                      No potential effects defined for this failure mode
                    </p>
                  )}
                </div>
              </div>

              {/* Linked Tasks with Toggle Switches */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">Linked Tasks ({linkedTasks.length})</Label>
                  {linkedTasks.length > 0 && (
                    <span className="text-[10px] text-slate-400">Toggle to enable/disable actions</span>
                  )}
                </div>
                <div className="space-y-2">
                  {linkedTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded">
                      No tasks linked to this failure mode
                    </p>
                  ) : (
                    linkedTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          task.is_mandatory !== false ? "bg-white" : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        {/* Task Toggle Switch */}
                        <Switch
                          checked={task.is_mandatory !== false}
                          onCheckedChange={(checked) => {
                            if (onUpdateTask) {
                              onUpdateTask(task.id, { is_mandatory: checked });
                            }
                          }}
                          className="data-[state=checked]:bg-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <ListChecks className={`w-3.5 h-3.5 ${task.is_mandatory !== false ? "text-blue-500" : "text-slate-300"}`} />
                            <span className={`text-sm truncate ${task.is_mandatory !== false ? "text-slate-900" : "text-slate-400"}`}>
                              {task.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {getTaskTypeConfig(task.task_type).label}
                            </Badge>
                            {task.discipline && (() => {
                              const d = normalizeDiscipline(task.discipline);
                              const c = DISCIPLINE_COLORS[d] || DISCIPLINE_COLORS["Mechanical"];
                              return (
                                <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} ${c.border}`}>
                                  {d}
                                </Badge>
                              );
                            })()}
                          </div>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onEditTask) onEditTask(task);
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit task</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Info className="w-3.5 h-3.5 text-slate-300" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{task.description || "No description available"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Criticality Frequency Matrix Editor
 */
const CriticalityMatrixEditor = ({ task, onUpdate }) => {
  const freqMatrix = task.frequency_matrix || {};

  return (
    <div className="grid grid-cols-3 gap-2">
      {CRITICALITY_LEVELS.map((crit) => (
        <div key={crit.value}>
          <Label className="text-[10px] text-slate-500">{crit.label} Criticality</Label>
          <Select
            value={freqMatrix[crit.value] || "monthly"}
            onValueChange={(v) => {
              onUpdate({
                frequency_matrix: {
                  ...freqMatrix,
                  [crit.value]: v,
                },
              });
            }}
          >
            <SelectTrigger className="mt-1 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
};

/**
 * Task Template Card
 */
const TaskTemplateCard = ({ task, onEdit, onDelete, failureModes }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const strategyConfig = getTaskTypeConfig(task.task_type);
  const StrategyIcon = strategyConfig.icon;
  
  const linkedFMs = failureModes?.filter((fm) => 
    task.failure_mode_ids?.includes(fm.failure_mode_id)
  ) || [];

  return (
    <Card className="overflow-hidden">
      <div
        className="p-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <StrategyIcon className={`w-4 h-4 ${strategyConfig.color.replace('bg-', 'text-').replace('-100', '-600')}`} />
              <span className="font-medium text-sm truncate">{task.name}</span>
            </div>
            {task.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge className={`text-[10px] ${strategyConfig.color}`}>
                {strategyConfig.label}
              </Badge>
              {task.discipline && (() => {
                const d = normalizeDiscipline(task.discipline);
                const c = DISCIPLINE_COLORS[d] || DISCIPLINE_COLORS["Mechanical"];
                return (
                  <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} ${c.border}`}>
                    {d}
                  </Badge>
                );
              })()}
              <span className="text-[10px] text-slate-400">
                {linkedFMs.length} FM{linkedFMs.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(task)}>
                  <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(task.id)}>
                  <Copy className="w-3.5 h-3.5 mr-2" /> Copy ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={() => onDelete(task.id)}>
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="px-3 pb-3 pt-2 border-t bg-slate-50 space-y-3">
              {/* Frequency Matrix - Hidden for CM (Corrective/Reactive) tasks */}
              {task.task_type !== "reactive" ? (
                <div>
                  <Label className="text-xs font-medium">Criticality-Based Frequency</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {CRITICALITY_LEVELS.map((crit) => {
                      const freq = task.frequency_matrix?.[crit.value] || "monthly";
                      return (
                        <div key={crit.value} className={`p-2 rounded border ${crit.color}`}>
                          <div className="text-[10px] font-medium">{crit.label}</div>
                          <div className="text-xs mt-0.5">{getFrequencyLabel(freq)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded border border-amber-200 bg-amber-50">
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Corrective task - no scheduled frequency (triggered on failure)
                  </p>
                </div>
              )}

              {/* Detection Methods */}
              {task.detection_methods?.length > 0 && (
                <div>
                  <Label className="text-xs font-medium">Detection Methods</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {task.detection_methods.map((m) => (
                      <Badge key={m} variant="outline" className="text-[10px]">
                        {DETECTION_METHODS.find((d) => d.value === m)?.label || m}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Failure Modes */}
              {linkedFMs.length > 0 && (
                <div>
                  <Label className="text-xs font-medium">Addresses Failure Modes</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {linkedFMs.map((fm) => (
                      <Badge key={fm.failure_mode_id} className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                        <Link2 className="w-2.5 h-2.5 mr-1" />
                        {fm.failure_mode_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Duration & Skills */}
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {task.duration_hours || 1}h duration
                </span>
                {task.skills_required?.length > 0 && (
                  <span>{task.skills_required.length} skill(s) required</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

/**
 * Add/Edit Task Dialog
 */
const TaskDialog = ({ open, onClose, task, failureModes, onSave, isLoading }) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    task_type: "preventive",
    duration_hours: 1,
    discipline: "",
    failure_mode_impact: "",
    failure_mode_ids: [],
    frequency_matrix: {
      low: "quarterly",
      medium: "monthly",
      high: "weekly",
    },
    procedure_steps: [],
    skills_required: [],
  });

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name || "",
        description: task.description || "",
        task_type: task.task_type || "preventive",
        duration_hours: task.duration_hours || 1,
        discipline: normalizeDiscipline(task.discipline) || "",
        failure_mode_impact: task.failure_mode_impact || "",
        failure_mode_ids: task.failure_mode_ids || [],
        frequency_matrix: task.frequency_matrix || {
          low: "quarterly",
          medium: "monthly",
          high: "weekly",
        },
        procedure_steps: task.procedure_steps || [],
        skills_required: task.skills_required || [],
      });
    } else {
      setFormData({
        name: "",
        description: "",
        task_type: "preventive",
        duration_hours: 1,
        discipline: "",
        failure_mode_impact: "",
        failure_mode_ids: [],
        frequency_matrix: {
          low: "quarterly",
          medium: "monthly",
          high: "weekly",
        },
        procedure_steps: [],
        skills_required: [],
      });
    }
  }, [task, open]);

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Task name is required");
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task Template" : "Add Task Template"}</DialogTitle>
          <DialogDescription>
            Define a maintenance task template with criticality-based frequencies
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Task Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Vibration Analysis Check"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this task involves..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          {/* Task Type & Duration */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Task Type</Label>
              <Select
                value={formData.task_type}
                onValueChange={(v) => setFormData({ ...formData, task_type: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration (hours)</Label>
              <Input
                type="number"
                min={0.25}
                step={0.25}
                value={formData.duration_hours}
                onChange={(e) => setFormData({ ...formData, duration_hours: parseFloat(e.target.value) || 1 })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Discipline</Label>
              <Select
                value={formData.discipline}
                onValueChange={(v) => setFormData({ ...formData, discipline: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select Discipline" />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.filter(d => d.value).map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Criticality Frequency Matrix - Hidden for CM (Corrective/Reactive) tasks */}
          {formData.task_type !== "reactive" ? (
            <div>
              <Label className="flex items-center gap-2">
                Criticality-Based Frequency
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Set different frequencies based on equipment criticality. High-criticality
                      equipment will be inspected more frequently.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {CRITICALITY_LEVELS.map((crit) => (
                  <div key={crit.value} className={`p-3 rounded-lg border ${crit.color}`}>
                    <Label className="text-xs font-medium">{crit.label}</Label>
                    <p className="text-[10px] text-slate-500 mb-2">{crit.description}</p>
                    <Select
                      value={formData.frequency_matrix[crit.value]}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          frequency_matrix: { ...formData.frequency_matrix, [crit.value]: v },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <Label className="text-sm font-medium text-amber-800">Corrective Maintenance Task</Label>
                  <p className="text-xs text-amber-700 mt-1">
                    CM (Corrective) tasks are reactive and do not have a scheduled frequency. 
                    They are triggered when equipment fails or issues are detected.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Failure Mode Impact Description */}
          <div>
            <Label className="flex items-center gap-2">
              Failure Mode Impact Description
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Describe the impact when this failure mode occurs - including effects on safety, 
                    production, environment, and asset condition.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Textarea
              value={formData.failure_mode_impact || ""}
              onChange={(e) => setFormData({ ...formData, failure_mode_impact: e.target.value })}
              placeholder="Describe the impact of the failure mode (e.g., production loss, safety hazards, environmental impact, equipment damage...)"
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Linked Failure Modes */}
          <div>
            <Label>Addresses Failure Modes</Label>
            <div className="max-h-32 overflow-y-auto mt-2 space-y-1.5 border rounded-lg p-2">
              {failureModes?.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">No failure modes defined</p>
              ) : (
                failureModes?.map((fm) => (
                  <div
                    key={fm.failure_mode_id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      formData.failure_mode_ids.includes(fm.failure_mode_id)
                        ? "bg-amber-50 border border-amber-200"
                        : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      const updated = formData.failure_mode_ids.includes(fm.failure_mode_id)
                        ? formData.failure_mode_ids.filter((id) => id !== fm.failure_mode_id)
                        : [...formData.failure_mode_ids, fm.failure_mode_id];
                      setFormData({ ...formData, failure_mode_ids: updated });
                    }}
                  >
                    <Checkbox
                      checked={formData.failure_mode_ids.includes(fm.failure_mode_id)}
                      className="pointer-events-none"
                    />
                    <span className="text-sm">{fm.failure_mode_name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Skills */}
          <div>
            <Label>Skills Required (comma-separated)</Label>
            <Input
              value={formData.skills_required.join(", ")}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  skills_required: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="e.g., Vibration analysis, Mechanical"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {task ? "Update" : "Create"} Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============= Main Component =============

const MaintenanceStrategyManager = ({ equipmentType, onViewInFMEA }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFMs, setExpandedFMs] = useState(new Set());
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const equipmentTypeId = equipmentType?.id;
  const equipmentTypeName = equipmentType?.name;

  // ============= Queries =============

  const { data: strategyData, isLoading: strategyLoading, refetch: refetchStrategy } = useQuery({
    queryKey: ["maintenance-strategy-v2", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getStrategy(equipmentTypeId),
    enabled: !!equipmentTypeId,
  });

  const strategy = strategyData?.strategy;
  const hasStrategy = strategyData?.exists;

  // Version history query
  const { data: versionHistoryData } = useQuery({
    queryKey: ["maintenance-strategy-v2-history", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getVersionHistory(equipmentTypeId),
    enabled: !!equipmentTypeId && hasStrategy,
  });

  // ============= Mutations =============

  const createStrategyMutation = useMutation({
    mutationFn: (data) => maintenanceStrategyV2API.createStrategy(data),
    onSuccess: () => {
      toast.success("Strategy created successfully");
      queryClient.invalidateQueries(["maintenance-strategy-v2", equipmentTypeId]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to create strategy");
    },
  });

  const updateStrategyMutation = useMutation({
    mutationFn: (data) => maintenanceStrategyV2API.updateStrategy(equipmentTypeId, data),
    onSuccess: () => {
      toast.success("Strategy updated");
      queryClient.invalidateQueries(["maintenance-strategy-v2", equipmentTypeId]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to update strategy");
    },
  });

  const updateFMStrategyMutation = useMutation({
    mutationFn: ({ failureModeId, data }) =>
      maintenanceStrategyV2API.updateFailureModeStrategy(equipmentTypeId, failureModeId, data),
    onSuccess: () => {
      toast.success("Failure mode strategy updated");
      queryClient.invalidateQueries(["maintenance-strategy-v2", equipmentTypeId]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to update");
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: (data) => maintenanceStrategyV2API.addTaskTemplate(equipmentTypeId, data),
    onSuccess: () => {
      toast.success("Task template added");
      setTaskDialogOpen(false);
      setEditingTask(null);
      queryClient.invalidateQueries(["maintenance-strategy-v2", equipmentTypeId]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to add task");
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) =>
      maintenanceStrategyV2API.updateTaskTemplate(equipmentTypeId, taskId, data),
    onSuccess: () => {
      toast.success("Task template updated");
      setTaskDialogOpen(false);
      setEditingTask(null);
      queryClient.invalidateQueries(["maintenance-strategy-v2", equipmentTypeId]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to update task");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId) => maintenanceStrategyV2API.deleteTaskTemplate(equipmentTypeId, taskId),
    onSuccess: () => {
      toast.success("Task template deleted");
      queryClient.invalidateQueries(["maintenance-strategy-v2", equipmentTypeId]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to delete task");
    },
  });

  // ============= Handlers =============

  const handleCreateStrategy = () => {
    createStrategyMutation.mutate({
      equipment_type_id: equipmentTypeId,
      equipment_type_name: equipmentTypeName,
      auto_generate: true,
    });
  };

  const handleToggleFM = (fmId) => {
    setExpandedFMs((prev) => {
      const next = new Set(prev);
      if (next.has(fmId)) {
        next.delete(fmId);
      } else {
        next.add(fmId);
      }
      return next;
    });
  };

  const handleUpdateFMStrategy = (failureModeId, updates) => {
    updateFMStrategyMutation.mutate({ failureModeId, data: updates });
  };

  const handleToggleStrategy = (newStatus) => {
    updateStrategyMutation.mutate({ status: newStatus });
  };

  const handleSaveTask = (formData) => {
    if (editingTask) {
      updateTaskMutation.mutate({ taskId: editingTask.id, data: formData });
    } else {
      addTaskMutation.mutate(formData);
    }
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const handleDeleteTask = (taskId) => {
    if (window.confirm("Are you sure you want to delete this task template?")) {
      deleteTaskMutation.mutate(taskId);
    }
  };

  const handleViewInFMEA = (failureModeName) => {
    if (onViewInFMEA) {
      onViewInFMEA(failureModeName);
    }
  };

  // ============= Filtered Data =============

  const filteredFMStrategies = useMemo(() => {
    const fmStrategies = strategy?.failure_mode_strategies || [];
    if (!searchQuery) return fmStrategies;
    const q = searchQuery.toLowerCase();
    return fmStrategies.filter(
      (fm) => fm.failure_mode_name?.toLowerCase().includes(q)
    );
  }, [strategy, searchQuery]);

  const filteredTasks = useMemo(() => {
    const tasks = strategy?.task_templates || [];
    if (!searchQuery) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.task_type?.toLowerCase().includes(q)
    );
  }, [strategy, searchQuery]);

  // ============= Render =============

  if (!equipmentType) {
    return (
      <div className="p-8 text-center">
        <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Select an equipment type to view its maintenance strategy</p>
      </div>
    );
  }

  if (strategyLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-500">Loading strategy...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-600" />
            Maintenance Strategy
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{equipmentTypeName}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasStrategy ? (
            <>
              <Button size="sm" variant="outline" onClick={() => refetchStrategy()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Refresh
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleCreateStrategy} disabled={createStrategyMutation.isPending}>
              {createStrategyMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Strategy
            </Button>
          )}
        </div>
      </div>

      {/* Strategy Overview */}
      <StrategyOverviewCard 
        strategy={strategyData} 
        onToggleStrategy={handleToggleStrategy}
        isUpdating={updateStrategyMutation.isPending}
      />

      {/* Tabs (only show if strategy exists) */}
      {hasStrategy && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs">
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              Failure Modes
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">
              <ListChecks className="w-3.5 h-3.5 mr-1.5" />
              Task Templates
            </TabsTrigger>
            <TabsTrigger value="matrix" className="text-xs">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              Frequency Matrix
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <History className="w-3.5 h-3.5 mr-1.5" />
              Version History
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Failure Modes Tab */}
          <TabsContent value="overview" className="mt-4">
            <div className="space-y-2">
              {filteredFMStrategies.length === 0 ? (
                <Card className="p-8 text-center">
                  <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {searchQuery ? "No failure modes match your search" : "No failure modes defined"}
                  </p>
                </Card>
              ) : (
                filteredFMStrategies.map((fm) => (
                  <FailureModeStrategyRow
                    key={fm.failure_mode_id}
                    fmStrategy={fm}
                    isExpanded={expandedFMs.has(fm.failure_mode_id)}
                    onToggle={() => handleToggleFM(fm.failure_mode_id)}
                    onUpdate={(updates) => handleUpdateFMStrategy(fm.failure_mode_id, updates)}
                    onUpdateTask={(taskId, updates) => updateTaskMutation.mutate({ taskId, data: updates })}
                    onEditTask={handleEditTask}
                    taskTemplates={strategy?.task_templates}
                    onViewInFMEA={handleViewInFMEA}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Task Templates Tab */}
          <TabsContent value="tasks" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                onClick={() => {
                  setEditingTask(null);
                  setTaskDialogOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Task
              </Button>
            </div>
            <div className="space-y-2">
              {filteredTasks.length === 0 ? (
                <Card className="p-8 text-center">
                  <ListChecks className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {searchQuery ? "No tasks match your search" : "No task templates defined"}
                  </p>
                </Card>
              ) : (
                filteredTasks.map((task) => (
                  <TaskTemplateCard
                    key={task.id}
                    task={task}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                    failureModes={strategy?.failure_mode_strategies}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Frequency Matrix Tab */}
          <TabsContent value="matrix" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Criticality-Based Frequency Matrix</CardTitle>
                <CardDescription>
                  How task frequencies change based on equipment criticality level
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium">Task</th>
                        {CRITICALITY_LEVELS.map((crit) => (
                          <th key={crit.value} className={`text-center py-2 px-3 font-medium ${crit.color} rounded-t`}>
                            {crit.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(strategy?.task_templates || []).map((task) => (
                        <tr key={task.id} className={`border-b hover:bg-slate-50 ${task.task_type === "reactive" ? "bg-amber-50/50" : ""}`}>
                          <td className="py-2 px-3 max-w-xs">
                            <div className="truncate">{task.name}</div>
                            {task.task_type === "reactive" && (
                              <span className="text-[10px] text-amber-600">(Corrective)</span>
                            )}
                          </td>
                          {task.task_type === "reactive" ? (
                            <td colSpan={3} className="text-center py-2 px-3">
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                No scheduled frequency - triggered on failure
                              </Badge>
                            </td>
                          ) : (
                            CRITICALITY_LEVELS.map((crit) => (
                              <td key={crit.value} className="text-center py-2 px-3">
                                <Badge variant="outline" className="text-xs">
                                  {getFrequencyLabel(task.frequency_matrix?.[crit.value] || "monthly")}
                                </Badge>
                              </td>
                            ))
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(!strategy?.task_templates || strategy.task_templates.length === 0) && (
                  <div className="py-8 text-center">
                    <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Add task templates to see the frequency matrix</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Version History Tab */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <GitBranch className="w-4 h-4" />
                      Version History
                    </CardTitle>
                    <CardDescription>
                      Track changes to this maintenance strategy template
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Current: v{versionHistoryData?.current_version || strategy?.version || "1.0"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {(!versionHistoryData?.version_history || versionHistoryData.version_history.length === 0) ? (
                  <div className="py-8 text-center">
                    <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No version history yet</p>
                    <p className="text-xs text-slate-400 mt-1">Changes will be tracked when you update the strategy</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {versionHistoryData.version_history.slice().reverse().map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-slate-50"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <GitBranch className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge className="text-xs bg-blue-100 text-blue-700">
                              v{entry.version}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "Unknown date"}
                            </span>
                          </div>
                          {entry.changes && entry.changes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {entry.changes.slice(0, 5).map((change, i) => (
                                <Badge key={i} variant="outline" className="text-[10px]">
                                  {change.replace(/_/g, " ")}
                                </Badge>
                              ))}
                              {entry.changes.length > 5 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{entry.changes.length - 5} more
                                </Badge>
                              )}
                            </div>
                          )}
                          {entry.updated_by && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                              <User className="w-3 h-3" />
                              {entry.updated_by}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Task Dialog */}
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        failureModes={strategy?.failure_mode_strategies}
        onSave={handleSaveTask}
        isLoading={addTaskMutation.isPending || updateTaskMutation.isPending}
      />
    </div>
  );
};

export default MaintenanceStrategyManager;
