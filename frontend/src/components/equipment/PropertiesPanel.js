import { useState, useMemo } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  Settings, Cog, Check, Edit, GripVertical, Trash2, ChevronDown, Sparkles, Eye,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";

const LEVEL_CONFIG = { 
  installation: { icon: Settings, label: "Installation" }, 
  plant_unit: { icon: Settings, label: "Plant/Unit" }, 
  section_system: { icon: Settings, label: "Section/System" }, 
  equipment_unit: { icon: Cog, label: "Equipment Unit" }, 
  subunit: { icon: Settings, label: "Subunit" },
  maintainable_item: { icon: Settings, label: "Maintainable Item" },
  // Legacy support - "unit" maps to Equipment Unit
  unit: { icon: Cog, label: "Equipment Unit" },
  plant: { icon: Settings, label: "Plant/Unit" },
  section: { icon: Settings, label: "Section/System" },
  system: { icon: Settings, label: "Section/System" },
  equipment: { icon: Cog, label: "Equipment Unit" },
  // Additional legacy levels from imports
  site: { icon: Settings, label: "Site/Location" },
  location: { icon: Settings, label: "Site/Location" },
  line: { icon: Settings, label: "Production Line" },
  production_line: { icon: Settings, label: "Production Line" },
  area: { icon: Settings, label: "Area" },
  zone: { icon: Settings, label: "Zone" },
  auxiliary: { icon: Cog, label: "Auxiliary" }
};

const CRIT_COLORS = { 
  safety_critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" }, 
  production_critical: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500" }, 
  medium: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500" }, 
  low: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" } 
};

const CriticalityDimension = ({ label, color, value, onClick }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className={`text-xs font-medium text-${color}-700`}>{label}</span>
      <span className="text-xs text-slate-500">{value || 0}/5</span>
    </div>
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(level => (
        <button
          key={level}
          onClick={() => onClick(level)}
          className={`flex-1 h-6 rounded transition-all ${
            (value || 0) >= level 
              ? `bg-${color}-500` 
              : `bg-${color}-100 hover:bg-${color}-200`
          }`}
          title={`${label}: ${level}`}
        />
      ))}
    </div>
  </div>
);

export function PropertiesPanel({ node, equipmentTypes, onUpdate, onAssignCriticality, onDelete, allNodes }) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showAllTypes, setShowAllTypes] = useState(false);
  
  // Determine parent system name for smart filtering
  const parentSystemName = useMemo(() => {
    if (!node || !allNodes) return null;
    
    // Find parent nodes and check for system-level name
    let currentParentId = node.parent_id;
    while (currentParentId) {
      const parent = allNodes.find(n => n.id === currentParentId);
      if (!parent) break;
      
      // Check if parent level is a system (section_system, system)
      if (parent.level === "section_system" || parent.level === "system" || parent.level === "equipment_unit") {
        return parent.name;
      }
      currentParentId = parent.parent_id;
    }
    return null;
  }, [node, allNodes]);
  
  // Filter equipment types - show recommended first based on compatible_systems
  const { recommendedTypes, otherTypes } = useMemo(() => {
    if (!equipmentTypes || !parentSystemName) {
      return { recommendedTypes: [], otherTypes: equipmentTypes || [] };
    }
    
    const searchTerms = parentSystemName.toLowerCase();
    
    // Find types that have compatible systems matching parent name
    const recommended = [];
    const others = [];
    
    equipmentTypes.forEach(eqt => {
      const isCompatible = eqt.compatible_systems?.some(sys => {
        const sysLower = sys.toLowerCase();
        // Check if system name contains any word from compatible systems
        return searchTerms.includes(sysLower.split(" ")[0]) || 
               sysLower.includes(searchTerms.split(" ")[0]) ||
               searchTerms.includes(sysLower) ||
               sysLower.includes(searchTerms);
      });
      
      if (isCompatible) {
        recommended.push(eqt);
      } else {
        others.push(eqt);
      }
    });
    
    return { recommendedTypes: recommended, otherTypes: others };
  }, [equipmentTypes, parentSystemName]);
  
  if (!node) return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <Settings className="w-12 h-12 text-slate-300 mb-3" />
      <p className="text-sm text-slate-400">{t("equipment.selectEquipment") || "Select an equipment item"}</p>
    </div>
  );
  
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  
  const handleSave = () => { onUpdate(node.id, { name: editName, description: editDesc }); setIsEditing(false); };
  const startEdit = () => { setEditName(node.name); setEditDesc(node.description || ""); setIsEditing(true); };
  
  return (
    <div className="h-full flex flex-col" data-testid="properties-panel">
      <div className={`p-4 border-b border-slate-200 ${critColors?.bg || "bg-slate-50"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${critColors?.bg || "bg-white"} ${critColors?.border || "border-slate-200"} border`}>
            <LevelIcon className={`w-5 h-5 ${critColors?.text || "text-slate-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm font-semibold" autoFocus />
            ) : (
              <h3 className="font-semibold text-slate-800 truncate">{node.name}</h3>
            )}
            <p className="text-xs text-slate-500">{config.label}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => isEditing ? handleSave() : startEdit()}>
            {isEditing ? <Check className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600">
              <GripVertical className="w-4 h-4" />
              <span className="text-xs font-medium">Drag to reorder or move</span>
            </div>
          </div>
          
          <div>
            <Label className="text-xs text-slate-500 mb-1">{t("common.description")}</Label>
            {isEditing ? (
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Add description..." className="h-8 text-sm" />
            ) : (
              <p className="text-sm text-slate-700">{node.description || <span className="text-slate-400 italic">{t("taskScheduler.noDescription")}</span>}</p>
            )}
          </div>
          
          {(node.level === "equipment_unit" || node.level === "equipment" || node.level === "subunit" || node.level === "maintainable_item") && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-slate-500">{t("equipment.equipmentType") || "Equipment Type"}</Label>
                  {recommendedTypes.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Eye className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400">Show all</span>
                      <Switch 
                        checked={showAllTypes} 
                        onCheckedChange={setShowAllTypes}
                        className="h-4 w-7"
                      />
                    </div>
                  )}
                </div>
                <Select 
                  value={node.equipment_type_id || "__none__"} 
                  onValueChange={v => {
                    const actualValue = v === "__none__" ? null : v;
                    const eqType = actualValue ? equipmentTypes?.find(t => t.id === actualValue) : null;
                    onUpdate(node.id, { 
                      equipment_type_id: actualValue,
                      discipline: eqType?.discipline || null
                    });
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="__none__">
                      <span className="text-slate-400">None</span>
                    </SelectItem>
                    
                    {/* Recommended types based on parent system */}
                    {recommendedTypes.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 bg-blue-50 border-y border-blue-100">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-blue-500" />
                            <span className="text-xs font-medium text-blue-700">Recommended for this system</span>
                          </div>
                        </div>
                        {recommendedTypes.map(eqt => (
                          <SelectItem key={eqt.id} value={eqt.id} className="pl-4">
                            <div className="flex items-center gap-2">
                              <span>{eqt.name}</span>
                              <span className="text-xs text-slate-400">({eqt.discipline})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    
                    {/* Other types - shown if showAllTypes is true or no recommendations */}
                    {(showAllTypes || recommendedTypes.length === 0) && otherTypes.length > 0 && (
                      <>
                        {recommendedTypes.length > 0 && (
                          <div className="px-2 py-1.5 bg-slate-50 border-y border-slate-100">
                            <span className="text-xs font-medium text-slate-500">All Equipment Types</span>
                          </div>
                        )}
                        {otherTypes.map(eqt => (
                          <SelectItem key={eqt.id} value={eqt.id} className="pl-4">
                            <div className="flex items-center gap-2">
                              <span>{eqt.name}</span>
                              <span className="text-xs text-slate-400">({eqt.discipline})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                
                {/* System context hint */}
                {parentSystemName && recommendedTypes.length > 0 && !showAllTypes && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Filtered for "{parentSystemName}"
                  </p>
                )}
              </div>
              
              {node.equipment_type_id && (
                <div>
                  <Label className="text-xs text-slate-500 mb-1">{t("library.discipline")}</Label>
                  <div className="h-9 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600 capitalize">
                    {equipmentTypes?.find(eqt => eqt.id === node.equipment_type_id)?.discipline || "Not set"}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Auto-assigned from equipment type</p>
                </div>
              )}
            </>
          )}
          
          {/* Process Step - only for subunit and maintainable_item levels */}
          {(node.level === "subunit" || node.level === "maintainable_item") && (
            <div>
              <Label className="text-xs text-slate-500 mb-1">{t("equipment.processStep") || "Process Step"}</Label>
              <Input 
                value={node.process_step || ""} 
                onChange={e => onUpdate(node.id, { process_step: e.target.value })} 
                placeholder={t("equipment.processStepPlaceholder") || "e.g., Extrusion, Compounding, Mixing"} 
                className="h-9 text-sm"
                data-testid="process-step-input"
              />
              {node.process_step && (
                <p className="text-xs text-slate-400 mt-1">{t("equipment.processStepHint") || "Inherited by child items"}</p>
              )}
            </div>
          )}
          
          <div>
            <Label className="text-xs text-slate-500 mb-2">{t("equipment.criticality") || "Criticality Assessment"}</Label>
            <div className="space-y-3 bg-slate-50 p-3 rounded-lg">
              <CriticalityDimension
                label={t("equipment.safetyImpact") || "Safety"}
                color="red"
                value={node.criticality?.safety_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, safety_impact: node.criticality?.safety_impact === level ? null : level })}
              />
              <CriticalityDimension
                label={t("equipment.productionImpact") || "Production"}
                color="orange"
                value={node.criticality?.production_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, production_impact: node.criticality?.production_impact === level ? null : level })}
              />
              <CriticalityDimension
                label={t("equipment.environmentalImpact") || "Environmental"}
                color="green"
                value={node.criticality?.environmental_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, environmental_impact: node.criticality?.environmental_impact === level ? null : level })}
              />
              <CriticalityDimension
                label={t("equipment.reputationImpact") || "Reputation"}
                color="purple"
                value={node.criticality?.reputation_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, reputation_impact: node.criticality?.reputation_impact === level ? null : level })}
              />
              
              {(node.criticality?.safety_impact || node.criticality?.production_impact || node.criticality?.environmental_impact || node.criticality?.reputation_impact) && (
                <div className="pt-2 border-t border-slate-200 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{t("equipment.overallCriticality") || "Overall Criticality"}</span>
                    <span className="text-sm font-bold text-slate-800">
                      {Math.max(
                        node.criticality?.safety_impact || 0,
                        node.criticality?.production_impact || 0,
                        node.criticality?.environmental_impact || 0,
                        node.criticality?.reputation_impact || 0
                      )}/5
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {node.level !== "installation" && (
            <div className="pt-4 border-t border-slate-200">
              <Button 
                variant="outline" 
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(node.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("common.delete")} {config.label}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
