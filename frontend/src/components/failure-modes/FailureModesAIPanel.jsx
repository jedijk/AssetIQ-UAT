import AIFailureModeSuggestions from "../library/AIFailureModeSuggestions";
import AINewEquipmentTypeSuggestions from "../library/AINewEquipmentTypeSuggestions";
import AINewFailureModeSuggestions from "../library/AINewFailureModeSuggestions";
import AIImproveFailureMode from "../library/AIImproveFailureMode";
import BulkImproveFailureModes from "../library/BulkImproveFailureModes";
import AIReviewActionDisciplines from "../library/AIReviewActionDisciplines";
import AIFindSimilarFailureModes from "../library/AIFindSimilarFailureModes";
import FindDuplicateActionsDialog from "../library/FindDuplicateActionsDialog";
import AIConsolidateFailureModeActions from "../library/AIConsolidateFailureModeActions";

export function FailureModesAIPanel({
  t,
  isOwner,
  isAISuggestionsOpen,
  setIsAISuggestionsOpen,
  isAINewTypesOpen,
  setIsAINewTypesOpen,
  isAINewFmOpen,
  setIsAINewFmOpen,
  isAIImproveOpen,
  setIsAIImproveOpen,
  isBulkImproveOpen,
  setIsBulkImproveOpen,
  isReviewDisciplinesOpen,
  setIsReviewDisciplinesOpen,
  isFindSimilarOpen,
  setIsFindSimilarOpen,
  isFindDuplicateActionsOpen,
  setIsFindDuplicateActionsOpen,
  isConsolidateActionsOpen,
  setIsConsolidateActionsOpen,
  equipmentTypes,
  failureModes,
  displayedFailureModes,
  hierarchyNodes,
  selectedFm,
  onApplyAIImprovement,
  onInvalidateFailureModes,
  onInvalidateEquipmentTypes,
  onConsolidateActionsApplied,
  onSelectFailureMode,
}) {
  return (
    <>
      <AIFailureModeSuggestions
        isOpen={isAISuggestionsOpen}
        onClose={() => setIsAISuggestionsOpen(false)}
        equipmentTypes={equipmentTypes}
        failureModes={failureModes}
        onAcceptSuggestions={() => {
          onInvalidateFailureModes();
          onInvalidateEquipmentTypes();
        }}
        t={t}
      />

      <AINewEquipmentTypeSuggestions
        isOpen={isAINewTypesOpen}
        onClose={() => setIsAINewTypesOpen(false)}
        nodes={hierarchyNodes}
        equipmentTypes={equipmentTypes}
        onCreated={onInvalidateEquipmentTypes}
      />

      <AINewFailureModeSuggestions
        isOpen={isAINewFmOpen}
        onClose={() => setIsAINewFmOpen(false)}
        equipmentTypes={equipmentTypes}
        failureModes={failureModes}
        onCreated={onInvalidateFailureModes}
        t={t}
      />

      <AIImproveFailureMode
        isOpen={isAIImproveOpen}
        onClose={() => setIsAIImproveOpen(false)}
        failureMode={selectedFm}
        equipmentTypes={equipmentTypes}
        onApply={onApplyAIImprovement}
      />

      <BulkImproveFailureModes
        isOpen={isBulkImproveOpen}
        onClose={() => setIsBulkImproveOpen(false)}
        failureModes={displayedFailureModes}
        equipmentTypes={equipmentTypes}
        onCompleted={onInvalidateFailureModes}
      />

      <AIReviewActionDisciplines
        open={isReviewDisciplinesOpen}
        onClose={() => setIsReviewDisciplinesOpen(false)}
        failureModes={failureModes}
        onApplied={onInvalidateFailureModes}
      />

      <AIFindSimilarFailureModes
        open={isFindSimilarOpen}
        onClose={() => setIsFindSimilarOpen(false)}
        failureModes={failureModes}
        equipmentTypes={equipmentTypes}
        onApplied={onInvalidateFailureModes}
      />

      {isOwner && (
        <FindDuplicateActionsDialog
          open={isFindDuplicateActionsOpen}
          onClose={() => setIsFindDuplicateActionsOpen(false)}
          failureModes={failureModes}
          onSelectFailureMode={onSelectFailureMode}
          onApplied={onInvalidateFailureModes}
        />
      )}

      <AIConsolidateFailureModeActions
        isOpen={isConsolidateActionsOpen}
        onClose={() => setIsConsolidateActionsOpen(false)}
        failureMode={selectedFm}
        onApplied={onConsolidateActionsApplied || onInvalidateFailureModes}
      />
    </>
  );
}
