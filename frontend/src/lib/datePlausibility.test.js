import {
  getDatePlausibilityIssue,
  isImplausibleFormDate,
  localTodayIsoDate,
  parseFormDateValue,
  snapFormDateToToday,
} from "./datePlausibility";

describe("parseFormDateValue", () => {
  it("parses ISO date fields", () => {
    const d = parseFormDateValue("2026-03-15", "date");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(15);
  });

  it("parses datetime-local values", () => {
    const d = parseFormDateValue("2026-03-15T14:30", "datetime");
    expect(d?.getHours()).toBe(14);
    expect(d?.getMinutes()).toBe(30);
  });

  it("returns null for invalid input", () => {
    expect(parseFormDateValue("", "date")).toBeNull();
    expect(parseFormDateValue("not-a-date", "date")).toBeNull();
  });
});

describe("getDatePlausibilityIssue", () => {
  const ref = new Date(2026, 5, 26);

  it("flags dates more than one year away", () => {
    const issue = getDatePlausibilityIssue("2016-01-01", "date", { referenceDate: ref });
    expect(issue?.implausible).toBe(true);
  });

  it("accepts dates within drift window", () => {
    const issue = getDatePlausibilityIssue("2026-06-20", "date", { referenceDate: ref });
    expect(issue?.implausible).toBe(false);
  });
});

describe("isImplausibleFormDate", () => {
  it("returns true only for implausible values", () => {
    const ref = new Date(2026, 5, 26);
    expect(isImplausibleFormDate("2010-01-01", "date", { referenceDate: ref })).toBe(true);
    expect(isImplausibleFormDate("2026-06-01", "date", { referenceDate: ref })).toBe(false);
  });
});

describe("localTodayIsoDate", () => {
  it("formats reference date as YYYY-MM-DD", () => {
    expect(localTodayIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("snapFormDateToToday", () => {
  it("preserves time when snapping datetime to today", () => {
    const ref = new Date(2026, 5, 26, 9, 0);
    expect(snapFormDateToToday("2010-01-01T14:45", "datetime", ref)).toBe("2026-06-26T14:45");
  });
});
