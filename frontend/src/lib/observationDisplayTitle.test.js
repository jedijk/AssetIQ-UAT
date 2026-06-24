import { buildObservationDisplayTitle, isMeaningfulFailureMode } from "./observationDisplayTitle";

describe("buildObservationDisplayTitle", () => {
  it("combines equipment and failure mode", () => {
    expect(
      buildObservationDisplayTitle({
        equipment: "Cooling Water Pump",
        failureMode: "Seal leak",
      }),
    ).toBe("Cooling Water Pump - Seal leak");
  });

  it("falls back to Problem when failure mode is missing", () => {
    expect(
      buildObservationDisplayTitle({
        equipment: "Cooling Water Pump",
        title: "Filters vervangen",
      }),
    ).toBe("Cooling Water Pump - Problem");
  });

  it("ignores generic failure mode placeholders", () => {
    expect(isMeaningfulFailureMode("unknown")).toBe(false);
    expect(
      buildObservationDisplayTitle({
        equipment: "Pump",
        failureMode: "N/A",
      }),
    ).toBe("Pump - Problem");
  });
});
