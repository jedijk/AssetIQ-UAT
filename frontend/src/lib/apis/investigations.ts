import { api } from "../apiClient";
import type {
  Investigation,
  InvestigationDeleteOptions,
  InvestigationDeleteResponse,
  InvestigationListResponse,
  InvestigationStatus,
} from "../../types/api/investigations";

type InvestigationSubResource = Record<string, unknown>;

/** Typed investigations API — Wave 6 TypeScript Phase 3 (wraps existing client). */
export const investigationAPI = {
  getAll: async (status: InvestigationStatus | null = null): Promise<InvestigationListResponse> => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get<InvestigationListResponse>(`/investigations${params}`);
    return response.data;
  },

  getById: async (id: string): Promise<Investigation> => {
    const response = await api.get<Investigation>(`/investigations/${id}`);
    return response.data;
  },

  create: async (data: Partial<Investigation>) => {
    const response = await api.post("/investigations", data);
    return response.data;
  },

  update: async (id: string, data: Partial<Investigation>) => {
    const response = await api.patch(`/investigations/${id}`, data);
    return response.data;
  },

  delete: async (
    id: string,
    options: InvestigationDeleteOptions = {}
  ): Promise<InvestigationDeleteResponse> => {
    const params = new URLSearchParams();
    if (options.deleteCentralActions) params.append("delete_central_actions", "true");
    const queryString = params.toString();
    const url = `/investigations/${id}${queryString ? `?${queryString}` : ""}`;
    const response = await api.delete<InvestigationDeleteResponse>(url);
    return response.data;
  },

  getStats: async (id: string) => {
    const response = await api.get(`/investigations/${id}/stats`);
    return response.data;
  },

  createFromThreat: async (threatId: string) => {
    const response = await api.post(`/threats/${threatId}/investigate`);
    return response.data;
  },

  // Timeline events
  createEvent: async (invId: string, data: InvestigationSubResource) => {
    const response = await api.post(`/investigations/${invId}/events`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateEvent: async (invId: string, eventId: string, data: InvestigationSubResource) => {
    const response = await api.patch(`/investigations/${invId}/events/${eventId}`, data);
    return response.data;
  },

  deleteEvent: async (invId: string, eventId: string) => {
    const response = await api.delete(`/investigations/${invId}/events/${eventId}`);
    return response.data;
  },

  // Failure identifications
  createFailure: async (invId: string, data: InvestigationSubResource) => {
    const response = await api.post(`/investigations/${invId}/failures`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateFailure: async (invId: string, failureId: string, data: InvestigationSubResource) => {
    const response = await api.patch(`/investigations/${invId}/failures/${failureId}`, data);
    return response.data;
  },

  deleteFailure: async (invId: string, failureId: string) => {
    const response = await api.delete(`/investigations/${invId}/failures/${failureId}`);
    return response.data;
  },

  // Cause nodes
  createCause: async (invId: string, data: InvestigationSubResource) => {
    const response = await api.post(`/investigations/${invId}/causes`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateCause: async (invId: string, causeId: string, data: InvestigationSubResource) => {
    const response = await api.patch(`/investigations/${invId}/causes/${causeId}`, data);
    return response.data;
  },

  deleteCause: async (invId: string, causeId: string) => {
    const response = await api.delete(`/investigations/${invId}/causes/${causeId}`);
    return response.data;
  },

  // Action items
  createAction: async (invId: string, data: InvestigationSubResource) => {
    const response = await api.post(`/investigations/${invId}/actions`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateAction: async (invId: string, actionId: string, data: InvestigationSubResource) => {
    const response = await api.patch(`/investigations/${invId}/actions/${actionId}`, data);
    return response.data;
  },

  deleteAction: async (invId: string, actionId: string) => {
    const response = await api.delete(`/investigations/${invId}/actions/${actionId}`);
    return response.data;
  },

  // Evidence
  addEvidence: async (invId: string, data: InvestigationSubResource) => {
    const response = await api.post(`/investigations/${invId}/evidence`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  deleteEvidence: async (invId: string, evidenceId: string) => {
    const response = await api.delete(`/investigations/${invId}/evidence/${evidenceId}`);
    return response.data;
  },

  uploadFile: async (invId: string, file: File, description: string | null = null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) {
      formData.append("description", description);
    }
    const response = await api.post(`/investigations/${invId}/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  downloadFile: async (storagePath: string) => {
    const response = await api.get(`/files/${storagePath}`, {
      responseType: "blob",
    });
    return response.data;
  },

  downloadReportPPTX: async (investigationId: string) => {
    const response = await api.get(`/investigations/${investigationId}/report/pptx`, {
      responseType: "blob",
    });
    return response.data;
  },

  downloadReportPDF: async (investigationId: string) => {
    const response = await api.get(`/investigations/${investigationId}/report/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  getAISummary: async (investigationId: string) => {
    const response = await api.get(`/investigations/${investigationId}/ai-summary`);
    return response.data;
  },

  aiProblemCheck: async (investigationId: string, description: string) => {
    const response = await api.post(`/investigations/${investigationId}/ai-problem-check`, {
      description,
    });
    return response.data;
  },

  getSimilarIncidents: async (investigationId: string) => {
    const response = await api.get(`/investigations/${investigationId}/similar-incidents`);
    return response.data;
  },

  getLinkedIncident: async (investigationId: string) => {
    const response = await api.get(`/investigations/${investigationId}/linked-incident`);
    return response.data;
  },

  updateRecurringQuadrant: async (investigationId: string, data: InvestigationSubResource) => {
    const response = await api.patch(`/investigations/${investigationId}/recurring-quadrant`, data);
    return response.data;
  },

  linkIncident: async (investigationId: string, linkedIncidentId: string) => {
    const response = await api.patch(
      `/investigations/${investigationId}/link-incident?linked_incident_id=${encodeURIComponent(linkedIncidentId)}`
    );
    return response.data;
  },

  unlinkIncident: async (investigationId: string) => {
    const response = await api.delete(`/investigations/${investigationId}/link-incident`);
    return response.data;
  },
};
