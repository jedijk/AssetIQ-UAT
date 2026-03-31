import { getBackendUrl } from '../lib/apiConfig';
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sliders, AlertTriangle, BarChart2, Eye, Info, Building2, Check, Pencil, RotateCcw, Save, X, Gauge, ArrowLeft } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { toast } from "sonner";

import { Shield, Factory, Leaf, Award } from "lucide-react";

const API_BASE_URL = getBackendUrl();

// Criticality dimension icons
const CRITICALITY_DIMENSIONS = [
  { key: "safety", icon: Shield, label: "Safety", color: "text-red-600" },
  { key: "production", icon: Factory, label: "Production", color: "text-blue-600" },
  { key: "environment", icon: Leaf, label: "Environment", color: "text-green-600" },
  { key: "reputation", icon: Award, label: "Reputation", color: "text-purple-600" },
];

// Criticality Table Component (multi-dimensional)
const CriticalityTable = ({ data, isEditing, onUpdateRow, t }) => {
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const handleEditClick = (row) => {
    setEditingRow(row.rank);
    setEditForm({ ...row });
  };

  const handleSaveRow = () => {
    if (editForm) {
      onUpdateRow("criticality", editForm);
      setEditingRow(null);
      setEditForm(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditForm(null);
  };

  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div 
          key={item.rank} 
          className={`border rounded-xl overflow-hidden transition-all ${
            editingRow === item.rank ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
          }`}
        >
          {/* Header Row */}
          <div className={`flex items-center justify-between px-4 py-3 ${item.color} bg-opacity-20`} 
               style={{ backgroundColor: item.color.includes('red') ? '#fef2f2' : 
                                         item.color.includes('orange') ? '#fff7ed' :
                                         item.color.includes('yellow') ? '#fefce8' :
                                         item.color.includes('green-5') ? '#f0fdf4' : '#ecfdf5' }}>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white font-bold text-lg ${item.color}`}>
                {item.rank}
              </span>
              {editingRow === item.rank ? (
                <Input
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  className="w-40 h-9 font-semibold"
                />
              ) : (
                <span className="font-semibold text-lg text-slate-800">{item.label}</span>
              )}
            </div>
            {isEditing && editingRow !== item.rank && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditClick(item)}
                className="h-8"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
            {editingRow === item.rank && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSaveRow}>
                  <Check className="w-4 h-4 mr-1" /> Save
                </Button>
              </div>
            )}
          </div>

          {/* Dimensions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {CRITICALITY_DIMENSIONS.map((dim) => {
              const Icon = dim.icon;
              return (
                <div key={dim.key} className="p-4">
                  <div className={`flex items-center gap-2 mb-2 ${dim.color}`}>
                    <Icon className="w-4 h-4" />
                    <span className="font-semibold text-sm">{t(`definitions.${dim.key}`) || dim.label}</span>
                  </div>
                  {editingRow === item.rank ? (
                    <Textarea
                      value={editForm[dim.key] || ""}
                      onChange={(e) => setEditForm({ ...editForm, [dim.key]: e.target.value })}
                      className="text-sm min-h-[80px]"
                      placeholder={`Enter ${dim.label.toLowerCase()} impact...`}
                    />
                  ) : (
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {item[dim.key] || "-"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// API functions
const definitionsAPI = {
  getInstallations: async () => {
    const response = await fetch(`${API_BASE_URL}/api/definitions/installations`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch installations");
    return response.json();
  },
  
  getDefinitions: async (equipmentId) => {
    const response = await fetch(`${API_BASE_URL}/api/definitions/equipment/${equipmentId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch definitions");
    return response.json();
  },
  
  getDefaults: async () => {
    const response = await fetch(`${API_BASE_URL}/api/definitions/defaults`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch defaults");
    return response.json();
  },
  
  saveDefinitions: async ({ equipmentId, severity, occurrence, detection, criticality }) => {
    const response = await fetch(`${API_BASE_URL}/api/definitions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({
        equipment_id: equipmentId,
        severity,
        occurrence,
        detection,
        criticality
      })
    });
    if (!response.ok) throw new Error("Failed to save definitions");
    return response.json();
  },
  
  resetDefinitions: async (equipmentId) => {
    const response = await fetch(`${API_BASE_URL}/api/definitions/${equipmentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to reset definitions");
    return response.json();
  }
};

// Row edit dialog component
const EditRowDialog = ({ row, type, onSave, onClose, t }) => {
  const [formData, setFormData] = useState({
    rank: row?.rank || 1,
    label: row?.label || "",
    description: row?.description || "",
    secondary_description: row?.secondary_description || "",
    color: row?.color || "bg-slate-500"
  });

  const colorOptions = [
    { value: "bg-red-600", label: "Red (Critical)" },
    { value: "bg-red-500", label: "Red (High)" },
    { value: "bg-orange-500", label: "Orange (Medium-High)" },
    { value: "bg-orange-400", label: "Orange (Medium)" },
    { value: "bg-yellow-500", label: "Yellow (Moderate)" },
    { value: "bg-yellow-400", label: "Yellow (Low-Moderate)" },
    { value: "bg-yellow-300", label: "Yellow (Light)" },
    { value: "bg-green-400", label: "Green (Low)" },
    { value: "bg-green-500", label: "Green (Very Low)" },
    { value: "bg-green-600", label: "Green (Minimal)" },
    { value: "bg-green-700", label: "Green (None)" },
  ];

  const getColumnLabels = () => {
    switch (type) {
      case "severity":
        return {
          desc: t("definitions.customerEffect"),
          secondary: t("definitions.manufacturingEffect")
        };
      case "occurrence":
        return {
          desc: t("definitions.description"),
          secondary: t("definitions.failureRate")
        };
      case "detection":
        return {
          desc: t("definitions.criteria"),
          secondary: t("definitions.detectionMethod")
        };
      case "criticality":
        return {
          desc: t("definitions.criticalityImpact") || "Impact Description",
          secondary: t("definitions.criticalityAction") || "Maintenance Strategy"
        };
      default:
        return { desc: "Description", secondary: "Secondary" };
    }
  };

  const labels = getColumnLabels();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("definitions.editRow")} - Rank {formData.rank}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">{t("definitions.ranking")}</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formData.rank}
                disabled
                className="bg-slate-50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t("definitions.label")}</label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Very High"
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700">{labels.desc}</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700">{labels.secondary}</label>
            <Textarea
              value={formData.secondary_description}
              onChange={(e) => setFormData({ ...formData, secondary_description: e.target.value })}
              rows={3}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700">Color</label>
            <Select value={formData.color} onValueChange={(val) => setFormData({ ...formData, color: val })}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${formData.color}`} />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded ${opt.value}`} />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(formData)}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Editable table component
const EditableTable = ({ type, data, isEditing, onUpdateRow, t }) => {
  const [editingRow, setEditingRow] = useState(null);

  const getHeaders = () => {
    switch (type) {
      case "severity":
        return [
          t("definitions.ranking"),
          t("definitions.effect"),
          t("definitions.customerEffect"),
          t("definitions.manufacturingEffect")
        ];
      case "occurrence":
        return [
          t("definitions.ranking"),
          t("definitions.probability"),
          t("definitions.description"),
          t("definitions.failureRate")
        ];
      case "detection":
        return [
          t("definitions.ranking"),
          t("definitions.detection"),
          t("definitions.criteria"),
          t("definitions.detectionMethod")
        ];
      case "criticality":
        return [
          t("definitions.ranking"),
          t("definitions.criticalityLevel") || "Criticality Level",
          t("definitions.criticalityImpact") || "Impact Description",
          t("definitions.criticalityAction") || "Maintenance Strategy"
        ];
      default:
        return [];
    }
  };

  const handleSaveRow = (updatedRow) => {
    onUpdateRow(type, updatedRow);
    setEditingRow(null);
  };

  return (
    <>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-[600px] px-4 sm:px-0">
          <ScrollArea className="h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  {getHeaders().map((header, idx) => (
                    <th key={idx} className={`px-3 py-3 text-left font-semibold text-slate-700 whitespace-nowrap ${idx === 0 ? 'w-16' : ''}`}>
                      {header}
                    </th>
                  ))}
                  {isEditing && <th className="px-3 py-3 w-16"></th>}
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.rank} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${item.color}`}>
                        {item.rank}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">{item.label}</td>
                    <td className="px-3 py-3 text-slate-600 min-w-[200px]">{item.description}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs min-w-[150px]">{item.secondary_description}</td>
                    {isEditing && (
                      <td className="px-3 py-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingRow(item)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </div>

      {editingRow && (
        <EditRowDialog
          row={editingRow}
          type={type}
          onSave={handleSaveRow}
          onClose={() => setEditingRow(null)}
          t={t}
        />
      )}
    </>
  );
};

export default function DefinitionsPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("criticality");
  const [selectedInstallation, setSelectedInstallation] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Check if mobile viewport
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Local state for editing
  const [localSeverity, setLocalSeverity] = useState([]);
  const [localOccurrence, setLocalOccurrence] = useState([]);
  const [localDetection, setLocalDetection] = useState([]);
  const [localCriticality, setLocalCriticality] = useState([]);

  // Queries
  const { data: installationsData, isLoading: loadingInstallations } = useQuery({
    queryKey: ["definitions-installations"],
    queryFn: definitionsAPI.getInstallations
  });

  const { data: defaultsData } = useQuery({
    queryKey: ["definitions-defaults"],
    queryFn: definitionsAPI.getDefaults
  });

  const { data: definitionsData, isLoading: loadingDefinitions } = useQuery({
    queryKey: ["definitions", selectedInstallation],
    queryFn: () => definitionsAPI.getDefinitions(selectedInstallation),
    enabled: !!selectedInstallation
  });

  // Auto-select first installation on mobile, or use defaults if none
  useEffect(() => {
    if (isMobile && !selectedInstallation) {
      if (installationsData?.installations?.length > 0) {
        setSelectedInstallation(installationsData.installations[0].id);
      } else if (defaultsData && !loadingInstallations) {
        // On mobile with no installations, use defaults directly
        setLocalSeverity(defaultsData.severity || []);
        setLocalOccurrence(defaultsData.occurrence || []);
        setLocalDetection(defaultsData.detection || []);
        setLocalCriticality(defaultsData.criticality || []);
      }
    }
  }, [isMobile, installationsData, selectedInstallation, defaultsData, loadingInstallations]);

  // Update local state when definitions change
  useEffect(() => {
    if (definitionsData) {
      setLocalSeverity(definitionsData.severity || []);
      setLocalOccurrence(definitionsData.occurrence || []);
      setLocalDetection(definitionsData.detection || []);
      setLocalCriticality(definitionsData.criticality || []);
    } else if (defaultsData && !selectedInstallation) {
      setLocalSeverity(defaultsData.severity || []);
      setLocalOccurrence(defaultsData.occurrence || []);
      setLocalDetection(defaultsData.detection || []);
      setLocalCriticality(defaultsData.criticality || []);
    }
  }, [definitionsData, defaultsData, selectedInstallation]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: definitionsAPI.saveDefinitions,
    onSuccess: () => {
      queryClient.invalidateQueries(["definitions", selectedInstallation]);
      queryClient.invalidateQueries(["definitions-installations"]);
      toast.success(t("definitions.saved"));
      setIsEditing(false);
    },
    onError: () => toast.error("Failed to save definitions")
  });

  const resetMutation = useMutation({
    mutationFn: definitionsAPI.resetDefinitions,
    onSuccess: () => {
      queryClient.invalidateQueries(["definitions", selectedInstallation]);
      queryClient.invalidateQueries(["definitions-installations"]);
      toast.success("Definitions reset to defaults");
      setShowResetConfirm(false);
      setIsEditing(false);
    },
    onError: () => toast.error("Failed to reset definitions")
  });

  const handleUpdateRow = (type, updatedRow) => {
    const updateFn = (rows) => rows.map(r => r.rank === updatedRow.rank ? updatedRow : r);
    
    switch (type) {
      case "severity":
        setLocalSeverity(updateFn);
        break;
      case "occurrence":
        setLocalOccurrence(updateFn);
        break;
      case "detection":
        setLocalDetection(updateFn);
        break;
      case "criticality":
        setLocalCriticality(updateFn);
        break;
    }
  };

  const handleSave = () => {
    if (!selectedInstallation) return;
    
    saveMutation.mutate({
      equipmentId: selectedInstallation,
      severity: localSeverity,
      occurrence: localOccurrence,
      detection: localDetection,
      criticality: localCriticality
    });
  };

  const handleReset = () => {
    if (!selectedInstallation) return;
    resetMutation.mutate(selectedInstallation);
  };

  const handleCancelEdit = () => {
    // Restore from server data
    if (definitionsData) {
      setLocalSeverity(definitionsData.severity || []);
      setLocalOccurrence(definitionsData.occurrence || []);
      setLocalDetection(definitionsData.detection || []);
      setLocalCriticality(definitionsData.criticality || []);
    }
    setIsEditing(false);
  };

  const installations = installationsData?.installations || [];
  const isCustom = definitionsData?.is_custom || false;

  return (
    <div className={`${isMobile ? 'h-[calc(100vh-64px)] flex flex-col' : ''}`}>
      {/* Fixed Header Section */}
      <div className={`${isMobile ? 'flex-shrink-0 px-4 pt-4 pb-2' : 'p-6 max-w-7xl mx-auto'}`}>
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                <Sliders className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-slate-800">
                  {t("settings.criticalityDefinitions") || "Definitions"}
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm hidden sm:block">
                  {t("definitions.pageDescription")}
                </p>
              </div>
            </div>
            
            {selectedInstallation && !isMobile && (
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                    >
                      <X className="w-4 h-4 mr-1" />
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {saveMutation.isPending ? t("definitions.saving") : t("definitions.saveChanges")}
                    </Button>
                  </>
                ) : (
                  <>
                    {isCustom && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResetConfirm(true)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        {t("definitions.resetToDefaults")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      {t("definitions.editDefinitions")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile Edit Actions - REMOVED: Read-only on mobile */}

        {/* Installation Selector - Desktop only */}
        {!isMobile && (
          <Card className="mb-4">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">
                    {t("definitions.selectInstallation")}
                  </span>
                </div>
                <div className="flex-1">
                  {loadingInstallations ? (
                    <div className="h-10 bg-slate-100 animate-pulse rounded" />
                  ) : installations.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("definitions.noInstallations")}</p>
                  ) : (
                    <Select
                      value={selectedInstallation || ""}
                      onValueChange={(val) => {
                        setSelectedInstallation(val);
                        setIsEditing(false);
                      }}
                    >
                      <SelectTrigger className="w-full" data-testid="installation-selector">
                        <SelectValue placeholder={t("definitions.selectInstallationDesc")} />
                      </SelectTrigger>
                      <SelectContent>
                        {installations.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            <div className="flex items-center gap-2">
                              {inst.name}
                              {inst.has_custom_definitions && (
                                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                  Custom
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                {selectedInstallation && (
                  <Badge className={`${isCustom ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"} whitespace-nowrap`}>
                    {isCustom ? "Custom" : "Default"}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile: Show active installation name or Default label */}
        {isMobile && (selectedInstallation || localCriticality.length > 0) && (
          <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-slate-100 rounded-lg">
            <Building2 className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-700 font-medium truncate">
              {selectedInstallation 
                ? installations.find(i => i.id === selectedInstallation)?.name || "Installation"
                : "Default Definitions"
              }
            </span>
            <Badge className={`ml-auto ${isCustom ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"} text-xs`}>
              {isCustom ? "Custom" : "Default"}
            </Badge>
          </div>
        )}

        {/* Info Card - Hidden on mobile */}
        <Card className="mb-4 border-blue-200 bg-blue-50 hidden sm:block">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">{t("definitions.rpnInfo")}</p>
                <p>{t("definitions.rpnFormula")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs - Horizontal scrollable on mobile */}
        {!loadingDefinitions && (selectedInstallation || (isMobile && localCriticality.length > 0)) && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-4 mb-2 sm:mb-4">
                <TabsTrigger value="criticality" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="criticality-tab">
                  <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">{t("definitions.criticality") || "Criticality"}</span>
                </TabsTrigger>
                <TabsTrigger value="severity" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="severity-tab">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">{t("definitions.severity")}</span>
                </TabsTrigger>
                <TabsTrigger value="occurrence" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="occurrence-tab">
                  <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">{t("definitions.occurrence")}</span>
                </TabsTrigger>
                <TabsTrigger value="detection" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="detection-tab">
                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">{t("definitions.detection")}</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className={`${isMobile ? 'flex-1 overflow-y-auto px-4 pb-4' : 'px-6 pb-6 max-w-7xl mx-auto'}`}>
        {/* Loading Spinner */}
        {loadingDefinitions && selectedInstallation ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : (selectedInstallation || (isMobile && localCriticality.length > 0)) ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Criticality Tab */}
            <TabsContent value="criticality">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                    <span className="truncate">{t("definitions.criticalityTitle") || "Equipment Criticality"}</span>
                    {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800 text-xs">{t("definitions.editMode")}</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{t("definitions.criticalityDesc") || "Define criticality levels across dimensions."}</CardDescription>
                </CardHeader>
                <CardContent>
                  <CriticalityTable
                    data={localCriticality}
                    isEditing={isEditing}
                    onUpdateRow={handleUpdateRow}
                    t={t}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Severity Tab */}
            <TabsContent value="severity">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                    {t("definitions.severityTitle")}
                    {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800 text-xs">{t("definitions.editMode")}</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{t("definitions.severityDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <EditableTable
                    type="severity"
                    data={localSeverity}
                    isEditing={isEditing}
                    onUpdateRow={handleUpdateRow}
                    t={t}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Occurrence Tab */}
            <TabsContent value="occurrence">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                    {t("definitions.occurrenceTitle")}
                    {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800 text-xs">{t("definitions.editMode")}</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{t("definitions.occurrenceDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <EditableTable
                    type="occurrence"
                    data={localOccurrence}
                    isEditing={isEditing}
                    onUpdateRow={handleUpdateRow}
                    t={t}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Detection Tab */}
            <TabsContent value="detection">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                    {t("definitions.detectionTitle")}
                    {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800 text-xs">{t("definitions.editMode")}</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{t("definitions.detectionDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <EditableTable
                    type="detection"
                    data={localDetection}
                    isEditing={isEditing}
                    onUpdateRow={handleUpdateRow}
                    t={t}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>{t("definitions.selectInstallationDesc") || "Select an installation to view definitions"}</p>
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("definitions.resetToDefaults")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("definitions.resetConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              className="bg-red-600 hover:bg-red-700"
            >
              {resetMutation.isPending ? "Resetting..." : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
