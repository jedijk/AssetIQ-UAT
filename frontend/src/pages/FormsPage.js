import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Search,
  Filter,
  Settings,
  Trash2,
  Edit,
  Copy,
  Eye,
  ChevronRight,
  ChevronDown,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Hash,
  Type,
  ToggleLeft,
  List,
  Calendar,
  Upload,
  Signature,
  SlidersHorizontal,
  MoreVertical,
  Clock,
  Layers,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Switch } from "../components/ui/switch";

// Get base URL without /api suffix
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// Field type configuration
const FIELD_TYPES = [
  { value: "numeric", label: "Numeric", icon: Hash, description: "Number with optional thresholds" },
  { value: "text", label: "Text", icon: Type, description: "Single line text" },
  { value: "textarea", label: "Text Area", icon: FileText, description: "Multi-line text" },
  { value: "dropdown", label: "Dropdown", icon: List, description: "Single select from options" },
  { value: "multi_select", label: "Multi-select", icon: List, description: "Multiple selections" },
  { value: "boolean", label: "Yes/No", icon: ToggleLeft, description: "Checkbox toggle" },
  { value: "range", label: "Range Slider", icon: SlidersHorizontal, description: "Slider with min/max" },
  { value: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { value: "datetime", label: "Date & Time", icon: Calendar, description: "Date + time picker" },
  { value: "file", label: "File Upload", icon: Upload, description: "File attachment" },
  { value: "image", label: "Image", icon: Upload, description: "Image upload" },
  { value: "signature", label: "Signature", icon: Signature, description: "Digital signature" },
];

// API functions
const formAPI = {
  getTemplates: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.discipline) queryParams.append("discipline", params.discipline);
    if (params.search) queryParams.append("search", params.search);
    const response = await fetch(`${API_BASE_URL}/api/form-templates?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch templates");
    return response.json();
  },
  getTemplate: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch template");
    return response.json();
  },
  createTemplate: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Failed to create template");
    return response.json();
  },
  updateTemplate: async ({ id, data }) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Failed to update template");
    return response.json();
  },
  deleteTemplate: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to delete template");
    return response.json();
  },
  getSubmissions: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.form_template_id) queryParams.append("form_template_id", params.form_template_id);
    if (params.has_warnings) queryParams.append("has_warnings", "true");
    if (params.has_critical) queryParams.append("has_critical", "true");
    const response = await fetch(`${API_BASE_URL}/api/form-submissions?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch submissions");
    return response.json();
  },
  getAnalytics: async (templateId) => {
    const response = await fetch(`${API_BASE_URL}/api/form-templates/${templateId}/analytics`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch analytics");
    return response.json();
  },
};

// Status badge for threshold status
const ThresholdBadge = ({ status }) => {
  const config = {
    normal: { color: "bg-green-100 text-green-800 border-green-200", label: "Normal" },
    warning: { color: "bg-amber-100 text-amber-800 border-amber-200", label: "Warning" },
    critical: { color: "bg-red-100 text-red-800 border-red-200", label: "Critical" },
  };
  const c = config[status] || config.normal;
  return <Badge className={c.color}>{c.label}</Badge>;
};

// Field type icon component
const FieldTypeIcon = ({ type }) => {
  const fieldType = FIELD_TYPES.find(f => f.value === type);
  if (!fieldType) return <FileText className="w-4 h-4" />;
  const Icon = fieldType.icon;
  return <Icon className="w-4 h-4" />;
};

// Form Template Card
const TemplateCard = ({ template, onEdit, onDelete, onView }) => {
  return (
    <Card 
      className="hover:shadow-md transition-shadow cursor-pointer group"
      data-testid={`form-template-${template.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{template.name}</CardTitle>
              <CardDescription className="text-sm">
                {template.field_count || 0} fields
                {template.discipline && ` • ${template.discipline}`}
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(template)}>
                <Eye className="w-4 h-4 mr-2" /> View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(template)}>
                <Edit className="w-4 h-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(template)} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {template.description && (
          <p className="text-sm text-slate-500 mb-3 line-clamp-2">{template.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            v{template.version}
          </Badge>
          {template.require_signature && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              <Signature className="w-3 h-3 mr-1" /> Signature
            </Badge>
          )}
          <Badge variant="outline" className="text-xs bg-slate-50">
            {template.usage_count || 0} submissions
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

// Field Preview Component
const FieldPreview = ({ field, onEdit, onDelete }) => {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 group">
      <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
      <div className="h-8 w-8 rounded bg-white border border-slate-200 flex items-center justify-center">
        <FieldTypeIcon type={field.field_type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-800">{field.label}</span>
          {field.required && (
            <span className="text-red-500 text-xs">*</span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {FIELD_TYPES.find(f => f.value === field.field_type)?.label}
          {field.unit && ` (${field.unit})`}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(field)}>
          <Edit className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => onDelete(field)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

// Submission Row Component
const SubmissionRow = ({ submission }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(!expanded)}
      >
        <Button variant="ghost" size="icon" className="h-6 w-6">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
        <div className="flex-1">
          <div className="font-medium text-sm">{submission.form_template_name}</div>
          <div className="text-xs text-slate-500">
            Submitted {new Date(submission.submitted_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {submission.has_critical && (
            <Badge className="bg-red-100 text-red-800 border-red-200">
              <AlertCircle className="w-3 h-3 mr-1" /> Critical
            </Badge>
          )}
          {submission.has_warnings && !submission.has_critical && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
              <AlertTriangle className="w-3 h-3 mr-1" /> Warning
            </Badge>
          )}
          {!submission.has_warnings && !submission.has_critical && (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Normal
            </Badge>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t bg-slate-50 p-4 space-y-2">
          {submission.values?.map((val, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{val.field_label || val.field_id}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {typeof val.value === "boolean" ? (val.value ? "Yes" : "No") : val.value}
                  {val.unit && ` ${val.unit}`}
                </span>
                {val.threshold_status && val.threshold_status !== "normal" && (
                  <ThresholdBadge status={val.threshold_status} />
                )}
              </div>
            </div>
          ))}
          {submission.notes && (
            <div className="mt-3 pt-3 border-t text-sm">
              <span className="text-slate-500">Notes: </span>
              <span>{submission.notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FormsPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

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
  });

  // Fetch templates
  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ["form-templates", disciplineFilter, searchQuery],
    queryFn: () => formAPI.getTemplates({ 
      discipline: disciplineFilter !== "all" ? disciplineFilter : undefined,
      search: searchQuery || undefined 
    }),
  });

  // Fetch submissions
  const { data: submissionsData, isLoading: loadingSubmissions } = useQuery({
    queryKey: ["form-submissions"],
    queryFn: () => formAPI.getSubmissions({}),
    enabled: activeTab === "submissions",
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: formAPI.createTemplate,
    onSuccess: () => {
      toast.success("Form template created");
      queryClient.invalidateQueries({ queryKey: ["form-templates"] });
      setShowCreateDialog(false);
      resetNewTemplate();
    },
    onError: (error) => {
      toast.error("Failed to create template: " + error.message);
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
    });
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

  // Stats for cards
  const stats = {
    totalTemplates: templates.length,
    totalSubmissions: submissionsData?.total || 0,
    warningCount: submissions.filter(s => s.has_warnings).length,
    criticalCount: submissions.filter(s => s.has_critical).length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="forms-page">
      {/* Header */}
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
          onClick={() => setShowCreateDialog(true)}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          data-testid="create-form-btn"
        >
          <Plus className="w-4 h-4 mr-2" /> New Form Template
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Templates</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalTemplates}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Layers className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Submissions</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalSubmissions}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Warnings</p>
                <p className="text-2xl font-bold text-amber-600">{stats.warningCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Critical</p>
                <p className="text-2xl font-bold text-red-600">{stats.criticalCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="templates" data-testid="templates-tab">
              <Layers className="w-4 h-4 mr-2" /> Templates
            </TabsTrigger>
            <TabsTrigger value="submissions" data-testid="submissions-tab">
              <FileText className="w-4 h-4 mr-2" /> Submissions
            </TabsTrigger>
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
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="inspection">Inspection</SelectItem>
                <SelectItem value="lab">Lab</SelectItem>
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
          ) : templates.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No form templates yet</h3>
                <p className="text-sm text-slate-500 mb-4">Create your first form template to start collecting data</p>
                <Button onClick={() => setShowCreateDialog(true)}>
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

        {/* Submissions Tab */}
        <TabsContent value="submissions" className="mt-4">
          {loadingSubmissions ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
            </div>
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
              <div className="grid grid-cols-2 gap-4">
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
                      <SelectItem value="operations">{t("forms.operations")}</SelectItem>
                      <SelectItem value="maintenance">{t("forms.maintenance")}</SelectItem>
                      <SelectItem value="inspection">{t("forms.inspection")}</SelectItem>
                      <SelectItem value="lab">{t("forms.lab")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t("forms.requireSignature")}</Label>
                    <Switch
                      checked={newTemplate.require_signature}
                      onCheckedChange={(v) => setNewTemplate(prev => ({ ...prev, require_signature: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>{t("forms.allowPartialSubmit")}</Label>
                    <Switch
                      checked={newTemplate.allow_partial_submission}
                      onCheckedChange={(v) => setNewTemplate(prev => ({ ...prev, allow_partial_submission: v }))}
                    />
                  </div>
                </div>
              </div>
            </div>

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
                onValueChange={(v) => setNewField(prev => ({ ...prev, field_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="w-4 h-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newField.field_type === "numeric" && (
              <div className="space-y-4 p-3 bg-slate-50 rounded-lg">
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={newField.unit || ""}
                    onChange={(e) => setNewField(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="e.g., °C, bar, mm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-amber-600">Warning Low</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.warning_low || ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, warning_low: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-amber-600">Warning High</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.warning_high || ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, warning_high: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-red-600">Critical Low</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.critical_low || ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, critical_low: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-red-600">Critical High</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.critical_high || ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, critical_high: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                    />
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
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTemplate?.description || "No description"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Version {selectedTemplate?.version}</Badge>
              {selectedTemplate?.discipline && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">{selectedTemplate.discipline}</Badge>
              )}
              {selectedTemplate?.require_signature && (
                <Badge className="bg-purple-50 text-purple-700 border-purple-200">
                  <Signature className="w-3 h-3 mr-1" /> Signature Required
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-slate-700">Fields ({selectedTemplate?.fields?.length || 0})</h4>
              <div className="space-y-2">
                {selectedTemplate?.fields?.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="h-8 w-8 rounded bg-white border flex items-center justify-center">
                      <FieldTypeIcon type={field.field_type} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{field.label}</span>
                        {field.required && <span className="text-red-500 text-xs">*</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {FIELD_TYPES.find(f => f.value === field.field_type)?.label}
                        {field.unit && ` (${field.unit})`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormsPage;
