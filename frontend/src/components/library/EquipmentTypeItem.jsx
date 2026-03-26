import { Edit, Trash2, Cog } from "lucide-react";

// Equipment type icons
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
  flame: require("lucide-react").Flame 
};

export const ICON_OPTIONS = ["droplets", "wind", "cog", "thermometer", "box", "circle-dot", "zap", "gauge", "cpu", "pipette", "flame"];
export const DISCIPLINES = ["mechanical", "electrical", "instrumentation", "process", "laboratory"];

export function EquipmentTypeItem({ item, onEdit, onDelete }) {
  const Icon = EQUIPMENT_ICONS[item.icon] || Cog;
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-all group" data-testid={`equipment-type-${item.id}`}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-slate-700 block truncate">{item.name}</span>
        <span className="text-xs text-slate-400 capitalize">{item.discipline}</span>
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
