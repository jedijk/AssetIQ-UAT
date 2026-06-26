import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { equipmentHierarchyAPI, threatsAPI } from "../lib/api";
import { isIOSLikeDevice } from "../lib/deviceUtils";
import { canUsePortalTarget } from "../lib/domUtils";
import { queryKeys } from "../lib/queryKeys";
import { useLanguage } from "../contexts/LanguageContext";
import { useEquipmentNodeIdMap } from "../hooks/useTranslatedEntities";
import { toast } from "sonner";
import { 
  ChevronRight, 
  ChevronDown,
  Building2,
  Factory,
  Settings,
  Cog,
  Box,
  Wrench,
  Layers,
  AlertTriangle,
  X,
  Plus,
  Info,
  Shield,
  Zap,
  Leaf,
  Star,
  Filter,
  Search,
  Paperclip,
  Upload,
  Download,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Eye,
  EyeOff,
  ClipboardList,
  FoldVertical,
  Package,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { DocumentViewer } from "./DocumentViewer";
import { getBackendUrl } from "../lib/apiConfig";
import { getEquipmentLevelLabel } from "../lib/equipmentLevelLabels";
import { LEVEL_ORDER as ISO_LEVEL_ORDER, isSparePartLinkableLevel } from "../lib/equipmentHierarchyUtils";
import { computeCriticalityScore, getCriticalityDimensions } from "../lib/criticalityScore";
import MaintenanceProgramPanel from "./equipment/MaintenanceProgramPanel";
import EquipmentSparePartsPanel from "./spareiq/EquipmentSparePartsPanel";

// ISO 14224 Level Configuration
const ISO_LEVEL_CONFIG = {
  installation: { icon: Building2, label: "Installation", color: "text-blue-600" },
  plant_unit: { icon: Factory, label: "Plant/Unit", color: "text-indigo-600" },
  section_system: { icon: Settings, label: "Section/System", color: "text-purple-600" },
  equipment_unit: { icon: Cog, label: "Equipment Unit", color: "text-orange-600" },
  subunit: { icon: Box, label: "Subunit", color: "text-teal-600" },
  maintainable_item: { icon: Wrench, label: "Maintainable Item", color: "text-slate-600" },
  // Legacy support - "unit" maps to Section/System (Process Units like Feedstock Prep Unit)
  unit: { icon: Settings, label: "Section/System", color: "text-purple-600" },
  plant: { icon: Factory, label: "Plant/Unit", color: "text-indigo-600" },
  section: { icon: Settings, label: "Section/System", color: "text-purple-600" },
  system: { icon: Settings, label: "Section/System", color: "text-purple-600" },
  equipment: { icon: Cog, label: "Equipment Unit", color: "text-orange-600" },
  // Additional legacy levels from imports
  site: { icon: Building2, label: "Site/Location", color: "text-cyan-600" },
  location: { icon: Building2, label: "Site/Location", color: "text-cyan-600" },
  line: { icon: Settings, label: "Production Line", color: "text-violet-600" },
  production_line: { icon: Settings, label: "Production Line", color: "text-violet-600" },
  area: { icon: Settings, label: "Area", color: "text-purple-600" },
  zone: { icon: Settings, label: "Zone", color: "text-purple-600" },
  auxiliary: { icon: Cog, label: "Auxiliary", color: "text-orange-600" }
};

// Legacy level mapping to ISO 14224
const LEGACY_LEVEL_MAP = {
  // "unit" in this database context refers to Process Units (Section/System level)
  unit: "section_system",
  plant: "plant_unit",
  system: "section_system",
  section: "section_system",
  equipment: "equipment_unit",
  site: "installation",
  location: "installation",
  line: "section_system",
  production_line: "section_system",
  area: "section_system",
  zone: "section_system",
  auxiliary: "section_system"
};

// Normalize level to handle legacy values
function normalizeLevel(level) {
  return LEGACY_LEVEL_MAP[level] || level;
}

// Criticality colors
const CRIT_COLORS = {
  safety_critical: "text-red-500",
  production_critical: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-green-500"
};

// Build tree from flat nodes (sorted by tag alphabetically, then name)
function buildTreeData(nodes, parentId = null) {
  return nodes
    .filter(n => n.parent_id === parentId)
    .sort((a, b) => {
      // If both have sort_order set (manually ordered), use that
      const aHasSort = a.sort_order !== null && a.sort_order !== undefined;
      const bHasSort = b.sort_order !== null && b.sort_order !== undefined;
      
      if (aHasSort && bHasSort) {
        return a.sort_order - b.sort_order;
      }
      
      // If only one has sort_order, it comes first
      if (aHasSort && !bHasSort) return -1;
      if (!aHasSort && bHasSort) return 1;
      
      // Default: sort by tag alphabetically, then by name
      const aTag = a.tag || '';
      const bTag = b.tag || '';
      const tagCompare = aTag.localeCompare(bTag);
      if (tagCompare !== 0) return tagCompare;
      
      return (a.name || '').localeCompare(b.name || '');
    })
    .map(node => ({
      ...node,
      children: buildTreeData(nodes, node.id)
    }));
}

// Remove hidden levels from tree, bubbling their children up
function filterHiddenLevels(tree, hiddenLevels) {
  if (!hiddenLevels || hiddenLevels.size === 0) return tree;
  const result = [];
  for (const node of tree) {
    const normalized = normalizeLevel(node.level || node.type);
    if (hiddenLevels.has(normalized)) {
      // Skip this node, promote its children
      result.push(...filterHiddenLevels(node.children || [], hiddenLevels));
    } else {
      result.push({
        ...node,
        children: filterHiddenLevels(node.children || [], hiddenLevels),
      });
    }
  }
  return result;
}

// Get threat count per equipment node - uses linked_equipment_id for accurate matching
function getThreatCountByAsset(threats) {
  const countByName = new Map();
  const countById = new Map();
  
  threats.forEach(threat => {
    // Primary: count by linked_equipment_id (accurate)
    if (threat.linked_equipment_id) {
      countById.set(threat.linked_equipment_id, (countById.get(threat.linked_equipment_id) || 0) + 1);
    }
    // Fallback: count by asset name (for older threats without linked_equipment_id)
    const asset = threat.asset;
    if (asset) {
      countByName.set(asset, (countByName.get(asset) || 0) + 1);
    }
  });
  
  return { countByName, countById };
}

// Get cumulative threat count for a node and all its descendants
function getCumulativeThreatCount(node, threatCounts) {
  const { countByName, countById } = threatCounts;
  // Prefer ID-based count, fallback to name-based
  let count = countById.get(node.id) || countByName.get(node.name) || 0;
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      count += getCumulativeThreatCount(child, threatCounts);
    });
  }
  return count;
}

// Get direct threat count for a specific node (not cumulative)
function getDirectThreatCount(node, threatCounts) {
  const { countByName, countById } = threatCounts;
  // Prefer ID-based count, fallback to name-based only if no ID match
  return countById.get(node.id) || 0;
}

function hierarchyNodeCanViewMaintenanceProgram(node) {
  return ["equipment_unit", "equipment", "subunit", "maintainable_item", "unit"].includes(node?.level);
}

function getHierarchyEquipmentTypeName(node, equipmentTypes) {
  const typeId = node?.equipment_type_id || node?.equipment_type;
  if (!typeId) return null;
  const eqType = equipmentTypes?.find((et) => et.id === typeId);
  if (eqType?.name) return eqType.name;
  if (node.equipment_type_name) return node.equipment_type_name;
  return typeId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getHierarchyDisciplineDisplay(node, equipmentTypes, t) {
  const disciplines = {
    mechanical: { label: t ? t("library.mechanical") : "Mechanical", color: "bg-blue-100 text-blue-700" },
    electrical: { label: t ? t("library.electrical") : "Electrical", color: "bg-yellow-100 text-yellow-700" },
    instrumentation: { label: t ? t("library.instrumentation") : "Instrumentation", color: "bg-purple-100 text-purple-700" },
    process: { label: t ? t("library.process") : "Process", color: "bg-green-100 text-green-700" },
    laboratory: { label: t ? t("library.laboratory") : "Laboratory", color: "bg-cyan-100 text-cyan-700" },
    rotating: { label: t ? t("library.rotating") : "Rotating", color: "bg-orange-100 text-orange-700" },
    static: { label: t ? t("library.static") : "Static", color: "bg-teal-100 text-teal-700" },
  };
  let disc = node?.discipline;
  if (!disc) {
    const typeId = node?.equipment_type_id || node?.equipment_type;
    if (typeId) {
      const eqType = equipmentTypes?.find((et) => et.id === typeId);
      disc = eqType?.discipline;
    }
  }
  if (!disc) return null;
  const discLower = disc.toLowerCase();
  if (disciplines[discLower]) return disciplines[discLower];
  return {
    label: disc.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    color: "bg-slate-100 text-slate-700",
  };
}

function getHierarchyCriticalityDetails(node) {
  const dims = getCriticalityDimensions(node?.criticality);
  if (!dims) return null;
  const { safety, production, environmental, reputation } = dims;
  const riskScore = computeCriticalityScore(node?.criticality);
  if (riskScore == null) return null;
  const crit = node.criticality;
  return {
    level: crit.level,
    safety,
    production,
    environmental,
    reputation,
    riskScore,
  };
}

function getHierarchyNodeConfig(node) {
  return ISO_LEVEL_CONFIG[node.level] || ISO_LEVEL_CONFIG[normalizeLevel(node.level)] || {
    icon: Cog,
    label: node.level ? node.level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Item",
    color: "text-slate-600",
  };
}

// Tree node component
const TreeNode = ({ node, children, isOpen, onToggle, onClick, isActive, level = 0, threatCount = 0, onEditEquipment, onShowContextMenu, t, equipmentTypes, isMobile = false, isSearchMatch = false }) => {
  const hasChildren = node.children && node.children.length > 0;
  // Translation lookup for hierarchy node name (id-keyed)
  const nodeTransMap = useEquipmentNodeIdMap();
  const translatedName = nodeTransMap[node.id]?.name || node.name;
  // Get config with smart fallback for unknown levels
  const config = ISO_LEVEL_CONFIG[node.level] || ISO_LEVEL_CONFIG[normalizeLevel(node.level)] || { 
    icon: Cog, 
    label: node.level ? node.level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : "Item",
    color: "text-slate-600"
  };
  const levelLabel = getEquipmentLevelLabel(t, node.level, normalizeLevel);
  const Icon = config.icon;
  const critColor = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY);
  };

  const openContextMenu = (x, y) => {
    onShowContextMenu?.(node, x, y);
  };

  // Handle click/tap on the equipment name/info area (NOT the arrow)
  const handleClick = (e) => {
    if (isMobile) {
      // On mobile: single tap immediately shows context menu (no delay, no double-tap)
      const rect = e.currentTarget.getBoundingClientRect();
      const menuX = Math.min(rect.left + 20, window.innerWidth - 200);
      const menuY = Math.min(rect.bottom + 5, window.innerHeight - 150);
      
      openContextMenu(menuX, menuY);
    } else {
      // Desktop behavior - single click navigates and toggles if has children
      if (hasChildren) onToggle?.();
      onClick?.();
    }
  };
  
  // Handle arrow click (expand/collapse only)
  const handleArrowClick = (e) => {
    e.stopPropagation();
    onToggle?.();
  };
  
  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
          isActive ? "bg-blue-50 text-blue-700" : 
          isSearchMatch ? "bg-yellow-50 border border-yellow-200" :
          "hover:bg-slate-100 text-slate-700"
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onContextMenu={handleContextMenu}
        data-testid={`hierarchy-node-${node.id}`}
      >
        {/* Arrow button - expand/collapse only, larger tap area on mobile */}
        {hasChildren ? (
          <button 
            className={`flex items-center justify-center hover:bg-slate-200 rounded transition-colors flex-shrink-0 ${isMobile ? 'w-7 h-7' : 'w-5 h-5'}`}
            onClick={handleArrowClick}
            data-testid={`hierarchy-expand-${node.id}`}
          >
            {isOpen ? (
              <ChevronDown className={`${isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5'} text-slate-400`} />
            ) : (
              <ChevronRight className={`${isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5'} text-slate-400`} />
            )}
          </button>
        ) : (
          <button 
            className={`flex items-center justify-center flex-shrink-0 pointer-events-none ${isMobile ? 'w-7 h-7' : 'w-5 h-5'}`}
            tabIndex={-1}
            aria-hidden="true"
          />
        )}
        
        {/* Equipment info - clickable area for context menu on mobile */}
        <div 
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
          onClick={handleClick}
          data-testid={`hierarchy-item-${node.id}`}
        >
          <Icon className={`w-4 h-4 ${critColor || config.color} flex-shrink-0`} />
          {node.tag ? (
            <span className={`text-sm font-medium truncate flex-1 ${isSearchMatch ? 'text-yellow-800' : ''}`}>
              <span className="font-mono text-slate-500">
                {/* For maintainable items, show only the last part of the tag (after last dash/separator) */}
                {node.level === 'maintainable_item' && node.tag.includes('-') 
                  ? node.tag.split('-').pop() 
                  : node.tag}
              </span>
              <span className="mx-1 text-slate-300">-</span>
              <span>{translatedName}</span>
            </span>
          ) : (
            <span className={`text-sm font-medium truncate flex-1 ${isSearchMatch ? 'text-yellow-800' : ''}`}>{translatedName}</span>
          )}
          {isSearchMatch && (
            <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded">Match</span>
          )}
          {threatCount > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {threatCount}
            </span>
          )}
          {node.criticality?.level && (
            <span className={`w-2 h-2 rounded-full ${
              node.criticality.level === 'safety_critical' ? 'bg-red-500' :
              node.criticality.level === 'production_critical' ? 'bg-orange-500' :
              node.criticality.level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
            }`} />
          )}
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {children}
        </div>
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// Equipment Details Dialog (mobile-friendly)
// ---------------------------------------------------------------------------
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EquipmentDetailsDialog({ open, onClose, node, config, critColor, t, getCriticalityDetails, getEquipmentTypeName, getDisciplineDisplay, onEditEquipment }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null);
  const Icon = config.icon;
  // Translations for hierarchy node (name + description)
  const nodeTransMap = useEquipmentNodeIdMap();
  const nodeTrans = nodeTransMap[node.id] || {};
  const translatedName = nodeTrans.name || node.name;
  const translatedDescription = nodeTrans.description || node.description;
  const levelLabel = getEquipmentLevelLabel(t, node.level, normalizeLevel);

  const { data: filesData } = useQuery({
    queryKey: queryKeys.equipment.files(node.id),
    queryFn: () => equipmentHierarchyAPI.getEquipmentFiles(node.id),
    enabled: open && !!node.id,
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => equipmentHierarchyAPI.uploadEquipmentFile(node.id, file),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.equipment.files(node.id) }); toast.success("File uploaded"); },
    onError: (e) => toast.error(e.response?.data?.detail || "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId) => equipmentHierarchyAPI.deleteEquipmentFile(fileId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.equipment.files(node.id) }); toast.success("Deleted"); },
    onError: () => toast.error("Delete failed"),
  });

  const handleDownload = async (fileId, filename) => {
    try {
      const blob = await equipmentHierarchyAPI.downloadEquipmentFile(fileId);
      const url = window.URL.createObjectURL(blob);
      if (isIOSLikeDevice()) {
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w) window.location.href = url;
        window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
        return;
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 5_000);
    } catch { toast.error("Download failed"); }
  };

  const handleView = (file) => {
    const ext = file.filename.split('.').pop()?.toLowerCase() || '';
    const dbEnv = localStorage.getItem("database_environment");
    const dbEnvQs = dbEnv ? `?db_env=${encodeURIComponent(dbEnv)}` : "";
    setPreviewFile({ 
      name: file.filename, 
      // Use the authenticated download endpoint for preview too.
      // iOS is much more reliable when preview bytes match download bytes.
      url: `${getBackendUrl()}/api/equipment-files/${file.id}/download${dbEnvQs}`,
      type: ext 
    });
  };

  const files = filesData?.files || [];

  return (
    <>
    <Dialog open={open && !previewFile} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden" data-testid="equipment-details-dialog">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              node.criticality?.level === "safety_critical" ? "bg-red-100" :
              node.criticality?.level === "production_critical" ? "bg-orange-100" :
              node.criticality?.level === "medium" ? "bg-yellow-100" : "bg-slate-100"
            }`}>
              <Icon className={`w-5 h-5 ${critColor || config.color}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm leading-tight">{translatedName}</DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">{levelLabel}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-2">
        <div className="space-y-3">
          {node.tag && (
            <div>
              <label className="text-xs text-slate-500 block mb-1">Tag</label>
              <span className="text-sm font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{node.tag}</span>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 block mb-1">Equipment Type</label>
            {getEquipmentTypeName() ? (
              <Badge variant="outline" className="bg-slate-50">{getEquipmentTypeName()}</Badge>
            ) : (
              <span className="text-sm text-slate-400 italic">Not assigned</span>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">Discipline</label>
            {getDisciplineDisplay() ? (
              <Badge className={getDisciplineDisplay().color}>{getDisciplineDisplay().label}</Badge>
            ) : (
              <span className="text-sm text-slate-400 italic">Not assigned</span>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">Criticality</label>
            {(() => {
              const critDetails = getCriticalityDetails();
              if (!critDetails) {
                return (
                  <span className="text-sm text-slate-400 italic">No criticality assigned</span>
                );
              }
              return (
                <>
                  <div className="grid grid-cols-4 gap-1 mt-1">
                    {[
                      { icon: Shield, color: "red", val: critDetails.safety },
                      { icon: Cog, color: "orange", val: critDetails.production },
                      { icon: Leaf, color: "green", val: critDetails.environmental },
                      { icon: Star, color: "purple", val: critDetails.reputation },
                    ].map(({ icon: CIcon, color, val }) => (
                      <div key={color} className="text-center flex flex-col items-center gap-0.5">
                        <CIcon className={`w-3.5 h-3.5 text-${color}-500`} />
                        <div className="flex gap-px">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-3 rounded-sm ${i <= val ? `bg-${color}-500` : "bg-slate-200"}`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">{val}</span>
                      </div>
                    ))}
                  </div>
                  {critDetails.riskScore != null && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                      <span className="text-xs font-semibold text-slate-700">
                        {t?.("equipment.criticalityScore") || "Criticality Score"}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-800">
                          {Math.round(critDetails.riskScore)}/100
                        </span>
                        {critDetails.level && (
                          <p className="text-[10px] text-slate-500 capitalize">
                            {String(critDetails.level).replace(/_/g, " ")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {translatedDescription && (
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t("common.description")}</label>
              <p className="text-sm text-slate-600">{translatedDescription}</p>
            </div>
          )}

          {isSparePartLinkableLevel(node.level) && (
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center gap-1.5 mb-2">
                <Package className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {t?.("equipment.spareParts") || "Spare Parts"}
                </span>
              </div>
              <EquipmentSparePartsPanel
                equipmentId={node.id}
                equipmentName={translatedName}
              />
            </div>
          )}

          {/* Files Section */}
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Files</span>
                {files.length > 0 && (
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{files.length}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} data-testid="upload-file-detail-btn">
                <Upload className="w-3.5 h-3.5 mr-1" />{uploadMutation.isPending ? "..." : "Upload"}
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadMutation.mutate(f); e.target.value = ""; } }} />
            </div>

            {files.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-3">No files attached</p>
            ) : (
              <div className="space-y-1">
                {files.map((f) => {
                  const isImage = f.content_type?.startsWith("image/");
                  const isPdf = f.content_type?.includes("pdf");
                  const isOffice = f.content_type?.includes("presentation") || f.content_type?.includes("powerpoint") || f.content_type?.includes("ppt")
                    || f.content_type?.includes("spreadsheet") || f.content_type?.includes("excel") || f.content_type?.includes("xls")
                    || f.content_type?.includes("msword") || f.content_type?.includes("wordprocessing") || f.content_type?.includes("doc");
                  const FIcon = isImage ? ImageIcon : (isPdf || isOffice) ? FileText : FileIcon;
                  const canView = isImage || isPdf || isOffice;
                  return (
                    <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 group" data-testid={`detail-file-${f.id}`}>
                      <FIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 truncate">{f.filename}</p>
                        <p className="text-[10px] text-slate-400">{formatFileSize(f.size)} &middot; {f.uploaded_by_name}</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {canView && (
                          <button onClick={() => handleView(f)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="View" data-testid={`view-file-${f.id}`}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDownload(f.id, f.filename)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Download" data-testid={`dl-file-${f.id}`}>
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteMutation.mutate(f.id)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" title="Delete" data-testid={`rm-file-${f.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 flex-shrink-0">
          <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { onClose(); onEditEquipment?.(node.id); }} data-testid="edit-equipment-btn">
            <Settings className="w-4 h-4 mr-2" />
            {t ? t("hierarchy.editInManager") : "Edit in Equipment Manager"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* File Preview - Full screen DocumentViewer via Portal to escape stacking contexts */}
    {previewFile && (
      canUsePortalTarget(document.body)
        ? createPortal(
            <DocumentViewer
              document={previewFile}
              onClose={() => setPreviewFile(null)}
              onBack={() => setPreviewFile(null)}
            />,
            document.body
          )
        : (
          <div className="fixed inset-0 z-[99999]">
            <DocumentViewer
              document={previewFile}
              onClose={() => setPreviewFile(null)}
              onBack={() => setPreviewFile(null)}
            />
          </div>
        )
    )}
    </>
  );
}


// ISO Level Summary Item
const LevelSummaryItem = ({ level, count, isActive, onClick, isHidden, onToggleHidden, t }) => {
  const config = ISO_LEVEL_CONFIG[level] || ISO_LEVEL_CONFIG[normalizeLevel(level)] || { 
    icon: Cog, 
    label: level ? level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : "Item", 
    color: "text-slate-600" 
  };
  const levelLabel = getEquipmentLevelLabel(t, level, normalizeLevel);
  const Icon = config.icon;
  
  return (
    <div className="flex items-center gap-1 w-full">
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors flex-1 text-left ${
          isHidden ? "opacity-40" :
          isActive ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-600"
        }`}
        data-testid={`iso-level-${level}`}
      >
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className="text-sm font-medium flex-1">{levelLabel}</span>
        <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleHidden(level); }}
        className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${isHidden ? "text-slate-300" : "text-slate-400"}`}
        title={isHidden ? `${t("common.show")} ${levelLabel}` : `${t("common.hide")} ${levelLabel}`}
        data-testid={`toggle-level-${level}`}
      >
        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

const EquipmentHierarchy = ({ isOpen, onClose, isMobile = false, onAddThreat, initialSearchQuery = "", onSearchQueryUsed }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const scrollContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  
  // Load expanded nodes from localStorage on initial render
  const [expandedNodes, setExpandedNodes] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar-hierarchy-expanded');
      return saved ? new Set(JSON.parse(saved)) : new Set(["all"]);
    } catch {
      return new Set(["all"]);
    }
  });
  
  // Persist expanded nodes to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-hierarchy-expanded', JSON.stringify([...expandedNodes]));
    } catch (e) {
      console.error('Failed to save expanded state:', e);
    }
  }, [expandedNodes]);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [activeContextMenu, setActiveContextMenu] = useState({ show: false, node: null, x: 0, y: 0 });
  const [detailsNode, setDetailsNode] = useState(null);
  const [maintenanceNode, setMaintenanceNode] = useState(null);
  const contextMenuRef = useRef(null);
  const nodeTransMap = useEquipmentNodeIdMap();
  const [viewMode, setViewMode] = useState("tree"); // "tree" or "levels"
  const [filterLevel, setFilterLevel] = useState(null);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [preSearchExpandedNodes, setPreSearchExpandedNodes] = useState(null);

  // Handle initial search query from props (e.g., from clicking tag in observation workspace)
  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      // Focus the search input after a short delay
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      // Clear the prop so it doesn't re-apply on re-renders
      if (onSearchQueryUsed) {
        onSearchQueryUsed();
      }
    }
  }, [initialSearchQuery, onSearchQueryUsed]);

  // Hidden levels - persisted to localStorage, default: hide first 2 levels
  const [hiddenLevels, setHiddenLevels] = useState(() => {
    try {
      const saved = localStorage.getItem('hierarchy-hidden-levels');
      if (saved) return new Set(JSON.parse(saved));
      // Default: hide installation and plant_unit
      const defaults = ["installation", "plant_unit"];
      localStorage.setItem('hierarchy-hidden-levels', JSON.stringify(defaults));
      return new Set(defaults);
    } catch {
      return new Set(["installation", "plant_unit"]);
    }
  });

  const toggleHiddenLevel = (level) => {
    setHiddenLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      localStorage.setItem('hierarchy-hidden-levels', JSON.stringify([...next]));
      return next;
    });
  };

  const closeContextMenu = useCallback(() => {
    setActiveContextMenu({ show: false, node: null, x: 0, y: 0 });
  }, []);

  const handleShowContextMenu = useCallback((node, x, y) => {
    setActiveContextMenu({ show: true, node, x, y });
  }, []);

  useEffect(() => {
    if (!activeContextMenu.show) return;
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        closeContextMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [activeContextMenu.show, closeContextMenu]);

  // Fetch equipment hierarchy nodes
  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: queryKeys.equipment.nodes(),
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 30000,
  });

  // Fetch equipment types for details popup
  const { data: typesData } = useQuery({
    queryKey: queryKeys.equipment.types(),
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 60000,
  });

  // Fetch threats to show counts
  const { data: threats = [] } = useQuery({
    queryKey: queryKeys.threats.all(),
    queryFn: () => threatsAPI.getAll(),
  });

  const nodes = useMemo(() => nodesData?.nodes ?? [], [nodesData]);
  const equipmentTypes = useMemo(() => typesData?.equipment_types ?? [], [typesData]);
  const threatCountByAsset = useMemo(() => getThreatCountByAsset(threats), [threats]);
  
  const expandedNodesRef = useRef(expandedNodes);
  useEffect(() => {
    expandedNodesRef.current = expandedNodes;
  }, [expandedNodes]);
  
  // Build tree structure
  const treeData = useMemo(() => {
    const raw = buildTreeData(nodes);
    return filterHiddenLevels(raw, hiddenLevels);
  }, [nodes, hiddenLevels]);
  
  // Search matching function
  const nodeMatchesSearch = useCallback((node, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const nameMatch = node.name?.toLowerCase().includes(q);
    const descMatch = node.description?.toLowerCase().includes(q);
    const tagMatch = node.tag?.toLowerCase().includes(q);
    const eqType = equipmentTypes.find(et => et.id === node.equipment_type_id);
    const typeMatch = eqType?.name?.toLowerCase().includes(q);
    return nameMatch || descMatch || tagMatch || typeMatch;
  }, [equipmentTypes]);
  
  // Get parent chain for a node
  const getParentChain = useCallback((nodeId, nodeList) => {
    const parents = [];
    let current = nodeList.find(n => n.id === nodeId);
    while (current?.parent_id) {
      parents.push(current.parent_id);
      current = nodeList.find(n => n.id === current.parent_id);
    }
    return parents;
  }, []);
  
  // Get matching node IDs and their parents for auto-expand
  const { matchingIds, expandForSearch } = useMemo(() => {
    if (!searchQuery) return { matchingIds: new Set(), expandForSearch: new Set() };
    const matching = new Set();
    const toExpand = new Set();
    nodes.forEach(node => {
      if (nodeMatchesSearch(node, searchQuery)) {
        matching.add(node.id);
        getParentChain(node.id, nodes).forEach(pid => toExpand.add(pid));
      }
    });
    return { matchingIds: matching, expandForSearch: toExpand };
  }, [nodes, searchQuery, nodeMatchesSearch, getParentChain]);
  
  // Auto-expand parents when searching
  useEffect(() => {
    if (searchQuery && expandForSearch.size > 0) {
      if (preSearchExpandedNodes === null) {
        setPreSearchExpandedNodes(new Set(expandedNodesRef.current));
      }
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        expandForSearch.forEach(id => newSet.add(id));
        return newSet;
      });
    } else if (!searchQuery && preSearchExpandedNodes !== null) {
      setExpandedNodes(preSearchExpandedNodes);
      setPreSearchExpandedNodes(null);
    }
  }, [searchQuery, expandForSearch, preSearchExpandedNodes]);
  
  // Count by ISO level (using the module-level LEGACY_LEVEL_MAP for consistency)
  const levelCounts = useMemo(() => {
    const counts = {};
    ISO_LEVEL_ORDER.forEach(level => { counts[level] = 0; });
    nodes.forEach(node => {
      // Normalize legacy levels to ISO 14224 using the module-level map
      const normalizedLevel = LEGACY_LEVEL_MAP[node.level] || node.level;
      if (counts[normalizedLevel] !== undefined) {
        counts[normalizedLevel]++;
      }
    });
    return counts;
  }, [nodes]);

  const toggleNode = (nodeId) => {
    // Preserve scroll position during toggle
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;
    
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
    
    // Restore scroll position after React re-renders
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollTop;
      }
    });
  };

  const collapseAllNodes = useCallback(() => {
    closeContextMenu();
    if (searchQuery) {
      setSearchQuery("");
    }
    setPreSearchExpandedNodes(null);
    setExpandedNodes(new Set());
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [searchQuery, closeContextMenu]);

  const hasExpandedNodes = expandedNodes.size > 0;

  // Helper function to collect all descendant names (including the node itself)
  const collectAllDescendantNames = (node) => {
    const names = [node.name];
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        names.push(...collectAllDescendantNames(child));
      });
    }
    return names;
  };

  const handleNodeClick = (node) => {
    setSelectedNodeId(node.id);
    // Collect all asset names from this node and its descendants
    const allAssetNames = collectAllDescendantNames(node);
    // Navigate to threats page filtered by all these assets
    navigate(`/threats?assets=${encodeURIComponent(allAssetNames.join(','))}&assetName=${encodeURIComponent(node.name)}`);
    if (isMobile) onClose?.();
  };

  // Navigate to Equipment Manager with selected equipment for editing
  const handleEditEquipment = (nodeId) => {
    navigate(`/equipment-manager?edit=${nodeId}`);
    if (isMobile) onClose?.();
  };

  // Render tree recursively
  const renderTree = (treeNodes, level = 0) => {
    return treeNodes
      .filter(node => {
        // If searching, only show nodes that match OR have matching descendants
        if (searchQuery) {
          const isMatch = matchingIds.has(node.id);
          const isParentOfMatch = expandForSearch.has(node.id);
          return isMatch || isParentOfMatch;
        }
        return !filterLevel || node.level === filterLevel;
      })
      .map(node => {
        // Only show direct threat count for this specific node (by ID, not name)
        const threatCount = getDirectThreatCount(node, threatCountByAsset);
        const isSearchMatch = searchQuery && matchingIds.has(node.id);
        return (
          <TreeNode
            key={node.id}
            node={node}
            level={level}
            isOpen={expandedNodes.has(node.id)}
            onToggle={() => toggleNode(node.id)}
            onClick={() => handleNodeClick(node)}
            isActive={selectedNodeId === node.id}
            threatCount={threatCount}
            onEditEquipment={handleEditEquipment}
            onShowContextMenu={handleShowContextMenu}
            t={t}
            equipmentTypes={equipmentTypes}
            isMobile={isMobile}
            isSearchMatch={isSearchMatch}
          >
            {node.children && node.children.length > 0 && renderTree(node.children, level + 1)}
          </TreeNode>
        );
      });
  };

  // Shared content JSX
  const contentJSX = (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className={`flex items-center justify-between p-3 border-b border-slate-200 flex-shrink-0 ${isMobile ? 'bg-white sticky top-0 z-10' : ''}`}>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">
            {isMobile ? t("equipment.equipmentHierarchyTitle") : t("equipment.hierarchy")}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <Button
            variant={viewMode === "tree" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => { setViewMode("tree"); setFilterLevel(null); setSearchQuery(""); }}
          >
            {t("equipment.tree")}
          </Button>
          <Button
            variant={viewMode === "levels" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => { setViewMode("levels"); setSearchQuery(""); }}
          >
            {t("equipment.levels")}
          </Button>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-slate-400 ml-1"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {viewMode === "tree" && (
        <div className="p-2 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              ref={searchInputRef}
              placeholder={t("equipment.searchEquipment")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-8 text-sm bg-white"
              data-testid="sidebar-hierarchy-search"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300"
                data-testid="sidebar-clear-search"
              >
                <X className="w-3 h-3 text-slate-500" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-1.5 text-xs text-slate-500">
              {matchingIds.size}{" "}
              {matchingIds.size === 1 ? t("equipment.matchSingular") : t("equipment.matches")}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {nodesLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="loading-dots"><span></span><span></span><span></span></div>
        </div>
      )}

      {/* Content */}
      {!nodesLoading && (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {viewMode === "levels" ? (
            // ISO Levels View
            <div className="space-y-1">
              <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t("equipment.hierarchyLevels")}
              </div>
              {ISO_LEVEL_ORDER.map(level => (
                <LevelSummaryItem
                  key={level}
                  level={level}
                  count={levelCounts[level] || 0}
                  isActive={filterLevel === level}
                  isHidden={hiddenLevels.has(level)}
                  onToggleHidden={toggleHiddenLevel}
                  t={t}
                  onClick={() => {
                    setFilterLevel(filterLevel === level ? null : level);
                    setViewMode("tree");
                  }}
                />
              ))}
            </div>
          ) : (
            // Tree View
            <>
              {filterLevel && (
                <div className="mb-2 px-2">
                  <div className="flex items-center justify-between bg-blue-50 rounded-lg px-2 py-1">
                    <span className="text-xs text-blue-700">
                      {t("equipment.showingFilter")}: {getEquipmentLevelLabel(t, filterLevel, normalizeLevel)}
                    </span>
                    <button 
                      onClick={() => setFilterLevel(null)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              
              {treeData.length > 0 ? (
                <div className="space-y-0.5">
                  {renderTree(treeData)}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium">{t("equipment.noEquipmentHierarchy")}</p>
                  <p className="text-xs mt-1">{t("equipment.goToEquipmentManagerHint")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/equipment-manager")}
                  >
                    {t("equipment.openEquipmentManager")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {viewMode === "tree" && !nodesLoading && treeData.length > 0 && hasExpandedNodes && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={collapseAllNodes}
          className="absolute left-2 bottom-[4.5rem] z-20 h-7 px-2 text-[11px] shadow-md bg-white/95 backdrop-blur-sm border-slate-200 text-slate-600 hover:text-slate-900"
          title={t("equipment.collapseAll")}
          aria-label={t("equipment.collapseAll")}
          data-testid="hierarchy-collapse-all"
        >
          <FoldVertical className="w-3.5 h-3.5" />
          <span className="ml-1">{t("equipment.collapseAll")}</span>
        </Button>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        {isMobile && (
          <p className="text-xs text-slate-400 mb-2 text-center">
            {t("equipment.tapItemHint")}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            <span className="font-medium">{nodes.length}</span>{" "}
            {nodes.length === 1 ? t("equipment.itemSingular") : t("equipment.itemsPlural")}
          </span>
          <button
            onClick={() => { navigate("/equipment-manager"); if (isMobile) onClose?.(); }}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            {t("equipment.manage")}
          </button>
        </div>
      </div>

      {activeContextMenu.show && activeContextMenu.node && canUsePortalTarget(document.body) && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[180px]"
          style={{ left: activeContextMenu.x, top: activeContextMenu.y, zIndex: 99999 }}
          data-testid="hierarchy-context-menu"
        >
          <button
            type="button"
            onClick={() => {
              handleNodeClick(activeContextMenu.node);
              closeContextMenu();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
            data-testid="context-menu-filter-on"
          >
            <Filter className="w-4 h-4" />
            {t?.("hierarchy.filterOn") || "Filter on"}
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            onClick={() => {
              setDetailsNode(activeContextMenu.node);
              closeContextMenu();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700 hover:text-slate-900"
            data-testid="context-menu-show-details"
          >
            <Info className="w-4 h-4" />
            {t?.("hierarchy.showDetails") || "Show Details"}
          </button>
          {hierarchyNodeCanViewMaintenanceProgram(activeContextMenu.node) && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  setMaintenanceNode(activeContextMenu.node);
                  closeContextMenu();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
                data-testid="context-menu-maintenance-program"
              >
                <ClipboardList className="w-4 h-4" />
                {t?.("equipment.viewMaintenanceProgram") || "View Maintenance Program"}
              </button>
            </>
          )}
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            onClick={() => {
              const n = activeContextMenu.node;
              closeContextMenu();
              const label = n.tag ? `${n.name} (${n.tag})` : n.name;
              onAddThreat?.(label);
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
            data-testid="context-menu-add-threat"
          >
            <Plus className="w-4 h-4" />
            {t?.("hierarchy.addThreat") || "Add Observation"}
          </button>
        </div>,
        document.body
      )}

      {detailsNode && (
        <EquipmentDetailsDialog
          open={!!detailsNode}
          onClose={() => setDetailsNode(null)}
          node={detailsNode}
          config={getHierarchyNodeConfig(detailsNode)}
          critColor={detailsNode.criticality?.level ? CRIT_COLORS[detailsNode.criticality.level] : null}
          t={t}
          getCriticalityDetails={() => getHierarchyCriticalityDetails(detailsNode)}
          getEquipmentTypeName={() => getHierarchyEquipmentTypeName(detailsNode, equipmentTypes)}
          getDisciplineDisplay={() => getHierarchyDisciplineDisplay(detailsNode, equipmentTypes, t)}
          onEditEquipment={handleEditEquipment}
        />
      )}

      {maintenanceNode && (
        <Dialog open={!!maintenanceNode} onOpenChange={(open) => { if (!open) setMaintenanceNode(null); }}>
          <DialogContent className="max-w-4xl max-h-[min(92dvh,100%)] sm:max-h-[85vh] overflow-hidden overflow-x-hidden flex flex-col gap-1 sm:gap-4 p-2 sm:p-6">
            <DialogHeader className="flex-shrink-0 pr-8 max-sm:space-y-0.5">
              <DialogTitle className="flex items-center gap-1.5 text-sm sm:text-lg">
                <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                {t?.("equipment.maintenanceProgram") || "Maintenance Program"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm line-clamp-2 sm:line-clamp-none">
                {nodeTransMap[maintenanceNode.id]?.name || maintenanceNode.name}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 py-0 sm:py-4 -mx-1 px-1">
              <MaintenanceProgramPanel
                equipmentId={maintenanceNode.id}
                equipmentName={nodeTransMap[maintenanceNode.id]?.name || maintenanceNode.name}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  // Mobile: render full-screen overlay
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 top-[52px] z-50 bg-white flex flex-col" data-testid="mobile-hierarchy-panel" style={{ height: 'calc(100dvh - 52px)' }}>
        {contentJSX}
      </div>
    );
  }

  // Desktop: render inline
  return (
    <div className="h-full flex flex-col">
      {contentJSX}
    </div>
  );
};

export default EquipmentHierarchy;
