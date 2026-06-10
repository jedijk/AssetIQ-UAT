import { api } from "../apiClient";

export const pushNotificationsAPI = {
  getVapidPublicKey: async () => {
    const response = await api.get("/push/vapid-public-key");
    return response.data;
  },

  getStatus: async () => {
    const response = await api.get("/push/status");
    return response.data;
  },

  subscribe: async (subscription) => {
    const json = typeof subscription?.toJSON === "function"
      ? subscription.toJSON()
      : subscription;
    const response = await api.post("/push/subscribe", json);
    return response.data;
  },

  unsubscribe: async (endpoint) => {
    const response = await api.delete("/push/subscribe", {
      data: endpoint ? { endpoint } : {},
    });
    return response.data;
  },

  sendTest: async () => {
    const response = await api.post("/push/test");
    return response.data;
  },
};
