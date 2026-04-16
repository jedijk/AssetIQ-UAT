import { getBackendUrl, getAuthHeaders } from '../lib/apiConfig';
import PhotoDataCaptureField from '../components/forms/PhotoDataCaptureField';
import { useState, useEffect } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import { DISCIPLINES } from "../constants/disciplines";
import {
  FileText,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Eye,
  ChevronRight,
  ChevronDown,
  GripVertical,
  X,
  MoreVertical,
  Layers,
  RefreshCw,
  Smartphone,
  Monitor,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Upload,
  Signature,
  Building2,
  SlidersHorizontal,
  List,
  Sparkles,
  Calendar,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { DocumentViewer } from "../components/DocumentViewer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SearchableSelect } from "../components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Card,
  CardContent,
} from "../components/ui/card";
import { Switch } from "../components/ui/switch";

// Import extracted form components
import {
  formAPI,
  FIELD_TYPES,
  TemplateCard,
  FieldPreview,
  FieldConfigDialog,
  SubmissionRow,
  FormStats,
  DocumentManager,
} from "../components/forms";

// Get base URL without /api suffix
const API_BASE_URL = getBackendUrl();

const FormsPage = ({ embedded = false }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [previewMode, setPreviewMode] = useState("desktop"); // "desktop" or "mobile"
  const [viewTab, setViewTab] = useState("fields"); // "fields" or "documents"
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docSearchResult, setDocSearchResult] = useState(null);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null); // For document viewer

  // Form state for new template
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    discipline: "",
    require_signature: false,
    allow_partial_submission: false,
    fields: [],
    tags: [],
  });

  // Form state for new field
  const [newField, setNewField] = useState({
    id: "",
    label: "",
    field_type: "text",
    required: false,
    description: "",
    unit: "",
    thresholds: {},
    options: [],
    range_min: null,
    range_max: null,
    range_step: null,
    allowed_extensions: [],
    max_file_size_mb: null,
    linked_equipment: null, // Equipment link {id, name, path}
  });
  
  // Equipment search state for field linking
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");
  const [equipmentSearchResults, setEquipmentSearchResults] = useState([]);
  const [searchingEquipment, setSearchingEquipment] = useState(false);

  // Fetch templates
  const { data: templatesData, isLoading: loadingTemplates, isError: templatesError, error: templatesErrorDetail } = useQuery({
    queryKey: ["form-templates", disciplineFilter, searchQuery],
    queryFn: () => formAPI.getTemplates({ 
      discipline: disciplineFilter !== "all" ? disciplineFilter : undefined,
      search: searchQuery || undefined 
    }),
    retry: 2,
    onError: (error) => {
      console.error("Failed to load form templates:", error);
    }
  });

  // Fetch submissions
  const { data: submissionsData, isLoading: loadingSubmissions, isError: submissionsError } = useQuery({
    queryKey: ["form-submissions"],
    queryFn: () => formAPI.getSubmissions({}),
    enabled: activeTab === "submissions",
    retry: 2,
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (template) => {
      // If template has an ID, it's an update, otherwise create new
      if (template.id) {
        return formAPI.updateTemplate({ id: template.id, data: template });
      }
      return formAPI.createTemplate(template);
    },
    onSuccess: async (data, variables) => {
      // Upload any pending documents after template creation
      if (variables.pendingDocuments?.length > 0 && data.id) {
        const pendingDocs = variables.pendingDocuments.filter(d => d.file);
        if (pendingDocs.length > 0) {
          toast.info(`Uploading ${pendingDocs.length} document(s)...`);
          let successCount = 0;
          let failCount = 0;
          
          for (const doc of pendingDocs) {
            try {
              await formAPI.uploadDocument(data.id, doc.file, "");
              successCount++;
            } catch (error) {
              console.error(`Failed to upload document ${doc.name}:`, error);
              failCount++;
            }
          }
          
          if (successCount > 0) {
            toast.success(`${successCount} document(s) uploaded successfully`);
          }
          if (failCount > 0) {
            toast.error(`${failCount} document(s) failed to upload`);
          }
        }
      }
      
      toast.success(variables.id ? "Form template updated" : "Form template created");
      queryClient.invalidateQueries({ queryKey: ["form-templates"] });
      setShowCreateDialog(false);
      resetNewTemplate();
    },
    onError: (error) => {
      toast.error("Failed to save template: " + error.message);
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: formAPI.deleteTemplate,
    onSuccess: () => {
      toast.success("Form template deleted");
      queryClient.invalidateQueries({ queryKey: ["form-templates"] });
      setShowDeleteConfirm(null);
    },
    onError: (error) => {
      toast.error("Failed to delete template: " + error.message);
    },
  });

  const resetNewTemplate = () => {
    setNewTemplate({
      name: "",
      description: "",
      discipline: "",
      require_signature: false,
      allow_partial_submission: false,
      fields: [],
      tags: [],
      documents: [],
      pendingDocuments: [], // Clear pending documents on reset
    });
  };

  const resetNewField = () => {
    setNewField({
      id: "",
      label: "",
      field_type: "text",
      required: false,
      description: "",
      unit: "",
      thresholds: {},
      options: [],
      range_min: null,
      range_max: null,
      range_step: null,
      allowed_extensions: [],
      max_file_size_mb: null,
      linked_equipment: null,
    });
    setEquipmentSearchQuery("");
    setEquipmentSearchResults([]);
  };
  
  // Search equipment for field linking
  const searchEquipmentForField = async (query) => {
    if (!query || query.length < 2) {
      setEquipmentSearchResults([]);
      return;
    }
    
    setSearchingEquipment(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/equipment-hierarchy/search?q=${encodeURIComponent(query)}&limit=10`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        setEquipmentSearchResults(data.results || []);
      }
    } catch (error) {
      console.error("Equipment search failed:", error);
    } finally {
      setSearchingEquipment(false);
    }
  };

  const handleCreateTemplate = () => {
    if (!newTemplate.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    createTemplateMutation.mutate(newTemplate);
  };

  const handleAddField = () => {
    if (!newField.label.trim()) {
      toast.error("Field label is required");
      return;
    }
    
    // When editing an existing field, update it in place
    if (editingField) {
      const updatedField = {
        ...newField,
        id: editingField.id, // Preserve original ID
        order: editingField.order, // Preserve original order
      };
      setNewTemplate(prev => ({
        ...prev,
        fields: prev.fields.map(f => f.id === editingField.id ? updatedField : f),
      }));
      setShowFieldDialog(false);
      setEditingField(null);
      resetNewField();
      toast.success("Field updated");
      return;
    }
    
    // Adding a new field
    const fieldId = newField.id || newField.label.toLowerCase().replace(/\s+/g, "_");
    const field = {
      ...newField,
      id: fieldId,
      order: newTemplate.fields.length,
    };
    setNewTemplate(prev => ({
      ...prev,
      fields: [...prev.fields, field],
    }));
    setShowFieldDialog(false);
    resetNewField();
    toast.success("Field added");
  };

  const handleRemoveField = (fieldId) => {
    setNewTemplate(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId),
    }));
    toast.success("Field removed");
  };

  const templates = templatesData?.templates || [];
  const submissions = submissionsData?.submissions || [];

  // Sync selectedTemplate with latest data from templates query
  // Uses version number as the primary change indicator to avoid expensive deep comparisons
  useEffect(() => {
    if (selectedTemplate && templates.length > 0) {
      const updatedTemplate = templates.find(t => t.id === selectedTemplate.id);
      if (updatedTemplate && updatedTemplate.version !== selectedTemplate.version) {
        setSelectedTemplate(updatedTemplate);
      }
    }
  }, [templates, selectedTemplate]);

  // Stats for cards
  const stats = {
    totalTemplates: templates.length,
    totalSubmissions: submissionsData?.total || 0,
    warningCount: submissions.filter(s => s.has_warnings).length,
    criticalCount: submissions.filter(s => s.has_critical).length,
  };

  // Mobile: Show desktop-only message
  if (isMobile) {
    return <DesktopOnlyMessage title="Form Designer" icon={FileText} />;
  }

  return (
    <div className={`${embedded ? 'p-4' : 'p-6'} max-w-7xl mx-auto`} data-testid="forms-page">
      {/* Header - Hidden when embedded */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Form Designer</h1>
              <p className="text-sm text-slate-500">Create and manage data collection forms</p>
            </div>
          </div>
          <Button 
            onClick={() => {
              resetNewTemplate();
              setShowCreateDialog(true);
            }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            data-testid="create-form-btn"
          >
            <Plus className="w-4 h-4 mr-2" /> New Form Template
          </Button>
        </div>
      )}

      {/* Embedded Header with Create Button */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">Create and manage data collection forms for your tasks</p>
          <Button 
            onClick={() => {
              resetNewTemplate();
              setShowCreateDialog(true);
            }}
            size="sm"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            data-testid="create-form-btn"
          >
            <Plus className="w-4 h-4 mr-1" /> New Form
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className={`grid ${embedded ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-3 ${embedded ? 'mb-4' : 'mb-6'}`}>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Templates</p>
                <p className="text-xl font-bold text-slate-900">{stats.totalTemplates}</p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Layers className="h-4 w-4 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        {!embedded && (
          <>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Submissions</p>
                    <p className="text-xl font-bold text-slate-900">{stats.totalSubmissions}</p>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Warnings</p>
                    <p className="text-xl font-bold text-amber-600">{stats.warningCount}</p>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Critical</p>
                    <p className="text-xl font-bold text-red-600">{stats.criticalCount}</p>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="templates" data-testid="templates-tab">
              <Layers className="w-4 h-4 mr-2" /> Templates
            </TabsTrigger>
            {!embedded && (
              <TabsTrigger value="submissions" data-testid="submissions-tab">
                <FileText className="w-4 h-4 mr-2" /> Submissions
              </TabsTrigger>
            )}
          </TabsList>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="search-input"
              />
            </div>
            <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Discipline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          {loadingTemplates ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : templatesError ? (
            <Card className="py-12 border-red-200 bg-red-50">
              <CardContent className="text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-700 mb-2">Failed to load form templates</h3>
                <p className="text-sm text-red-500 mb-4">
                  {templatesErrorDetail?.message || "Please check your connection and try again"}
                </p>
                <Button 
                  variant="outline"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["form-templates"] })}
                  data-testid="retry-templates-btn"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
              </CardContent>
            </Card>
          ) : templates.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No form templates yet</h3>
                <p className="text-sm text-slate-500 mb-4">Create your first form template to start collecting data</p>
                <Button onClick={() => {
                  resetNewTemplate();
                  setShowCreateDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onView={setSelectedTemplate}
                  onEdit={(t) => {
                    setNewTemplate(t);
                    setShowCreateDialog(true);
                  }}
                  onDelete={(t) => setShowDeleteConfirm(t)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Submissions Tab - Only shown when not embedded */}
        {!embedded && (
          <TabsContent value="submissions" className="mt-4">
            {loadingSubmissions ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            ) : submissionsError ? (
              <Card className="py-12 border-red-200 bg-red-50">
                <CardContent className="text-center">
                  <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-700 mb-2">Failed to load submissions</h3>
                  <p className="text-sm text-red-500 mb-4">Please check your connection and try again</p>
                  <Button 
                    variant="outline"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["form-submissions"] })}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry
                  </Button>
                </CardContent>
              </Card>
            ) : submissions.length === 0 ? (
              <Card className="py-12">
                <CardContent className="text-center">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-700 mb-2">No submissions yet</h3>
                  <p className="text-sm text-slate-500">Submissions will appear here when forms are filled</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {submissions.map((submission) => (
                  <SubmissionRow key={submission.id} submission={submission} />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Create/Edit Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {newTemplate.id ? t("common.edit") + " " + t("forms.templates") : t("forms.title")}
            </DialogTitle>
            <DialogDescription>
              {t("forms.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">{t("forms.templateName")} *</Label>
                <Input
                  id="template-name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Daily Equipment Inspection"
                  data-testid="template-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">{t("forms.templateDescription")}</Label>
                <Textarea
                  id="template-description"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the purpose of this form..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("forms.discipline")}</Label>
                  <Select
                    value={newTemplate.discipline}
                    onValueChange={(v) => setNewTemplate(prev => ({ ...prev, discipline: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("forms.discipline")} />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCIPLINES.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="require-signature"
                      checked={newTemplate.require_signature}
                      onCheckedChange={(v) => setNewTemplate(prev => ({ ...prev, require_signature: v }))}
                    />
                    <Label htmlFor="require-signature" className="cursor-pointer">{t("forms.requireSignature")}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="allow-partial"
                      checked={newTemplate.allow_partial_submission}
                      onCheckedChange={(v) => setNewTemplate(prev => ({ ...prev, allow_partial_submission: v }))}
                    />
                    <Label htmlFor="allow-partial" className="cursor-pointer">{t("forms.allowPartialSubmit")}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="photo-extraction-enabled"
                      checked={newTemplate.photo_extraction_config?.enabled || false}
                      onCheckedChange={(v) => setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: {
                          ...(prev.photo_extraction_config || { label: "Capture Photo", mode: "hybrid", confidence_threshold: 0.7, extraction_fields: [] }),
                          enabled: v,
                        }
                      }))}
                    />
                    <Label htmlFor="photo-extraction-enabled" className="cursor-pointer">Photo AI Extraction</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Photo Extraction Config - shown when enabled */}
            {newTemplate.photo_extraction_config?.enabled && (
              <div className="space-y-3 p-4 border border-blue-200 rounded-lg bg-blue-50/30">
                <Label className="text-sm font-medium text-blue-800">Photo Extraction Settings</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Button Label</Label>
                    <Input
                      value={newTemplate.photo_extraction_config?.label || "Capture Photo"}
                      onChange={(e) => setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: { ...prev.photo_extraction_config, label: e.target.value }
                      }))}
                      placeholder="Capture Photo"
                      className="h-8 text-sm"
                      data-testid="photo-extraction-label"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mode</Label>
                    <Select
                      value={newTemplate.photo_extraction_config?.mode || "hybrid"}
                      onValueChange={(v) => setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: { ...prev.photo_extraction_config, mode: v }
                      }))}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="photo-extraction-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
                        <SelectItem value="structured">Structured (readings)</SelectItem>
                        <SelectItem value="text">Text (serial numbers)</SelectItem>
                        <SelectItem value="classification">Classification</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Custom Prompt (optional)</Label>
                  <Textarea
                    value={newTemplate.photo_extraction_config?.prompt_template || ""}
                    onChange={(e) => setNewTemplate(prev => ({
                      ...prev,
                      photo_extraction_config: { ...prev.photo_extraction_config, prompt_template: e.target.value || null }
                    }))}
                    placeholder="Leave empty for auto-generated prompt based on fields..."
                    className="text-sm min-h-[60px]"
                    data-testid="photo-extraction-prompt"
                  />
                </div>

                {/* Extraction Fields */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Extraction Fields</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                        fields.push({ key: "", description: "", type: "string", target_field_id: "" });
                        setNewTemplate(prev => ({
                          ...prev,
                          photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields }
                        }));
                      }}
                      data-testid="add-extraction-field-btn"
                    >
                      + Add Field
                    </Button>
                  </div>
                  {(newTemplate.photo_extraction_config?.extraction_fields || []).map((ef, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-white p-2 rounded border">
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Key</Label>
                        <Input
                          value={ef.key}
                          onChange={(e) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], key: e.target.value };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                          placeholder="pressure"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <Label className="text-[10px]">Description</Label>
                        <Input
                          value={ef.description}
                          onChange={(e) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], description: e.target.value };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                          placeholder="Pressure reading from gauge"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Map to Field</Label>
                        <Select
                          value={ef.target_field_id || ""}
                          onValueChange={(v) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], target_field_id: v };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
                          <SelectContent>
                            {(newTemplate.fields || []).map(f => (
                              <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Type</Label>
                        <Select
                          value={ef.type || "string"}
                          onValueChange={(v) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], type: v };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="enum">Enum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                          onClick={() => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields.splice(idx, 1);
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fields Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">{t("forms.formFields")}</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetNewField();
                    setShowFieldDialog(true);
                  }}
                  data-testid="add-field-btn"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Field
                </Button>
              </div>

              {newTemplate.fields.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <p className="text-sm text-slate-500">{t("forms.noFieldsYet")}</p>
                  <p className="text-xs text-slate-400 mt-1">{t("forms.addFieldHint")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {newTemplate.fields.map((field) => (
                    <FieldPreview
                      key={field.id}
                      field={field}
                      onEdit={(f) => {
                        setEditingField(f);
                        setNewField(f);
                        setShowFieldDialog(true);
                      }}
                      onDelete={() => handleRemoveField(field.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Documents Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">{t("forms.referenceDocuments")}</Label>
                  <p className="text-xs text-slate-500">{t("forms.referenceDocumentsHint")}</p>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // If editing existing template, upload immediately
                      if (newTemplate.id) {
                        const docId = `uploading_${Date.now()}`;
                        // Show uploading state
                        setNewTemplate(prev => ({
                          ...prev,
                          pendingDocuments: [
                            ...(prev.pendingDocuments || []),
                            { id: docId, name: file.name, type: file.name.split('.').pop().toLowerCase(), uploading: true, file, error: null }
                          ]
                        }));
                        
                        try {
                          const result = await formAPI.uploadDocument(newTemplate.id, file, "");
                          // Replace pending with actual document - SUCCESS STATE
                          setNewTemplate(prev => ({
                            ...prev,
                            pendingDocuments: prev.pendingDocuments?.filter(d => d.id !== docId),
                            documents: [...(prev.documents || []), result.document]
                          }));
                          // Invalidate templates query to refresh documents list
                          queryClient.invalidateQueries({ queryKey: ["form-templates"] });
                          toast.success(t("forms.documentUploaded"));
                        } catch (error) {
                          // Set error state on the pending document (allow retry)
                          setNewTemplate(prev => ({
                            ...prev,
                            pendingDocuments: prev.pendingDocuments?.map(d => 
                              d.id === docId 
                                ? { ...d, uploading: false, error: error.message || "Upload failed" }
                                : d
                            )
                          }));
                          toast.error(error.message || "Upload failed");
                        }
                      } else {
                        // For new templates, stage the document for later upload
                        const docId = `pending_${Date.now()}`;
                        setNewTemplate(prev => ({
                          ...prev,
                          pendingDocuments: [
                            ...(prev.pendingDocuments || []),
                            { id: docId, file, name: file.name, type: file.name.split('.').pop().toLowerCase(), uploading: false, error: null }
                          ]
                        }));
                      }
                      e.target.value = '';
                    }}
                    data-testid="document-upload-input"
                  />
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-1" /> {t("forms.addDocument")}
                    </span>
                  </Button>
                </label>
              </div>

              {/* Existing Documents */}
              {(newTemplate.documents?.length > 0 || newTemplate.pendingDocuments?.length > 0) ? (
                <div className="space-y-2">
                  {newTemplate.documents?.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                      <div className="h-8 w-8 rounded bg-white border flex items-center justify-center">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{doc.name}</div>
                        <div className="text-xs text-slate-500">{doc.type?.toUpperCase()} • {doc.description || 'No description'}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        onClick={async () => {
                          if (newTemplate.id && doc.id) {
                            try {
                              await formAPI.deleteDocument(newTemplate.id, doc.id);
                              setNewTemplate(prev => ({
                                ...prev,
                                documents: prev.documents?.filter(d => d.id !== doc.id)
                              }));
                              // Invalidate templates query to refresh documents list
                              queryClient.invalidateQueries({ queryKey: ["form-templates"] });
                              toast.success("Document deleted");
                            } catch (error) {
                              toast.error("Failed to delete document");
                            }
                          } else {
                            setNewTemplate(prev => ({
                              ...prev,
                              documents: prev.documents?.filter(d => d.id !== doc.id)
                            }));
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {newTemplate.pendingDocuments?.map((doc) => (
                    <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-lg border ${doc.error ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`} data-testid={`pending-doc-${doc.id}`}>
                      <div className="h-8 w-8 rounded bg-white border flex items-center justify-center">
                        {doc.uploading ? (
                          <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                        ) : doc.error ? (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <Upload className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{doc.name}</div>
                        <div className={`text-xs ${doc.error ? 'text-red-600' : 'text-amber-600'}`}>
                          {doc.uploading 
                            ? t("common.uploading") 
                            : doc.error 
                              ? doc.error 
                              : newTemplate.id 
                                ? t("forms.pendingUpload")
                                : t("forms.willUploadOnSave") || "Will upload when form is saved"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Retry button for failed uploads */}
                        {doc.error && doc.file && newTemplate.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-600 hover:text-amber-800"
                            onClick={async () => {
                              // Set uploading state
                              setNewTemplate(prev => ({
                                ...prev,
                                pendingDocuments: prev.pendingDocuments?.map(d => 
                                  d.id === doc.id ? { ...d, uploading: true, error: null } : d
                                )
                              }));
                              
                              try {
                                const result = await formAPI.uploadDocument(newTemplate.id, doc.file, "");
                                setNewTemplate(prev => ({
                                  ...prev,
                                  pendingDocuments: prev.pendingDocuments?.filter(d => d.id !== doc.id),
                                  documents: [...(prev.documents || []), result.document]
                                }));
                                // Invalidate templates query to refresh documents list
                                queryClient.invalidateQueries({ queryKey: ["form-templates"] });
                                toast.success(t("forms.documentUploaded"));
                              } catch (error) {
                                setNewTemplate(prev => ({
                                  ...prev,
                                  pendingDocuments: prev.pendingDocuments?.map(d => 
                                    d.id === doc.id ? { ...d, uploading: false, error: error.message || "Retry failed" } : d
                                  )
                                }));
                                toast.error(error.message || "Retry failed");
                              }
                            }}
                            data-testid={`retry-upload-${doc.id}`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {/* Remove button - only when not uploading */}
                        {!doc.uploading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            onClick={() => setNewTemplate(prev => ({
                              ...prev,
                              pendingDocuments: prev.pendingDocuments?.filter(d => d.id !== doc.id)
                            }))}
                            data-testid={`remove-pending-doc-${doc.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">{t("forms.noDocuments")}</p>
                  <p className="text-xs text-slate-400">{t("forms.noDocumentsHint")}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              resetNewTemplate();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={createTemplateMutation.isPending}
              data-testid="save-template-btn"
            >
              {createTemplateMutation.isPending ? t("taskScheduler.saving") : t("taskScheduler.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Field Dialog */}
      <Dialog open={showFieldDialog} onOpenChange={setShowFieldDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? t("common.edit") : t("common.add")} {t("forms.label")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("forms.label")} *</Label>
              <Input
                value={newField.label}
                onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Temperature"
                data-testid="field-label-input"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("forms.fieldType")}</Label>
              <Select
                value={newField.field_type}
                onValueChange={(v) => {
                  // Clear type-specific sub-options when changing field type
                  const clearedField = {
                    ...newField,
                    field_type: v,
                    // Clear numeric-specific
                    unit: v === "numeric" ? newField.unit : "",
                    thresholds: v === "numeric" ? newField.thresholds : {},
                    // Clear dropdown/multi_select-specific
                    options: (v === "dropdown" || v === "multi_select") ? newField.options : [],
                    // Clear range-specific
                    range_min: v === "range" ? newField.range_min : null,
                    range_max: v === "range" ? newField.range_max : null,
                    range_step: v === "range" ? newField.range_step : null,
                    // Clear file/image-specific
                    allowed_extensions: (v === "file" || v === "image") ? newField.allowed_extensions : [],
                    max_file_size_mb: (v === "file" || v === "image") ? newField.max_file_size_mb : null,
                  };
                  setNewField(clearedField);
                }}
                data-testid="field-type-select"
              >
                <SelectTrigger data-testid="field-type-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} data-testid={`field-type-${type.value}`}>
                      <div className="flex items-center gap-2">
                        <type.icon className="w-4 h-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Numeric field sub-options */}
            {newField.field_type === "numeric" && (
              <div className="space-y-4 p-3 bg-slate-50 rounded-lg" data-testid="numeric-suboptions">
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={newField.unit || ""}
                    onChange={(e) => setNewField(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="e.g., °C, bar, mm"
                    data-testid="numeric-unit-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-amber-600">Warning Low</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.warning_low ?? ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, warning_low: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                      data-testid="numeric-warning-low"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-amber-600">Warning High</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.warning_high ?? ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, warning_high: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                      data-testid="numeric-warning-high"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-red-600">Critical Low</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.critical_low ?? ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, critical_low: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                      data-testid="numeric-critical-low"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-red-600">Critical High</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.critical_high ?? ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, critical_high: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                      data-testid="numeric-critical-high"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Dropdown/Multi-select options */}
            {(newField.field_type === "dropdown" || newField.field_type === "multi_select") && (
              <div className="space-y-3 p-3 bg-blue-50 rounded-lg" data-testid="dropdown-suboptions">
                <Label className="flex items-center gap-2">
                  <List className="w-4 h-4" />
                  Options
                </Label>
                <div className="space-y-2">
                  {(newField.options || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={opt.label}
                        onChange={(e) => {
                          const newOptions = [...(newField.options || [])];
                          newOptions[idx] = { ...newOptions[idx], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "_") };
                          setNewField(prev => ({ ...prev, options: newOptions }));
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1"
                        data-testid={`option-input-${idx}`}
                      />
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={opt.is_failure || false}
                          onCheckedChange={(v) => {
                            const newOptions = [...(newField.options || [])];
                            newOptions[idx] = { ...newOptions[idx], is_failure: v };
                            setNewField(prev => ({ ...prev, options: newOptions }));
                          }}
                          data-testid={`option-failure-${idx}`}
                        />
                        <span className="text-xs text-slate-500">Failure</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => {
                          const newOptions = (newField.options || []).filter((_, i) => i !== idx);
                          setNewField(prev => ({ ...prev, options: newOptions }));
                        }}
                        data-testid={`remove-option-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewField(prev => ({
                        ...prev,
                        options: [...(prev.options || []), { value: "", label: "", is_failure: false }]
                      }));
                    }}
                    className="w-full"
                    data-testid="add-option-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Option
                  </Button>
                </div>
              </div>
            )}

            {/* Range slider sub-options */}
            {newField.field_type === "range" && (
              <div className="space-y-3 p-3 bg-purple-50 rounded-lg" data-testid="range-suboptions">
                <Label className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Range Settings
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Min</Label>
                    <Input
                      type="number"
                      value={newField.range_min ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, range_min: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="0"
                      data-testid="range-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Max</Label>
                    <Input
                      type="number"
                      value={newField.range_max ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, range_max: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="100"
                      data-testid="range-max"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Step</Label>
                    <Input
                      type="number"
                      value={newField.range_step ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, range_step: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="1"
                      data-testid="range-step"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* File/Image upload sub-options */}
            {(newField.field_type === "file" || newField.field_type === "image") && (
              <div className="space-y-3 p-3 bg-green-50 rounded-lg" data-testid="file-suboptions">
                <Label className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload Settings
                </Label>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Max File Size (MB)</Label>
                    <Input
                      type="number"
                      value={newField.max_file_size_mb ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, max_file_size_mb: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="10"
                      data-testid="file-max-size"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Allowed Extensions (comma-separated)</Label>
                    <Input
                      value={(newField.allowed_extensions || []).join(", ")}
                      onChange={(e) => setNewField(prev => ({ 
                        ...prev, 
                        allowed_extensions: e.target.value ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : []
                      }))}
                      placeholder={newField.field_type === "image" ? "jpg, png, gif" : "pdf, doc, xlsx"}
                      data-testid="file-extensions"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Equipment field sub-options - Configure hierarchy selection */}
            {newField.field_type === "equipment" && (
              <div className="space-y-3 p-3 bg-indigo-50 rounded-lg" data-testid="equipment-suboptions">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Equipment Selection Settings
                </Label>
                <p className="text-xs text-slate-600 mb-2">
                  This field will show a hierarchical equipment selector to the user during form execution.
                </p>
                
                {/* Preview of equipment selector */}
                <div className="space-y-2 border border-indigo-200 rounded-lg p-3 bg-white">
                  <Label className="text-xs text-slate-500">Preview (Hierarchy Levels)</Label>
                  <div className="flex flex-wrap gap-1">
                    {['Installation', 'System', 'Unit', 'Subunit', 'Equipment'].map((level, idx) => (
                      <Badge key={level} variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                        {idx > 0 && <ChevronRight className="w-3 h-3 mr-0.5" />}
                        {level}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Test equipment search to verify hierarchy data exists */}
                  <div className="mt-3">
                    <Label className="text-xs text-slate-500 mb-1 block">Test equipment search:</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={equipmentSearchQuery}
                        onChange={(e) => {
                          setEquipmentSearchQuery(e.target.value);
                          searchEquipmentForField(e.target.value);
                        }}
                        placeholder="Type to search equipment..."
                        className="pl-8 h-9 text-sm"
                        data-testid="equipment-search-test"
                      />
                      {searchingEquipment && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                    </div>
                    
                    {/* Show search results with hierarchy path */}
                    {equipmentSearchResults.length > 0 && equipmentSearchQuery && (
                      <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                        {equipmentSearchResults.map((eq) => (
                          <div
                            key={eq.id}
                            className="px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 truncate">{eq.name}</p>
                                <p className="text-xs text-slate-500 truncate">
                                  {eq.path || eq.full_path || `Level: ${eq.level}`}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs capitalize">
                                {eq.level}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {equipmentSearchQuery && equipmentSearchResults.length === 0 && !searchingEquipment && (
                      <p className="mt-2 text-xs text-amber-600">
                        No equipment found. Ensure equipment hierarchy is configured in Settings.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={newField.required}
                onCheckedChange={(v) => setNewField(prev => ({ ...prev, required: v }))}
              />
              <Label>Required field</Label>
            </div>

            <div className="space-y-2">
              <Label>Description / Help Text</Label>
              <Input
                value={newField.description || ""}
                onChange={(e) => setNewField(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional help text for users"
              />
            </div>
            
            {/* Equipment Link */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                Link to Equipment (optional)
              </Label>
              
              {newField.linked_equipment ? (
                <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">{newField.linked_equipment.name}</p>
                      {newField.linked_equipment.path && (
                        <p className="text-xs text-blue-600">{newField.linked_equipment.path}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewField(prev => ({ ...prev, linked_equipment: null }))}
                    className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={equipmentSearchQuery}
                      onChange={(e) => {
                        setEquipmentSearchQuery(e.target.value);
                        searchEquipmentForField(e.target.value);
                      }}
                      placeholder="Search equipment to link..."
                      className="pl-9"
                      data-testid="equipment-link-search"
                    />
                    {searchingEquipment && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>
                  
                  {equipmentSearchResults.length > 0 && equipmentSearchQuery && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {equipmentSearchResults.map((eq) => (
                        <button
                          key={eq.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 last:border-0"
                          onClick={() => {
                            setNewField(prev => ({
                              ...prev,
                              linked_equipment: {
                                id: eq.id,
                                name: eq.name,
                                path: eq.path || eq.full_path,
                                level: eq.level
                              }
                            }));
                            setEquipmentSearchQuery("");
                            setEquipmentSearchResults([]);
                          }}
                        >
                          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{eq.name}</p>
                            {(eq.path || eq.full_path) && (
                              <p className="text-xs text-slate-500 truncate">{eq.path || eq.full_path}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">Link this field to a specific equipment from the hierarchy</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowFieldDialog(false);
              setEditingField(null);
              resetNewField();
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddField} data-testid="save-field-btn">
              {editingField ? "Update Field" : "Add Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("common.delete")} {t("forms.templates")}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{showDeleteConfirm?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTemplateMutation.mutate(showDeleteConfirm.id)}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? t("taskScheduler.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Template Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={(open) => { 
        // Don't close if document viewer is open
        if (!open && viewingDocument) return;
        if (!open) {
          setSelectedTemplate(null); 
          setPreviewMode("desktop"); 
          setViewTab("fields");
          setDocSearchQuery("");
          setDocSearchResult(null);
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  {selectedTemplate?.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedTemplate?.description || "No description"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">Version {selectedTemplate?.version}</Badge>
              {selectedTemplate?.discipline && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">{selectedTemplate.discipline}</Badge>
              )}
              {selectedTemplate?.require_signature && (
                <Badge className="bg-purple-50 text-purple-700 border-purple-200">
                  <Signature className="w-3 h-3 mr-1" /> Signature Required
                </Badge>
              )}
              {selectedTemplate?.documents?.length > 0 && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                  <FileText className="w-3 h-3 mr-1" /> {selectedTemplate.documents.length} {t("forms.documents")}
                </Badge>
              )}
            </div>

            {/* View Tabs with Preview Mode Toggle */}
            <div className="flex items-center justify-between mb-4 border-b">
              <div className="flex gap-2">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    viewTab === "fields" 
                      ? "border-indigo-600 text-indigo-600" 
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setViewTab("fields")}
                >
                  <Layers className="w-4 h-4 inline mr-1" /> {t("forms.formFields")} ({selectedTemplate?.fields?.length || 0})
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    viewTab === "documents" 
                      ? "border-indigo-600 text-indigo-600" 
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setViewTab("documents")}
                >
                  <FileText className="w-4 h-4 inline mr-1" /> {t("forms.documents")} ({selectedTemplate?.documents?.length || 0})
                </button>
              </div>
              
              {/* Preview Mode Toggle - Always visible on Fields tab */}
              {viewTab === "fields" && (
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <Button
                    variant={previewMode === "desktop" ? "default" : "ghost"}
                    size="sm"
                    className={`h-8 px-3 ${previewMode === "desktop" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
                    onClick={() => setPreviewMode("desktop")}
                    data-testid="preview-desktop-btn"
                  >
                    <Monitor className="w-4 h-4 mr-1.5" /> {t("common.desktop")}
                  </Button>
                  <Button
                    variant={previewMode === "mobile" ? "default" : "ghost"}
                    size="sm"
                    className={`h-8 px-3 ${previewMode === "mobile" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
                    onClick={() => setPreviewMode("mobile")}
                    data-testid="preview-mobile-btn"
                  >
                    <Smartphone className="w-4 h-4 mr-1.5" /> {t("common.mobile")}
                  </Button>
                </div>
              )}
            </div>

            {/* Fields Tab */}
            {viewTab === "fields" && (
              <>
                {/* Desktop Preview */}
                {previewMode === "desktop" && (
                  <div className="flex justify-center">
                    {/* Desktop Browser Frame */}
                    <div className="w-full max-w-3xl">
                      {/* Browser Chrome */}
                      <div className="bg-slate-200 rounded-t-lg px-4 py-2 flex items-center gap-2">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-400" />
                          <div className="w-3 h-3 rounded-full bg-yellow-400" />
                          <div className="w-3 h-3 rounded-full bg-green-400" />
                        </div>
                        <div className="flex-1 ml-4">
                          <div className="bg-white rounded px-3 py-1 text-xs text-slate-500 truncate">
                            forms.assetiq.com/{selectedTemplate?.name?.toLowerCase().replace(/\s+/g, '-')}
                          </div>
                        </div>
                      </div>
                      
                      {/* Browser Content */}
                      <div className="bg-white border-x border-b border-slate-200 rounded-b-lg shadow-lg overflow-hidden">
                        {/* Form Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                          <h3 className="text-white font-semibold text-lg">{selectedTemplate?.name}</h3>
                          <p className="text-white/70 text-sm">{selectedTemplate?.description || "Fill out the form below"}</p>
                        </div>
                        
                        {/* Form Fields */}
                        <div className="p-6 space-y-5 max-h-[50vh] overflow-y-auto">
                          {/* Photo AI Extraction */}
                          {selectedTemplate?.photo_extraction_config?.enabled && (
                            <PhotoDataCaptureField
                              config={selectedTemplate.photo_extraction_config}
                              formData={{}}
                              onAutoFill={() => toast.info("Photo extraction is available during task execution")}
                            />
                          )}
                          {selectedTemplate?.fields?.map((field, idx) => (
                            <div key={idx} className="space-y-2">
                              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                {field.label}
                                {field.required && <span className="text-red-500">*</span>}
                              </label>
                              {/* Linked Equipment Display */}
                              {field.linked_equipment && (
                                <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-fit">
                                  <Building2 className="w-3 h-3" />
                                  <span>{field.linked_equipment.name}</span>
                                </div>
                              )}
                              {field.description && (
                                <p className="text-xs text-slate-400">{field.description}</p>
                              )}
                              
                              {/* Render realistic field inputs */}
                              {field.field_type === "text" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center">
                                  <span className="text-sm text-slate-400">{field.placeholder || "Enter text..."}</span>
                                </div>
                              )}
                              {field.field_type === "textarea" && (
                                <div className="h-24 bg-slate-50 rounded-lg border border-slate-200 p-3">
                                  <span className="text-sm text-slate-400">{field.placeholder || "Enter description..."}</span>
                                </div>
                              )}
                              {field.field_type === "numeric" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                  <span className="text-sm text-slate-400">0</span>
                                  {field.unit && <span className="text-sm text-slate-500 font-medium">{field.unit}</span>}
                                </div>
                              )}
                              {field.field_type === "boolean" && (
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform" />
                                  </div>
                                  <span className="text-sm text-slate-500">No</span>
                                </div>
                              )}
                              {field.field_type === "dropdown" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select an option...</span>
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "multi_select" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select options...</span>
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "date" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select date...</span>
                                  <Calendar className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "datetime" && (
                                <div className="h-10 bg-slate-50 rounded-lg border border-slate-200 px-3 flex items-center justify-between cursor-pointer hover:border-slate-300">
                                  <span className="text-sm text-slate-400">Select date & time...</span>
                                  <Calendar className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              {field.field_type === "file" && (
                                <div className="h-20 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                                  <Upload className="w-5 h-5 text-slate-400" />
                                  <span className="text-xs text-slate-400 mt-1">Click to upload or drag and drop</span>
                                </div>
                              )}
                              {field.field_type === "image" && (
                                <div className="h-28 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                                  <Upload className="w-6 h-6 text-slate-400" />
                                  <span className="text-xs text-slate-400 mt-1">Click to upload image</span>
                                  <span className="text-xs text-slate-300">PNG, JPG up to 10MB</span>
                                </div>
                              )}
                              {field.field_type === "signature" && (
                                <div className="h-32 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400">
                                  <Signature className="w-6 h-6 text-slate-400" />
                                  <span className="text-xs text-slate-400 mt-1">Click to sign</span>
                                </div>
                              )}
                              {field.field_type === "range" && (
                                <div className="space-y-2 pt-1">
                                  <div className="h-2 bg-slate-200 rounded-full relative">
                                    <div className="absolute left-0 top-0 h-full w-1/2 bg-indigo-500 rounded-full" />
                                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white border-2 border-indigo-500 rounded-full shadow cursor-grab" />
                                  </div>
                                  <div className="flex justify-between text-xs text-slate-400">
                                    <span>{field.range_min || 0}</span>
                                    <span>{field.range_max || 100}</span>
                                  </div>
                                </div>
                              )}
                              {field.field_type === "equipment" && (
                                <div className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                                  <Building2 className="w-4 h-4 text-slate-400" />
                                  <span className="text-sm text-slate-500">Search equipment...</span>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Submit Button */}
                          <div className="pt-4">
                            <div className="h-11 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
                              <span className="text-white font-medium">Submit Form</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

            {/* Mobile Preview */}
            {previewMode === "mobile" && (
              <div className="flex justify-center">
                {/* iPhone-style Device Frame */}
                <div className="relative">
                  {/* Phone Outer Frame */}
                  <div className="w-[320px] h-[640px] bg-slate-900 rounded-[40px] p-3 shadow-2xl">
                    {/* Phone Inner Frame */}
                    <div className="w-full h-full bg-white rounded-[32px] overflow-hidden relative">
                      {/* Status Bar */}
                      <div className="h-11 bg-slate-50 flex items-center justify-between px-6 border-b">
                        <span className="text-xs font-medium">9:41</span>
                        <div className="absolute left-1/2 -translate-x-1/2 w-20 h-6 bg-slate-900 rounded-full" />
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-2 border border-slate-400 rounded-sm">
                            <div className="w-2/3 h-full bg-slate-400 rounded-sm" />
                          </div>
                        </div>
                      </div>
                      
                      {/* App Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
                        <h3 className="text-white font-semibold text-sm truncate">{selectedTemplate?.name}</h3>
                        <p className="text-white/70 text-xs">Fill out the form below</p>
                      </div>

                      {/* Form Content */}
                      <div className="p-4 space-y-4 overflow-y-auto h-[480px]">
                        {/* Photo AI Extraction */}
                        {selectedTemplate?.photo_extraction_config?.enabled && (
                          <PhotoDataCaptureField
                            config={selectedTemplate.photo_extraction_config}
                            formData={{}}
                            onAutoFill={() => toast.info("Photo extraction is available during task execution")}
                          />
                        )}
                        {selectedTemplate?.fields?.map((field, idx) => (
                          <div key={idx} className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                              {field.label}
                              {field.required && <span className="text-red-500">*</span>}
                            </label>
                            {field.description && (
                              <p className="text-[10px] text-slate-400">{field.description}</p>
                            )}
                            {/* Render field based on type */}
                            {field.field_type === "text" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center">
                                <span className="text-xs text-slate-400">Enter text...</span>
                              </div>
                            )}
                            {field.field_type === "textarea" && (
                              <div className="h-20 bg-slate-100 rounded-lg border border-slate-200 p-2">
                                <span className="text-xs text-slate-400">Enter description...</span>
                              </div>
                            )}
                            {field.field_type === "numeric" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">0</span>
                                {field.unit && <span className="text-xs text-slate-500">{field.unit}</span>}
                              </div>
                            )}
                            {field.field_type === "boolean" && (
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-5 bg-slate-200 rounded-full relative">
                                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow" />
                                </div>
                                <span className="text-xs text-slate-500">No</span>
                              </div>
                            )}
                            {field.field_type === "dropdown" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select option...</span>
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "multi_select" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select options...</span>
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "date" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select date...</span>
                                <Calendar className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "datetime" && (
                              <div className="h-9 bg-slate-100 rounded-lg border border-slate-200 px-3 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Select date & time...</span>
                                <Calendar className="w-3 h-3 text-slate-400" />
                              </div>
                            )}
                            {field.field_type === "file" && (
                              <div className="h-16 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center">
                                <Upload className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] text-slate-400 mt-1">Tap to upload</span>
                              </div>
                            )}
                            {field.field_type === "image" && (
                              <div className="h-20 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center">
                                <Upload className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] text-slate-400 mt-1">Tap to add image</span>
                              </div>
                            )}
                            {field.field_type === "signature" && (
                              <div className="h-24 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center">
                                <Signature className="w-5 h-5 text-slate-400" />
                                <span className="text-[10px] text-slate-400 mt-1">Tap to sign</span>
                              </div>
                            )}
                            {field.field_type === "range" && (
                              <div className="space-y-1">
                                <div className="h-2 bg-slate-200 rounded-full relative">
                                  <div className="absolute left-0 top-0 h-full w-1/3 bg-indigo-500 rounded-full" />
                                  <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full shadow" />
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>Min</span>
                                  <span>Max</span>
                                </div>
                              </div>
                            )}
                            {field.field_type === "equipment" && (
                              <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs text-slate-500">Search equipment...</span>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Submit Button */}
                        <div className="pt-4 pb-2">
                          <div className="h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm font-medium">Submit</span>
                          </div>
                        </div>
                      </div>

                      {/* Home Indicator */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            )}
              </>
            )}

            {/* Documents Tab */}
            {viewTab === "documents" && (
              <div className="space-y-4" data-testid="documents-tab-content">
                {/* Check if selectedTemplate exists and is valid */}
                {!selectedTemplate ? (
                  <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700 mb-2">Template data unavailable</h3>
                    <p className="text-sm text-slate-500">Please close and reopen the template to view documents.</p>
                  </div>
                ) : (
                  <>
                    {/* AI Search Section */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-medium text-sm text-indigo-900">{t("forms.aiDocumentSearch")}</h4>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={docSearchQuery}
                          onChange={(e) => setDocSearchQuery(e.target.value)}
                          placeholder={t("forms.searchDocumentsPlaceholder")}
                          className="flex-1"
                          data-testid="doc-search-input"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && docSearchQuery.trim() && selectedTemplate?.id) {
                              setIsSearchingDocs(true);
                              formAPI.searchDocuments(selectedTemplate.id, docSearchQuery.trim())
                                .then(setDocSearchResult)
                                .catch((err) => {
                                  console.error("Document search failed:", err);
                                  toast.error("Search failed: " + (err.message || "Unknown error"));
                                })
                                .finally(() => setIsSearchingDocs(false));
                            }
                          }}
                        />
                        <Button
                          onClick={() => {
                            if (docSearchQuery.trim() && selectedTemplate?.id) {
                              setIsSearchingDocs(true);
                              formAPI.searchDocuments(selectedTemplate.id, docSearchQuery.trim())
                                .then(setDocSearchResult)
                                .catch((err) => {
                                  console.error("Document search failed:", err);
                                  toast.error("Search failed: " + (err.message || "Unknown error"));
                                })
                                .finally(() => setIsSearchingDocs(false));
                            }
                          }}
                          disabled={isSearchingDocs || !docSearchQuery.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700"
                          data-testid="doc-search-btn"
                        >
                          {isSearchingDocs ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><Search className="w-4 h-4 mr-1" /> {t("forms.askAI")}</>
                          )}
                        </Button>
                      </div>

                      {/* AI Search Result */}
                      {docSearchResult && (
                        <div className="mt-4 bg-white rounded-lg p-4 border" data-testid="doc-search-result">
                          <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                              <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{docSearchResult.answer}</p>
                              {docSearchResult.relevant_documents?.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {docSearchResult.relevant_documents.map((doc) => (
                                    <button
                                      key={doc.id}
                                      onClick={() => setViewingDocument(doc)}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 hover:bg-slate-200 transition-colors"
                                      data-testid={`view-doc-${doc.id}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      {doc.name}
                                      <Eye className="w-3 h-3" />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Document List */}
                    <div data-testid="document-list-section">
                      <h4 className="font-medium text-sm text-slate-700 mb-2">{t("forms.attachedDocuments")}</h4>
                      {selectedTemplate?.documents?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedTemplate.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border hover:bg-slate-100 transition-colors" data-testid={`document-row-${doc.id}`}>
                              <div className="h-10 w-10 rounded bg-white border flex items-center justify-center">
                                <FileText className="w-5 h-5 text-slate-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{doc.name || "Unnamed document"}</div>
                                <div className="text-xs text-slate-500">
                                  {doc.type?.toUpperCase() || "FILE"} 
                                  {doc.description && ` • ${doc.description}`}
                                </div>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setViewingDocument(doc)}
                                className="text-indigo-600 hover:text-indigo-700"
                                data-testid={`view-doc-btn-${doc.id}`}
                              >
                                <Eye className="w-4 h-4 mr-1" /> {t("common.view")}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300" data-testid="no-documents-message">
                          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-500">{t("forms.noDocumentsAttached")}</p>
                          <p className="text-xs text-slate-400 mt-1">Upload documents in the Edit mode to attach reference materials</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { 
              setSelectedTemplate(null); 
              setPreviewMode("desktop"); 
              setViewTab("fields");
              setDocSearchQuery("");
              setDocSearchResult(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer - rendered as portal to be above all dialogs */}
      {viewingDocument && createPortal(
        <DocumentViewer
          document={viewingDocument}
          onClose={() => setViewingDocument(null)}
          onBack={() => setViewingDocument(null)}
          showBackButton={true}
        />,
        document.body
      )}
    </div>
  );
};

export default FormsPage;
