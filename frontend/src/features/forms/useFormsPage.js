import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../lib/apiClient";
import { formAPI } from "../../components/forms";
import { createEmptyField, createEmptyTemplate } from "./formsPageShared";

export function useFormsPage({ activeTab }) {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [previewMode, setPreviewMode] = useState("desktop");
  const [viewTab, setViewTab] = useState("fields");
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docSearchResult, setDocSearchResult] = useState(null);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [newTemplate, setNewTemplate] = useState(createEmptyTemplate);
  const [newField, setNewField] = useState(createEmptyField);
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");
  const [equipmentSearchResults, setEquipmentSearchResults] = useState([]);
  const [searchingEquipment, setSearchingEquipment] = useState(false);

  const {
    data: templatesData,
    isLoading: loadingTemplates,
    isError: templatesError,
    error: templatesErrorDetail,
  } = useQuery({
    queryKey: ["form-templates", disciplineFilter, searchQuery],
    queryFn: () =>
      formAPI.getTemplates({
        discipline: disciplineFilter !== "all" ? disciplineFilter : undefined,
        search: searchQuery || undefined,
      }),
    retry: 2,
  });

  const {
    data: submissionsData,
    isLoading: loadingSubmissions,
    isError: submissionsError,
  } = useQuery({
    queryKey: ["form-submissions"],
    queryFn: () => formAPI.getSubmissions({ limit: 200 }),
    enabled: activeTab === "submissions",
    retry: 2,
  });

  const { data: submissionStats } = useQuery({
    queryKey: ["form-submission-stats"],
    queryFn: () => formAPI.getSubmissionStats(),
    staleTime: 30 * 1000,
    retry: 1,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (template) => {
      if (template.id) {
        return formAPI.updateTemplate(template.id, template);
      }
      return formAPI.createTemplate(template);
    },
    onSuccess: async (data, variables) => {
      if (variables.pendingDocuments?.length > 0 && data.id) {
        const pendingDocs = variables.pendingDocuments.filter((d) => d.file);
        if (pendingDocs.length > 0) {
          toast.info(`Uploading ${pendingDocs.length} document(s)...`);
          let successCount = 0;
          let failCount = 0;
          for (const doc of pendingDocs) {
            try {
              await formAPI.uploadDocument(data.id, doc.file, "");
              successCount += 1;
            } catch (error) {
              console.error(`Failed to upload document ${doc.name}:`, error);
              failCount += 1;
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
      toast.error(`Failed to save template: ${error.message}`);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: formAPI.deleteTemplate,
    onSuccess: () => {
      toast.success("Form template deleted");
      queryClient.invalidateQueries({ queryKey: ["form-templates"] });
      setShowDeleteConfirm(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete template: ${error.message}`);
    },
  });

  const resetNewTemplate = () => setNewTemplate(createEmptyTemplate());

  const resetNewField = () => {
    setNewField(createEmptyField());
    setEquipmentSearchQuery("");
    setEquipmentSearchResults([]);
  };

  const searchEquipmentForField = async (query) => {
    if (!query || query.length < 2) {
      setEquipmentSearchResults([]);
      return;
    }
    setSearchingEquipment(true);
    try {
      const response = await api.get("/equipment-hierarchy/search", {
        params: { q: query, limit: 10 },
      });
      setEquipmentSearchResults(response.data.results || []);
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
    if (editingField) {
      const updatedField = {
        ...newField,
        id: editingField.id,
        order: editingField.order,
      };
      setNewTemplate((prev) => ({
        ...prev,
        fields: prev.fields.map((f) => (f.id === editingField.id ? updatedField : f)),
      }));
      setShowFieldDialog(false);
      setEditingField(null);
      resetNewField();
      toast.success("Field updated");
      return;
    }
    const fieldId = newField.id || newField.label.toLowerCase().replace(/\s+/g, "_");
    const field = { ...newField, id: fieldId, order: newTemplate.fields.length };
    setNewTemplate((prev) => ({ ...prev, fields: [...prev.fields, field] }));
    setShowFieldDialog(false);
    resetNewField();
    toast.success("Field added");
  };

  const handleRemoveField = (fieldId) => {
    setNewTemplate((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== fieldId),
    }));
    toast.success("Field removed");
  };

  const templates = useMemo(() => templatesData?.templates ?? [], [templatesData]);
  const submissions = useMemo(() => submissionsData?.submissions ?? [], [submissionsData]);

  useEffect(() => {
    if (selectedTemplate && templates.length > 0) {
      const updatedTemplate = templates.find((tpl) => tpl.id === selectedTemplate.id);
      if (updatedTemplate && updatedTemplate.version !== selectedTemplate.version) {
        setSelectedTemplate(updatedTemplate);
      }
    }
  }, [templates, selectedTemplate]);

  const stats = {
    totalTemplates: templates.length,
    totalSubmissions: submissionStats?.total || 0,
    warningCount: submissionStats?.warningCount || 0,
    criticalCount: submissionStats?.criticalCount || 0,
  };

  const openCreateTemplate = () => {
    resetNewTemplate();
    setShowCreateDialog(true);
  };

  const openAddFieldDialog = () => {
    resetNewField();
    setEditingField(null);
    setShowFieldDialog(true);
  };

  const openEditFieldDialog = (field) => {
    setEditingField(field);
    setNewField(field);
    setShowFieldDialog(true);
  };

  const openEditTemplate = (template) => {
    setNewTemplate(template);
    setShowCreateDialog(true);
  };

  const closeViewTemplate = () => {
    setSelectedTemplate(null);
    setPreviewMode("desktop");
    setViewTab("fields");
    setDocSearchQuery("");
    setDocSearchResult(null);
  };

  return {
    queryClient,
    searchQuery,
    setSearchQuery,
    disciplineFilter,
    setDisciplineFilter,
    selectedTemplate,
    setSelectedTemplate,
    showCreateDialog,
    setShowCreateDialog,
    showFieldDialog,
    setShowFieldDialog,
    editingField,
    setEditingField,
    showDeleteConfirm,
    setShowDeleteConfirm,
    previewMode,
    setPreviewMode,
    viewTab,
    setViewTab,
    docSearchQuery,
    setDocSearchQuery,
    docSearchResult,
    setDocSearchResult,
    isSearchingDocs,
    setIsSearchingDocs,
    viewingDocument,
    setViewingDocument,
    newTemplate,
    setNewTemplate,
    newField,
    setNewField,
    equipmentSearchQuery,
    setEquipmentSearchQuery,
    equipmentSearchResults,
    searchingEquipment,
    loadingTemplates,
    templatesError,
    templatesErrorDetail,
    loadingSubmissions,
    submissionsError,
    templates,
    submissions,
    stats,
    createTemplateMutation,
    deleteTemplateMutation,
    resetNewTemplate,
    resetNewField,
    searchEquipmentForField,
    handleCreateTemplate,
    handleAddField,
    handleRemoveField,
    openCreateTemplate,
    openAddFieldDialog,
    openEditFieldDialog,
    openEditTemplate,
    closeViewTemplate,
  };
}
