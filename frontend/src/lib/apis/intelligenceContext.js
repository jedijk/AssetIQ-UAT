/**
 * Intelligence Context Panel API — single-request upstream/downstream context.
 */
import { api } from "../apiClient";

export const intelligenceContextAPI = {
  /**
   * Strategy detail context for an equipment type maintenance strategy.
   */
  getStrategyContext: async (equipmentTypeId) => {
    const response = await api.get(
      `/intelligence-map/context/strategy/${encodeURIComponent(equipmentTypeId)}`,
    );
    return response.data;
  },
};
