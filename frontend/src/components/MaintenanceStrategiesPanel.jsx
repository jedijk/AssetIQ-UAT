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
} from "lucide-react";
import { Button } from "./ui/button";
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

const CRITICALITY_LEVELS = [
  { value: "safety_critical", label: "Safety Critical", color: "bg-red-500", icon: Shield },
  { value: "production_critical", label: "Production Critical", color: "bg-orange-500", icon: AlertTriangle },
  { value: "medium", label: "Medium", color: "bg-yellow-500", icon: Activity },
  { value: "low", label: "Low", color: "bg-green-500", icon: CheckCircle2 },
];

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
const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = false, count = 0, color = "indigo" }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-3 bg-${color}-50 hover:bg-${color}-100 transition-colors`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 text-${color}-600`} />
          <span className="font-medium text-slate-700">{title}</span>
          {count > 0 && (
            <Badge variant="secondary" className="ml-2">{count}</Badge>
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
            <div className="p-3 space-y-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Strategy Card Component
const StrategyCard = ({ strategy, onDelete, onRegenerate, isDeleting }) => {
  const criticalityConfig = CRITICALITY_LEVELS.find(c => c.value === strategy.criticality_level) || CRITICALITY_LEVELS[2];
  const CritIcon = criticalityConfig.icon;
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${criticalityConfig.color}`}>
              <CritIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{strategy.equipment_type_name}</CardTitle>
              <CardDescription className="text-xs capitalize">
                {strategy.criticality_level.replace("_", " ")} • v{strategy.strategy_version}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
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
                    This will permanently delete the maintenance strategy for {strategy.equipment_type_name} ({strategy.criticality_level.replace("_", " ")}).
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
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-blue-50 rounded">
            <div className="text-lg font-bold text-blue-600">{strategy.operator_rounds?.length || 0}</div>
            <div className="text-[10px] text-blue-500">Rounds</div>
          </div>
          <div className="p-2 bg-purple-50 rounded">
            <div className="text-lg font-bold text-purple-600">{strategy.detection_systems?.length || 0}</div>
            <div className="text-[10px] text-purple-500">Sensors</div>
          </div>
          <div className="p-2 bg-green-50 rounded">
            <div className="text-lg font-bold text-green-600">{strategy.scheduled_maintenance?.length || 0}</div>
            <div className="text-[10px] text-green-500">Tasks</div>
          </div>
          <div className="p-2 bg-orange-50 rounded">
            <div className="text-lg font-bold text-orange-600">{strategy.spare_parts?.length || 0}</div>
            <div className="text-[10px] text-orange-500">Parts</div>
          </div>
        </div>
        
        {/* Cost Estimate */}
        {strategy.total_annual_cost_estimate_eur && (
          <div className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
            <span className="text-slate-500 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              Est. Annual Cost
            </span>
            <span className="font-semibold">€{strategy.total_annual_cost_estimate_eur.toLocaleString()}</span>
          </div>
        )}
        
        {/* Expandable Sections */}
        <div className="space-y-2">
          {/* Operator Rounds */}
          {strategy.operator_rounds?.length > 0 && (
            <CollapsibleSection 
              title="Operator Rounds" 
              icon={Users} 
              count={strategy.operator_rounds.length}
              color="blue"
            >
              {strategy.operator_rounds.map((round, idx) => (
                <div key={idx} className="p-2 bg-white border rounded text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{round.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {FREQUENCY_LABELS[round.frequency] || round.frequency}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500">{round.duration_minutes} min • {round.checklist?.length || 0} checks</div>
                  {round.checklist?.slice(0, 3).map((check, cIdx) => (
                    <div key={cIdx} className="text-xs text-slate-600 ml-2 mt-1 flex items-start gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                      {check.description}
                    </div>
                  ))}
                  {round.checklist?.length > 3 && (
                    <div className="text-xs text-slate-400 ml-2 mt-1">+{round.checklist.length - 3} more checks</div>
                  )}
                </div>
              ))}
            </CollapsibleSection>
          )}
          
          {/* Detection Systems */}
          {strategy.detection_systems?.length > 0 && (
            <CollapsibleSection 
              title="Detection Systems" 
              icon={Gauge} 
              count={strategy.detection_systems.length}
              color="purple"
            >
              {strategy.detection_systems.map((system, idx) => (
                <div key={idx} className="p-2 bg-white border rounded text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{system.name}</span>
                    <Badge variant="outline" className="capitalize text-xs">
                      {system.system_type.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-600">{system.description}</div>
                  {system.alarm_thresholds && (
                    <div className="text-xs text-slate-500 mt-1">
                      Thresholds: Warning {system.alarm_thresholds.warning}, Critical {system.alarm_thresholds.critical}
                    </div>
                  )}
                  {system.installation_cost_eur && (
                    <div className="text-xs text-slate-400 mt-1">Install cost: €{system.installation_cost_eur}</div>
                  )}
                </div>
              ))}
            </CollapsibleSection>
          )}
          
          {/* Scheduled Maintenance */}
          {strategy.scheduled_maintenance?.length > 0 && (
            <CollapsibleSection 
              title="Scheduled Maintenance" 
              icon={Calendar} 
              count={strategy.scheduled_maintenance.length}
              color="green"
            >
              {strategy.scheduled_maintenance.map((task, idx) => (
                <div key={idx} className="p-2 bg-white border rounded text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{task.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {FREQUENCY_LABELS[task.interval] || task.interval}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-600">{task.description}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    {task.duration_hours}h
                    {task.estimated_cost_eur && (
                      <>
                        <DollarSign className="w-3 h-3 ml-2" />
                        €{task.estimated_cost_eur}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CollapsibleSection>
          )}
          
          {/* Corrective Actions */}
          {strategy.corrective_actions?.length > 0 && (
            <CollapsibleSection 
              title="Corrective Actions" 
              icon={Zap} 
              count={strategy.corrective_actions.length}
              color="orange"
            >
              {strategy.corrective_actions.map((action, idx) => (
                <div key={idx} className="p-2 bg-white border rounded text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs">{action.trigger_condition}</span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        action.priority === 'critical' ? 'border-red-500 text-red-600' :
                        action.priority === 'high' ? 'border-orange-500 text-orange-600' :
                        'border-slate-300'
                      }`}
                    >
                      {action.priority}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-600">{action.action_description}</div>
                  <div className="text-xs text-slate-500 mt-1">Response: {action.response_time_hours}h</div>
                </div>
              ))}
            </CollapsibleSection>
          )}
          
          {/* Emergency Procedures */}
          {strategy.emergency_procedures?.length > 0 && (
            <CollapsibleSection 
              title="Emergency Procedures" 
              icon={Bell} 
              count={strategy.emergency_procedures.length}
              color="red"
            >
              {strategy.emergency_procedures.map((proc, idx) => (
                <div key={idx} className="p-2 bg-white border border-red-200 rounded text-sm">
                  <div className="font-medium text-red-700 mb-1">{proc.condition}</div>
                  <div className="text-xs text-slate-600">
                    <strong>Immediate Actions:</strong>
                    <ul className="list-disc ml-4 mt-1">
                      {proc.immediate_actions?.slice(0, 3).map((act, aIdx) => (
                        <li key={aIdx}>{act}</li>
                      ))}
                    </ul>
                  </div>
                  {proc.estimated_downtime_hours && (
                    <div className="text-xs text-slate-500 mt-1">Est. downtime: {proc.estimated_downtime_hours}h</div>
                  )}
                </div>
              ))}
            </CollapsibleSection>
          )}
          
          {/* Spare Parts */}
          {strategy.spare_parts?.length > 0 && (
            <CollapsibleSection 
              title="Spare Parts" 
              icon={Package} 
              count={strategy.spare_parts.length}
              color="slate"
            >
              <div className="grid grid-cols-2 gap-2">
                {strategy.spare_parts.map((part, idx) => (
                  <div key={idx} className="p-2 bg-white border rounded text-sm">
                    <div className="font-medium text-xs">{part.part_name}</div>
                    <div className="text-xs text-slate-500">Qty: {part.quantity_recommended}</div>
                    {part.lead_time_days && (
                      <div className="text-xs text-slate-400">Lead: {part.lead_time_days}d</div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>
        
        {/* Auto-generated badge */}
        {strategy.auto_generated && (
          <div className="flex items-center gap-1 text-xs text-indigo-500">
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
  const [selectedEquipmentType, setSelectedEquipmentType] = useState(null);
  const [selectedCriticality, setSelectedCriticality] = useState("safety_critical");
  
  // Fetch equipment types
  const { data: equipmentTypesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
  });
  const equipmentTypes = equipmentTypesData?.equipment_types || [];
  
  // Fetch all strategies
  const { data: strategiesData, isLoading: loadingStrategies } = useQuery({
    queryKey: ["maintenance-strategies"],
    queryFn: () => maintenanceStrategyAPI.getAll(),
  });
  const strategies = strategiesData?.strategies || [];
  
  // Generate strategy mutation
  const generateMutation = useMutation({
    mutationFn: ({ equipmentTypeId, equipmentTypeName, criticalityLevel }) => 
      maintenanceStrategyAPI.generate(equipmentTypeId, equipmentTypeName, criticalityLevel),
    onSuccess: () => {
      queryClient.invalidateQueries(["maintenance-strategies"]);
      toast.success("Maintenance strategy generated successfully!");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to generate strategy");
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
      criticalityLevel: selectedCriticality,
    });
  };
  
  // Group strategies by equipment type
  const strategiesByType = strategies.reduce((acc, strategy) => {
    const key = strategy.equipment_type_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(strategy);
    return acc;
  }, {});
  
  return (
    <div className="h-full flex flex-col">
      {/* Header with Generate Controls */}
      <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          Maintenance Strategies
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
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
          
          <Select value={selectedCriticality} onValueChange={setSelectedCriticality}>
            <SelectTrigger className="w-[180px] bg-white" data-testid="select-criticality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITICALITY_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${level.color}`} />
                    {level.label}
                  </div>
                </SelectItem>
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
                Generate from FMEA
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Auto-generate maintenance strategies based on FMEA failure modes for each equipment type and criticality level.
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
              <p className="text-sm">Select an equipment type and criticality level to generate one.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(strategiesByType).map(([typeName, typeStrategies]) => (
                <div key={typeName}>
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    {typeName}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {typeStrategies.map((strategy) => (
                      <StrategyCard
                        key={strategy.id}
                        strategy={strategy}
                        onDelete={deleteMutation.mutate}
                        isDeleting={deleteMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
