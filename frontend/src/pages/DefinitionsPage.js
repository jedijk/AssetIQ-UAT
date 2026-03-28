import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sliders, AlertTriangle, BarChart2, Eye, Info, Building2, Check, Pencil, RotateCcw, Save, X } from "lucide-react";
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

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

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
  
  saveDefinitions: async ({ equipmentId, severity, occurrence, detection }) => {
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
        detection
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
      <ScrollArea className="h-[500px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {getHeaders().map((header, idx) => (
                <th key={idx} className={`px-3 py-3 text-left font-semibold text-slate-700 ${idx === 0 ? 'w-16' : ''}`}>
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
                <td className="px-3 py-3 font-medium text-slate-800">{item.label}</td>
                <td className="px-3 py-3 text-slate-600">{item.description}</td>
                <td className="px-3 py-3 text-slate-600 text-xs">{item.secondary_description}</td>
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
  
  const [activeTab, setActiveTab] = useState("severity");
  const [selectedInstallation, setSelectedInstallation] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Local state for editing
  const [localSeverity, setLocalSeverity] = useState([]);
  const [localOccurrence, setLocalOccurrence] = useState([]);
  const [localDetection, setLocalDetection] = useState([]);

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

  // Update local state when definitions change
  useEffect(() => {
    if (definitionsData) {
      setLocalSeverity(definitionsData.severity || []);
      setLocalOccurrence(definitionsData.occurrence || []);
      setLocalDetection(definitionsData.detection || []);
    } else if (defaultsData && !selectedInstallation) {
      setLocalSeverity(defaultsData.severity || []);
      setLocalOccurrence(defaultsData.occurrence || []);
      setLocalDetection(defaultsData.detection || []);
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
    }
  };

  const handleSave = () => {
    if (!selectedInstallation) return;
    
    saveMutation.mutate({
      equipmentId: selectedInstallation,
      severity: localSeverity,
      occurrence: localOccurrence,
      detection: localDetection
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
    }
    setIsEditing(false);
  };

  const installations = installationsData?.installations || [];
  const isCustom = definitionsData?.is_custom || false;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sliders className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {t("settings.criticalityDefinitions") || "Definitions"}
              </h1>
              <p className="text-slate-500 text-sm">
                {t("definitions.pageDescription")}
              </p>
            </div>
          </div>
          
          {selectedInstallation && (
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

      {/* Installation Selector */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Building2 className="w-5 h-5 text-slate-500" />
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                {t("definitions.selectInstallation")}
              </label>
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
                  <SelectTrigger className="w-full md:w-96" data-testid="installation-selector">
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
              <Badge className={isCustom ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"}>
                {isCustom ? t("definitions.usingCustom") : t("definitions.usingDefaults")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
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

      {/* Tabs */}
      {loadingDefinitions && selectedInstallation ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="severity" className="flex items-center gap-2" data-testid="severity-tab">
              <AlertTriangle className="w-4 h-4" />
              {t("definitions.severity")}
            </TabsTrigger>
            <TabsTrigger value="occurrence" className="flex items-center gap-2" data-testid="occurrence-tab">
              <BarChart2 className="w-4 h-4" />
              {t("definitions.occurrence")}
            </TabsTrigger>
            <TabsTrigger value="detection" className="flex items-center gap-2" data-testid="detection-tab">
              <Eye className="w-4 h-4" />
              {t("definitions.detection")}
            </TabsTrigger>
          </TabsList>

          {/* Severity Tab */}
          <TabsContent value="severity">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  {t("definitions.severityTitle")}
                  {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800">{t("definitions.editMode")}</Badge>}
                </CardTitle>
                <CardDescription>{t("definitions.severityDesc")}</CardDescription>
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
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart2 className="w-5 h-5 text-orange-500" />
                  {t("definitions.occurrenceTitle")}
                  {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800">{t("definitions.editMode")}</Badge>}
                </CardTitle>
                <CardDescription>{t("definitions.occurrenceDesc")}</CardDescription>
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
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="w-5 h-5 text-blue-500" />
                  {t("definitions.detectionTitle")}
                  {isEditing && <Badge className="ml-2 bg-amber-100 text-amber-800">{t("definitions.editMode")}</Badge>}
                </CardTitle>
                <CardDescription>{t("definitions.detectionDesc")}</CardDescription>
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
      )}

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
