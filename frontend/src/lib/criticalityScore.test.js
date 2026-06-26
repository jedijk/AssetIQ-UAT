import { computeCriticalityScore, getCriticalityDimensions } from "./criticalityScore";

describe("getCriticalityDimensions", () => {
  it("normalizes snake_case and legacy keys", () => {
    expect(
      getCriticalityDimensions({
        safety_impact: 4,
        production_impact: 3,
        environmental_impact: 2,
        reputation_impact: 1,
      }),
    ).toEqual({ safety: 4, production: 3, environmental: 2, reputation: 1 });
  });

  it("returns null for invalid input", () => {
    expect(getCriticalityDimensions(null)).toBeNull();
  });
});

describe("computeCriticalityScore", () => {
  it("matches backend formula", () => {
    const score = computeCriticalityScore({
      safety: 4,
      production: 3,
      environmental: 2,
      reputation: 1,
    });
    expect(score).toBe(Math.min(100, Math.round((4 * 25 + 3 * 20 + 2 * 15 + 1 * 10) / 3.5)));
  });

  it("returns null when all dimensions are zero", () => {
    expect(
      computeCriticalityScore({ safety: 0, production: 0, environmental: 0, reputation: 0 }),
    ).toBeNull();
  });
});
