/**
 * Normalize auth API errors into a consistent shape for login UX.
 *
 * Backend status mapping:
 * - 401: Invalid email or password
 * - 403: Pending approval, rejected, or deactivated account
 * - 423: Account locked (too many failed sign-in attempts)
 * - 429: IP rate limit (slowapi) — distinct from account lockout
 */

const INVALID_CREDENTIALS = "Invalid email or password.";
const DEFAULT_MESSAGE = "Login failed. Please try again.";

function parseRetryAfterHeader(headers) {
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (raw == null || raw === "") return null;
  const parsed = parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractFromDetail(detail) {
  let message = null;
  let errorCode = null;
  let retryAfterSeconds = null;
  let remainingMinutes = null;

  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    message = detail.message || detail.detail || null;
    errorCode = detail.error_code || null;
    if (typeof detail.retry_after_seconds === "number") {
      retryAfterSeconds = detail.retry_after_seconds;
    }
    if (typeof detail.remaining_minutes === "number") {
      remainingMinutes = detail.remaining_minutes;
    }
  } else if (typeof detail === "string") {
    message = detail;
    const minsMatch = detail.match(/(\d+)\s*minute/i);
    if (minsMatch) {
      remainingMinutes = parseInt(minsMatch[1], 10);
    }
  } else if (Array.isArray(detail) && detail.length > 0) {
    message = detail.map((d) => (d?.msg ? d.msg : String(d))).join(" ");
  }

  return { message, errorCode, retryAfterSeconds, remainingMinutes };
}

export function parseAuthError(error) {
  const status = error?.response?.status ?? null;
  const detail = error?.response?.data?.detail;
  const headers = error?.response?.headers || {};

  const extracted = extractFromDetail(detail);
  let { message, errorCode, retryAfterSeconds, remainingMinutes } = extracted;

  if (!message && error?.message) {
    message = error.message;
  }
  if (!message) {
    message = DEFAULT_MESSAGE;
  }

  const headerRetry = parseRetryAfterHeader(headers);
  if (retryAfterSeconds == null && headerRetry != null) {
    retryAfterSeconds = headerRetry;
  }

  if (retryAfterSeconds == null && remainingMinutes != null) {
    retryAfterSeconds = remainingMinutes * 60;
  }

  if (!errorCode && typeof detail === "string" && /locked|too many/i.test(detail)) {
    errorCode = "account_locked";
  }
  if (!errorCode && status === 423) {
    errorCode = "account_locked";
  }

  // 423 = locked account; 429 + account_locked kept for backwards compatibility
  const isLockout =
    status === 423 ||
    errorCode === "account_locked" ||
    (status === 429 && errorCode === "account_locked");

  const isRateLimited = status === 429 && !isLockout;

  if (status === 401) {
    message =
      message === DEFAULT_MESSAGE || !message ? INVALID_CREDENTIALS : message;
  }

  if (isRateLimited) {
    if (retryAfterSeconds == null) {
      retryAfterSeconds = 60;
    }
    if (!errorCode) {
      errorCode = "rate_limited";
    }
  }

  if (isLockout && !errorCode) {
    errorCode = "account_locked";
  }

  return {
    message,
    retryAfterSeconds,
    remainingMinutes,
    isLockout,
    isRateLimited,
    status,
    errorCode,
  };
}

export function formatCountdown(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const SUPPORT_EMAIL = process.env.REACT_APP_SUPPORT_EMAIL || "";

export function buildUnlockMailto(userEmail = "") {
  const to = SUPPORT_EMAIL || "support@assetiq.com";
  const subject = encodeURIComponent("AssetIQ account unlock request");
  const body = encodeURIComponent(
    userEmail
      ? `Hello,\n\nPlease unlock my AssetIQ account (${userEmail}).\n\nThank you.`
      : "Hello,\n\nPlease unlock my AssetIQ account.\n\nThank you."
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
