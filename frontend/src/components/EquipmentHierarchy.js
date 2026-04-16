import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { equipmentHierarchyAPI, threatsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
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
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

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

const ISO_LEVEL_ORDER = ["installation", "plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"];

// Criticality colors
const CRIT_COLORS = {
  safety_critical: "text-red-500",
  production_critical: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-green-500"
};

// Build tree from flat nodes (sorted by sort_order, then name)
function buildTreeData(nodes, parentId = null) {
  return nodes
    .filter(n => n.parent_id === parentId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
    .map(node => ({
      ...node,
      children: buildTreeData(nodes, node.id)
    }));
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

// Tree node component
const TreeNode = ({ node, children, isOpen, onToggle, onClick, isActive, level = 0, threatCount = 0, onAddThreat, onEditEquipment, t, equipmentTypes, isMobile = false, isSearchMatch = false }) => {
  const hasChildren = node.children && node.children.length > 0;
  // Get config with smart fallback for unknown levels
  const config = ISO_LEVEL_CONFIG[node.level] || ISO_LEVEL_CONFIG[normalizeLevel(node.level)] || { 
    icon: Cog, 
    label: node.level ? node.level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : "Item",
    color: "text-slate-600"
  };
  const Icon = config.icon;
  const critColor = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(false);
  const contextMenuRef = useRef(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu({ show: false, x: 0, y: 0 });
      }
    };
    if (contextMenu.show) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [contextMenu.show]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY });
  };

  // Handle click/tap on the equipment name/info area (NOT the arrow)
  const handleClick = (e) => {
    if (isMobile) {
      // On mobile: single tap immediately shows context menu (no delay, no double-tap)
      const rect = e.currentTarget.getBoundingClientRect();
      const menuX = Math.min(rect.left + 20, window.innerWidth - 200);
      const menuY = Math.min(rect.bottom + 5, window.innerHeight - 150);
      
      setContextMenu({ 
        show: true, 
        x: menuX, 
        y: menuY 
      });
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

  const handleAddThreatClick = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
    const label = node.tag ? `${node.name} (${node.tag})` : node.name;
    onAddThreat?.(label);
  };

  const handleShowDetails = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
    setShowDetails(true);
  };

  const handleFilterOn = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
    onClick?.(); // Navigate to filtered observations
  };

  // Get equipment type name
  const getEquipmentTypeName = () => {
    if (!node.equipment_type) return null;
    const eqType = equipmentTypes?.find(et => et.id === node.equipment_type);
    return eqType?.name || node.equipment_type;
  };

  // Get discipline display name
  const getDisciplineDisplay = () => {
    const disciplines = {
      mechanical: { label: t ? t("library.mechanical") : "Mechanical", color: "bg-blue-100 text-blue-700" },
      electrical: { label: t ? t("library.electrical") : "Electrical", color: "bg-yellow-100 text-yellow-700" },
      instrumentation: { label: t ? t("library.instrumentation") : "Instrumentation", color: "bg-purple-100 text-purple-700" },
      process: { label: t ? t("library.process") : "Process", color: "bg-green-100 text-green-700" }
    };
    return disciplines[node.discipline] || null;
  };

  // Get criticality details
  const getCriticalityDetails = () => {
    if (!node.criticality) return null;
    const crit = node.criticality;
    return {
      level: crit.level,
      safety: crit.safety_impact || 0,
      production: crit.production_impact || 0,
      environmental: crit.environmental_impact || 0,
      reputation: crit.reputation_impact || 0,
      maxImpact: crit.max_impact || Math.max(crit.safety_impact || 0, crit.production_impact || 0, crit.environmental_impact || 0, crit.reputation_impact || 0)
    };
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
          <span className={`flex-shrink-0 ${isMobile ? 'w-7' : 'w-5'}`} />
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
              <span className="font-mono text-slate-500">{node.tag}</span>
              <span className="mx-1 text-slate-300">-</span>
              <span>{node.name}</span>
            </span>
          ) : (
            <span className={`text-sm font-medium truncate flex-1 ${isSearchMatch ? 'text-yellow-800' : ''}`}>{node.name}</span>
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
      
      {/* Context Menu - rendered via Portal to ensure it's on top of everything */}
      {contextMenu.show && createPortal(
        <div 
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y, zIndex: 99999 }}
        >
          <button
            onClick={handleFilterOn}
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
            data-testid="context-menu-filter-on"
          >
            <Filter className="w-4 h-4" />
            {t?.("hierarchy.filterOn") || "Filter on"}
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={handleShowDetails}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700 hover:text-slate-900"
            data-testid="context-menu-show-details"
          >
            <Info className="w-4 h-4" />
            {t?.("hierarchy.showDetails") || "Show Details"}
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={handleAddThreatClick}
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
            data-testid="context-menu-add-threat"
          >
            <Plus className="w-4 h-4" />
            {t?.("hierarchy.addThreat") || "Add Observation"}
          </button>
        </div>,
        document.body
      )}

      {/* Details Popup - rendered via Portal to ensure it's on top of everything */}
      {showDetails && (
        <EquipmentDetailsDialog
          open={showDetails}
          onClose={() => setShowDetails(false)}
          node={node}
          config={config}
          critColor={critColor}
          t={t}
          getCriticalityDetails={getCriticalityDetails}
          getEquipmentTypeName={getEquipmentTypeName}
          getDisciplineDisplay={getDisciplineDisplay}
          onEditEquipment={onEditEquipment}
        />
      )}
      
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

  const { data: filesData } = useQuery({
    queryKey: ["equipment-files", node.id],
    queryFn: () => equipmentHierarchyAPI.getEquipmentFiles(node.id),
    enabled: open && !!node.id,
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => equipmentHierarchyAPI.uploadEquipmentFile(node.id, file),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["equipment-files", node.id] }); toast.success("File uploaded"); },
    onError: (e) => toast.error(e.response?.data?.detail || "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId) => equipmentHierarchyAPI.deleteEquipmentFile(fileId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["equipment-files", node.id] }); toast.success("Deleted"); },
    onError: () => toast.error("Delete failed"),
  });

  const handleDownload = async (fileId, filename) => {
    try {
      const blob = await equipmentHierarchyAPI.downloadEquipmentFile(fileId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Download failed"); }
  };

  const handleView = async (file) => {
    try {
      const blob = await equipmentHierarchyAPI.downloadEquipmentFile(file.id);
      const url = window.URL.createObjectURL(blob);
      setPreviewFile({ url, filename: file.filename, contentType: file.content_type, fileId: file.id });
    } catch { toast.error("Could not load file"); }
  };

  const files = filesData?.files || [];

  return (
    <>
    <Dialog open={open && !previewFile} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-sm sm:max-w-md max-h-[85vh] overflow-y-auto p-4 sm:p-6" data-testid="equipment-details-dialog">
        <DialogHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              node.criticality?.level === "safety_critical" ? "bg-red-100" :
              node.criticality?.level === "production_critical" ? "bg-orange-100" :
              node.criticality?.level === "medium" ? "bg-yellow-100" : "bg-slate-100"
            }`}>
              <Icon className={`w-5 h-5 ${critColor || config.color}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm leading-tight">{node.name}</DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">{config.label}</p>
            </div>
          </div>
        </DialogHeader>

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
            {getCriticalityDetails() ? (
              <div className="grid grid-cols-4 gap-1 mt-1">
                {[
                  { icon: Shield, color: "red", val: getCriticalityDetails().safety },
                  { icon: Cog, color: "orange", val: getCriticalityDetails().production },
                  { icon: Leaf, color: "green", val: getCriticalityDetails().environmental },
                  { icon: Star, color: "purple", val: getCriticalityDetails().reputation },
                ].map(({ icon: CIcon, color, val }) => (
                  <div key={color} className="text-center flex flex-col items-center gap-0.5">
                    <CIcon className={`w-3.5 h-3.5 text-${color}-500`} />
                    <div className="flex gap-px">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`w-1.5 h-3 rounded-sm ${i <= val ? `bg-${color}-500` : "bg-slate-200"}`} />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500">{val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-slate-400 italic">No criticality assigned</span>
            )}
          </div>

          {node.description && (
            <div>
              <label className="text-xs text-slate-500 block mb-1">Description</label>
              <p className="text-sm text-slate-600">{node.description}</p>
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

        <div className="pt-3 border-t border-slate-200 mt-2">
          <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { onClose(); onEditEquipment?.(node.id); }} data-testid="edit-equipment-btn">
            <Settings className="w-4 h-4 mr-2" />
            {t ? t("hierarchy.editInManager") : "Edit in Equipment Manager"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* File Preview Dialog */}
    {previewFile && (
      <Dialog open={!!previewFile} onOpenChange={() => { if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url); setPreviewFile(null); }}>
        <DialogContent className="w-[92vw] max-w-3xl max-h-[90vh] p-0 overflow-hidden" data-testid="file-preview-dialog">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm truncate pr-10">{previewFile.filename}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 overflow-auto touch-pan-x touch-pan-y" style={{ maxHeight: "calc(90vh - 70px)", WebkitOverflowScrolling: "touch" }}>
            {previewFile.contentType?.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.filename} className="max-w-full object-contain rounded-lg" style={{ touchAction: "pinch-zoom", maxHeight: "75vh" }} />
            ) : previewFile.contentType?.includes("pdf") ? (
              <iframe src={previewFile.url} title={previewFile.filename} className="w-full rounded-lg border" style={{ height: "75vh", minHeight: "300px" }} />
            ) : (previewFile.contentType?.includes("presentation") || previewFile.contentType?.includes("powerpoint") || previewFile.contentType?.includes("ppt")
              || previewFile.contentType?.includes("spreadsheet") || previewFile.contentType?.includes("excel")
              || previewFile.contentType?.includes("msword") || previewFile.contentType?.includes("wordprocessing")) ? (
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(window.location.origin + "/api/equipment-files/" + previewFile.fileId + "/view")}`}
                title={previewFile.filename}
                className="w-full rounded-lg border"
                style={{ height: "75vh", minHeight: "300px" }}
              />
            ) : (
              <p className="text-sm text-slate-500 py-8">Preview not available for this file type</p>
            )}
          </div>
          <div className="px-4 pb-3 border-t border-slate-100 pt-2">
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { const a = document.createElement("a"); a.href = previewFile.url; a.download = previewFile.filename; a.click(); }}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Download {previewFile.filename}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}


// ISO Level Summary Item
const LevelSummaryItem = ({ level, count, isActive, onClick }) => {
  const config = ISO_LEVEL_CONFIG[level] || ISO_LEVEL_CONFIG[normalizeLevel(level)] || { 
    icon: Cog, 
    label: level ? level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : "Item", 
    color: "text-slate-600" 
  };
  const Icon = config.icon;
  
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors w-full text-left ${
        isActive ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-600"
      }`}
      data-testid={`iso-level-${level}`}
    >
      <Icon className={`w-4 h-4 ${config.color}`} />
      <span className="text-sm font-medium flex-1">{config.label}</span>
      <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
        {count}
      </span>
    </button>
  );
};

const EquipmentHierarchy = ({ isOpen, onClose, isMobile = false, onAddThreat }) => {
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
  const [viewMode, setViewMode] = useState("tree"); // "tree" or "levels"
  const [filterLevel, setFilterLevel] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [preSearchExpandedNodes, setPreSearchExpandedNodes] = useState(null);

  // Fetch equipment hierarchy nodes
  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 30000,
  });

  // Fetch equipment types for details popup
  const { data: typesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 60000,
  });

  // Fetch threats to show counts
  const { data: threats = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });

  const nodes = nodesData?.nodes || [];
  const equipmentTypes = typesData?.equipment_types || [];
  const threatCountByAsset = useMemo(() => getThreatCountByAsset(threats), [threats]);
  
  // Build tree structure
  const treeData = useMemo(() => buildTreeData(nodes), [nodes]);
  
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
        setPreSearchExpandedNodes(new Set(expandedNodes));
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
            onAddThreat={onAddThreat}
            onEditEquipment={handleEditEquipment}
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between p-3 border-b border-slate-200 flex-shrink-0 ${isMobile ? 'bg-white sticky top-0 z-10' : ''}`}>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">{isMobile ? 'Equipment Hierarchy' : 'Hierarchy'}</h2>
        </div>
        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <Button
            variant={viewMode === "tree" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => { setViewMode("tree"); setFilterLevel(null); setSearchQuery(""); }}
          >
            Tree
          </Button>
          <Button
            variant={viewMode === "levels" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => { setViewMode("levels"); setSearchQuery(""); }}
          >
            Levels
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
              placeholder="Search equipment..."
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
              {matchingIds.size} {matchingIds.size === 1 ? 'match' : 'matches'}
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
                Hierarchy Levels
              </div>
              {ISO_LEVEL_ORDER.map(level => (
                <LevelSummaryItem
                  key={level}
                  level={level}
                  count={levelCounts[level] || 0}
                  isActive={filterLevel === level}
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
                      Showing: {ISO_LEVEL_CONFIG[filterLevel]?.label || filterLevel}
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
                  <p className="text-sm font-medium">No equipment hierarchy</p>
                  <p className="text-xs mt-1">Go to Equipment Manager to create hierarchy</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/equipment-manager")}
                  >
                    Open Equipment Manager
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        {isMobile && (
          <p className="text-xs text-slate-400 mb-2 text-center">
            Tap item for options • Tap arrow to expand
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            <span className="font-medium">{nodes.length}</span> items
          </span>
          <button
            onClick={() => { navigate("/equipment-manager"); if (isMobile) onClose?.(); }}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Manage
          </button>
        </div>
      </div>
    </div>
  );

  // Mobile: render full-screen overlay
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
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
