/**
 * Translation API Client
 * Handles language management, dictionary, and entity translations
 */

import api from '../apiClient';

const translationsAPI = {
  // ============= Languages =============
  
  /**
   * Get all supported languages
   */
  getLanguages: async (activeOnly = false) => {
    const response = await api.get(`/translations/languages`, {
      params: { active_only: activeOnly }
    });
    return response.data;
  },
  
  /**
   * Create a new language
   */
  createLanguage: async (languageData) => {
    const response = await api.post('/translations/languages', languageData);
    return response.data;
  },
  
  /**
   * Update language settings
   */
  updateLanguage: async (code, updates) => {
    const response = await api.patch(`/translations/languages/${code}`, updates);
    return response.data;
  },
  
  /**
   * Seed default languages (EN, NL, DE)
   */
  seedLanguages: async () => {
    const response = await api.post('/translations/languages/seed');
    return response.data;
  },
  
  // ============= Technical Dictionary =============
  
  /**
   * Get dictionary terms
   */
  getDictionary: async (options = {}) => {
    const response = await api.get('/translations/dictionary', { params: options });
    return response.data;
  },
  
  /**
   * Create a dictionary term
   */
  createDictionaryTerm: async (termData) => {
    const response = await api.post('/translations/dictionary', termData);
    return response.data;
  },
  
  /**
   * Update a dictionary term
   */
  updateDictionaryTerm: async (termId, updates) => {
    const response = await api.patch(`/translations/dictionary/${termId}`, updates);
    return response.data;
  },
  
  /**
   * Delete a dictionary term
   */
  deleteDictionaryTerm: async (termId) => {
    const response = await api.delete(`/translations/dictionary/${termId}`);
    return response.data;
  },
  
  /**
   * Seed default dictionary terms
   */
  seedDictionary: async () => {
    const response = await api.post('/translations/dictionary/seed');
    return response.data;
  },
  
  // ============= Entity Translations =============
  
  /**
   * Get translations for an entity
   */
  getEntityTranslations: async (entityType, entityId, languageCode = null) => {
    const params = {};
    if (languageCode) params.language_code = languageCode;
    const response = await api.get(`/translations/entities/${entityType}/${entityId}`, { params });
    return response.data;
  },
  
  /**
   * Generate AI translations for entities
   */
  generateTranslations: async (request) => {
    const response = await api.post('/translations/generate', request);
    return response.data;
  },
  
  /**
   * Update a translation
   */
  updateTranslation: async (translationId, updates) => {
    const response = await api.patch(`/translations/entities/${translationId}`, updates);
    return response.data;
  },
  
  /**
   * Bulk update translation statuses
   */
  bulkUpdateStatus: async (translationIds, status) => {
    const response = await api.post('/translations/bulk-status', {
      translation_ids: translationIds,
      status
    });
    return response.data;
  },
  
  // ============= Translation Jobs =============
  
  /**
   * Get translation jobs
   */
  getJobs: async (status = null, limit = 20) => {
    const params = { limit };
    if (status) params.status = status;
    const response = await api.get('/translations/jobs', { params });
    return response.data;
  },
  
  /**
   * Get a specific translation job
   */
  getJob: async (jobId) => {
    const response = await api.get(`/translations/jobs/${jobId}`);
    return response.data;
  },
  
  // ============= Statistics =============
  
  /**
   * Get translation statistics
   */
  getStats: async (entityType = null) => {
    const params = {};
    if (entityType) params.entity_type = entityType;
    const response = await api.get('/translations/stats', { params });
    return response.data;
  },
  
  // ============= User Language Preference =============
  
  /**
   * Get current user's language preference
   */
  getUserPreference: async () => {
    const response = await api.get('/translations/user/preference');
    return response.data;
  },
  
  /**
   * Set current user's language preference
   */
  setUserPreference: async (preferredLanguage, secondaryLanguage = null) => {
    const response = await api.post('/translations/user/preference', {
      preferred_language: preferredLanguage,
      secondary_language: secondaryLanguage
    });
    return response.data;
  },
  
  // ============= Utility =============
  
  /**
   * Translate a single piece of text
   */
  translateText: async (text, targetLanguage, sourceLanguage = 'en') => {
    const response = await api.post('/translations/translate-text', null, {
      params: { text, target_language: targetLanguage, source_language: sourceLanguage }
    });
    return response.data;
  },
};

export default translationsAPI;
