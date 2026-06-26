import {
  getUserPreferences,
  updateCachedPreferences,
  clearCachedPreferences,
  formatDate,
  formatDateRelative,
  formatDateOnlyCompact,
} from "./dateUtils";

describe("getUserPreferences", () => {
  beforeEach(() => {
    clearCachedPreferences();
    localStorage.clear();
  });

  it("returns defaults when localStorage empty", () => {
    const prefs = getUserPreferences();
    expect(prefs.date_format).toBe("YYYY-MM-DD");
    expect(prefs.time_format).toBe("24h");
    expect(prefs.timezone).toBeTruthy();
  });

  it("merges stored preferences", () => {
    localStorage.setItem(
      "userPreferences",
      JSON.stringify({ date_format: "DD/MM/YYYY", time_format: "12h" }),
    );
    const prefs = getUserPreferences();
    expect(prefs.date_format).toBe("DD/MM/YYYY");
    expect(prefs.time_format).toBe("12h");
  });
});

describe("updateCachedPreferences", () => {
  beforeEach(() => {
    clearCachedPreferences();
    localStorage.clear();
  });

  it("persists to localStorage", () => {
    updateCachedPreferences({ date_format: "MM/DD/YYYY" });
    const stored = JSON.parse(localStorage.getItem("userPreferences"));
    expect(stored.date_format).toBe("MM/DD/YYYY");
  });
});

describe("formatDate", () => {
  beforeEach(() => {
    clearCachedPreferences();
    localStorage.clear();
  });

  it("returns dash for invalid input", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
  });

  it("formats ISO date with default YYYY-MM-DD", () => {
    const result = formatDate("2024-06-15T12:00:00.000Z");
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/06|15/);
  });
});

describe("formatDateRelative", () => {
  beforeEach(() => {
    clearCachedPreferences();
  });

  it("returns Just now for recent timestamps", () => {
    const now = new Date();
    expect(formatDateRelative(now)).toBe("Just now");
  });
});

describe("formatDateOnlyCompact", () => {
  beforeEach(() => {
    clearCachedPreferences();
    updateCachedPreferences({ date_format: "YYYY-MM-DD", timezone: "UTC" });
  });

  it("returns em dash for missing date", () => {
    expect(formatDateOnlyCompact(null)).toBe("—");
  });

  it("formats compact numeric date", () => {
    const result = formatDateOnlyCompact("2024-03-05T00:00:00.000Z");
    expect(result).toMatch(/2024/);
  });
});
