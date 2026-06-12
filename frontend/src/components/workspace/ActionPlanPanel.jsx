import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ClipboardList, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDisciplines } from "../../hooks/useDisciplines";
import { getActionStatusLabel, normalizeActionType } from "./actionPlanUtils";
import { EditActionDialog, DeleteActionDialog, AddActionDialog } from "./ActionPlanDialogs";

const ActionPlanPanel = ({ actions, onViewAll, onEditAction, onDeleteAction, onAddAction, isCreating }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { getLabel } = useDisciplines();
  const [editingAction, setEditingAction] = useState(null);
  const [deletingAction, setDeletingAction] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeColors = {
    PM: "bg-blue-100 text-blue-700",
    CM: "bg-amber-100 text-amber-700",
    PDM: "bg-purple-100 text-purple-700",
    OP: "bg-green-100 text-green-700",
    LEARN: "bg-pink-100 text-pink-700",
    IV: "bg-indigo-100 text-indigo-700",
  };

  const statusConfig = {
    open: { color: "bg-blue-50 text-blue-600 border-blue-200", label: getActionStatusLabel(t, "open") },
    planned: { color: "bg-purple-50 text-purple-600 border-purple-200", label: getActionStatusLabel(t, "planned") },
    in_progress: { color: "bg-amber-50 text-amber-600 border-amber-200", label: getActionStatusLabel(t, "in_progress") },
    completed: { color: "bg-green-50 text-green-600 border-green-200", label: getActionStatusLabel(t, "completed") },
    validated: { color: "bg-emerald-50 text-emerald-600 border-emerald-200", label: getActionStatusLabel(t, "validated") },
  };

  const handleActionClick = (action) => {
    // Only allow navigation to causal engine for synthetic investigation entries
    if (action.is_synthetic && action.linked_investigation_id) {
      navigate(`/causal-engine?id=${action.linked_investigation_id}`);
      return;
    }
    // No deep linking to action detail page - actions are managed inline
  };

  const isActionClickable = (action) =>
    Boolean(action.is_synthetic && action.linked_investigation_id);

  const handleEdit = (action, e) => {
    e.stopPropagation();
    setEditingAction(action);
  };

  const handleDelete = (action, e) => {
    e.stopPropagation();
    setDeletingAction(action);
  };

  const handleSaveEdit = async (updates) => {
    if (!editingAction) return;
    setIsSaving(true);
    try {
      await onEditAction?.(editingAction, updates);
      setEditingAction(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAction) return;
    setIsDeleting(true);
    try {
      await onDeleteAction?.(deletingAction);
      setDeletingAction(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin">
      {/* Header - sticky on scroll, sized to match Recommended Actions */}
      <div className="lg:sticky lg:top-0 z-10 bg-white px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">
                {t("observationWorkspace.actionPlan")}
                {actions && actions.length > 0 && (
                  <span className="ml-2 text-xs text-slate-400 font-normal">({actions.length})</span>
                )}
              </h3>
              <p className="text-xs text-slate-500 truncate">{t("observationWorkspace.actionPlanSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAddDialog(true)}
              className="h-7 text-xs px-2"
              title={t("observationWorkspace.addActionManually")}
              data-testid="action-plan-add-btn"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> {t("observationWorkspace.add")}
            </Button>
            {actions && actions.length > 0 && (
              <Button size="sm" variant="ghost" onClick={onViewAll} className="h-7 text-xs px-2 hidden sm:inline-flex">
                {t("observationWorkspace.viewAll")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-4 sm:pb-6">

      {/* Actions List - Same style as recommended actions */}
      {actions && actions.length > 0 ? (
        <div className="space-y-2">
          {actions.slice(0, 5).map((action) => {
            const status = statusConfig[action.status?.toLowerCase()] || statusConfig.open;
            const actionType = normalizeActionType(action.action_type);
            const clickable = isActionClickable(action);

            return (
              <div 
                key={action.id}
                className={`p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors group ${
                  clickable ? "cursor-pointer hover:bg-slate-100" : ""
                }`}
                onClick={clickable ? () => handleActionClick(action) : undefined}
                title={
                  action.is_synthetic
                    ? t("observationWorkspace.openLinkedInvestigation")
                    : undefined
                }
                data-testid={`action-plan-item-${action.id}`}
              >
                <div className="flex items-start gap-2">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    {/* Header row: Type badge, status */}
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[actionType] || 'bg-slate-100 text-slate-600'}`}>
                        {actionType}
                      </span>
                      {action.discipline && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {getLabel(action.discipline)}
                        </span>
                      )}
                      <span className={`text-[10px] px-1 py-0.5 rounded border ${status.color}`}>
                        {status.label}
                      </span>
                      {action.action_number && (
                        <span className="text-[10px] text-slate-400 font-mono ml-auto">
                          {action.action_number}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <p className="text-xs text-slate-700 leading-snug">
                      {action.title}
                    </p>

                    {/* Due date / Owner */}
                    {(action.due_date || action.owner) && (
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                        {action.owner && <span>{action.owner}</span>}
                        {action.due_date && (
                          <span>{t("observationWorkspace.dueDate", { date: format(parseISO(action.due_date), "MMM d") })}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Edit & Delete buttons — hidden for synthetic investigation entries */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!action.is_synthetic && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleEdit(action, e)}
                          className="h-7 w-7 p-0"
                          title={t("observationWorkspace.editAction")}
                          data-testid={`action-plan-edit-${action.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleDelete(action, e)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          title={t("observationWorkspace.removeFromPlan")}
                          data-testid={`action-plan-delete-${action.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-xs">{t("observationWorkspace.noActionsInPlan")}</p>
          <p className="text-[10px] text-slate-400 mt-1">{t("observationWorkspace.addFromRecommendations")}</p>
        </div>
      )}

      {/* Edit / Delete dialogs */}
      <EditActionDialog
        key={editingAction?.id || "edit"}
        action={editingAction}
        open={!!editingAction}
        onClose={() => setEditingAction(null)}
        onSave={handleSaveEdit}
        isSaving={isSaving}
      />
      <DeleteActionDialog
        action={deletingAction}
        open={!!deletingAction}
        onClose={() => setDeletingAction(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
      <AddActionDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreate={async (data) => {
          await onAddAction?.(data);
          setShowAddDialog(false);
        }}
        isCreating={isCreating}
      />
      </div>
    </div>
  );
};

export default ActionPlanPanel;
