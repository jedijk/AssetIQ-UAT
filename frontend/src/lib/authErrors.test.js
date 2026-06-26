import {
  buildUnlockMailto,
  formatCountdown,
  parseAuthError,
} from "./authErrors";

describe("parseAuthError", () => {
  it("maps 401 to invalid credentials message", () => {
    const result = parseAuthError({
      response: { status: 401, data: { detail: "Login failed. Please try again." } },
    });
    expect(result.message).toBe("Invalid email or password.");
    expect(result.status).toBe(401);
  });

  it("detects account lockout from 423", () => {
    const result = parseAuthError({
      response: {
        status: 423,
        data: { detail: { message: "Account locked", error_code: "account_locked", retry_after_seconds: 900 } },
      },
    });
    expect(result.isLockout).toBe(true);
    expect(result.retryAfterSeconds).toBe(900);
    expect(result.errorCode).toBe("account_locked");
  });

  it("detects IP rate limit separately from lockout", () => {
    const result = parseAuthError({
      response: {
        status: 429,
        headers: { "retry-after": "120" },
        data: { detail: "Request throttled" },
      },
    });
    expect(result.isRateLimited).toBe(true);
    expect(result.isLockout).toBe(false);
    expect(result.retryAfterSeconds).toBe(120);
  });

  it("parses pydantic validation array detail", () => {
    const result = parseAuthError({
      response: {
        status: 422,
        data: { detail: [{ msg: "Field required" }] },
      },
    });
    expect(result.message).toBe("Field required");
  });
});

describe("formatCountdown", () => {
  it("formats mm:ss with zero padding", () => {
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("buildUnlockMailto", () => {
  it("includes user email in body when provided", () => {
    const link = buildUnlockMailto("user@example.com");
    expect(link).toContain("mailto:");
    expect(decodeURIComponent(link)).toContain("user@example.com");
  });
});
