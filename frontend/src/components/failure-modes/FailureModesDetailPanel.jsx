import { useMemo } from "react";
import { motion } from "framer-motion";
import { FailureModeViewPanel } from "../library";
import IntelligenceContextPanel, {
  IntelligenceContextToggle,
} from "../intelligence/IntelligenceContextPanel";
import { useIntelligenceContextPanel } from "../../hooks/useIntelligenceContextPanel";

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
  onCheckActionDowntime,
  equipmentTypes,
  categories,
  currentUser,
  t,
  onToggleFullscreen,
}) {
  const contextEquipmentTypeId = selectedFm?.equipment_type_ids?.[0] || null;
  const contextEquipmentTypeName = useMemo(() => {
    if (!contextEquipmentTypeId) return null;
    return equipmentTypes?.find((et) => et.id === contextEquipmentTypeId)?.name || null;
  }, [contextEquipmentTypeId, equipmentTypes]);

  const intelPanelStorageKey = selectedFm?.id
    ? `assetiq:intel-context:failure-mode:${selectedFm.id}:${contextEquipmentTypeId || "none"}`
    : null;
  const [intelPanelOpen, setIntelPanelOpen] = useIntelligenceContextPanel(intelPanelStorageKey);

  if (!selectedFm) return null;

  const intelligenceContextToggle = (
    <IntelligenceContextToggle
      open={intelPanelOpen}
      onToggle={() => setIntelPanelOpen((prev) => !prev)}
      disabled={!contextEquipmentTypeId}
      title={
        !contextEquipmentTypeId ? t("intelligenceContext.requiresEquipmentType") : undefined
      }
    />
  );

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
    onCheckActionDowntime,
    equipmentTypes,
    categories,
    currentUser,
    t,
    isFullscreen: isViewPanelFullscreen,
    onToggleFullscreen,
    intelligenceContextToggle,
  };

  const wrapWithIntelligencePanel = (content) => (
    <div className="flex items-start gap-0 min-h-0 h-full">
      <div className="flex-1 min-w-0 h-full">{content}</div>
      <IntelligenceContextPanel
        open={intelPanelOpen && !!contextEquipmentTypeId}
        onOpenChange={setIntelPanelOpen}
        objectType="strategy"
        objectId={contextEquipmentTypeId}
        equipmentTypeName={contextEquipmentTypeName || selectedFm.failure_mode}
      />
    </div>
  );

  if (isViewPanelFullscreen) {
    return wrapWithIntelligencePanel(
      <div className="fixed inset-0 z-50 bg-white overflow-hidden">
        <FailureModeViewPanel {...panelProps} />
      </div>,
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-1/2 lg:w-3/5 h-full min-h-0"
    >
      {wrapWithIntelligencePanel(<FailureModeViewPanel {...panelProps} isFullscreen={false} />)}
    </motion.div>
  );
}
