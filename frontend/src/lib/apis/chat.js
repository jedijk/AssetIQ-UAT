import { api } from "../apiClient";

// Chat API
export const chatAPI = {
  sendMessage: async (content, imageBase64 = null, language = null) => {
    const payload = { content, image_base64: imageBase64 };
    if (language) payload.language = language;
    const response = await api.post("/chat/send", payload);
    return response.data;
  },

  getHistory: async (limit = 50) => {
    const response = await api.get(`/chat/history?limit=${limit}`);
    return response.data;
  },

  clearHistory: async () => {
    const response = await api.delete("/chat/clear");
    return response.data;
  },

  cancelFlow: async () => {
    const response = await api.post("/chat/cancel");
    return response.data;
  },
};

// Voice API
export const voiceAPI = {
  transcribe: async (audioBase64) => {
    const formData = new FormData();
    formData.append("audio_base64", audioBase64);
    const response = await api.post("/voice/transcribe", formData);
    return response.data;
  },
  /** Combined transcribe + send in one request (faster) */
  sendVoice: async (audioBlob, language = null) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    if (language) formData.append("language", language);
    const response = await api.post("/chat/voice-send", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    });
    return response.data;
  },
};

