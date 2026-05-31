/**
 * useTranslatedEntities Hook
 * Generic hook to fetch and apply translations for any entity type
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../lib/apiClient";

/**
 * Batch fetch translations for multiple entities
 */
async function fetchBatchTranslations(entityType, entityIds, languageCode) {
  if (!entityIds.length || languageCode === "en") return {};
  
  // Fetch translations for each entity (limit to 100 for performance)
  const idsToFetch = entityIds.slice(0, 100);
  const translationsMap = {};
  
  await Promise.all(
    idsToFetch.map(async (id) => {
      try {
        // URL encode the entity ID since failure mode names can have spaces
        const encodedId = encodeURIComponent(id);
        const response = await api.get(`/translations/entities/${entityType}/${encodedId}`, {
          params: { language_code: languageCode }
        });
        if (response.data?.translations?.[languageCode]) {
          translationsMap[id] = response.data.translations[languageCode];
        }
      } catch (e) {
        // Silently fail for individual translations
        console.debug(`No translation found for ${entityType}/${id}`);
      }
    })
  );
  
  return translationsMap;
}

/**
 * Hook to translate failure modes
 */
export function useTranslatedFailureModes(failureModes = []) {
  const { language } = useLanguage();
  
  // Use failure_mode NAME as the primary identifier (this is how translations are stored)
  const fmIds = useMemo(() => 
    failureModes.map(fm => fm.failure_mode).filter(Boolean), 
    [failureModes]
  );
  
  // Debug logging
  console.log('[Translation] Language:', language, 'Total FMs:', fmIds.length, 'Sample IDs:', fmIds.slice(0, 3));
  
  const { data: translationsMap = {}, isLoading, error } = useQuery({
    queryKey: ["fm-translations", language, fmIds.slice(0, 50).join(",")],
    queryFn: () => {
      console.log('[Translation] Fetching translations for', fmIds.length, 'failure modes in', language);
      return fetchBatchTranslations("failure_mode", fmIds, language);
    },
    enabled: language !== "en" && fmIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    retry: false,
  });
  
  // Debug logging
  console.log('[Translation] TranslationsMap keys:', Object.keys(translationsMap).slice(0, 5), 'Error:', error);
  
  // Apply translations
  const translatedModes = useMemo(() => {
    if (language === "en") return failureModes;
    
    return failureModes.map(fm => {
      // Use failure_mode name as the key to look up translations
      const trans = translationsMap[fm.failure_mode];
      if (!trans) return fm;
      
      console.log('[Translation] Applying translation for:', fm.failure_mode, '->', trans.name);
      
      return {
        ...fm,
        // Apply translations, keeping originals as fallback
        failure_mode: trans.name || fm.failure_mode,
        name: trans.name || fm.name,
        description: trans.description || fm.description,
        potential_effects: trans.effects || fm.potential_effects,
        potential_causes: trans.causes || fm.potential_causes,
        // Mark as translated
        _translated: true,
        _originalName: fm.failure_mode || fm.name,
      };
    });
  }, [failureModes, translationsMap, language]);
  
  return {
    failureModes: translatedModes,
    isTranslated: language !== "en" && Object.keys(translationsMap).length > 0,
    isLoading,
  };
}

/**
 * Hook to translate equipment types
 */
export function useTranslatedEquipmentTypes(equipmentTypes = []) {
  const { language } = useLanguage();
  
  const typeIds = useMemo(() => 
    equipmentTypes.map(t => t.id).filter(Boolean), 
    [equipmentTypes]
  );
  
  const { data: translationsMap = {} } = useQuery({
    queryKey: ["et-translations", typeIds.slice(0, 20).join(","), language],
    queryFn: () => fetchBatchTranslations("equipment_type", typeIds, language),
    enabled: language !== "en" && typeIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  
  const translatedTypes = useMemo(() => {
    if (language === "en") return equipmentTypes;
    
    return equipmentTypes.map(et => {
      const trans = translationsMap[et.id];
      if (!trans) return et;
      
      return {
        ...et,
        name: trans.name || et.name,
        description: trans.description || et.description,
        _translated: true,
        _originalName: et.name,
      };
    });
  }, [equipmentTypes, translationsMap, language]);
  
  return {
    equipmentTypes: translatedTypes,
    isTranslated: language !== "en" && Object.keys(translationsMap).length > 0,
  };
}

/**
 * Hook to translate equipment hierarchy nodes
 */
export function useTranslatedHierarchyNodes(nodes = []) {
  const { language } = useLanguage();
  
  const nodeIds = useMemo(() => 
    nodes.map(n => n.id).filter(Boolean), 
    [nodes]
  );
  
  const { data: translationsMap = {} } = useQuery({
    queryKey: ["node-translations", nodeIds.slice(0, 50).join(","), language],
    queryFn: () => fetchBatchTranslations("equipment_node", nodeIds, language),
    enabled: language !== "en" && nodeIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  
  const translatedNodes = useMemo(() => {
    if (language === "en") return nodes;
    
    return nodes.map(node => {
      const trans = translationsMap[node.id];
      if (!trans) return node;
      
      return {
        ...node,
        name: trans.name || node.name,
        description: trans.description || node.description,
        _translated: true,
        _originalName: node.name,
      };
    });
  }, [nodes, translationsMap, language]);
  
  return {
    nodes: translatedNodes,
    isTranslated: language !== "en" && Object.keys(translationsMap).length > 0,
  };
}

/**
 * Hook to translate actions
 */
export function useTranslatedActions(actions = []) {
  const { language } = useLanguage();
  
  // Actions use the observation entity type for translations
  const actionIds = useMemo(() => 
    actions.map(a => a.id).filter(Boolean), 
    [actions]
  );
  
  const { data: translationsMap = {} } = useQuery({
    queryKey: ["action-translations", actionIds.slice(0, 50).join(","), language],
    queryFn: () => fetchBatchTranslations("observation", actionIds, language),
    enabled: language !== "en" && actionIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  
  const translatedActions = useMemo(() => {
    if (language === "en") return actions;
    
    return actions.map(action => {
      const trans = translationsMap[action.id];
      if (!trans) return action;
      
      return {
        ...action,
        title: trans.title || trans.name || action.title,
        description: trans.description || action.description,
        _translated: true,
        _originalTitle: action.title,
      };
    });
  }, [actions, translationsMap, language]);
  
  return {
    actions: translatedActions,
    isTranslated: language !== "en" && Object.keys(translationsMap).length > 0,
  };
}

/**
 * Hook to translate observations/threats
 */
export function useTranslatedObservations(observations = []) {
  const { language } = useLanguage();
  
  const obsIds = useMemo(() => 
    observations.map(o => o.id).filter(Boolean), 
    [observations]
  );
  
  const { data: translationsMap = {} } = useQuery({
    queryKey: ["obs-translations", obsIds.slice(0, 50).join(","), language],
    queryFn: () => fetchBatchTranslations("observation", obsIds, language),
    enabled: language !== "en" && obsIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  
  const translatedObs = useMemo(() => {
    if (language === "en") return observations;
    
    return observations.map(obs => {
      const trans = translationsMap[obs.id];
      if (!trans) return obs;
      
      return {
        ...obs,
        title: trans.title || trans.name || obs.title,
        description: trans.description || obs.description,
        _translated: true,
        _originalTitle: obs.title,
      };
    });
  }, [observations, translationsMap, language]);
  
  return {
    observations: translatedObs,
    isTranslated: language !== "en" && Object.keys(translationsMap).length > 0,
  };
}

export default {
  useTranslatedFailureModes,
  useTranslatedEquipmentTypes,
  useTranslatedHierarchyNodes,
  useTranslatedActions,
  useTranslatedObservations,
};
