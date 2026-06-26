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

/** ISO levels (and legacy aliases) that may receive spare-part equipment links. */
export const SPARE_PART_LINKABLE_LEVELS = new Set([
  "equipment_unit",
  "subunit",
  "maintainable_item",
  "equipment",
  "tag",
]);

export function isSparePartLinkableLevel(level) {
  if (!level) return false;
  const normalized = normalizeLevel(level);
  return SPARE_PART_LINKABLE_LEVELS.has(level) || SPARE_PART_LINKABLE_LEVELS.has(normalized);
}
