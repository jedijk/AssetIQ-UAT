import { Edit, Trash2, Cog } from "lucide-react";

// Equipment type icons - Expanded for ISO 14224 coverage
export const EQUIPMENT_ICONS = { 
  droplets: require("lucide-react").Droplets, 
  wind: require("lucide-react").Wind, 
  cog: Cog, 
  thermometer: require("lucide-react").Thermometer, 
  box: require("lucide-react").Box, 
  "circle-dot": require("lucide-react").CircleDot, 
  zap: require("lucide-react").Zap, 
  gauge: require("lucide-react").Gauge, 
  cpu: require("lucide-react").Cpu, 
  pipette: require("lucide-react").Pipette, 
  flame: require("lucide-react").Flame,
  settings: require("lucide-react").Settings,
  cylinder: require("lucide-react").Cylinder,
  shield: require("lucide-react").Shield,
  "shield-alert": require("lucide-react").ShieldAlert,
  "alert-triangle": require("lucide-react").AlertTriangle,
  battery: require("lucide-react").Battery,
  activity: require("lucide-react").Activity,
  cable: require("lucide-react").Cable,
  sliders: require("lucide-react").SlidersHorizontal,
  "flask-conical": require("lucide-react").FlaskConical,
  move: require("lucide-react").Move,
  "move-horizontal": require("lucide-react").MoveHorizontal,
  "arrow-up-down": require("lucide-react").ArrowUpDown,
  filter: require("lucide-react").Filter,
  circle: require("lucide-react").Circle
};

export const ICON_OPTIONS = [
  "droplets", "wind", "cog", "thermometer", "box", "circle-dot", "zap", "gauge", 
  "cpu", "pipette", "flame", "settings", "cylinder", "shield", "shield-alert",
  "alert-triangle", "battery", "activity", "cable", "sliders", "flask-conical",
  "move", "move-horizontal", "arrow-up-down", "filter", "circle"
];

// Standardized disciplines aligned with ISO 14224
export const DISCIPLINES = [
  "Mechanical",
  "Electrical", 
  "Instrumentation",
  "Static Equipment",
  "Safety"
];

// Equipment categories
export const EQUIPMENT_CATEGORIES = [
  "rotating",
  "static", 
  "control",
  "safety",
  "electrical"
];

// Discipline colors for visual grouping
export const DISCIPLINE_COLORS = {
  "Mechanical": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "text-blue-600" },
  "Electrical": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "text-amber-600" },
  "Instrumentation": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "text-purple-600" },
  "Static Equipment": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "text-slate-600" },
  "Safety": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: "text-red-600" }
};

export function EquipmentTypeItem({ item, onEdit, onDelete }) {
  const Icon = EQUIPMENT_ICONS[item.icon] || Cog;
  const colors = DISCIPLINE_COLORS[item.discipline] || DISCIPLINE_COLORS["Mechanical"];
  
  return (
    <div 
      className={`flex items-center gap-3 p-3 bg-white rounded-lg border ${colors.border} hover:shadow-sm transition-all group`} 
      data-testid={`equipment-type-${item.id}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg}`}>
        <Icon className={`w-5 h-5 ${colors.icon}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
          {item.is_system_level && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">SYS</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${colors.text}`}>{item.discipline}</span>
          {item.category && (
            <span className="text-xs text-slate-400 capitalize">• {item.category}</span>
          )}
        </div>
        {item.compatible_systems && item.compatible_systems.length > 0 && (
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {item.compatible_systems.slice(0, 2).join(", ")}
            {item.compatible_systems.length > 2 && ` +${item.compatible_systems.length - 2}`}
          </div>
        )}
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
        <button onClick={() => onEdit(item)} className="p-1.5 hover:bg-blue-50 rounded">
          <Edit className="w-3.5 h-3.5 text-blue-500" />
        </button>
        {item.is_custom && (
          <button onClick={() => onDelete(item.id)} className="p-1.5 hover:bg-red-50 rounded">
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        )}
      </div>
    </div>
  );
}

export default EquipmentTypeItem;
