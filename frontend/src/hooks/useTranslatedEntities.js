/**
 * useTranslatedEntities Hook
 * Generic hook to fetch and apply translations for any entity type
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../lib/apiClient";

/**
 * Batch fetch translations for multiple entities.
 * Uses a single backend call (/translations/batch/{type}) to avoid N+1 HTTP requests.
 */
async function fetchBatchTranslations(entityType, entityIds, languageCode) {
  if (!entityIds.length || languageCode === "en") return {};
  try {
    const response = await api.get(`/translations/batch/${entityType}`, {
      params: { language_code: languageCode }
    });
    const allTranslations = response.data?.translations || {};
    // Filter to just the requested entity_ids
    const map = {};
    for (const id of entityIds) {
      if (allTranslations[id]) map[id] = allTranslations[id];
    }
    return map;
  } catch (e) {
    console.debug(`Batch translation fetch failed for ${entityType}:`, e);
    return {};
  }
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
  
  const { data: translationsMap = {}, isLoading, error } = useQuery({
    queryKey: ["fm-translations", language, fmIds.length, fmIds.slice(0, 5).join(",")],
    queryFn: () => fetchBatchTranslations("failure_mode", fmIds, language),
    enabled: language !== "en" && fmIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    retry: false,
  });
  
  // Apply translations
  const translatedModes = useMemo(() => {
    if (language === "en") return failureModes;
    
    return failureModes.map(fm => {
      // Use failure_mode name as the key to look up translations
      const trans = translationsMap[fm.failure_mode];
      if (!trans) return fm;
      
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
  
  const { data: translationsMap = {}, isLoading } = useQuery({
    queryKey: ["et-translations", language, typeIds.length, typeIds.slice(0, 5).join(",")],
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
    isLoading,
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
    queryKey: ["node-translations", language, nodeIds.length, nodeIds.slice(0, 5).join(",")],
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
    queryKey: ["action-translations", language, actionIds.length, actionIds.slice(0, 5).join(",")],
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
    queryKey: ["obs-translations", language, obsIds.length, obsIds.slice(0, 5).join(",")],
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

/**
 * Hook to translate maintenance task templates
 */
export function useTranslatedTasks(tasks = []) {
  const { language } = useLanguage();
  
  const taskIds = useMemo(() => 
    tasks.map(t => t.id).filter(Boolean), 
    [tasks]
  );
  
  const { data: translationsMap = {} } = useQuery({
    queryKey: ["task-translations", language, taskIds.length, taskIds.slice(0, 5).join(",")],
    queryFn: () => fetchBatchTranslations("maintenance_task_template", taskIds, language),
    enabled: language !== "en" && taskIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  
  const translatedTasks = useMemo(() => {
    if (language === "en") return tasks;
    
    return tasks.map(task => {
      const trans = translationsMap[task.id];
      if (!trans) return task;
      
      return {
        ...task,
        name: trans.name || task.name,
        description: trans.description || task.description,
        procedure_steps: trans.procedure_steps ? trans.procedure_steps.split('\n') : task.procedure_steps,
        _translated: true,
        _originalName: task.name,
      };
    });
  }, [tasks, translationsMap, language]);
  
  return {
    tasks: translatedTasks,
    isTranslated: language !== "en" && Object.keys(translationsMap).length > 0,
  };
}

/**
 * Hook that returns a name-based translation map for failure modes.
 * Map: { englishName (lowercase): translatedName }.
 */
export function useFailureModeNameMap() {
  const { language } = useLanguage();
  const { data: map = {} } = useQuery({
    queryKey: ["fm-name-map-batch", language],
    queryFn: async () => {
      if (language === "en") return {};
      const r = await api.get(`/translations/batch/failure_mode`, {
        params: { language_code: language },
      });
      const out = {};
      const trans = r.data?.translations || {};
      for (const [name, fields] of Object.entries(trans)) {
        if (fields?.name) out[String(name).trim().toLowerCase()] = fields.name;
      }
      return out;
    },
    enabled: language !== "en",
    staleTime: 1000 * 60 * 10,
    retry: false,
  });
  return map;
}

export default {
  useTranslatedFailureModes,
  useTranslatedEquipmentTypes,
  useTranslatedHierarchyNodes,
  useTranslatedActions,
  useTranslatedObservations,
  useTranslatedTasks,
};

/**
 * Hook that returns a translation map for maintenance task templates keyed by task.id.
 * Map: { taskId: { name, description } }
 * Used to translate task names inside the Maintenance Strategy view, where each
 * task.id is the same as the translation entity_id (e.g. "task_<strategy_id>_<index>_<ts>").
 */
export function useMaintenanceTaskTemplateMap() {
  const { language } = useLanguage();
  const { data: map = {} } = useQuery({
    queryKey: ["maint-task-template-batch", language],
    queryFn: async () => {
      if (language === "en") return {};
      const r = await api.get(`/translations/batch/maintenance_task_template`, {
        params: { language_code: language },
      });
      return r.data?.translations || {};
    },
    enabled: language !== "en",
    staleTime: 1000 * 60 * 10,
    retry: false,
  });
  return map;
}

/**
 * Hook that returns a name-based translation map for equipment types.
 * Map: { englishName (lowercase): translatedName }.
 * Useful when you have free-text equipment type strings on entities
 * (e.g. `threat.asset = "Cooling Water Pump"`) and want to display
 * their translated counterpart without changing the underlying data.
 */
export function useEquipmentTypeNameMap() {
  const { language } = useLanguage();

  // Fetch all equipment types (provides English name → id)
  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ["equipment-types-list-for-name-map"],
    queryFn: async () => {
      const r = await api.get("/equipment-hierarchy/types");
      return r.data?.equipment_types || r.data || [];
    },
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  // Fetch batch translations for current language
  const { data: translationsByEntityId = {} } = useQuery({
    queryKey: ["equipment-type-batch-translations", language],
    queryFn: async () => {
      if (language === "en") return {};
      const r = await api.get(`/translations/batch/equipment_type`, {
        params: { language_code: language },
      });
      return r.data?.translations || {};
    },
    enabled: language !== "en",
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  return useMemo(() => {
    if (language === "en") return {};
    const map = {};
    for (const et of equipmentTypes) {
      const trans = translationsByEntityId[et.id];
      if (!trans?.name) continue;
      const engName = (et.name || "").trim();
      if (engName) map[engName.toLowerCase()] = trans.name;
    }
    return map;
  }, [equipmentTypes, translationsByEntityId, language]);
}

/**
 * Hook that returns a name-based translation map for equipment hierarchy nodes
 * (e.g. specific assets like "Cooling Water Pump", "Condensation Vessel").
 * Map: { englishName (lowercase): translatedName }.
 */
export function useEquipmentNodeNameMap() {
  const { language } = useLanguage();

  // Fetch all hierarchy nodes (provides English name → id)
  const { data: nodes = [] } = useQuery({
    queryKey: ["equipment-nodes-list-for-name-map"],
    queryFn: async () => {
      const r = await api.get("/equipment-hierarchy/nodes");
      return r.data?.nodes || r.data || [];
    },
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  // Fetch batch translations for current language
  const { data: translationsByEntityId = {} } = useQuery({
    queryKey: ["equipment-node-batch-translations", language],
    queryFn: async () => {
      if (language === "en") return {};
      const r = await api.get(`/translations/batch/equipment_node`, {
        params: { language_code: language },
      });
      return r.data?.translations || {};
    },
    enabled: language !== "en",
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  return useMemo(() => {
    if (language === "en") return {};
    const map = {};
    for (const n of nodes) {
      const trans = translationsByEntityId[n.id];
      if (!trans?.name) continue;
      const engName = (n.name || "").trim();
      if (engName) map[engName.toLowerCase()] = trans.name;
    }
    return map;
  }, [nodes, translationsByEntityId, language]);
}

/**
 * Hook that returns a translation map for hierarchy nodes keyed by node ID.
 * Map: { nodeId: { name, description } } — useful for translating both fields
 * (e.g. on the equipment hierarchy detail panel).
 */
export function useEquipmentNodeIdMap() {
  const { language } = useLanguage();

  const { data: translationsByEntityId = {} } = useQuery({
    queryKey: ["equipment-node-batch-translations", language],
    queryFn: async () => {
      if (language === "en") return {};
      const r = await api.get(`/translations/batch/equipment_node`, {
        params: { language_code: language },
      });
      return r.data?.translations || {};
    },
    enabled: language !== "en",
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  return language === "en" ? {} : translationsByEntityId;
}
