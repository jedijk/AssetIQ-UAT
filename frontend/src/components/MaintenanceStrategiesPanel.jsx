import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
  Gauge,
  Settings,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Trash2,
  Package,
  Zap,
  Bell,
  CheckCircle2,
  Calendar,
  DollarSign,
  Activity,
  Search,
  PlayCircle,
  Edit2,
  Plus,
  X,
  Save,
  Link2,
  ExternalLink,
  FileWarning,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
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
import { Label } from "./ui/label";

const CRITICALITY_CONFIG = {
  safety_critical: { label: "Safety Critical", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200", icon: Shield },
  production_critical: { label: "Production Critical", color: "bg-orange-500", textColor: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: AlertTriangle },
  medium: { label: "Medium", color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-200", icon: Activity },
  low: { label: "Low", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200", icon: CheckCircle2 },
};

const FREQUENCY_OPTIONS = [
  { value: "continuous", label: "Continuous" },
  { value: "hourly", label: "Hourly" },
  { value: "shift", label: "Per Shift" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-Annual" },
  { value: "annual", label: "Annual" },
];

const DETECTION_TYPES = [
  { value: "vibration", label: "Vibration" },
  { value: "temperature", label: "Temperature" },
  { value: "pressure", label: "Pressure" },
  { value: "flow", label: "Flow" },
  { value: "level", label: "Level" },
  { value: "acoustic", label: "Acoustic" },
  { value: "oil_analysis", label: "Oil Analysis" },
  { value: "thermography", label: "Thermography" },
  { value: "ultrasonic", label: "Ultrasonic" },
  { value: "visual", label: "Visual" },
  { value: "electrical", label: "Electrical" },
  { value: "process", label: "Process" },
];

const MAINTENANCE_TYPES = [
  { value: "preventive", label: "Preventive" },
  { value: "predictive", label: "Predictive" },
  { value: "condition_based", label: "Condition-Based" },
  { value: "corrective", label: "Corrective" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

// Clickable Failure Mode Link Component
const FailureModeLink = ({ mode, onClick }) => {
  return (
    <button
      onClick={() => onClick(mode)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition-colors border border-amber-200"
      title={`Click to view "${mode}" in FMEA Library`}
    >
      <Link2 className="w-2.5 h-2.5" />
      {mode}
    </button>
  );
};

// Failure Modes Display Component
const FailureModesDisplay = ({ modes = [], onModeClick, label = "Addresses" }) => {
  if (!modes || modes.length === 0) return null;
  
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <span className="text-[10px] text-slate-400">{label}:</span>
      {modes.map((mode, idx) => (
        <FailureModeLink key={idx} mode={mode} onClick={onModeClick} />
      ))}
    </div>
  );
};

// Generic Edit Dialog Component
const EditItemDialog = ({ open, onClose, title, children, onSave, isSaving }) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {children}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Operator Round Edit Form
const OperatorRoundForm = ({ round, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...round, [field]: value });
  };

  const addCheck = () => {
    const newCheck = {
      id: `check_${Date.now()}`,
      description: "",
      check_type: "visual",
      acceptable_range: null,
      failure_modes_addressed: []
    };
    onChange({ ...round, checklist: [...(round.checklist || []), newCheck] });
  };

  const updateCheck = (idx, field, value) => {
    const newChecklist = [...(round.checklist || [])];
    newChecklist[idx] = { ...newChecklist[idx], [field]: value };
    onChange({ ...round, checklist: newChecklist });
  };

  const removeCheck = (idx) => {
    onChange({ ...round, checklist: round.checklist.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Round Name</Label>
          <Input value={round.name || ""} onChange={(e) => updateField("name", e.target.value)} />
        </div>
        <div>
          <Label>Frequency</Label>
          <Select value={round.frequency || "daily"} onValueChange={(v) => updateField("frequency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Duration (minutes)</Label>
          <Input type="number" value={round.duration_minutes || 15} onChange={(e) => updateField("duration_minutes", parseInt(e.target.value))} />
        </div>
        <div>
          <Label>Skills Required (comma-separated)</Label>
          <Input value={(round.skills_required || []).join(", ")} onChange={(e) => updateField("skills_required", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
        </div>
      </div>
      <div>
        <Label>PPE Required (comma-separated)</Label>
        <Input value={(round.ppe_required || []).join(", ")} onChange={(e) => updateField("ppe_required", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
      </div>
      
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <Label>Checklist Items</Label>
          <Button size="sm" variant="outline" onClick={addCheck}><Plus className="w-3 h-3 mr-1" />Add Check</Button>
        </div>
        <div className="space-y-2">
          {(round.checklist || []).map((check, idx) => (
            <div key={idx} className="flex gap-2 items-start p-2 border rounded bg-slate-50">
              <div className="flex-1 space-y-2">
                <Input placeholder="Description" value={check.description || ""} onChange={(e) => updateCheck(idx, "description", e.target.value)} />
                <div className="flex gap-2">
                  <Select value={check.check_type || "visual"} onValueChange={(v) => updateCheck(idx, "check_type", v)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visual">Visual</SelectItem>
                      <SelectItem value="measurement">Measurement</SelectItem>
                      <SelectItem value="functional">Functional</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" placeholder="Acceptable range" value={check.acceptable_range || ""} onChange={(e) => updateCheck(idx, "acceptable_range", e.target.value)} />
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => removeCheck(idx)}><X className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Detection System Edit Form
const DetectionSystemForm = ({ system, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...system, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>System Name</Label>
          <Input value={system.name || ""} onChange={(e) => updateField("name", e.target.value)} />
        </div>
        <div>
          <Label>System Type</Label>
          <Select value={system.system_type || "visual"} onValueChange={(v) => updateField("system_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DETECTION_TYPES.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={system.description || ""} onChange={(e) => updateField("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Monitoring Interval</Label>
          <Select value={system.monitoring_interval || "daily"} onValueChange={(v) => updateField("monitoring_interval", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Installation Cost (€)</Label>
          <Input type="number" value={system.installation_cost_eur || ""} onChange={(e) => updateField("installation_cost_eur", e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Warning Threshold</Label>
          <Input type="number" step="0.1" value={system.alarm_thresholds?.warning || ""} onChange={(e) => updateField("alarm_thresholds", { ...system.alarm_thresholds, warning: e.target.value ? parseFloat(e.target.value) : null })} />
        </div>
        <div>
          <Label>Critical Threshold</Label>
          <Input type="number" step="0.1" value={system.alarm_thresholds?.critical || ""} onChange={(e) => updateField("alarm_thresholds", { ...system.alarm_thresholds, critical: e.target.value ? parseFloat(e.target.value) : null })} />
        </div>
      </div>
      <div>
        <Label>Failure Modes Detected (comma-separated)</Label>
        <Input value={(system.failure_modes_detected || []).join(", ")} onChange={(e) => updateField("failure_modes_detected", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
      </div>
    </div>
  );
};

// Maintenance Task Edit Form
const MaintenanceTaskForm = ({ task, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...task, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Task Name</Label>
          <Input value={task.name || ""} onChange={(e) => updateField("name", e.target.value)} />
        </div>
        <div>
          <Label>Maintenance Type</Label>
          <Select value={task.maintenance_type || "preventive"} onValueChange={(v) => updateField("maintenance_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_TYPES.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={task.description || ""} onChange={(e) => updateField("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Interval</Label>
          <Select value={task.interval || "monthly"} onValueChange={(v) => updateField("interval", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Duration (hours)</Label>
          <Input type="number" step="0.5" value={task.duration_hours || 2} onChange={(e) => updateField("duration_hours", parseFloat(e.target.value))} />
        </div>
        <div>
          <Label>Est. Cost (€)</Label>
          <Input type="number" value={task.estimated_cost_eur || ""} onChange={(e) => updateField("estimated_cost_eur", e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
      </div>
      <div>
        <Label>Skills Required (comma-separated)</Label>
        <Input value={(task.skills_required || []).join(", ")} onChange={(e) => updateField("skills_required", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
      </div>
      <div>
        <Label>Tools Required (comma-separated)</Label>
        <Input value={(task.tools_required || []).join(", ")} onChange={(e) => updateField("tools_required", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
      </div>
      <div>
        <Label>Spare Parts (comma-separated)</Label>
        <Input value={(task.spare_parts || []).join(", ")} onChange={(e) => updateField("spare_parts", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
      </div>
    </div>
  );
};

// Corrective Action Edit Form
const CorrectiveActionForm = ({ action, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...action, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Trigger Condition</Label>
        <Input value={action.trigger_condition || ""} onChange={(e) => updateField("trigger_condition", e.target.value)} />
      </div>
      <div>
        <Label>Action Description</Label>
        <Textarea value={action.action_description || ""} onChange={(e) => updateField("action_description", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Response Time (hours)</Label>
          <Input type="number" value={action.response_time_hours || 24} onChange={(e) => updateField("response_time_hours", parseFloat(e.target.value))} />
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={action.priority || "medium"} onValueChange={(v) => updateField("priority", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Escalation Path</Label>
        <Input value={action.escalation_path || ""} onChange={(e) => updateField("escalation_path", e.target.value)} />
      </div>
    </div>
  );
};

// Emergency Procedure Edit Form
const EmergencyProcedureForm = ({ procedure, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...procedure, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Condition</Label>
        <Input value={procedure.condition || ""} onChange={(e) => updateField("condition", e.target.value)} />
      </div>
      <div>
        <Label>Immediate Actions (one per line)</Label>
        <Textarea rows={3} value={(procedure.immediate_actions || []).join("\n")} onChange={(e) => updateField("immediate_actions", e.target.value.split("\n").filter(Boolean))} />
      </div>
      <div>
        <Label>Safety Precautions (one per line)</Label>
        <Textarea rows={3} value={(procedure.safety_precautions || []).join("\n")} onChange={(e) => updateField("safety_precautions", e.target.value.split("\n").filter(Boolean))} />
      </div>
      <div>
        <Label>Recovery Steps (one per line)</Label>
        <Textarea rows={3} value={(procedure.recovery_steps || []).join("\n")} onChange={(e) => updateField("recovery_steps", e.target.value.split("\n").filter(Boolean))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Notification List (comma-separated)</Label>
          <Input value={(procedure.notification_list || []).join(", ")} onChange={(e) => updateField("notification_list", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} />
        </div>
        <div>
          <Label>Est. Downtime (hours)</Label>
          <Input type="number" value={procedure.estimated_downtime_hours || ""} onChange={(e) => updateField("estimated_downtime_hours", e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
      </div>
    </div>
  );
};

// Spare Part Edit Form
const SparePartForm = ({ part, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...part, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Part Name</Label>
          <Input value={part.part_name || ""} onChange={(e) => updateField("part_name", e.target.value)} />
        </div>
        <div>
          <Label>Part Number</Label>
          <Input value={part.part_number || ""} onChange={(e) => updateField("part_number", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Quantity</Label>
          <Input type="number" value={part.quantity_recommended || 1} onChange={(e) => updateField("quantity_recommended", parseInt(e.target.value))} />
        </div>
        <div>
          <Label>Lead Time (days)</Label>
          <Input type="number" value={part.lead_time_days || ""} onChange={(e) => updateField("lead_time_days", e.target.value ? parseInt(e.target.value) : null)} />
        </div>
        <div>
          <Label>Est. Cost (€)</Label>
          <Input type="number" value={part.estimated_cost_eur || ""} onChange={(e) => updateField("estimated_cost_eur", e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
      </div>
      <div>
        <Label>Criticality</Label>
        <Select value={part.criticality || "medium"} onValueChange={(v) => updateField("criticality", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

// Collapsible Section Component
const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = false, count = 0, color = "slate", onAdd, addLabel = "Add" }) => {
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
        <div className="flex items-center gap-2">
          {onAdd && (
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
              <Plus className="w-3 h-3 mr-1" />{addLabel}
            </Button>
          )}
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
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

// Editable Item Card
const EditableItem = ({ children, onEdit, onDelete }) => {
  return (
    <div className="group relative p-2 pr-14 bg-white border rounded hover:border-indigo-300 transition-colors">
      {children}
      <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-white/90 rounded">
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onEdit}>
          <Edit2 className="w-3 h-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500 hover:text-red-700" onClick={onDelete}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

// Criticality Tab Content with Editing
const CriticalityContent = ({ strategy, criticalityLevel, onUpdate, onFailureModeClick }) => {
  const [editDialog, setEditDialog] = useState({ open: false, type: null, index: null, data: null });

  const handleSave = () => {
    const { type, index, data } = editDialog;
    const newStrategy = { ...strategy };
    
    if (type === "operator_round") {
      newStrategy.operator_rounds = [...(strategy.operator_rounds || [])];
      if (index === -1) {
        newStrategy.operator_rounds.push({ ...data, id: `round_${Date.now()}` });
      } else {
        newStrategy.operator_rounds[index] = data;
      }
    } else if (type === "detection_system") {
      newStrategy.detection_systems = [...(strategy.detection_systems || [])];
      if (index === -1) {
        newStrategy.detection_systems.push({ ...data, id: `det_${Date.now()}` });
      } else {
        newStrategy.detection_systems[index] = data;
      }
    } else if (type === "maintenance_task") {
      newStrategy.scheduled_maintenance = [...(strategy.scheduled_maintenance || [])];
      if (index === -1) {
        newStrategy.scheduled_maintenance.push({ ...data, id: `task_${Date.now()}` });
      } else {
        newStrategy.scheduled_maintenance[index] = data;
      }
    } else if (type === "corrective_action") {
      newStrategy.corrective_actions = [...(strategy.corrective_actions || [])];
      if (index === -1) {
        newStrategy.corrective_actions.push({ ...data, id: `corr_${Date.now()}` });
      } else {
        newStrategy.corrective_actions[index] = data;
      }
    } else if (type === "emergency_procedure") {
      newStrategy.emergency_procedures = [...(strategy.emergency_procedures || [])];
      if (index === -1) {
        newStrategy.emergency_procedures.push({ ...data, id: `emerg_${Date.now()}` });
      } else {
        newStrategy.emergency_procedures[index] = data;
      }
    }
    
    onUpdate(criticalityLevel, newStrategy);
    setEditDialog({ open: false, type: null, index: null, data: null });
  };

  const handleDelete = (type, index) => {
    const newStrategy = { ...strategy };
    if (type === "operator_round") {
      newStrategy.operator_rounds = strategy.operator_rounds.filter((_, i) => i !== index);
    } else if (type === "detection_system") {
      newStrategy.detection_systems = strategy.detection_systems.filter((_, i) => i !== index);
    } else if (type === "maintenance_task") {
      newStrategy.scheduled_maintenance = strategy.scheduled_maintenance.filter((_, i) => i !== index);
    } else if (type === "corrective_action") {
      newStrategy.corrective_actions = strategy.corrective_actions.filter((_, i) => i !== index);
    } else if (type === "emergency_procedure") {
      newStrategy.emergency_procedures = strategy.emergency_procedures.filter((_, i) => i !== index);
    }
    onUpdate(criticalityLevel, newStrategy);
  };

  const openEdit = (type, index, data) => {
    setEditDialog({ open: true, type, index, data: { ...data } });
  };

  const openAdd = (type) => {
    const defaults = {
      operator_round: { name: "", frequency: "daily", duration_minutes: 15, checklist: [], skills_required: [], ppe_required: [] },
      detection_system: { name: "", system_type: "visual", description: "", monitoring_interval: "daily" },
      maintenance_task: { name: "", description: "", maintenance_type: "preventive", interval: "monthly", duration_hours: 2 },
      corrective_action: { trigger_condition: "", action_description: "", response_time_hours: 24, priority: "medium" },
      emergency_procedure: { condition: "", immediate_actions: [], safety_precautions: [], recovery_steps: [] },
    };
    setEditDialog({ open: true, type, index: -1, data: defaults[type] });
  };
  
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
      
      {/* Expandable Sections */}
      <div className="space-y-2">
        <CollapsibleSection 
          title="Operator Rounds" 
          icon={Users} 
          count={strategy.operator_rounds?.length || 0} 
          color="blue" 
          defaultOpen
          onAdd={() => openAdd("operator_round")}
        >
          {(strategy.operator_rounds || []).map((round, idx) => {
            // Collect all failure modes from checklist items
            const allFailureModes = (round.checklist || []).flatMap(c => c.failure_modes_addressed || []);
            const uniqueFailureModes = [...new Set(allFailureModes)];
            
            return (
              <EditableItem key={idx} onEdit={() => openEdit("operator_round", idx, round)} onDelete={() => handleDelete("operator_round", idx)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">{round.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {FREQUENCY_OPTIONS.find(f => f.value === round.frequency)?.label || round.frequency}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-500">{round.duration_minutes} min • {round.checklist?.length || 0} checks</div>
                <FailureModesDisplay modes={uniqueFailureModes} onModeClick={onFailureModeClick} label="Checks for" />
              </EditableItem>
            );
          })}
          {(!strategy.operator_rounds || strategy.operator_rounds.length === 0) && (
            <div className="text-xs text-slate-400 italic">No operator rounds defined</div>
          )}
        </CollapsibleSection>
        
        <CollapsibleSection 
          title="Detection Systems" 
          icon={Gauge} 
          count={strategy.detection_systems?.length || 0} 
          color="purple"
          onAdd={() => openAdd("detection_system")}
        >
          {(strategy.detection_systems || []).map((system, idx) => (
            <EditableItem key={idx} onEdit={() => openEdit("detection_system", idx, system)} onDelete={() => handleDelete("detection_system", idx)}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs">{system.name}</span>
                <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                  {system.system_type?.replace("_", " ")}
                </Badge>
              </div>
              <div className="text-[11px] text-slate-600 line-clamp-1">{system.description}</div>
              <FailureModesDisplay modes={system.failure_modes_detected} onModeClick={onFailureModeClick} label="Detects" />
            </EditableItem>
          ))}
          {(!strategy.detection_systems || strategy.detection_systems.length === 0) && (
            <div className="text-xs text-slate-400 italic">No detection systems defined</div>
          )}
        </CollapsibleSection>
        
        <CollapsibleSection 
          title="Scheduled Maintenance" 
          icon={Calendar} 
          count={strategy.scheduled_maintenance?.length || 0} 
          color="green"
          onAdd={() => openAdd("maintenance_task")}
        >
          {(strategy.scheduled_maintenance || []).map((task, idx) => (
            <EditableItem key={idx} onEdit={() => openEdit("maintenance_task", idx, task)} onDelete={() => handleDelete("maintenance_task", idx)}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs">{task.name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {FREQUENCY_OPTIONS.find(f => f.value === task.interval)?.label || task.interval}
                </Badge>
              </div>
              <div className="text-[11px] text-slate-600 line-clamp-1">{task.description}</div>
              <FailureModesDisplay modes={task.failure_modes_addressed} onModeClick={onFailureModeClick} label="Prevents" />
            </EditableItem>
          ))}
          {(!strategy.scheduled_maintenance || strategy.scheduled_maintenance.length === 0) && (
            <div className="text-xs text-slate-400 italic">No maintenance tasks defined</div>
          )}
        </CollapsibleSection>
        
        <CollapsibleSection 
          title="Corrective Actions" 
          icon={Zap} 
          count={strategy.corrective_actions?.length || 0} 
          color="orange"
          onAdd={() => openAdd("corrective_action")}
        >
          {(strategy.corrective_actions || []).map((action, idx) => (
            <EditableItem key={idx} onEdit={() => openEdit("corrective_action", idx, action)} onDelete={() => handleDelete("corrective_action", idx)}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs line-clamp-1">{action.trigger_condition}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                  action.priority === 'critical' ? 'border-red-500 text-red-600' :
                  action.priority === 'high' ? 'border-orange-500 text-orange-600' : ''
                }`}>
                  {action.priority} • {action.response_time_hours}h
                </Badge>
              </div>
              <FailureModesDisplay modes={action.failure_modes} onModeClick={onFailureModeClick} label="Addresses" />
            </EditableItem>
          ))}
          {(!strategy.corrective_actions || strategy.corrective_actions.length === 0) && (
            <div className="text-xs text-slate-400 italic">No corrective actions defined</div>
          )}
        </CollapsibleSection>
        
        <CollapsibleSection 
          title="Emergency Procedures" 
          icon={Bell} 
          count={strategy.emergency_procedures?.length || 0} 
          color="red"
          onAdd={() => openAdd("emergency_procedure")}
        >
          {(strategy.emergency_procedures || []).map((proc, idx) => (
            <EditableItem key={idx} onEdit={() => openEdit("emergency_procedure", idx, proc)} onDelete={() => handleDelete("emergency_procedure", idx)}>
              <div className="font-medium text-xs text-red-700 mb-1">{proc.condition}</div>
              <div className="text-[11px] text-slate-600 line-clamp-1">
                {proc.immediate_actions?.slice(0, 2).join(", ")}
              </div>
            </EditableItem>
          ))}
          {(!strategy.emergency_procedures || strategy.emergency_procedures.length === 0) && (
            <div className="text-xs text-slate-400 italic">No emergency procedures defined</div>
          )}
        </CollapsibleSection>
      </div>

      {/* Edit Dialog */}
      <EditItemDialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, type: null, index: null, data: null })}
        title={editDialog.type === "operator_round" ? (editDialog.index === -1 ? "Add Operator Round" : "Edit Operator Round") :
               editDialog.type === "detection_system" ? (editDialog.index === -1 ? "Add Detection System" : "Edit Detection System") :
               editDialog.type === "maintenance_task" ? (editDialog.index === -1 ? "Add Maintenance Task" : "Edit Maintenance Task") :
               editDialog.type === "corrective_action" ? (editDialog.index === -1 ? "Add Corrective Action" : "Edit Corrective Action") :
               editDialog.type === "emergency_procedure" ? (editDialog.index === -1 ? "Add Emergency Procedure" : "Edit Emergency Procedure") : "Edit"}
        onSave={handleSave}
      >
        {editDialog.type === "operator_round" && editDialog.data && (
          <OperatorRoundForm round={editDialog.data} onChange={(data) => setEditDialog(prev => ({ ...prev, data }))} />
        )}
        {editDialog.type === "detection_system" && editDialog.data && (
          <DetectionSystemForm system={editDialog.data} onChange={(data) => setEditDialog(prev => ({ ...prev, data }))} />
        )}
        {editDialog.type === "maintenance_task" && editDialog.data && (
          <MaintenanceTaskForm task={editDialog.data} onChange={(data) => setEditDialog(prev => ({ ...prev, data }))} />
        )}
        {editDialog.type === "corrective_action" && editDialog.data && (
          <CorrectiveActionForm action={editDialog.data} onChange={(data) => setEditDialog(prev => ({ ...prev, data }))} />
        )}
        {editDialog.type === "emergency_procedure" && editDialog.data && (
          <EmergencyProcedureForm procedure={editDialog.data} onChange={(data) => setEditDialog(prev => ({ ...prev, data }))} />
        )}
      </EditItemDialog>
    </div>
  );
};

// Strategy Card Component
const StrategyCard = ({ strategy, onDelete, onUpdate, isDeleting, isUpdating, onFailureModeClick }) => {
  const [activeTab, setActiveTab] = useState("safety_critical");
  const [sparePartDialog, setSparePartDialog] = useState({ open: false, index: null, data: null });
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  const strategiesByCrit = strategy.strategies_by_criticality || [];
  
  const handleCriticalityUpdate = (criticalityLevel, updatedCritStrategy) => {
    const newStrategies = strategiesByCrit.map(s => 
      s.criticality_level === criticalityLevel ? updatedCritStrategy : s
    );
    onUpdate(strategy.id, { strategies_by_criticality: newStrategies });
  };

  const handleSparePartSave = () => {
    const newParts = [...(strategy.spare_parts || [])];
    if (sparePartDialog.index === -1) {
      newParts.push({ ...sparePartDialog.data, id: `spare_${Date.now()}` });
    } else {
      newParts[sparePartDialog.index] = sparePartDialog.data;
    }
    onUpdate(strategy.id, { spare_parts: newParts });
    setSparePartDialog({ open: false, index: null, data: null });
  };

  const handleSparePartDelete = (idx) => {
    onUpdate(strategy.id, { spare_parts: strategy.spare_parts.filter((_, i) => i !== idx) });
  };
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
            <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-transparent">
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </Button>
            <div className="p-1.5 rounded-lg bg-indigo-100">
              <Wrench className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">{strategy.equipment_type_name}</CardTitle>
              <CardDescription className="text-xs">
                v{strategy.strategy_version} • {strategiesByCrit.length} criticality levels
                {isUpdating && <Loader2 className="w-3 h-3 ml-2 inline animate-spin" />}
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
      {!isCollapsed && (
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
              <CriticalityContent 
                strategy={critStrategy} 
                criticalityLevel={critStrategy.criticality_level}
                onUpdate={handleCriticalityUpdate}
                onFailureModeClick={onFailureModeClick}
              />
            </TabsContent>
          ))}
        </Tabs>
        
        {/* Failure Mode Mappings */}
        {strategy.failure_mode_mappings && strategy.failure_mode_mappings.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <CollapsibleSection 
              title="FMEA Linkages" 
              icon={Link2} 
              count={strategy.failure_mode_mappings.length} 
              color="amber"
            >
              <div className="space-y-2">
                {strategy.failure_mode_mappings.map((mapping, idx) => (
                  <div key={idx} className="p-2 bg-amber-50 border border-amber-200 rounded">
                    <button
                      onClick={() => onFailureModeClick(mapping.failure_mode_name)}
                      className="font-medium text-xs text-amber-800 hover:text-amber-900 flex items-center gap-1"
                    >
                      <FileWarning className="w-3 h-3" />
                      {mapping.failure_mode_name}
                      <ExternalLink className="w-2.5 h-2.5 ml-1" />
                    </button>
                    <div className="text-[10px] text-amber-700 mt-1">
                      {mapping.recommended_interval && (
                        <span className="mr-2">Interval: {FREQUENCY_OPTIONS.find(f => f.value === mapping.recommended_interval)?.label || mapping.recommended_interval}</span>
                      )}
                      <span className={`px-1 py-0.5 rounded ${
                        mapping.risk_if_unaddressed === 'critical' ? 'bg-red-100 text-red-700' :
                        mapping.risk_if_unaddressed === 'high' ? 'bg-orange-100 text-orange-700' :
                        mapping.risk_if_unaddressed === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        Risk: {mapping.risk_if_unaddressed}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}
        
        {/* Spare Parts Summary */}
        <div className="mt-3 pt-3 border-t">
          <CollapsibleSection 
            title="Spare Parts (All Levels)" 
            icon={Package} 
            count={strategy.spare_parts?.length || 0} 
            color="slate"
            onAdd={() => setSparePartDialog({ open: true, index: -1, data: { part_name: "", quantity_recommended: 1, criticality: "medium" } })}
          >
            <div className="grid grid-cols-2 gap-2">
              {(strategy.spare_parts || []).map((part, idx) => (
                <EditableItem 
                  key={idx} 
                  onEdit={() => setSparePartDialog({ open: true, index: idx, data: { ...part } })}
                  onDelete={() => handleSparePartDelete(idx)}
                >
                  <div className="font-medium text-xs">{part.part_name}</div>
                  <div className="text-[10px] text-slate-500">Qty: {part.quantity_recommended}</div>
                  <FailureModesDisplay modes={part.failure_modes_addressed} onModeClick={onFailureModeClick} label="For" />
                </EditableItem>
              ))}
            </div>
            {(!strategy.spare_parts || strategy.spare_parts.length === 0) && (
              <div className="text-xs text-slate-400 italic">No spare parts defined</div>
            )}
          </CollapsibleSection>
        </div>
        
        {/* Auto-generated badge */}
        {strategy.auto_generated && (
          <div className="flex items-center gap-1 text-[10px] text-indigo-500 mt-2">
            <Sparkles className="w-3 h-3" />
            Auto-generated from FMEA
          </div>
        )}
      </CardContent>
      )}

      {/* Spare Part Edit Dialog */}
      <EditItemDialog
        open={sparePartDialog.open}
        onClose={() => setSparePartDialog({ open: false, index: null, data: null })}
        title={sparePartDialog.index === -1 ? "Add Spare Part" : "Edit Spare Part"}
        onSave={handleSparePartSave}
      >
        {sparePartDialog.data && (
          <SparePartForm part={sparePartDialog.data} onChange={(data) => setSparePartDialog(prev => ({ ...prev, data }))} />
        )}
      </EditItemDialog>
    </Card>
  );
};

export default function MaintenanceStrategiesPanel() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEquipmentType, setSelectedEquipmentType] = useState(null);
  
  // Handle click on failure mode link - navigate to Library with search
  const handleFailureModeClick = (failureModeName) => {
    // Navigate to library page and set the failure modes tab active with search
    navigate(`/library?tab=failure-modes&search=${encodeURIComponent(failureModeName)}`);
    toast.info(`Searching for "${failureModeName}" in FMEA Library`);
  };
  
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
      const detail = error.response?.data?.detail || "Failed to generate strategy";
      const status = error.response?.status;
      if (status === 402 || detail.toLowerCase().includes("budget")) {
        toast.error("LLM budget exceeded. Add balance to Universal Key in Profile.", { duration: 8000 });
      } else {
        toast.error(detail);
      }
    },
  });
  
  // Generate all strategies mutation
  const generateAllMutation = useMutation({
    mutationFn: () => maintenanceStrategyAPI.generateAll(),
    onSuccess: (data) => {
      queryClient.invalidateQueries(["maintenance-strategies"]);
      if (data.error) {
        toast.error(data.error, { duration: 8000 });
      } else if (data.generated > 0) {
        toast.success(`Generated ${data.generated} strategies!`);
      } else if (data.skipped > 0) {
        toast.info(`All ${data.skipped} strategies already exist`);
      }
    },
    onError: (error) => {
      const detail = error.response?.data?.detail || "Failed to generate strategies";
      const status = error.response?.status;
      if (status === 402 || detail.toLowerCase().includes("budget")) {
        toast.error("LLM budget exceeded. Add balance to Universal Key in Profile.", { duration: 8000 });
      } else {
        toast.error(detail);
      }
    },
  });
  
  // Update strategy mutation
  const updateMutation = useMutation({
    mutationFn: ({ strategyId, data }) => maintenanceStrategyAPI.update(strategyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["maintenance-strategies"]);
      toast.success("Strategy updated!");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to update strategy");
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

  const handleUpdate = (strategyId, data) => {
    updateMutation.mutate({ strategyId, data });
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
                {t("maintenance.generating")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {t("maintenance.generateStrategy")}
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
                {t("maintenance.generating")}
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4 mr-2" />
                {t("maintenance.generateAll")}
              </>
            )}
          </Button>
        </div>
        
        <p className="text-xs text-slate-500 mt-2">
          {t("maintenance.noStrategiesDesc")}
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
              <p className="font-medium">{t("maintenance.noStrategies")}</p>
              <p className="text-sm">{t("maintenance.noStrategiesDesc")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {strategies.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  onDelete={deleteMutation.mutate}
                  onUpdate={handleUpdate}
                  isDeleting={deleteMutation.isPending}
                  isUpdating={updateMutation.isPending}
                  onFailureModeClick={handleFailureModeClick}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
