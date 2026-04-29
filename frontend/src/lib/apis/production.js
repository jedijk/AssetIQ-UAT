import { api } from "../apiClient";

// Production Dashboard API
export const productionAPI = {
  getDashboard: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.date) qs.append("date", params.date);
    if (params.from_date) qs.append("from_date", params.from_date);
    if (params.to_date) qs.append("to_date", params.to_date);
    if (params.shift) qs.append("shift", params.shift);
    // Bypass browser/CDN/proxy caching for live KPI data — same URL otherwise may return stale JSON.
    qs.append("_cb", String(Date.now()));
    const response = await api.get(`/production/dashboard?${qs.toString()}`, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    return response.data;
  },
  getEvents: async (date, eventType) => {
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (eventType) params.append("event_type", eventType);
    const response = await api.get(`/production/events?${params.toString()}`);
    return response.data;
  },
  createEvent: async (data) => {
    const response = await api.post("/production/events", data);
    return response.data;
  },
  deleteEvent: async (eventId) => {
    const response = await api.delete(`/production/events/${eventId}`);
    return response.data;
  },
  updateSubmission: async (submissionId, values) => {
    const response = await api.patch(`/production/submission/${submissionId}`, { values });
    return response.data;
  },
  createViscositySubmission: async (datetime, measurement) => {
    const response = await api.post("/production/create-viscosity", { datetime, measurement });
    return response.data;
  },
  clearSeedData: async () => {
    const response = await api.delete("/production/seed-data");
    return response.data;
  },
  deleteSubmission: async (submissionId) => {
    const response = await api.delete(`/form-submissions/${submissionId}`);
    return response.data;
  },
  generateAiInsights: async (dashboardData) => {
    const response = await api.post("/production/ai-insights", dashboardData);
    return response.data;
  },
};

/**
 * Safely extract error message from API error response.
 * Handles Pydantic validation errors (array of objects) and standard error formats.
 */
export const getErrorMessage = (error, fallback = "An error occurred") => {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    // Pydantic validation errors
    return detail[0]?.msg || detail[0]?.message || fallback;
  }

  if (error?.message) {
    return error.message;
  }

  return fallback;
};

