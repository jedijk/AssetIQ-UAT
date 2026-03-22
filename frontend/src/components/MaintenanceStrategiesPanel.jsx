import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maintenanceStrategyAPI, equipmentHierarchyAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench,
  Shield,
  AlertTriangle,
  Clock,
  Users,
  Eye,
  Gauge,
  Settings,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Trash2,
  RefreshCw,
  Package,
  Zap,
  Bell,
  CheckCircle2,
  Calendar,
  DollarSign,
  Activity,
  Search,
  PlayCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

const CRITICALITY_CONFIG = {
  safety_critical: { label: "Safety Critical", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200", icon: Shield },
  production_critical: { label: "Production Critical", color: "bg-orange-500", textColor: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: AlertTriangle },
  medium: { label: "Medium", color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-200", icon: Activity },
  low: { label: "Low", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200", icon: CheckCircle2 },
};

const FREQUENCY_LABELS = {
  continuous: "Continuous",
  hourly: "Hourly",
  shift: "Per Shift",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

// Collapsible Section Component
const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = false, count = 0, color = "slate" }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-2 bg-${color}-50 hover:bg-${color}-100 transition-colors text-left`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 text-${color}-600`} />
          <span className="font-medium text-sm text-slate-700">{title}</span>
          {count > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{count}</Badge>
          )}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-2 text-sm">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Criticality Tab Content
const CriticalityContent = ({ strategy }) => {
  const config = CRITICALITY_CONFIG[strategy.criticality_level] || CRITICALITY_CONFIG.medium;
  
  return (
    <div className="space-y-3">
      {/* Quick Stats */}
      <div className="grid grid-cols-5 gap-2 text-center">
        <div className="p-2 bg-blue-50 rounded">
          <div className="text-base font-bold text-blue-600">{strategy.operator_rounds?.length || 0}</div>
          <div className="text-[10px] text-blue-500">Rounds</div>
        </div>
        <div className="p-2 bg-purple-50 rounded">
          <div className="text-base font-bold text-purple-600">{strategy.detection_systems?.length || 0}</div>
          <div className="text-[10px] text-purple-500">Sensors</div>
        </div>
        <div className="p-2 bg-green-50 rounded">
          <div className="text-base font-bold text-green-600">{strategy.scheduled_maintenance?.length || 0}</div>
          <div className="text-[10px] text-green-500">Tasks</div>
        </div>
        <div className="p-2 bg-orange-50 rounded">
          <div className="text-base font-bold text-orange-600">{strategy.corrective_actions?.length || 0}</div>
          <div className="text-[10px] text-orange-500">Actions</div>
        </div>
        <div className="p-2 bg-red-50 rounded">
          <div className="text-base font-bold text-red-600">{strategy.emergency_procedures?.length || 0}</div>
          <div className="text-[10px] text-red-500">Emergency</div>
        </div>
      </div>
      
      {/* Cost & Availability */}
      <div className="flex gap-2">
        {strategy.estimated_annual_cost_eur && (
          <div className="flex-1 flex items-center gap-2 text-sm p-2 bg-slate-50 rounded">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">€{strategy.estimated_annual_cost_eur.toLocaleString()}/yr</span>
          </div>
        )}
        {strategy.expected_availability_percent && (
          <div className="flex-1 flex items-center gap-2 text-sm p-2 bg-slate-50 rounded">
            <Activity className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">{strategy.expected_availability_percent}% availability</span>
          </div>
        )}
      </div>
      
      {/* Expandable Sections */}
      <div className="space-y-2">
        {strategy.operator_rounds?.length > 0 && (
          <CollapsibleSection title="Operator Rounds" icon={Users} count={strategy.operator_rounds.length} color="blue" defaultOpen>
            {strategy.operator_rounds.map((round, idx) => (
              <div key={idx} className="p-2 bg-white border rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">{round.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {FREQUENCY_LABELS[round.frequency] || round.frequency}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-500">{round.duration_minutes} min • {round.checklist?.length || 0} checks</div>
                {round.checklist?.slice(0, 3).map((check, cIdx) => (
                  <div key={cIdx} className="text-[11px] text-slate-600 ml-2 mt-1 flex items-start gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{check.description}</span>
                  </div>
                ))}
              </div>
            ))}
          </CollapsibleSection>
        )}
        
        {strategy.detection_systems?.length > 0 && (
          <CollapsibleSection title="Detection Systems" icon={Gauge} count={strategy.detection_systems.length} color="purple">
            {strategy.detection_systems.map((system, idx) => (
              <div key={idx} className="p-2 bg-white border rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">{system.name}</span>
                  <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                    {system.system_type?.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-600 line-clamp-2">{system.description}</div>
                {system.alarm_thresholds && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    Warning: {system.alarm_thresholds.warning}, Critical: {system.alarm_thresholds.critical}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleSection>
        )}
        
        {strategy.scheduled_maintenance?.length > 0 && (
          <CollapsibleSection title="Scheduled Maintenance" icon={Calendar} count={strategy.scheduled_maintenance.length} color="green">
            {strategy.scheduled_maintenance.map((task, idx) => (
              <div key={idx} className="p-2 bg-white border rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">{task.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {FREQUENCY_LABELS[task.interval] || task.interval}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-600 line-clamp-2">{task.description}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                  <Clock className="w-3 h-3" /> {task.duration_hours}h
                  {task.estimated_cost_eur && <><DollarSign className="w-3 h-3 ml-1" /> €{task.estimated_cost_eur}</>}
                </div>
              </div>
            ))}
          </CollapsibleSection>
        )}
        
        {strategy.corrective_actions?.length > 0 && (
          <CollapsibleSection title="Corrective Actions" icon={Zap} count={strategy.corrective_actions.length} color="orange">
            {strategy.corrective_actions.map((action, idx) => (
              <div key={idx} className="p-2 bg-white border rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs line-clamp-1">{action.trigger_condition}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                    action.priority === 'critical' ? 'border-red-500 text-red-600' :
                    action.priority === 'high' ? 'border-orange-500 text-orange-600' : ''
                  }`}>
                    {action.priority} • {action.response_time_hours}h
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-600 line-clamp-2">{action.action_description}</div>
              </div>
            ))}
          </CollapsibleSection>
        )}
        
        {strategy.emergency_procedures?.length > 0 && (
          <CollapsibleSection title="Emergency Procedures" icon={Bell} count={strategy.emergency_procedures.length} color="red">
            {strategy.emergency_procedures.map((proc, idx) => (
              <div key={idx} className="p-2 bg-white border border-red-200 rounded">
                <div className="font-medium text-xs text-red-700 mb-1">{proc.condition}</div>
                <div className="text-[11px] text-slate-600">
                  <strong>Actions:</strong> {proc.immediate_actions?.slice(0, 2).join(", ")}
                </div>
                {proc.estimated_downtime_hours && (
                  <div className="text-[10px] text-slate-500 mt-1">Downtime: {proc.estimated_downtime_hours}h</div>
                )}
              </div>
            ))}
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
};

// Strategy Card Component
const StrategyCard = ({ strategy, onDelete, isDeleting }) => {
  const [activeTab, setActiveTab] = useState("safety_critical");
  
  const strategiesByCrit = strategy.strategies_by_criticality || [];
  const activeStrategy = strategiesByCrit.find(s => s.criticality_level === activeTab) || strategiesByCrit[0];
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100">
              <Wrench className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">{strategy.equipment_type_name}</CardTitle>
              <CardDescription className="text-xs">
                v{strategy.strategy_version} • {strategiesByCrit.length} criticality levels
              </CardDescription>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Strategy?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the maintenance strategy for {strategy.equipment_type_name} (all criticality levels).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(strategy.id)} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Criticality Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-8 mb-3">
            {["safety_critical", "production_critical", "medium", "low"].map((level) => {
              const config = CRITICALITY_CONFIG[level];
              const hasData = strategiesByCrit.some(s => s.criticality_level === level);
              return (
                <TabsTrigger 
                  key={level} 
                  value={level} 
                  className="text-[10px] px-1 py-1 data-[state=active]:bg-white"
                  disabled={!hasData}
                >
                  <div className={`w-2 h-2 rounded-full ${config.color} mr-1`} />
                  {level === "safety_critical" ? "Safety" : 
                   level === "production_critical" ? "Prod" : 
                   level.charAt(0).toUpperCase() + level.slice(1)}
                </TabsTrigger>
              );
            })}
          </TabsList>
          
          {strategiesByCrit.map((critStrategy) => (
            <TabsContent key={critStrategy.criticality_level} value={critStrategy.criticality_level} className="mt-0">
              <CriticalityContent strategy={critStrategy} />
            </TabsContent>
          ))}
        </Tabs>
        
        {/* Spare Parts Summary */}
        {strategy.spare_parts?.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <CollapsibleSection title="Spare Parts (All Levels)" icon={Package} count={strategy.spare_parts.length} color="slate">
              <div className="grid grid-cols-2 gap-2">
                {strategy.spare_parts.map((part, idx) => (
                  <div key={idx} className="p-2 bg-white border rounded">
                    <div className="font-medium text-xs">{part.part_name}</div>
                    <div className="text-[10px] text-slate-500">Qty: {part.quantity_recommended}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}
        
        {/* Auto-generated badge */}
        {strategy.auto_generated && (
          <div className="flex items-center gap-1 text-[10px] text-indigo-500 mt-2">
            <Sparkles className="w-3 h-3" />
            Auto-generated from FMEA
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function MaintenanceStrategiesPanel() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEquipmentType, setSelectedEquipmentType] = useState(null);
  
  // Fetch equipment types
  const { data: equipmentTypesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
  });
  const equipmentTypes = equipmentTypesData?.equipment_types || [];
  
  // Fetch all strategies with search
  const { data: strategiesData, isLoading: loadingStrategies } = useQuery({
    queryKey: ["maintenance-strategies", searchQuery],
    queryFn: () => maintenanceStrategyAPI.getAll({ search: searchQuery }),
  });
  const strategies = strategiesData?.strategies || [];
  
  // Generate single strategy mutation
  const generateMutation = useMutation({
    mutationFn: ({ equipmentTypeId, equipmentTypeName }) => 
      maintenanceStrategyAPI.generate(equipmentTypeId, equipmentTypeName),
    onSuccess: () => {
      queryClient.invalidateQueries(["maintenance-strategies"]);
      toast.success("Maintenance strategy generated successfully!");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to generate strategy");
    },
  });
  
  // Generate all strategies mutation
  const generateAllMutation = useMutation({
    mutationFn: () => maintenanceStrategyAPI.generateAll(),
    onSuccess: (data) => {
      queryClient.invalidateQueries(["maintenance-strategies"]);
      toast.success(`Generated ${data.generated} strategies!`);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to generate strategies");
    },
  });
  
  // Delete strategy mutation
  const deleteMutation = useMutation({
    mutationFn: maintenanceStrategyAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(["maintenance-strategies"]);
      toast.success("Strategy deleted");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to delete strategy");
    },
  });
  
  const handleGenerate = () => {
    if (!selectedEquipmentType) {
      toast.error("Please select an equipment type");
      return;
    }
    const eqType = equipmentTypes.find(et => et.id === selectedEquipmentType);
    if (!eqType) return;
    
    generateMutation.mutate({
      equipmentTypeId: selectedEquipmentType,
      equipmentTypeName: eqType.name,
    });
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Header with Controls */}
      <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          Maintenance Strategies
        </h2>
        
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search strategies, spare parts, failure modes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white"
            data-testid="search-strategies"
          />
        </div>
        
        {/* Generate Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedEquipmentType || ""} onValueChange={setSelectedEquipmentType}>
            <SelectTrigger className="w-[200px] bg-white" data-testid="select-equipment-type">
              <SelectValue placeholder="Select Equipment Type" />
            </SelectTrigger>
            <SelectContent>
              {equipmentTypes.map((et) => (
                <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={handleGenerate} 
            disabled={generateMutation.isPending || !selectedEquipmentType}
            className="bg-indigo-600 hover:bg-indigo-700"
            data-testid="generate-strategy-btn"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </>
            )}
          </Button>
          
          <Button 
            onClick={() => generateAllMutation.mutate()} 
            disabled={generateAllMutation.isPending}
            variant="outline"
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            data-testid="generate-all-btn"
          >
            {generateAllMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating All...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4 mr-2" />
                Generate All
              </>
            )}
          </Button>
        </div>
        
        <p className="text-xs text-slate-500 mt-2">
          Each strategy includes all 4 criticality levels (Safety Critical, Production Critical, Medium, Low) with tailored maintenance tasks.
        </p>
      </div>
      
      {/* Strategies List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loadingStrategies ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : strategies.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Settings className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No maintenance strategies yet</p>
              <p className="text-sm">Select an equipment type and click Generate, or use "Generate All" to create strategies for all equipment types.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {strategies.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  onDelete={deleteMutation.mutate}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
