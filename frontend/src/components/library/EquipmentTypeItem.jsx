import { useState, useMemo } from "react";
import { Edit, Trash2, Cog, AlertTriangle, Link, Search, X, ChevronRight, CheckCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { useLanguage } from "../../contexts/LanguageContext";

// Translate a discipline label via the i18n dictionary, falling back to the original
function translateDiscipline(name, t) {
  if (!name) return name;
  const translated = t(`disciplines.${name}`);
  // If t returned the raw key, no translation existed — fall back
  if (translated && translated !== `disciplines.${name}`) return translated;
  return name;
}

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

// Standardized disciplines - MUST match /app/frontend/src/constants/disciplines.js
// To customize disciplines, update both this file and the constants file
export const DISCIPLINES = [
  "Rotating",
  "Static",
  "Piping",
  "Electrical", 
  "Instrumentation",
  "Civil",
  "Operations",
  "Laboratory"
];

// Equipment categories for ISO 14224 classification
export const EQUIPMENT_CATEGORIES = [
  "rotating",
  "static", 
  "piping",
  "electrical",
  "instrumentation",
  "civil"
];

// Discipline colors for visual grouping - matches the disciplines above
export const DISCIPLINE_COLORS = {
  "Rotating": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "text-blue-600" },
  "Static": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "text-slate-600" },
  "Piping": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", icon: "text-teal-600" },
  "Electrical": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "text-amber-600" },
  "Instrumentation": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "text-purple-600" },
  "Civil": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", icon: "text-orange-600" },
  "Operations": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", icon: "text-green-600" },
  "Laboratory": { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", icon: "text-cyan-600" },
  // Legacy support - map old names to new colors
  "Mechanical": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "text-blue-600" },
  "Static Equipment": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "text-slate-600" },
  "Safety": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: "text-red-600" },
};

export function EquipmentTypeItem({ item, onEdit, onDelete, onSelect, isSelected, connectedFmCount = 0 }) {
  const Icon = EQUIPMENT_ICONS[item.icon] || Cog;
  const colors = DISCIPLINE_COLORS[item.discipline] || DISCIPLINE_COLORS["Mechanical"];
  const { t } = useLanguage();
  
  return (
    <div 
      className={`flex items-start gap-3 p-3 bg-white rounded-lg border transition-all group cursor-pointer ${
        isSelected 
          ? `${colors.border} ring-2 ring-blue-300 shadow-md` 
          : `${colors.border} hover:shadow-sm`
      }`} 
      data-testid={`equipment-type-${item.id}`}
      onClick={() => onSelect && onSelect(item)}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
        <Icon className={`w-5 h-5 ${colors.icon}`} />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
          {item.is_system_level && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium flex-shrink-0">SYS</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-xs ${colors.text} truncate`}>{translateDiscipline(item.discipline, t)}</span>
          {item.category && (
            <span className="text-xs text-slate-400 capitalize truncate">• {translateDiscipline(item.category.charAt(0).toUpperCase() + item.category.slice(1), t)}</span>
          )}
        </div>
        {/* Show connected failure modes count */}
        {connectedFmCount > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Link className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-600 font-medium truncate">{connectedFmCount} failure modes</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        {/* Show chevron if selectable */}
        {onSelect && (
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isSelected ? 'rotate-90' : ''}`} />
        )}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={e => e.stopPropagation()}>
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
    </div>
  );
}

// Panel to show and edit connected failure modes for an equipment type
export function EquipmentTypeFailureModesPanel({ 
  equipmentType, 
  allFailureModes = [], 
  onUpdateFailureMode, 
  onClose,
  t 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyConnected, setShowOnlyConnected] = useState(false);
  
  const Icon = EQUIPMENT_ICONS[equipmentType?.icon] || Cog;
  const colors = DISCIPLINE_COLORS[equipmentType?.discipline] || DISCIPLINE_COLORS["Mechanical"];
  
  // Get connected failure modes
  const connectedFms = useMemo(() => {
    return allFailureModes.filter(fm => 
      fm.equipment_type_ids?.includes(equipmentType?.id)
    );
  }, [allFailureModes, equipmentType?.id]);
  
  // Filter failure modes based on search
  const filteredFms = useMemo(() => {
    let fms = showOnlyConnected ? connectedFms : allFailureModes;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      fms = fms.filter(fm => 
        fm.failure_mode?.toLowerCase().includes(query) ||
        fm.category?.toLowerCase().includes(query) ||
        fm.keywords?.some(k => k.toLowerCase().includes(query))
      );
    }
    
    return fms;
  }, [allFailureModes, connectedFms, searchQuery, showOnlyConnected]);
  
  // Toggle connection
  const handleToggleConnection = (fm) => {
    const currentIds = fm.equipment_type_ids || [];
    const isConnected = currentIds.includes(equipmentType.id);
    
    const newIds = isConnected
      ? currentIds.filter(id => id !== equipmentType.id)
      : [...currentIds, equipmentType.id];
    
    onUpdateFailureMode(fm.id, { equipment_type_ids: newIds });
  };
  
  if (!equipmentType) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Cog className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-2">Select an Equipment Type</h3>
          <p className="text-sm text-slate-400">Click on an equipment type to view and manage connected failure modes</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.bg}`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-slate-900 text-lg truncate">{equipmentType.name}</h2>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>{translateDiscipline(equipmentType.discipline, t)}</span>
            <span>•</span>
            <span className="text-blue-600 font-medium">{connectedFms.length} failure modes linked</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Search and filter */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search failure modes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyConnected}
              onChange={(e) => setShowOnlyConnected(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-slate-600">Show only connected ({connectedFms.length})</span>
          </label>
          <span className="text-sm text-slate-400">
            {filteredFms.length} results
          </span>
        </div>
      </div>
      
      {/* Failure modes list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filteredFms.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>{searchQuery ? "No matching failure modes" : "No failure modes found"}</p>
            </div>
          ) : (
            filteredFms.map(fm => {
              const isConnected = fm.equipment_type_ids?.includes(equipmentType.id);
              const rpn = fm.severity * fm.occurrence * fm.detectability;
              
              return (
                <div
                  key={fm.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                    isConnected 
                      ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => handleToggleConnection(fm)}
                >
                  {/* Connection indicator */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isConnected ? 'bg-blue-500' : 'bg-slate-100'
                  }`}>
                    {isConnected ? (
                      <CheckCircle className="w-4 h-4 text-white" />
                    ) : (
                      <Link className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{fm.category}</Badge>
                      {fm.failure_mode_type === "customer_specific" && (
                        <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                          Customer
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-medium text-sm text-slate-900 line-clamp-1">
                      {fm.failure_mode}
                    </h4>
                    {fm.keywords?.length > 0 && (
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                        {fm.keywords.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                  
                  {/* RPN Score */}
                  <div className={`w-12 h-10 rounded-lg flex flex-col items-center justify-center text-sm font-bold flex-shrink-0 ${
                    rpn >= 200 ? 'bg-red-100 text-red-700' :
                    rpn >= 125 ? 'bg-orange-100 text-orange-700' :
                    rpn >= 80 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    <span className="text-lg leading-tight">{rpn}</span>
                    <span className="text-[9px] opacity-70">RPN</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      
      {/* Footer with summary */}
      <div className="p-4 border-t bg-slate-50 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-blue-600">{connectedFms.length}</span> failure modes connected to this equipment type
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

export default EquipmentTypeItem;
