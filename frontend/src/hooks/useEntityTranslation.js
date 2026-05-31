/**
 * useEntityTranslation Hook
 * Fetches and applies translations for entity data (failure modes, equipment types, etc.)
 */

import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import translationsAPI from "../lib/apis/translations";

/**
 * Hook to get translated value for an entity field
 * Falls back to original value if no translation exists
 */
export function useEntityTranslation(entityType, entityId, enabled = true) {
  const { language } = useLanguage();
  
  const { data, isLoading } = useQuery({
    queryKey: ["entity-translation", entityType, entityId, language],
    queryFn: () => translationsAPI.getEntityTranslations(entityType, entityId, language),
    enabled: enabled && !!entityId && language !== "en", // Only fetch for non-English
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: false,
  });
  
  /**
   * Get translated value for a field
   * @param {string} fieldName - The field to translate (e.g., "name", "description")
   * @param {string} fallback - Original English value to use if no translation
   */
  const getTranslation = (fieldName, fallback) => {
    if (language === "en") return fallback;
    
    const translations = data?.translations?.[language];
    if (translations && translations[fieldName]) {
      return translations[fieldName];
    }
    return fallback;
  };
  
  return {
    getTranslation,
    isLoading,
    hasTranslations: !!data?.translations?.[language],
  };
}

/**
 * Hook to translate multiple entities at once
 * Useful for lists of failure modes, equipment types, etc.
 */
export function useEntitiesTranslation(entityType, entityIds = [], enabled = true) {
  const { language } = useLanguage();
  
  // Create a map to store translations
  const translationsMap = {};
  
  // For now, we'll return a simple helper that works with pre-fetched data
  // In a production app, you'd batch these requests
  
  const getTranslation = (entityId, fieldName, fallback) => {
    if (language === "en") return fallback;
    
    const cached = translationsMap[entityId];
    if (cached && cached[fieldName]) {
      return cached[fieldName];
    }
    return fallback;
  };
  
  return {
    getTranslation,
    language,
    isEnglish: language === "en",
  };
}

/**
 * Helper to translate a single text using AI (for on-demand translation)
 */
export async function translateText(text, targetLanguage, sourceLanguage = "en") {
  if (!text || targetLanguage === sourceLanguage) return text;
  
  try {
    const result = await translationsAPI.translateText(text, targetLanguage, sourceLanguage);
    return result.translated || text;
  } catch (error) {
    console.error("Translation failed:", error);
    return text;
  }
}

export default useEntityTranslation;
