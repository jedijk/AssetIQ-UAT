import {
  LEGACY_LEVEL_MAP,
  normalizeEquipmentLevel,
  getEquipmentLevelLabel,
  getEquipmentLevelDescription,
} from "./equipmentLevelLabels";

const t = (key) => {
  const labels = {
    "equipment.tierPlantUnit": "Plant Unit",
    "equipment.tierSectionSystem": "Section / System",
    "equipment.tierPlantUnitDesc": "Plant unit description",
  };
  return labels[key] || key;
};

describe("normalizeEquipmentLevel", () => {
  it("maps legacy aliases to ISO 14224 levels", () => {
    expect(normalizeEquipmentLevel("plant")).toBe("plant_unit");
    expect(normalizeEquipmentLevel("system")).toBe("section_system");
    expect(normalizeEquipmentLevel("site")).toBe("installation");
  });

  it("passes through unknown levels", () => {
    expect(normalizeEquipmentLevel("subunit")).toBe("subunit");
  });
});

describe("getEquipmentLevelLabel", () => {
  it("uses i18n key when available", () => {
    expect(getEquipmentLevelLabel(t, "plant")).toBe("Plant Unit");
  });

  it("title-cases unknown levels", () => {
    expect(getEquipmentLevelLabel(t, "custom_level")).toBe("Custom Level");
  });

  it("returns empty string for falsy level", () => {
    expect(getEquipmentLevelLabel(t, null)).toBe("");
  });
});

describe("getEquipmentLevelDescription", () => {
  it("returns translated description", () => {
    expect(getEquipmentLevelDescription(t, "plant")).toBe("Plant unit description");
  });

  it("returns empty when no translation", () => {
    expect(getEquipmentLevelDescription(t, "subunit")).toBe("");
  });
});

describe("LEGACY_LEVEL_MAP", () => {
  it("maps production_line to section_system", () => {
    expect(LEGACY_LEVEL_MAP.production_line).toBe("section_system");
  });
});
