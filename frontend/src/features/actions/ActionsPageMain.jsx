import { useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";
import { isIOSLikeDevice } from "../../lib/deviceUtils";
import { useActionsPage } from "./useActionsPage";
import { ActionsPageToolbar } from "./components/ActionsPageToolbar";
import { ActionsListSection } from "./components/ActionsListSection";
import { ActionsEditSheet } from "./components/ActionsEditSheet";
import { ActionsEditDialog } from "./components/ActionsEditDialog";
import { ActionsDeleteDialog } from "./components/ActionsDeleteDialog";
import { ActionsClosureDialog } from "./components/ActionsClosureDialog";

export default function ActionsPageMain() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isIOSLike = isIOSLikeDevice();
  const page = useActionsPage();

  const editProps = {
    open: page.isEditDialogOpen,
    onOpenChange: page.setIsEditDialogOpen,
    editingAction: page.editingAction,
    editForm: page.editForm,
    setEditForm: page.setEditForm,
    usersList: page.usersList,
    t: page.t,
    onSave: page.handleSaveEdit,
    isSaving: page.updateMutation.isPending,
    onRequestDelete: (action) => {
      page.setDeleteConfirm(action);
      page.setIsEditDialogOpen(false);
    },
    uploadingActionAttachment: page.uploadingActionAttachment,
    setUploadingActionAttachment: page.setUploadingActionAttachment,
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" data-testid="actions-page">
      <ActionsPageToolbar
        location={location}
        t={page.t}
        stats={page.stats}
        statCards={page.statCards}
        searchQuery={page.searchQuery}
        setSearchQuery={page.setSearchQuery}
        statusFilter={page.statusFilter}
        statusDropdownOpen={page.statusDropdownOpen}
        setStatusDropdownOpen={page.setStatusDropdownOpen}
        toggleStatus={page.toggleStatus}
        clearStatusFilter={page.clearStatusFilter}
        priorityFilter={page.priorityFilter}
        setPriorityFilter={page.setPriorityFilter}
        sortBy={page.sortBy}
        setSortBy={page.setSortBy}
        sortDropdownOpen={page.sortDropdownOpen}
        setSortDropdownOpen={page.setSortDropdownOpen}
      />

      <ActionsListSection
        isLoading={page.isLoading}
        sortedActions={page.sortedActions}
        isMobile={isMobile}
        isIOSLike={isIOSLike}
        navigate={navigate}
        t={page.t}
        canWrite={page.canWrite}
        canDelete={page.canDelete}
        quickStatusUpdate={page.quickStatusUpdate}
        openEditDialog={page.openEditDialog}
        onRequestDelete={page.setDeleteConfirm}
        isOverdue={page.isOverdue}
        formatDate={page.formatDate}
      />

      {isMobile ? (
        <ActionsEditSheet {...editProps} />
      ) : (
        <ActionsEditDialog {...editProps} />
      )}

      <ActionsDeleteDialog
        open={!!page.deleteConfirm}
        onOpenChange={() => page.setDeleteConfirm(null)}
        t={page.t}
        onConfirm={() => page.deleteMutation.mutate(page.deleteConfirm.id)}
      />

      <ActionsClosureDialog
        suggestion={page.closureSuggestion}
        onClose={() => page.setClosureSuggestion(null)}
      />
    </div>
  );
}
