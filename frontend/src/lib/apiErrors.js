/**
 * Normalize FastAPI / axios error payloads into user-visible strings.
 * Avoids React "Objects are not valid as a React child" when detail is a
 * Pydantic validation object or array.
 */

export function formatApiErrorDetail(detail, fallback = "Request failed") {
  if (detail == null || detail === "") {
    return fallback;
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object") {
          return item.msg || item.message || item.detail || "";
        }
        return String(item);
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join(". ") : fallback;
  }
  if (typeof detail === "object") {
    return (
      detail.message ||
      detail.msg ||
      detail.detail ||
      fallback
    );
  }
  return String(detail);
}

export function formatApiError(error, fallback = "Request failed") {
  const detail = error?.response?.data?.detail;
  const message = formatApiErrorDetail(detail, "");
  if (message) return message;
  if (error?.message) return error.message;
  return fallback;
}
