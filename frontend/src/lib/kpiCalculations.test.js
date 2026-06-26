import { pctFormula, ratioFormula } from "./kpiCalculations";

describe("pctFormula", () => {
  it("formats percentage calculation", () => {
    expect(pctFormula(3, 4)).toBe("3 ÷ 4 × 100 = 75%");
  });

  it("uses provided value when given", () => {
    expect(pctFormula(3, 4, 80)).toBe("3 ÷ 4 × 100 = 80%");
  });

  it("handles zero denominator", () => {
    expect(pctFormula(1, 0)).toBe("No items in scope.");
  });
});

describe("ratioFormula", () => {
  it("formats ratio with one decimal", () => {
    expect(ratioFormula(5, 2)).toBe("5 ÷ 2 = 2.5 ratio");
  });

  it("handles zero denominator", () => {
    expect(ratioFormula(1, 0, "tasks per asset")).toBe("No items in scope for tasks per asset.");
  });
});
