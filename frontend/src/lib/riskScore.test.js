import { computeWeightedRiskScore, fmeaScoreFromFailureMode } from "./riskScore";

describe("fmeaScoreFromFailureMode", () => {
  it("computes score from S×O×D / 10", () => {
    expect(fmeaScoreFromFailureMode({ severity: 8, occurrence: 5, detectability: 4 })).toBe(16);
  });

  it("falls back to rpn / 10", () => {
    expect(fmeaScoreFromFailureMode({ rpn: 250 })).toBe(25);
  });

  it("clamps to 0–100", () => {
    expect(fmeaScoreFromFailureMode({ rpn: 1500 })).toBe(100);
  });

  it("returns null when inputs missing", () => {
    expect(fmeaScoreFromFailureMode(null)).toBeNull();
    expect(fmeaScoreFromFailureMode({})).toBeNull();
  });
});

describe("computeWeightedRiskScore", () => {
  it("uses default 0.75 / 0.25 weights", () => {
    expect(computeWeightedRiskScore(80, 40)).toBe(70);
  });

  it("respects custom weights", () => {
    expect(
      computeWeightedRiskScore(80, 40, { criticality_weight: 0.5, fmea_weight: 0.5 }),
    ).toBe(60);
  });

  it("clamps result to 0–100", () => {
    expect(computeWeightedRiskScore(200, 200)).toBe(100);
  });
});
