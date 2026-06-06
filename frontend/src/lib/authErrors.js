/**
 * Normalize auth API errors into a consistent shape for login UX.
 */
export function parseAuthError(error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  const headers = error?.response?.headers || {};

  let message = "Login failed. Please try again.";
  let retryAfterSeconds = null;
  let isLockout = false;
  let errorCode = null;

  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    message = detail.message || detail.detail || message;
    retryAfterSeconds =
      typeof detail.retry_after_seconds === "number"
        ? detail.retry_after_seconds
        : null;
    errorCode = detail.error_code || null;
    isLockout =
      errorCode === "account_locked" ||
      errorCode === "rate_limited" ||
      status === 429;
  } else if (typeof detail === "string") {
    message = detail;
    isLockout = status === 429 || /locked|too many/i.test(detail);
    const minsMatch = detail.match(/(\d+)\s*minute/i);
    if (minsMatch) {
      retryAfterSeconds = parseInt(minsMatch[1], 10) * 60;
    }
  } else if (Array.isArray(detail) && detail.length > 0) {
    message = detail.map((d) => (d?.msg ? d.msg : String(d))).join(" ");
  } else if (error?.message) {
    message = error.message;
  }

  if (status === 401) {
    message = message || "Invalid email or password.";
  }

  const retryAfterHeader = headers["retry-after"];
  if (retryAfterHeader != null && retryAfterSeconds == null) {
    const parsed = parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(parsed)) {
      retryAfterSeconds = parsed;
    }
  }

  if (status === 429 && retryAfterSeconds == null) {
    retryAfterSeconds = 60;
    isLockout = true;
  }

  return {
    message,
    retryAfterSeconds,
    isLockout,
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
