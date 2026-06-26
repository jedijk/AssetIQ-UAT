import {
  getCookie,
  setCsrfToken,
  clearCsrfToken,
  getCsrfToken,
  getAuthHeaders,
} from "./apiConfig";

describe("getCookie", () => {
  afterEach(() => {
    document.cookie = "assetiq_csrf=; Max-Age=0";
    document.cookie = "other=; Max-Age=0";
  });

  it("reads cookie by name", () => {
    document.cookie = "assetiq_csrf=abc123; path=/";
    expect(getCookie("assetiq_csrf")).toBe("abc123");
  });

  it("returns null for missing cookie", () => {
    expect(getCookie("missing")).toBeNull();
  });
});

describe("CSRF token session storage", () => {
  beforeEach(() => {
    document.cookie = "assetiq_csrf=; Max-Age=0";
    sessionStorage.clear();
    clearCsrfToken();
  });

  it("stores and retrieves token", () => {
    setCsrfToken("token-xyz");
    expect(sessionStorage.getItem("assetiq_csrf_token")).toBe("token-xyz");
    expect(getCsrfToken()).toBe("token-xyz");
  });

  it("clears token", () => {
    setCsrfToken("token-xyz");
    clearCsrfToken();
    expect(sessionStorage.getItem("assetiq_csrf_token")).toBeNull();
  });

  it("prefers cookie over session storage", () => {
    document.cookie = "assetiq_csrf=from-cookie";
    setCsrfToken("from-session");
    expect(getCsrfToken()).toBe("from-cookie");
  });
});

describe("getAuthHeaders", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("adds bearer token in bearer mode", () => {
    localStorage.setItem("token", "jwt-token");
    const headers = getAuthHeaders({}, "GET");
    expect(headers.Authorization).toBe("Bearer jwt-token");
  });

  it("merges additional headers", () => {
    const headers = getAuthHeaders({ "X-Custom": "1" }, "GET");
    expect(headers["X-Custom"]).toBe("1");
  });
});
