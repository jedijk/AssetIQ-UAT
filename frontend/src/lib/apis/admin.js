import { api } from "../apiClient";

export async function getMaintenanceReadiness() {
  const response = await api.get("/admin/maintenance-readiness");
  return response.data;
}
