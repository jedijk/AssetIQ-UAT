import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../../contexts/LanguageContext";
import { failureModesAPI, qrCodeAPI } from "../../lib/api";
import {
  Settings, Cog, Check, Edit, GripVertical, Trash2, ChevronDown, Sparkles, Eye, Search, AlertTriangle, QrCode,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { QRCodeDialog } from "./QRCodeDialog";

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
  const [typeSearchOpen, setTypeSearchOpen] = useState(false);
  const [typeSearchQuery, setTypeSearchQuery] = useState("");
  const [showQRDialog, setShowQRDialog] = useState(false);
  
  // Fetch QR code for this equipment
  const { data: qrData } = useQuery({
    queryKey: ["qr-code", node?.id],
    queryFn: () => qrCodeAPI.getForEquipment(node.id),
    enabled: !!node?.id,
    staleTime: 30000,
  });
  
  // Fetch failure mode counts by equipment type
  const { data: fmCountsData } = useQuery({
    queryKey: ["failure-mode-counts"],
    queryFn: failureModesAPI.getCountsByEquipmentType,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const fmCounts = fmCountsData?.counts_by_type || {};
  
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
  
  // Filter equipment types - first by applicable_levels (hierarchy level), then by compatible_systems
  const { recommendedTypes, otherTypes } = useMemo(() => {
    if (!equipmentTypes) {
      return { recommendedTypes: [], otherTypes: [] };
    }
    
    // First filter by applicable_levels based on current node level
    const nodeLevel = node?.level || "equipment_unit";
    // Normalize legacy levels
    const normalizedLevel = nodeLevel === "equipment" ? "equipment_unit" : 
                           nodeLevel === "system" ? "section_system" : 
                           nodeLevel === "unit" ? "plant_unit" : nodeLevel;
    
    // Filter types that are applicable to the current hierarchy level
    const levelFilteredTypes = equipmentTypes.filter(eqt => {
      const applicableLevels = eqt.applicable_levels || ["equipment_unit"];
      return applicableLevels.includes(normalizedLevel);
    });
    
    // If no parent system context, return level-filtered types without further recommendations
    if (!parentSystemName) {
      return { recommendedTypes: [], otherTypes: levelFilteredTypes };
    }
    
    const searchTerms = parentSystemName.toLowerCase();
    
    // Find types that have compatible systems matching parent name
    const recommended = [];
    const others = [];
    
    levelFilteredTypes.forEach(eqt => {
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
  }, [equipmentTypes, parentSystemName, node?.level]);
  
  // Filter types by search query
  const filteredRecommendedTypes = useMemo(() => {
    if (!typeSearchQuery) return recommendedTypes;
    const q = typeSearchQuery.toLowerCase();
    return recommendedTypes.filter(eqt => 
      eqt.name.toLowerCase().includes(q) || 
      eqt.discipline?.toLowerCase().includes(q) ||
      eqt.id.toLowerCase().includes(q)
    );
  }, [recommendedTypes, typeSearchQuery]);
  
  const filteredOtherTypes = useMemo(() => {
    if (!typeSearchQuery) return otherTypes;
    const q = typeSearchQuery.toLowerCase();
    return otherTypes.filter(eqt => 
      eqt.name.toLowerCase().includes(q) || 
      eqt.discipline?.toLowerCase().includes(q) ||
      eqt.id.toLowerCase().includes(q)
    );
  }, [otherTypes, typeSearchQuery]);
  
  // Get selected equipment type
  const selectedType = equipmentTypes?.find(t => t.id === node?.equipment_type_id);
  
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
                
                {/* Searchable Equipment Type Selector */}
                <Popover open={typeSearchOpen} onOpenChange={setTypeSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={typeSearchOpen}
                      className="w-full h-9 justify-between font-normal"
                    >
                      {selectedType ? (
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate">{selectedType.name}</span>
                          {fmCounts[selectedType.id] && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {fmCounts[selectedType.id]} FM
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Select equipment type...</span>
                      )}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Search equipment types..." 
                        value={typeSearchQuery}
                        onValueChange={setTypeSearchQuery}
                      />
                      <CommandList className="max-h-72">
                        <CommandEmpty>No equipment type found.</CommandEmpty>
                        
                        {/* Clear selection option */}
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => {
                              onUpdate(node.id, { equipment_type_id: null, discipline: null });
                              setTypeSearchOpen(false);
                              setTypeSearchQuery("");
                            }}
                          >
                            <span className="text-slate-400">None (clear selection)</span>
                          </CommandItem>
                        </CommandGroup>
                        
                        {/* Recommended types */}
                        {filteredRecommendedTypes.length > 0 && (
                          <>
                            <CommandSeparator />
                            <CommandGroup heading={
                              <div className="flex items-center gap-1.5 text-blue-600">
                                <Sparkles className="w-3 h-3" />
                                <span>Recommended for this system</span>
                              </div>
                            }>
                              {filteredRecommendedTypes.map(eqt => (
                                <CommandItem
                                  key={eqt.id}
                                  value={`recommended-${eqt.id}-${eqt.name}`}
                                  onSelect={() => {
                                    onUpdate(node.id, { 
                                      equipment_type_id: eqt.id,
                                      discipline: eqt.discipline || null
                                    });
                                    setTypeSearchOpen(false);
                                    setTypeSearchQuery("");
                                  }}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                      {node.equipment_type_id === eqt.id && <Check className="w-4 h-4 text-blue-500" />}
                                      <span>{eqt.name}</span>
                                      <span className="text-xs text-slate-400">({eqt.discipline})</span>
                                    </div>
                                    {fmCounts[eqt.id] > 0 && (
                                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                        {fmCounts[eqt.id]} FM
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                        
                        {/* Other types - shown if showAllTypes or no recommendations */}
                        {(showAllTypes || recommendedTypes.length === 0) && filteredOtherTypes.length > 0 && (
                          <>
                            <CommandSeparator />
                            <CommandGroup heading="All Equipment Types">
                              {filteredOtherTypes.map(eqt => (
                                <CommandItem
                                  key={eqt.id}
                                  value={`other-${eqt.id}-${eqt.name}`}
                                  onSelect={() => {
                                    onUpdate(node.id, { 
                                      equipment_type_id: eqt.id,
                                      discipline: eqt.discipline || null
                                    });
                                    setTypeSearchOpen(false);
                                    setTypeSearchQuery("");
                                  }}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                      {node.equipment_type_id === eqt.id && <Check className="w-4 h-4 text-blue-500" />}
                                      <span>{eqt.name}</span>
                                      <span className="text-xs text-slate-400">({eqt.discipline})</span>
                                    </div>
                                    {fmCounts[eqt.id] > 0 && (
                                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                        {fmCounts[eqt.id]} FM
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                
                {/* System context hint */}
                {parentSystemName && recommendedTypes.length > 0 && !showAllTypes && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Filtered for "{parentSystemName}"
                  </p>
                )}
                
                {/* Show failure mode count for selected type */}
                {selectedType && fmCounts[selectedType.id] > 0 && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {fmCounts[selectedType.id]} failure modes in library for {selectedType.name}
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
          
          {/* QR Code Section */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">QR Code</Label>
              {qrData?.qr_code && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Active
                </span>
              )}
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setShowQRDialog(true)}
            >
              <QrCode className="w-4 h-4 mr-2" />
              {qrData?.qr_code ? "View/Edit QR Code" : "Generate QR Code"}
            </Button>
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
      
      {/* QR Code Dialog */}
      <QRCodeDialog 
        open={showQRDialog}
        onOpenChange={setShowQRDialog}
        equipment={node}
        existingQR={qrData?.qr_code}
      />
    </div>
  );
}
