/** Legacy level aliases → ISO 14224 (aligned with EquipmentManagerPage). */
export const LEGACY_LEVEL_MAP = {
  plant: "plant_unit",
  unit: "plant_unit",
  system: "section_system",
  section: "section_system",
  equipment: "equipment_unit",
  site: "installation",
  location: "installation",
  line: "section_system",
  production_line: "section_system",
  area: "section_system",
  zone: "section_system",
  auxiliary: "equipment_unit",
};

export function normalizeEquipmentLevel(level) {
  return LEGACY_LEVEL_MAP[level] || level;
}

/** ISO 14224 hierarchy level → LanguageContext key (equipment.tier*). */
export const LEVEL_LABEL_KEYS = {
  installation: "equipment.tierInstallation",
  plant_unit: "equipment.tierPlantUnit",
  section_system: "equipment.tierSectionSystem",
  equipment_unit: "equipment.tierEquipmentUnit",
  subunit: "equipment.tierSubunit",
  maintainable_item: "equipment.tierMaintainableItem",
  plant: "equipment.tierPlantUnit",
  unit: "equipment.tierPlantUnit",
  section: "equipment.tierSectionSystem",
  system: "equipment.tierSectionSystem",
  equipment: "equipment.tierEquipmentUnit",
  site: "equipment.tierInstallation",
  location: "equipment.tierInstallation",
  line: "equipment.tierSectionSystem",
  production_line: "equipment.tierSectionSystem",
  area: "equipment.tierSectionSystem",
  zone: "equipment.tierSectionSystem",
  auxiliary: "equipment.tierEquipmentUnit",
};

export function getEquipmentLevelLabel(t, level, normalizeLevel) {
  if (!level) return "";
  const normalized = normalizeLevel ? normalizeLevel(level) : normalizeEquipmentLevel(level);
  const key = LEVEL_LABEL_KEYS[normalized] || LEVEL_LABEL_KEYS[level];
  if (key) {
    const label = t(key);
    if (label && label !== key) return label;
  }
  return String(level).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** ISO / legacy level → LanguageContext key (equipment.tier*Desc). */
export const LEVEL_DESC_KEYS = {
  installation: "equipment.tierInstallationDesc",
  plant_unit: "equipment.tierPlantUnitDesc",
  section_system: "equipment.tierSectionSystemDesc",
  equipment_unit: "equipment.tierEquipmentUnitDesc",
  subunit: "equipment.tierSubunitDesc",
  maintainable_item: "equipment.tierMaintainableItemDesc",
  plant: "equipment.tierPlantUnitDesc",
  unit: "equipment.tierPlantUnitDesc",
  section: "equipment.tierSectionSystemDesc",
  system: "equipment.tierSectionSystemDesc",
  equipment: "equipment.tierEquipmentUnitDesc",
  site: "equipment.tierInstallationDesc",
  location: "equipment.tierInstallationDesc",
  line: "equipment.tierSectionSystemDesc",
  production_line: "equipment.tierSectionSystemDesc",
  area: "equipment.tierSectionSystemDesc",
  zone: "equipment.tierSectionSystemDesc",
  auxiliary: "equipment.tierEquipmentUnitDesc",
};

export function getEquipmentLevelDescription(t, level, normalizeLevel) {
  if (!level) return "";
  const normalized = normalizeLevel ? normalizeLevel(level) : normalizeEquipmentLevel(level);
  const key = LEVEL_DESC_KEYS[normalized] || LEVEL_DESC_KEYS[level];
  if (key) {
    const desc = t(key);
    if (desc && desc !== key) return desc;
  }
  return "";
}
