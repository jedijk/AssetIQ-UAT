import { api } from "../apiClient";

export async function listExternalApiKeys() {
  const response = await api.get("/admin/external-api/keys");
  return response.data;
}

export async function createExternalApiKey(payload) {
  const response = await api.post("/admin/external-api/keys", payload);
  return response.data;
}

export async function getExternalApiKey(keyId) {
  const response = await api.get(`/admin/external-api/keys/${keyId}`);
  return response.data;
}

export async function updateExternalApiKey(keyId, payload) {
  const response = await api.patch(`/admin/external-api/keys/${keyId}`, payload);
  return response.data;
}

export async function revokeExternalApiKey(keyId) {
  const response = await api.post(`/admin/external-api/keys/${keyId}/revoke`);
  return response.data;
}

export async function rotateExternalApiKey(keyId, gracePeriodHours = 24) {
  const response = await api.post(`/admin/external-api/keys/${keyId}/rotate`, {
    grace_period_hours: gracePeriodHours,
  });
  return response.data;
}

export async function getExternalApiKeyUsage(keyId) {
  const response = await api.get(`/admin/external-api/keys/${keyId}/usage`);
  return response.data;
}

export async function getExternalApiOpenApiInfo() {
  const response = await api.get("/v1/external/openapi-info");
  return response.data;
}
