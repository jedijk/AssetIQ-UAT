import { translateEnum } from "./translateEnum";

describe("translateEnum", () => {
  it("returns translated label when key exists", () => {
    const t = (key) => (key === "enums.open" ? "Open" : key);
    expect(translateEnum(t, "open")).toBe("Open");
  });

  it("falls back to raw value when untranslated", () => {
    const t = (key) => key;
    expect(translateEnum(t, "custom_status")).toBe("custom_status");
  });

  it("passes through empty values", () => {
    const t = () => "ignored";
    expect(translateEnum(t, "")).toBe("");
    expect(translateEnum(t, null)).toBeNull();
  });
});
