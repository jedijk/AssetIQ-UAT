import { useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { Tabs } from "../../components/ui/tabs";
import { DocumentViewer } from "../../components/DocumentViewer";
import { useFormsPage } from "./useFormsPage";
import { FormsPageHeader } from "./components/FormsPageHeader";
import { FormsTabsToolbar } from "./components/FormsTabsToolbar";
import { FormsTemplatesTabPanel } from "./components/FormsTemplatesTabPanel";
import { FormsSubmissionsTabPanel } from "./components/FormsSubmissionsTabPanel";
import { FormsTemplateEditorDialog } from "./components/FormsTemplateEditorDialog";
import { FormsFieldEditorDialog } from "./components/FormsFieldEditorDialog";
import { FormsDeleteConfirmDialog } from "./components/FormsDeleteConfirmDialog";
import { FormsViewTemplateDialog } from "./components/FormsViewTemplateDialog";

export default function FormsPageMain({ embedded = false }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("templates");
  const page = useFormsPage({ activeTab });

  return (
    <div
      className={`${embedded ? "min-h-0" : "app-page-content-band py-3 max-w-7xl mx-auto w-full"}`}
      data-testid="forms-page"
    >
      <FormsPageHeader
        embedded={embedded}
        t={t}
        stats={page.stats}
        onCreateTemplate={page.openCreateTemplate}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <FormsTabsToolbar
          embedded={embedded}
          t={t}
          searchQuery={page.searchQuery}
          setSearchQuery={page.setSearchQuery}
          disciplineFilter={page.disciplineFilter}
          setDisciplineFilter={page.setDisciplineFilter}
        />

        <FormsTemplatesTabPanel
          loadingTemplates={page.loadingTemplates}
          templatesError={page.templatesError}
          templatesErrorDetail={page.templatesErrorDetail}
          queryClient={page.queryClient}
          templates={page.templates}
          onCreateTemplate={page.openCreateTemplate}
          onViewTemplate={page.setSelectedTemplate}
          onEditTemplate={page.openEditTemplate}
          onDeleteTemplate={page.setShowDeleteConfirm}
        />

        {!embedded && (
          <FormsSubmissionsTabPanel
            loadingSubmissions={page.loadingSubmissions}
            submissionsError={page.submissionsError}
            queryClient={page.queryClient}
            submissions={page.submissions}
            templates={page.templates}
          />
        )}
      </Tabs>

      <FormsTemplateEditorDialog
        open={page.showCreateDialog}
        onOpenChange={page.setShowCreateDialog}
        newTemplate={page.newTemplate}
        setNewTemplate={page.setNewTemplate}
        t={t}
        onSave={page.handleCreateTemplate}
        isSaving={page.createTemplateMutation.isPending}
        onAddField={page.openAddFieldDialog}
        onEditField={page.openEditFieldDialog}
        onRemoveField={page.handleRemoveField}
        onCancel={page.resetNewTemplate}
      />

      <FormsFieldEditorDialog
        open={page.showFieldDialog}
        onOpenChange={page.setShowFieldDialog}
        editingField={page.editingField}
        newField={page.newField}
        setNewField={page.setNewField}
        t={t}
        onSave={page.handleAddField}
        onReset={page.resetNewField}
        equipmentSearchQuery={page.equipmentSearchQuery}
        setEquipmentSearchQuery={page.setEquipmentSearchQuery}
        equipmentSearchResults={page.equipmentSearchResults}
        searchingEquipment={page.searchingEquipment}
        onSearchEquipment={page.searchEquipmentForField}
      />

      <FormsDeleteConfirmDialog
        template={page.showDeleteConfirm}
        onClose={() => page.setShowDeleteConfirm(null)}
        onConfirm={() => page.deleteTemplateMutation.mutate(page.showDeleteConfirm.id)}
        isDeleting={page.deleteTemplateMutation.isPending}
        t={t}
      />

      <FormsViewTemplateDialog
        selectedTemplate={page.selectedTemplate}
        onClose={page.closeViewTemplate}
        viewingDocument={page.viewingDocument}
        previewMode={page.previewMode}
        setPreviewMode={page.setPreviewMode}
        viewTab={page.viewTab}
        setViewTab={page.setViewTab}
        docSearchQuery={page.docSearchQuery}
        setDocSearchQuery={page.setDocSearchQuery}
        docSearchResult={page.docSearchResult}
        setDocSearchResult={page.setDocSearchResult}
        isSearchingDocs={page.isSearchingDocs}
        setIsSearchingDocs={page.setIsSearchingDocs}
        setViewingDocument={page.setViewingDocument}
        t={t}
      />

      {page.viewingDocument && createPortal(
        <DocumentViewer
          document={page.viewingDocument}
          onClose={() => page.setViewingDocument(null)}
          onBack={() => page.setViewingDocument(null)}
          showBackButton
        />,
        document.body
      )}
    </div>
  );
}
