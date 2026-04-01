/**
 * Causal Engine API
 * Centralized API calls for investigations and causal analysis
 */
import { getBackendUrl } from '../../lib/apiConfig';

const API_BASE_URL = getBackendUrl();

export const causalAPI = {
  // Investigations
  getInvestigations: async () => {
    const response = await fetch(`${API_BASE_URL}/api/investigations`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to fetch investigations");
    return response.json();
  },

  getInvestigation: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to fetch investigation");
    return response.json();
  },

  createInvestigation: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to create investigation");
    return response.json();
  },

  updateInvestigation: async (id, data) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update investigation");
    return response.json();
  },

  deleteInvestigation: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to delete investigation");
    return response.json();
  },

  // Events
  addEvent: async (investigationId, data) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${investigationId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to add event");
    return response.json();
  },

  updateEvent: async (investigationId, eventId, data) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${investigationId}/events/${eventId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update event");
    return response.json();
  },

  deleteEvent: async (investigationId, eventId) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${investigationId}/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to delete event");
    return response.json();
  },

  // Failures
  addFailure: async (investigationId, data) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${investigationId}/failures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to add failure");
    return response.json();
  },

  // Causes
  addCause: async (investigationId, data) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${investigationId}/causes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to add cause");
    return response.json();
  },

  // AI Generation
  generateCausalAnalysis: async (investigationId) => {
    const response = await fetch(`${API_BASE_URL}/api/investigations/${investigationId}/generate-analysis`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) throw new Error("Failed to generate analysis");
    return response.json();
  },
};

export default causalAPI;
