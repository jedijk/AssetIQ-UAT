import { api } from "../apiClient";

// Equipment Hierarchy API (ISO 14224)
export const equipmentHierarchyAPI = {
  // Get library data
  getEquipmentTypes: async () => {
    const response = await api.get("/equipment-hierarchy/types");
    return response.data;
  },

  getDisciplines: async () => {
    const response = await api.get("/equipment-hierarchy/disciplines");
    return response.data;
  },

  getCriticalityProfiles: async () => {
    const response = await api.get("/equipment-hierarchy/criticality-profiles");
    return response.data;
  },

  getISOLevels: async () => {
    const response = await api.get("/equipment-hierarchy/iso-levels");
    return response.data;
  },

  // Node operations
  getNodes: async () => {
    const response = await api.get("/equipment-hierarchy/nodes");
    return response.data;
  },

  refreshCache: async () => {
    const response = await api.post("/equipment-hierarchy/refresh");
    return response.data;
  },

  getNode: async (nodeId) => {
    const response = await api.get(`/equipment-hierarchy/nodes/${nodeId}`);
    return response.data;
  },

  createNode: async (nodeData) => {
    const response = await api.post("/equipment-hierarchy/nodes", nodeData);
    return response.data;
  },

  updateNode: async (nodeId, updateData) => {
    const response = await api.patch(`/equipment-hierarchy/nodes/${nodeId}`, updateData);
    return response.data;
  },

  deleteNode: async (nodeId) => {
    const response = await api.delete(`/equipment-hierarchy/nodes/${nodeId}`);
    return response.data;
  },

  getDeletionImpact: async (nodeId) => {
    const response = await api.get(`/equipment-hierarchy/nodes/${nodeId}/deletion-impact`);
    return response.data;
  },

  moveNode: async (nodeId, newParentId, recalculateCriticality = true) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/move`, {
      node_id: nodeId,
      new_parent_id: newParentId,
      recalculate_criticality: recalculateCriticality,
    });
    return response.data;
  },

  changeNodeLevel: async (nodeId, newLevel, newParentId = null) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/change-level`, {
      new_level: newLevel,
      new_parent_id: newParentId,
    });
    return response.data;
  },

  reorderNode: async (nodeId, direction) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/reorder`, {
      direction,
    });
    return response.data;
  },

  reorderNodeToPosition: async (nodeId, targetNodeId, position, newParentId = null) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/reorder-to`, {
      target_node_id: targetNodeId,
      position,
      new_parent_id: newParentId,
    });
    return response.data;
  },

  assignCriticality: async (nodeId, assignment) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/criticality`, assignment);
    return response.data;
  },

  assignDiscipline: async (nodeId, discipline) => {
    const response = await api.post(`/equipment-hierarchy/nodes/${nodeId}/discipline?discipline=${discipline}`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get("/equipment-hierarchy/stats");
    return response.data;
  },

  // Unstructured items operations
  getUnstructuredItems: async () => {
    const response = await api.get("/equipment-hierarchy/unstructured");
    return response.data;
  },

  createUnstructuredItem: async (itemData) => {
    const response = await api.post("/equipment-hierarchy/unstructured", itemData);
    return response.data;
  },

  parseEquipmentList: async (content, source = "paste") => {
    const response = await api.post("/equipment-hierarchy/parse-list", { content, source });
    return response.data;
  },

  parseEquipmentFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/equipment-hierarchy/parse-file", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  assignUnstructuredToHierarchy: async (itemId, parentId, level) => {
    const response = await api.post(`/equipment-hierarchy/unstructured/${itemId}/assign`, {
      parent_id: parentId,
      level,
    });
    return response.data;
  },

  deleteUnstructuredItem: async (itemId) => {
    const response = await api.delete(`/equipment-hierarchy/unstructured/${itemId}`);
    return response.data;
  },

  clearUnstructuredItems: async () => {
    const response = await api.delete("/equipment-hierarchy/unstructured");
    return response.data;
  },

  // Equipment type management
  createEquipmentType: async (typeData) => {
    const response = await api.post("/equipment-hierarchy/types", typeData);
    return response.data;
  },

  updateEquipmentType: async (typeId, updateData) => {
    const response = await api.patch(`/equipment-hierarchy/types/${typeId}`, updateData);
    return response.data;
  },

  deleteEquipmentType: async (typeId) => {
    const response = await api.delete(`/equipment-hierarchy/types/${typeId}`);
    return response.data;
  },

  // Equipment history timeline
  getEquipmentHistory: async (nodeId) => {
    const response = await api.get(`/equipment-hierarchy/nodes/${nodeId}/history`);
    return response.data;
  },

  // Equipment files
  getEquipmentFiles: async (equipmentId) => {
    const response = await api.get(`/equipment/${equipmentId}/files`);
    return response.data;
  },
  uploadEquipmentFile: async (equipmentId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/equipment-files/${equipmentId}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  downloadEquipmentFile: async (fileId) => {
    const response = await api.get(`/equipment-files/${fileId}/download`, { responseType: "blob" });
    return response.data;
  },
  deleteEquipmentFile: async (fileId) => {
    const response = await api.delete(`/equipment-files/${fileId}`);
    return response.data;
  },
};

