import { motion } from "framer-motion";
import { FailureModeViewPanel } from "../library";

export function FailureModesDetailPanel({
  selectedFm,
  isViewPanelFullscreen,
  isViewPanelEditing,
  viewPanelForm,
  setViewPanelForm,
  onStartEdit,
  onSave,
  onCancel,
  onClose,
  onDelete,
  onValidate,
  onUnvalidate,
  onShowVersionHistory,
  onImproveWithAI,
  onConsolidateActions,
  onMapActionDisciplines,
  equipmentTypes,
  categories,
  currentUser,
  t,
  onToggleFullscreen,
}) {
  if (!selectedFm) return null;

  const panelProps = {
    fm: selectedFm,
    isEditing: isViewPanelEditing,
    formData: viewPanelForm,
    setFormData: setViewPanelForm,
    onStartEdit,
    onSave,
    onCancel,
    onClose,
    onDelete,
    onValidate,
    onUnvalidate,
    onShowVersionHistory,
    onImproveWithAI,
    onConsolidateActions,
    onMapActionDisciplines,
    equipmentTypes,
    categories,
    currentUser,
    t,
    isFullscreen: isViewPanelFullscreen,
    onToggleFullscreen,
  };

  if (isViewPanelFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-hidden">
        <FailureModeViewPanel {...panelProps} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-1/2 lg:w-3/5 h-full min-h-0"
    >
      <FailureModeViewPanel {...panelProps} isFullscreen={false} />
    </motion.div>
  );
}
