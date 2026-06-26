import {
  CRITICALITY_FIELD_BY_DIMENSION,
  translateCriticalityDimensionLabel,
  translateCriticalityLabel,
  translateCriticalityField,
  translateCriticalityDefinitionText,
} from "./criticalityDefinitionI18n";

const t = (key, params) => {
  const map = {
    "definitions.safety": "Safety",
    "definitions.defaultCriticality.1.label": "Level 1",
    "definitions.defaultCriticality.1.safety": "Minor injury",
    "observationWorkspace.levelN": `Level ${params?.rank}`,
  };
  return map[key] || key;
};

describe("CRITICALITY_FIELD_BY_DIMENSION", () => {
  it("maps safety dimension", () => {
    expect(CRITICALITY_FIELD_BY_DIMENSION.safety).toBe("safety");
    expect(CRITICALITY_FIELD_BY_DIMENSION.environmental).toBe("environment");
  });
});

describe("translateCriticalityDimensionLabel", () => {
  it("translates known dimensions", () => {
    expect(translateCriticalityDimensionLabel("safety", t)).toBe("Safety");
  });

  it("returns raw dimension when unknown", () => {
    expect(translateCriticalityDimensionLabel("custom", t)).toBe("custom");
  });
});

describe("translateCriticalityLabel", () => {
  it("uses rank-based i18n key", () => {
    expect(translateCriticalityLabel({ rank: 1, label: "L1" }, t)).toBe("Level 1");
  });

  it("translates label without rank", () => {
    expect(translateCriticalityLabel({ label: "high" }, t)).toBeTruthy();
  });
});

describe("translateCriticalityField", () => {
  it("returns translated field for rank row", () => {
    expect(translateCriticalityField({ rank: 1, safety: "raw" }, "safety", t)).toBe("Minor injury");
  });

  it("returns raw when no rank", () => {
    expect(translateCriticalityField({ safety: "raw" }, "safety", t)).toBe("raw");
  });
});

describe("translateCriticalityDefinitionText", () => {
  const defs = [{ rank: 1, safety: "Minor injury" }];

  it("finds definition by rank and field", () => {
    expect(
      translateCriticalityDefinitionText({
        criticalityDefs: defs,
        rank: 1,
        field: "safety",
        fallbackText: "fallback",
        t,
      }),
    ).toBe("Minor injury");
  });

  it("returns fallback when row missing", () => {
    expect(
      translateCriticalityDefinitionText({
        criticalityDefs: defs,
        rank: 99,
        field: "safety",
        fallbackText: "fallback",
        t,
      }),
    ).toBe("fallback");
  });
});
