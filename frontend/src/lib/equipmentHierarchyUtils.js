/**
 * Shared ISO 14224 hierarchy helpers (aligned with backend iso14224_models.py).
 */
import {
  LEGACY_LEVEL_MAP,
  normalizeEquipmentLevel,
} from "./equipmentLevelLabels";

export { LEGACY_LEVEL_MAP, normalizeEquipmentLevel };

/** Canonical ISO 14224 level order. */
export const LEVEL_ORDER = [
  "installation",
  "plant_unit",
  "section_system",
  "equipment_unit",
  "subunit",
  "maintainable_item",
];

export function normalizeLevel(level) {
  return normalizeEquipmentLevel(level);
}

export function getValidChildLevels(parentLevel) {
  const normalizedLevel = normalizeLevel(parentLevel);
  const idx = LEVEL_ORDER.indexOf(normalizedLevel);
  if (idx === -1 || idx >= LEVEL_ORDER.length - 1) return [];
  return [LEVEL_ORDER[idx + 1]];
}

export function canBeChildOf(childLevel, parentLevel) {
  const normalizedParent = normalizeLevel(parentLevel);
  const normalizedChild = normalizeLevel(childLevel);
  const parentIdx = LEVEL_ORDER.indexOf(normalizedParent);
  const childIdx = LEVEL_ORDER.indexOf(normalizedChild);
  return parentIdx >= 0 && childIdx === parentIdx + 1;
}
