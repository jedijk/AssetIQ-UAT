import {
  isSamsungTVBrowser,
  isIOSLikeDevice,
  isAndroidDevice,
  isTouchMobileDevice,
  isConnectedDomNode,
} from "./deviceUtils";

describe("isSamsungTVBrowser", () => {
  it("detects Tizen user agents", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)",
      configurable: true,
    });
    expect(isSamsungTVBrowser()).toBe(true);
  });

  it("returns false for desktop Chrome", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 Chrome/120.0",
      configurable: true,
    });
    expect(isSamsungTVBrowser()).toBe(false);
  });
});

describe("isIOSLikeDevice", () => {
  it("detects iPhone", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      configurable: true,
    });
    expect(isIOSLikeDevice()).toBe(true);
  });

  it("returns false for generic desktop", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0)",
      configurable: true,
    });
    expect(isIOSLikeDevice()).toBe(false);
  });
});

describe("isAndroidDevice", () => {
  it("detects Android", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14)",
      configurable: true,
    });
    expect(isAndroidDevice()).toBe(true);
  });
});

describe("isTouchMobileDevice", () => {
  it("is true for iOS or Android", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14)",
      configurable: true,
    });
    expect(isTouchMobileDevice()).toBe(true);
  });
});

describe("isConnectedDomNode", () => {
  it("returns true only for connected elements", () => {
    const el = document.createElement("span");
    expect(isConnectedDomNode(el)).toBe(false);
    document.body.appendChild(el);
    expect(isConnectedDomNode(el)).toBe(true);
    document.body.removeChild(el);
  });
});
