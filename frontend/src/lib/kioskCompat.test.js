import {
  legacyWidgetFontVars,
  legacyVmbTextStyle,
  useLegacyChartFallback,
} from "./kioskCompat";

describe("legacyWidgetFontVars", () => {
  it("returns CSS variables for md font size", () => {
    const vars = legacyWidgetFontVars({ font_size: "md" });
    expect(vars["--vmb-fs"]).toBe("12px");
    expect(vars.fontSize).toBe("12px");
    expect(vars["--vmb-pad"]).toBeTruthy();
  });

  it("defaults to md when font_size unknown", () => {
    const vars = legacyWidgetFontVars({});
    expect(vars["--vmb-fs"]).toBe("12px");
  });

  it("scales xl font size", () => {
    const vars = legacyWidgetFontVars({ font_size: "xl" });
    expect(vars["--vmb-fs"]).toBe("16px");
  });
});

describe("legacyVmbTextStyle", () => {
  it("returns role-specific styles", () => {
    expect(legacyVmbTextStyle("title").fontWeight).toBe(600);
    expect(legacyVmbTextStyle("value").fontWeight).toBe(700);
    expect(legacyVmbTextStyle("label").textTransform).toBe("uppercase");
  });

  it("falls back to body style", () => {
    expect(legacyVmbTextStyle("unknown")).toEqual(legacyVmbTextStyle("body"));
  });
});

describe("useLegacyChartFallback", () => {
  it("returns true when kiosk flag set", () => {
    window.__ASSETIQ_REACT_KIOSK__ = true;
    expect(useLegacyChartFallback()).toBe(true);
    delete window.__ASSETIQ_REACT_KIOSK__;
  });

  it("returns boolean without throwing", () => {
    expect(typeof useLegacyChartFallback()).toBe("boolean");
  });
});
