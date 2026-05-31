/**
 * useTranslatedFailureModes Hook
 * Fetches and applies translations for failure modes based on user's language
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import translationsAPI from "../lib/apis/translations";

/**
 * Get a translated value with fallback
 */
function getTranslatedValue(translations, languageCode, fieldName, fallback) {
  const langTranslations = translations?.[languageCode];
  if (langTranslations && langTranslations[fieldName]) {
    return langTranslations[fieldName];
  }
  return fallback;
}

/**
 * Hook to get failure modes with translations applied
 * @param {Array} failureModes - Array of failure modes from API
 * @returns {Array} - Failure modes with translated fields based on current language
 */
export function useTranslatedFailureModes(failureModes = []) {
  const { language } = useLanguage();
  
  // Fetch translations for all failure modes in the list
  const fmIds = useMemo(() => failureModes.map(fm => fm.id).filter(Boolean), [failureModes]);
  
  const { data: translationsData } = useQuery({
    queryKey: ["fm-translations-batch", fmIds.join(","), language],
    queryFn: async () => {
      if (language === "en" || fmIds.length === 0) return {};
      
      // Fetch translations for each failure mode
      // In a production app, you'd want a batch endpoint
      const translationsMap = {};
      
      // Limit to first 50 for performance
      const idsToFetch = fmIds.slice(0, 50);
      
      await Promise.all(
        idsToFetch.map(async (id) => {
          try {
            const result = await translationsAPI.getEntityTranslations(
              "failure_mode", 
              id, 
              language
            );
            if (result?.translations) {
              translationsMap[id] = result.translations;
            }
          } catch (e) {
            // Silently fail for individual translations
          }
        })
      );
      
      return translationsMap;
    },
    enabled: language !== "en" && fmIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });
  
  // Apply translations to failure modes
  const translatedFailureModes = useMemo(() => {
    if (language === "en" || !translationsData) {
      return failureModes;
    }
    
    return failureModes.map(fm => {
      const translations = translationsData[fm.id];
      if (!translations) return fm;
      
      return {
        ...fm,
        // Apply translations to display fields
        failure_mode: getTranslatedValue(translations, language, "name", fm.failure_mode),
        description: getTranslatedValue(translations, language, "description", fm.description),
        potential_effects: getTranslatedValue(translations, language, "effects", fm.potential_effects),
        potential_causes: getTranslatedValue(translations, language, "causes", fm.potential_causes),
        // Keep original values accessible
        _original: {
          failure_mode: fm.failure_mode,
          description: fm.description,
          potential_effects: fm.potential_effects,
          potential_causes: fm.potential_causes,
        },
        _hasTranslation: true,
      };
    });
  }, [failureModes, translationsData, language]);
  
  return {
    failureModes: translatedFailureModes,
    language,
    isEnglish: language === "en",
    hasTranslations: !!translationsData && Object.keys(translationsData).length > 0,
  };
}

export default useTranslatedFailureModes;
