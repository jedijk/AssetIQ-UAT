import { api } from "../apiClient";

// Image Analysis API
export const imageAnalysisAPI = {
  // Analyze single image for damage detection
  analyze: async (imageBase64, context = null, equipmentType = null) => {
    const response = await api.post("/image-analysis/analyze", {
      image_base64: imageBase64,
      context,
      equipment_type: equipmentType,
    });
    return response.data;
  },

  // Analyze multiple images
  analyzeMultiple: async (images, context = null, equipmentType = null) => {
    const response = await api.post("/image-analysis/analyze-multiple", {
      images,
      context,
      equipment_type: equipmentType,
    });
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.get("/image-analysis/health");
    return response.data;
  },
};

