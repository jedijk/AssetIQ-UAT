const GENERIC_FAILURE_MODES = new Set([
  "unknown",
  "not specified",
  "n/a",
  "na",
  "none",
  "-",
]);

export function isMeaningfulFailureMode(failureMode) {
  if (!failureMode || !String(failureMode).trim()) return false;
  return !GENERIC_FAILURE_MODES.has(String(failureMode).toLowerCase().trim());
}

/**
 * List/workspace title: "{equipment} - {failure mode}" when FM is known,
 * otherwise "{equipment} - Problem" or the observation title.
 */
export function buildObservationDisplayTitle({
  equipment = "",
  failureMode = "",
  title = "",
  problemLabel = "Problem",
} = {}) {
  const equipmentLabel = String(equipment || "").trim();

  if (isMeaningfulFailureMode(failureMode)) {
    return equipmentLabel ? `${equipmentLabel} - ${failureMode}` : failureMode;
  }

  return equipmentLabel ? `${equipmentLabel} - ${problemLabel}` : title || problemLabel;
}
