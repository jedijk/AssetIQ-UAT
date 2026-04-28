import { useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../../contexts/LanguageContext";
import { failureModesAPI, qrCodeAPI, equipmentHierarchyAPI } from "../../lib/api";
import {
  Settings, Cog, Check, Edit, GripVertical, Trash2, ChevronDown, Sparkles, Eye, Search, AlertTriangle, QrCode, Info,
  Paperclip, Upload, Download, FileText, Image, File as FileIcon, X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { QRCodeDialog } from "./QRCodeDialog";
import { DocumentViewer } from "../DocumentViewer";
import { getBackendUrl } from "../../lib/apiConfig";

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

// Criticality scale descriptions per dimension (ISO 14224 aligned)
const CRITICALITY_SCALES = {
  safety: {
    1: { label: "Negligible", desc: "No injury risk, no health impact" },
    2: { label: "Minor", desc: "First aid level injury, minor discomfort" },
    3: { label: "Moderate", desc: "Medical treatment required, restricted work" },
    4: { label: "Major", desc: "Serious injury, permanent disability possible" },
    5: { label: "Catastrophic", desc: "Fatality or multiple severe injuries" },
  },
  production: {
    1: { label: "Negligible", desc: "No production loss, no impact on output" },
    2: { label: "Minor", desc: "< 1 day production loss, easily recoverable" },
    3: { label: "Moderate", desc: "1-3 days production loss, partial shutdown" },
    4: { label: "Major", desc: "3-7 days loss, full unit shutdown" },
    5: { label: "Catastrophic", desc: "> 7 days loss, plant-wide shutdown" },
  },
  environmental: {
    1: { label: "Negligible", desc: "No release, no environmental effect" },
    2: { label: "Minor", desc: "Small contained release, no off-site impact" },
    3: { label: "Moderate", desc: "Moderate release, local cleanup required" },
    4: { label: "Major", desc: "Significant release, regulatory reporting" },
    5: { label: "Catastrophic", desc: "Major spill/emission, lasting ecosystem damage" },
  },
  reputation: {
    1: { label: "Negligible", desc: "No external awareness, no media interest" },
    2: { label: "Minor", desc: "Local community awareness, minor complaint" },
    3: { label: "Moderate", desc: "Regional media coverage, customer concern" },
    4: { label: "Major", desc: "National media, regulatory scrutiny, contract risk" },
    5: { label: "Catastrophic", desc: "International coverage, license/permit threat" },
  },
};

const CriticalityDimension = ({ label, color, value, onClick, dimension }) => {
  const scale = CRITICALITY_SCALES[dimension];
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <span className={`text-xs font-medium text-${color}-700`}>{label}</span>
          {scale && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-${color}-100 transition-colors`}
                  data-testid={`criticality-info-${dimension}`}
                >
                  <Info className={`h-3 w-3 text-${color}-400 hover:text-${color}-600`} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-64 p-0" sideOffset={8}>
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className={`text-xs font-semibold text-${color}-700`}>{label} Impact Scale</p>
                </div>
                <div className="p-2 space-y-0.5">
                  {[1, 2, 3, 4, 5].map(level => (
                    <div
                      key={level}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                        value === level ? `bg-${color}-50 ring-1 ring-${color}-200` : "hover:bg-slate-50"
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center h-4 w-4 rounded text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                        value >= level ? `bg-${color}-500 text-white` : `bg-${color}-100 text-${color}-600`
                      }`}>
                        {level}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">{scale[level].label}</span>
                        <p className="text-slate-500 leading-tight">{scale[level].desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <span className="text-xs text-slate-500">{value || 0}/5</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(level => (
          <TooltipProvider key={level} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onClick(level)}
                  className={`flex-1 h-6 rounded transition-all ${
                    (value || 0) >= level 
                      ? `bg-${color}-500` 
                      : `bg-${color}-100 hover:bg-${color}-200`
                  }`}
                  data-testid={`criticality-${dimension}-${level}`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-48">
                {scale ? (
                  <p><span className="font-semibold">{level}:</span> {scale[level].label}</p>
                ) : (
                  <p>{label}: {level}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
};


function getFileIcon(contentType) {
  if (contentType?.startsWith("image/")) return Image;
  if (contentType?.includes("pdf")) return FileText;
  if (contentType?.includes("presentation") || contentType?.includes("powerpoint") || contentType?.includes("ppt")) return FileText;
  return FileIcon;
}

function canPreviewFile(contentType) {
  if (!contentType) return false;
  if (contentType.startsWith("image/")) return true;
  if (contentType.includes("pdf")) return true;
  if (contentType.includes("presentation") || contentType.includes("powerpoint") || contentType.includes("ppt")) return true;
  // DocumentViewer supports Office docs by fetching as blob
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("xls")) return true;
  if (contentType.includes("msword") || contentType.includes("wordprocessing") || contentType.includes("doc")) return true;
  if (contentType.includes("csv")) return true;
  return false;
}

function isOfficeFile(contentType) {
  if (!contentType) return false;
  return contentType.includes("presentation") || contentType.includes("powerpoint") || contentType.includes("ppt")
    || contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("xls")
    || contentType.includes("msword") || contentType.includes("wordprocessing") || contentType.includes("doc");
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EquipmentFiles({ equipmentId }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null);

  const { data } = useQuery({
    queryKey: ["equipment-files", equipmentId],
    queryFn: () => equipmentHierarchyAPI.getEquipmentFiles(equipmentId),
    enabled: !!equipmentId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => equipmentHierarchyAPI.uploadEquipmentFile(equipmentId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-files", equipmentId] });
      toast.success("File uploaded");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId) => equipmentHierarchyAPI.deleteEquipmentFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-files", equipmentId] });
      toast.success("File deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleDownload = async (fileId, filename) => {
    try {
      const blob = await equipmentHierarchyAPI.downloadEquipmentFile(fileId);
      const url = window.URL.createObjectURL(blob);
      const ua = typeof navigator !== "undefined" ? (navigator.userAgent || "") : "";
      const isIOSLike = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);

      if (isIOSLike) {
        // iOS Safari often ignores `a.download` for blob URLs; open the blob so the user can
        // Save/Share from the viewer.
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
    } catch {
      toast.error("Download failed");
    }
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

  const files = data?.files || [];
  const Icon = Paperclip;

  return (
    <>
    <div className="pt-4 border-t border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Files</span>
          {files.length > 0 && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{files.length}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          data-testid="upload-equipment-file-btn"
        >
          <Upload className="w-3.5 h-3.5 mr-1" />
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { uploadMutation.mutate(f); e.target.value = ""; }
          }}
        />
      </div>

      {files.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-3">No files attached</p>
      ) : (
        <div className="space-y-1">
          {files.map((f) => {
            const FIcon = getFileIcon(f.content_type);
            const canView = canPreviewFile(f.content_type);
            return (
              <div
                key={f.id}
                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-slate-50 group"
                data-testid={`equipment-file-${f.id}`}
              >
                <FIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 truncate">{f.filename}</p>
                  <p className="text-[10px] text-slate-400">{formatFileSize(f.size)}</p>
                </div>
                {canView && (
                  <button
                    className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => handleView(f)}
                    title="View"
                    data-testid={`view-file-${f.id}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => handleDownload(f.id, f.filename)}
                  title="Download"
                  data-testid={`download-file-${f.id}`}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => deleteMutation.mutate(f.id)}
                  title="Delete"
                  data-testid={`delete-file-${f.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {previewFile && createPortal(
      <DocumentViewer
        document={previewFile}
        onClose={() => setPreviewFile(null)}
        onBack={() => setPreviewFile(null)}
      />,
      document.body
    )}
    </>
  );
}


export function PropertiesPanel({ node, equipmentTypes, onUpdate, onAssignCriticality, onDelete, allNodes }) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTag, setEditTag] = useState("");
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
  
  const handleSave = () => { onUpdate(node.id, { name: editName, description: editDesc, tag: editTag }); setIsEditing(false); };
  const startEdit = () => { setEditName(node.name); setEditDesc(node.description || ""); setEditTag(node.tag || ""); setIsEditing(true); };
  
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
              <h3 className="font-semibold text-slate-800 truncate">
                {node.tag && (
                  <>
                    <span className="font-mono text-slate-500 font-normal">
                      {node.level === 'maintainable_item' && node.tag.includes('-') 
                        ? node.tag.split('-').pop() 
                        : node.tag}
                    </span>
                    <span className="mx-1 text-slate-300">-</span>
                  </>
                )}
                {node.name}
              </h3>
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
          
          <div>
            <Label className="text-xs text-slate-500 mb-1">{t("common.tag") || "Tag"}</Label>
            {isEditing ? (
              <Input value={editTag} onChange={e => setEditTag(e.target.value)} placeholder="Add tag (e.g., P-101, HX-201)..." className="h-8 text-sm" data-testid="edit-tag-input" />
            ) : (
              <p className="text-sm text-slate-700">{node.tag || <span className="text-slate-400 italic">No tag</span>}</p>
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
                dimension="safety"
                value={node.criticality?.safety_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, safety_impact: node.criticality?.safety_impact === level ? null : level })}
              />
              <CriticalityDimension
                label={t("equipment.productionImpact") || "Production"}
                color="orange"
                dimension="production"
                value={node.criticality?.production_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, production_impact: node.criticality?.production_impact === level ? null : level })}
              />
              <CriticalityDimension
                label={t("equipment.environmentalImpact") || "Environmental"}
                color="green"
                dimension="environmental"
                value={node.criticality?.environmental_impact}
                onClick={(level) => onAssignCriticality(node.id, { ...node.criticality, environmental_impact: node.criticality?.environmental_impact === level ? null : level })}
              />
              <CriticalityDimension
                label={t("equipment.reputationImpact") || "Reputation"}
                color="purple"
                dimension="reputation"
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
          
          {/* Files Section */}
          <EquipmentFiles equipmentId={node.id} />

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
