import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { processImportAPI } from "../../lib/apis/processImport";
import { toast } from "sonner";
import {
  Upload, FileText, Image, X, CheckCircle, AlertTriangle, ChevronRight, ChevronDown,
  Loader2, Sparkles, Zap, Brain, Building2, Factory, Settings, Cog, Box, Wrench,
  Download, Check, XCircle, Edit2, Info, AlertCircle, Plus, Trash2, TreePine,
  Shield, Gauge, Leaf, Star, Eye,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";

// Level icons
const LEVEL_ICONS = {
  "Plant/Unit": Factory,
  "Section/System": Settings,
  "Equipment Unit": Cog,
  "Subunit": Box,
  "Maintainable Item": Wrench,
};

const LEVEL_COLORS = {
  "Plant/Unit": "bg-purple-100 text-purple-700 border-purple-200",
  "Section/System": "bg-blue-100 text-blue-700 border-blue-200",
  "Equipment Unit": "bg-green-100 text-green-700 border-green-200",
  "Subunit": "bg-amber-100 text-amber-700 border-amber-200",
  "Maintainable Item": "bg-slate-100 text-slate-700 border-slate-200",
};

// Confidence badge
const ConfidenceBadge = ({ score }) => {
  let color = "bg-red-100 text-red-700";
  if (score >= 90) color = "bg-green-100 text-green-700";
  else if (score >= 70) color = "bg-yellow-100 text-yellow-700";
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score}%
    </span>
  );
};

// Criticality display
const CriticalityDisplay = ({ criticality, compact = false }) => {
  if (!criticality) return null;
  
  const items = [
    { key: "safety", label: "S", icon: Shield, color: "text-red-600" },
    { key: "production", label: "P", icon: Gauge, color: "text-orange-600" },
    { key: "environmental", label: "E", icon: Leaf, color: "text-green-600" },
    { key: "reputation", label: "R", icon: Star, color: "text-blue-600" },
  ];
  
  if (compact) {
    return (
      <div className="flex gap-1">
        {items.map(({ key, label, color }) => (
          <span key={key} className={`text-xs font-medium ${color}`}>
            {label}:{criticality[key] || 0}
          </span>
        ))}
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ key, label, icon: Icon, color }) => (
        <div key={key} className="text-center">
          <Icon className={`w-4 h-4 mx-auto ${color}`} />
          <span className="text-xs text-slate-500">{label}</span>
          <p className="text-lg font-bold">{criticality[key] || 0}</p>
        </div>
      ))}
    </div>
  );
};

// KPI Card
const KPICard = ({ label, value, icon: Icon, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-50 text-slate-600",
  };
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
};

// Tree node component
const TreeNode = ({ item, items, level = 0, onSelect, selectedId, onAccept, onReject }) => {
  const [expanded, setExpanded] = useState(true);
  const children = items.filter(i => i.parent_id === item.item_id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === item.item_id;
  const LevelIcon = LEVEL_ICONS[item.level] || Cog;
  
  const statusColors = {
    pending: "border-l-slate-300",
    accepted: "border-l-green-500",
    rejected: "border-l-red-400",
    edited: "border-l-blue-500",
  };
  
  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors border-l-4 ${
          statusColors[item.review_status] || statusColors.pending
        } ${isSelected ? "bg-blue-50 border-blue-300" : "hover:bg-slate-50"}`}
        style={{ marginLeft: level * 20 }}
        onClick={() => onSelect(item)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-0.5 hover:bg-slate-200 rounded"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        <LevelIcon className="w-4 h-4 text-slate-500" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-slate-900 truncate">{item.tag}</span>
            <Badge className={`text-xs ${LEVEL_COLORS[item.level] || "bg-slate-100"}`}>
              {item.level}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 truncate">{item.name}</p>
        </div>
        
        <ConfidenceBadge score={item.confidence} />
        
        {item.review_status === "pending" && (
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAccept(item.item_id); }}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject(item.item_id); }}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {item.review_status === "accepted" && (
          <Badge className="bg-green-100 text-green-700 text-xs">
            <Check className="w-3 h-3 mr-1" />Accepted
          </Badge>
        )}
        
        {item.review_status === "rejected" && (
          <Badge className="bg-red-100 text-red-700 text-xs">
            <X className="w-3 h-3 mr-1" />Rejected
          </Badge>
        )}
      </div>
      
      {hasChildren && expanded && (
        <div>
          {children.map(child => (
            <TreeNode
              key={child.item_id}
              item={child}
              items={items}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Detail panel
const DetailPanel = ({ item, onUpdate, onClose }) => {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(item);
  
  useEffect(() => {
    setFormData(item);
    setEditing(false);
  }, [item]);
  
  const handleSave = async () => {
    await onUpdate(item.item_id, formData);
    setEditing(false);
  };
  
  if (!item) return null;
  
  const LevelIcon = LEVEL_ICONS[item.level] || Cog;
  
  return (
    <div className="w-96 border-l border-slate-200 bg-white flex flex-col">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LevelIcon className="w-5 h-5 text-slate-600" />
          <span className="font-semibold">{item.tag}</span>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit2 className="w-4 h-4 mr-1" /> Edit
            </Button>
          )}
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        {editing ? (
          <div className="space-y-4">
            <div>
              <Label>Tag / ID</Label>
              <Input
                value={formData.tag}
                onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Level</Label>
              <Select
                value={formData.level}
                onValueChange={(v) => setFormData({ ...formData, level: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(LEVEL_ICONS).map(level => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Equipment Type</Label>
              <Input
                value={formData.equipment_type || ""}
                onChange={(e) => setFormData({ ...formData, equipment_type: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            
            <div className="border-t pt-4">
              <Label className="mb-2 block">Criticality Scores (0-5)</Label>
              <div className="grid grid-cols-2 gap-3">
                {["safety", "production", "environmental", "reputation"].map(key => (
                  <div key={key}>
                    <Label className="text-xs capitalize">{key}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      value={formData.criticality?.[key] || 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        criticality: { ...formData.criticality, [key]: parseInt(e.target.value) || 0 }
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">Save Changes</Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Name</p>
              <p className="font-medium">{item.name}</p>
            </div>
            
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-slate-500">Level</p>
                <Badge className={LEVEL_COLORS[item.level]}>{item.level}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Type</p>
                <p className="font-medium">{item.equipment_type || "-"}</p>
              </div>
            </div>
            
            {item.description && (
              <div>
                <p className="text-xs text-slate-500">Description</p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
            
            <div className="border-t pt-4">
              <p className="text-xs text-slate-500 mb-2">Criticality</p>
              <CriticalityDisplay criticality={item.criticality} />
            </div>
            
            <div className="border-t pt-4">
              <p className="text-xs text-slate-500 mb-1">Confidence</p>
              <div className="flex items-center gap-2">
                <ConfidenceBadge score={item.confidence} />
                <span className="text-sm text-slate-600">
                  {item.source === "detected" ? "AI Detected" : 
                   item.source === "template" ? "From Template" : "Manual"}
                </span>
              </div>
            </div>
            
            {item.ai_reasoning && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Brain className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-blue-700 mb-1">AI Reasoning</p>
                    <p className="text-sm text-blue-800">{item.ai_reasoning}</p>
                  </div>
                </div>
              </div>
            )}
            
            {item.criticality_reasoning && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">Criticality Reasoning</p>
                <p className="text-sm text-amber-800">{item.criticality_reasoning}</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

// Main wizard component
export const ProcessImportWizard = ({ isOpen, onClose, onImportComplete, installations = [] }) => {
  const [step, setStep] = useState(1);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [processingStep, setProcessingStep] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [activeTab, setActiveTab] = useState("hierarchy");
  const [selectedInstallation, setSelectedInstallation] = useState("");
  
  // Options
  const [options, setOptions] = useState({
    generate_subunits: true,
    generate_maintainable_items: false,
    estimate_criticality: true,
  });
  
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);
  
  const supportedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
  
  // Reset on close
  const handleClose = () => {
    setStep(1);
    setSelectedFile(null);
    setSessionId(null);
    setSession(null);
    setProcessingStep(1);
    setSelectedItem(null);
    setImportResult(null);
    setActiveTab("hierarchy");
    setSelectedInstallation("");
    if (pollingRef.current) clearInterval(pollingRef.current);
    onClose();
  };
  
  // File handling
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) validateAndSetFile(file);
  };
  
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };
  
  const validateAndSetFile = (file) => {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!supportedExtensions.includes(ext)) {
      toast.error("Unsupported file type. Please use PDF or image files.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 50MB.");
      return;
    }
    setSelectedFile(file);
  };
  
  // Upload and process
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setStep(2);
    setProcessingStep(1);
    
    try {
      const result = await processImportAPI.upload(selectedFile, options);
      setSessionId(result.session_id);
      pollSession(result.session_id);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.detail || "Failed to upload file");
      setStep(1);
    }
  };
  
  // Poll session
  const pollSession = async (sid) => {
    const poll = async () => {
      try {
        const sess = await processImportAPI.getSession(sid);
        setSession(sess);
        
        if (sess.progress < 30) setProcessingStep(1);
        else if (sess.progress < 50) setProcessingStep(2);
        else if (sess.progress < 70) setProcessingStep(3);
        else if (sess.progress < 90) setProcessingStep(4);
        else setProcessingStep(5);
        
        if (sess.status === "ready_for_review") {
          clearInterval(pollingRef.current);
          setStep(3);
        } else if (sess.status === "error") {
          clearInterval(pollingRef.current);
          toast.error(sess.error_message || "Processing failed");
          setStep(1);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    
    await poll();
    pollingRef.current = setInterval(poll, 2000);
  };
  
  // Item actions
  const handleAcceptItem = async (itemId) => {
    try {
      const result = await processImportAPI.acceptItem(sessionId, itemId);
      setSession(prev => ({
        ...prev,
        hierarchy_items: prev.hierarchy_items.map(i =>
          i.item_id === itemId ? { ...i, review_status: "accepted" } : i
        ),
        stats: result.stats,
      }));
    } catch (error) {
      toast.error("Failed to accept item");
    }
  };
  
  const handleRejectItem = async (itemId) => {
    try {
      const result = await processImportAPI.rejectItem(sessionId, itemId);
      setSession(prev => ({
        ...prev,
        hierarchy_items: prev.hierarchy_items.map(i =>
          i.item_id === itemId ? { ...i, review_status: "rejected" } : i
        ),
        stats: result.stats,
      }));
    } catch (error) {
      toast.error("Failed to reject item");
    }
  };
  
  const handleUpdateItem = async (itemId, updates) => {
    try {
      await processImportAPI.updateItem(sessionId, itemId, updates);
      const sess = await processImportAPI.getSession(sessionId);
      setSession(sess);
      toast.success("Item updated");
    } catch (error) {
      toast.error("Failed to update item");
    }
  };
  
  const handleAcceptAll = async () => {
    try {
      const result = await processImportAPI.acceptAll(sessionId, 70);
      toast.success(`Accepted ${result.accepted_count} items`);
      const sess = await processImportAPI.getSession(sessionId);
      setSession(sess);
    } catch (error) {
      toast.error("Failed to accept items");
    }
  };
  
  // Export
  const handleExportCSV = async () => {
    try {
      const blob = await processImportAPI.exportCSV(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hierarchy_${sessionId.slice(0, 8)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch (error) {
      toast.error("Export failed");
    }
  };
  
  const handleExportExcel = async () => {
    try {
      const blob = await processImportAPI.exportExcel(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hierarchy_${sessionId.slice(0, 8)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Excel exported");
    } catch (error) {
      toast.error("Export failed");
    }
  };
  
  // Import
  const handleImport = async () => {
    if (!selectedInstallation) {
      toast.error("Please select a target installation");
      return;
    }
    
    setImporting(true);
    try {
      const result = await processImportAPI.importToAssetIQ(sessionId, selectedInstallation);
      setImportResult(result);
      setStep(4);
      toast.success("Import complete!");
      if (onImportComplete) onImportComplete(result);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };
  
  // Get root items for tree
  const rootItems = session?.hierarchy_items?.filter(i => !i.parent_id) || [];
  
  // Stats
  const acceptedCount = session?.hierarchy_items?.filter(i => 
    i.review_status === "accepted" || i.review_status === "edited"
  ).length || 0;
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TreePine className="w-5 h-5 text-green-600" />
            Import Process Diagram
          </DialogTitle>
          <DialogDescription>
            Upload process documentation and AssetIQ will automatically build an ISO 14224-aligned asset hierarchy.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="p-6 space-y-6">
              <div
                className={`relative border-2 border-dashed rounded-xl p-12 transition-all ${
                  dragActive ? "border-green-500 bg-green-50" :
                  selectedFile ? "border-green-300 bg-green-50" : "border-slate-300 hover:border-slate-400"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={supportedExtensions.join(",")}
                  onChange={handleFileSelect}
                />
                
                <div className="text-center">
                  {selectedFile ? (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-xl flex items-center justify-center">
                        <FileText className="w-8 h-8 text-green-600" />
                      </div>
                      <p className="text-lg font-medium text-slate-900 mb-1">{selectedFile.name}</p>
                      <p className="text-sm text-slate-500 mb-4">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setSelectedFile(null)}>
                        Choose Different File
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Upload className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-lg font-medium text-slate-700 mb-1">
                        Drag and drop your process diagram
                      </p>
                      <p className="text-sm text-slate-500 mb-4">
                        PFD, P&ID, process schematic, or engineering diagram
                      </p>
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                        Browse Files
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Supported formats */}
              <div className="flex items-center justify-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  PDF
                </div>
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Images (.png, .jpg)
                </div>
              </div>
              
              {/* Options */}
              <div className="border rounded-lg p-4 space-y-3">
                <p className="font-medium text-sm">Processing Options</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="subunits"
                    checked={options.generate_subunits}
                    onCheckedChange={(v) => setOptions({ ...options, generate_subunits: v })}
                  />
                  <Label htmlFor="subunits" className="text-sm">
                    Auto-generate subunits from equipment templates
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="mi"
                    checked={options.generate_maintainable_items}
                    onCheckedChange={(v) => setOptions({ ...options, generate_maintainable_items: v })}
                  />
                  <Label htmlFor="mi" className="text-sm">
                    Auto-generate maintainable items
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="crit"
                    checked={options.estimate_criticality}
                    onCheckedChange={(v) => setOptions({ ...options, estimate_criticality: v })}
                  />
                  <Label htmlFor="crit" className="text-sm">
                    AI-estimate criticality scores
                  </Label>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button
                  disabled={!selectedFile}
                  onClick={handleUpload}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Step 2: Processing */}
          {step === 2 && (
            <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-green-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-green-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <TreePine className="w-10 h-10 text-green-600" />
                </div>
              </div>
              
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Analyzing Process Diagram
              </h3>
              <p className="text-slate-500 mb-8">
                {session?.progress_message || "Processing your file..."}
              </p>
              
              <div className="w-full max-w-md mb-8">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>Progress</span>
                  <span>{session?.progress || 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-green-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${session?.progress || 0}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                {[
                  "Reading process documentation",
                  "Detecting equipment tags",
                  "Building hierarchy structure",
                  "Mapping ISO 14224 levels",
                  "Estimating criticality",
                ].map((label, i) => (
                  <div key={i} className={`flex items-center gap-2 ${
                    processingStep > i + 1 ? "text-green-600" :
                    processingStep === i + 1 ? "text-green-600 font-medium" : "text-slate-400"
                  }`}>
                    {processingStep > i + 1 ? (
                      <Check className="w-4 h-4" />
                    ) : processingStep === i + 1 ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="w-4 h-4 flex items-center justify-center text-xs">{i + 1}</span>
                    )}
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Step 3: Review */}
          {step === 3 && session && (
            <div className="flex flex-col h-full max-h-[70vh]">
              {/* KPI Cards */}
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="grid grid-cols-7 gap-2">
                  <KPICard label="Total Items" value={session.stats?.total_items || 0} icon={TreePine} color="blue" />
                  <KPICard label="Plants/Units" value={session.stats?.plants || 0} icon={Factory} color="purple" />
                  <KPICard label="Systems" value={session.stats?.systems || 0} icon={Settings} color="blue" />
                  <KPICard label="Equipment" value={session.stats?.equipment || 0} icon={Cog} color="green" />
                  <KPICard label="Subunits" value={session.stats?.subunits || 0} icon={Box} color="amber" />
                  <KPICard label="Low Confidence" value={session.stats?.low_confidence || 0} icon={AlertTriangle} color="amber" />
                  <KPICard label="Exceptions" value={session.stats?.exceptions || 0} icon={AlertCircle} color="red" />
                </div>
              </div>
              
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 border-b">
                  <TabsList>
                    <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                    <TabsTrigger value="criticality">Criticality</TabsTrigger>
                    <TabsTrigger value="exceptions">Exceptions ({session.exceptions?.length || 0})</TabsTrigger>
                    <TabsTrigger value="preview">Import Preview</TabsTrigger>
                  </TabsList>
                </div>
                
                {/* Hierarchy Tab */}
                <TabsContent value="hierarchy" className="flex-1 flex overflow-hidden m-0">
                  {/* Toolbar */}
                  <div className="w-full flex flex-col">
                    <div className="p-2 border-b flex items-center justify-between bg-white">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={handleAcceptAll}>
                          <CheckCircle className="w-4 h-4 mr-1" /> Accept All (≥70%)
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleExportCSV}>
                          <Download className="w-4 h-4 mr-1" /> Export CSV
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleExportExcel}>
                          <Download className="w-4 h-4 mr-1" /> Export Excel
                        </Button>
                      </div>
                      <span className="text-sm text-slate-500">
                        <span className="font-medium text-green-600">{acceptedCount}</span> of {session.hierarchy_items?.length || 0} accepted
                      </span>
                    </div>
                    
                    {/* Tree + Detail */}
                    <div className="flex-1 flex overflow-hidden">
                      <ScrollArea className="flex-1 p-4">
                        {rootItems.map(item => (
                          <TreeNode
                            key={item.item_id}
                            item={item}
                            items={session.hierarchy_items || []}
                            onSelect={setSelectedItem}
                            selectedId={selectedItem?.item_id}
                            onAccept={handleAcceptItem}
                            onReject={handleRejectItem}
                          />
                        ))}
                        {rootItems.length === 0 && (
                          <div className="text-center py-12 text-slate-500">
                            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No hierarchy items detected</p>
                          </div>
                        )}
                      </ScrollArea>
                      
                      {selectedItem && (
                        <DetailPanel
                          item={selectedItem}
                          onUpdate={handleUpdateItem}
                          onClose={() => setSelectedItem(null)}
                        />
                      )}
                    </div>
                  </div>
                </TabsContent>
                
                {/* Criticality Tab */}
                <TabsContent value="criticality" className="flex-1 overflow-auto m-0 p-4">
                  <div className="space-y-2">
                    {(session.hierarchy_items || [])
                      .filter(i => i.level === "Equipment Unit")
                      .map(item => (
                        <div key={item.item_id} className="border rounded-lg p-3 flex items-center gap-4">
                          <div className="flex-1">
                            <p className="font-medium">{item.tag}</p>
                            <p className="text-sm text-slate-500">{item.name}</p>
                          </div>
                          <CriticalityDisplay criticality={item.criticality} compact />
                          {item.criticality_reasoning && (
                            <div className="max-w-xs">
                              <p className="text-xs text-slate-500 truncate">{item.criticality_reasoning}</p>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </TabsContent>
                
                {/* Exceptions Tab */}
                <TabsContent value="exceptions" className="flex-1 overflow-auto m-0 p-4">
                  {session.exceptions?.length > 0 ? (
                    <div className="space-y-2">
                      {session.exceptions.map((exc, i) => (
                        <div key={i} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                            <div>
                              <p className="font-medium text-amber-800">{exc.type}</p>
                              <p className="text-sm text-amber-700">{exc.message}</p>
                              {exc.tag && <Badge variant="outline" className="mt-1">{exc.tag}</Badge>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                      <p>No exceptions found</p>
                    </div>
                  )}
                </TabsContent>
                
                {/* Preview Tab */}
                <TabsContent value="preview" className="flex-1 overflow-auto m-0 p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border p-2 text-left">ID or Tag</th>
                          <th className="border p-2 text-left">Name</th>
                          <th className="border p-2 text-left">Level</th>
                          <th className="border p-2 text-left">Equipment Type</th>
                          <th className="border p-2 text-left">Description</th>
                          <th className="border p-2 text-center">S</th>
                          <th className="border p-2 text-center">P</th>
                          <th className="border p-2 text-center">E</th>
                          <th className="border p-2 text-center">R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(session.hierarchy_items || [])
                          .filter(i => i.review_status !== "rejected")
                          .map(item => (
                            <tr key={item.item_id} className="hover:bg-slate-50">
                              <td className="border p-2 font-mono">{item.tag}</td>
                              <td className="border p-2">{item.name}</td>
                              <td className="border p-2">
                                <Badge className={LEVEL_COLORS[item.level]}>{item.level}</Badge>
                              </td>
                              <td className="border p-2">{item.equipment_type}</td>
                              <td className="border p-2 max-w-xs truncate">{item.description}</td>
                              <td className="border p-2 text-center">{item.criticality?.safety || 0}</td>
                              <td className="border p-2 text-center">{item.criticality?.production || 0}</td>
                              <td className="border p-2 text-center">{item.criticality?.environmental || 0}</td>
                              <td className="border p-2 text-center">{item.criticality?.reputation || 0}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
              
              {/* Footer */}
              <div className="p-4 border-t bg-white flex justify-between">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <div className="flex items-center gap-3">
                  {installations.length > 0 && (
                    <Select value={selectedInstallation} onValueChange={setSelectedInstallation}>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select target installation..." />
                      </SelectTrigger>
                      <SelectContent>
                        {installations.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>{inst.name || inst.tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    disabled={acceptedCount === 0 || importing || (installations.length > 0 && !selectedInstallation)}
                    onClick={handleImport}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {importing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                    ) : (
                      <>Import to AssetIQ<ChevronRight className="w-4 h-4 ml-1" /></>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Step 4: Import Summary */}
          {step === 4 && importResult && (
            <div className="p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              
              <h3 className="text-2xl font-semibold text-slate-900 mb-2">Import Complete!</h3>
              <p className="text-slate-500 mb-8">Your asset hierarchy has been imported to AssetIQ.</p>
              
              <div className="max-w-md mx-auto bg-slate-50 rounded-xl p-6 mb-8">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-3xl font-bold text-green-600">{importResult.created_count}</p>
                    <p className="text-sm text-slate-500">Created</p>
                  </div>
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-3xl font-bold text-blue-600">{importResult.updated_count}</p>
                    <p className="text-sm text-slate-500">Updated</p>
                  </div>
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-3xl font-bold text-slate-400">{importResult.skipped_count}</p>
                    <p className="text-sm text-slate-500">Skipped</p>
                  </div>
                </div>
              </div>
              
              <Button onClick={handleClose} className="bg-green-600 hover:bg-green-700">Done</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessImportWizard;
