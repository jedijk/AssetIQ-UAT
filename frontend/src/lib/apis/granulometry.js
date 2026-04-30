import { api } from "../apiClient";

export const granulometryAPI = {
  listFormRecords: async ({ fromDate, toDate, bigBagNos, skip = 0, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    (bigBagNos || []).forEach((b) => {
      if (b) params.append("bigBagNo", b);
    });
    params.set("skip", String(skip));
    params.set("limit", String(limit));
    const res = await api.get(`/granulometry/form-records?${params.toString()}`);
    return res.data;
  },

  listFormBigBags: async ({ fromDate, toDate } = {}) => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const res = await api.get(`/granulometry/form-big-bags?${params.toString()}`);
    return res.data;
  },

  listRecords: async ({ fromDate, toDate, bigBagNos, skip = 0, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    (bigBagNos || []).forEach((b) => {
      if (b) params.append("bigBagNo", b);
    });
    params.set("skip", String(skip));
    params.set("limit", String(limit));
    const res = await api.get(`/granulometry/records?${params.toString()}`);
    return res.data;
  },

  getRecord: async (id) => {
    const res = await api.get(`/granulometry/records/${id}`);
    return res.data;
  },

  createRecord: async (payload) => {
    const res = await api.post(`/granulometry/records`, payload);
    return res.data;
  },

  updateRecord: async (id, payload) => {
    const res = await api.patch(`/granulometry/records/${id}`, payload);
    return res.data;
  },

  deleteRecord: async (id) => {
    const res = await api.delete(`/granulometry/records/${id}`);
    return res.data;
  },

  listBigBags: async ({ fromDate, toDate } = {}) => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const res = await api.get(`/granulometry/big-bags?${params.toString()}`);
    return res.data;
  },

  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post(`/granulometry/images/upload`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data; // { imageId, imageUrl }
  },
};

