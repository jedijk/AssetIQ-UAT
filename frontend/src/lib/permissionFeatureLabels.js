/**
 * Permission feature labels aligned with nav / page titles (see layoutNavConfig + i18n nav.*).
 * Keep feature keys in sync with backend FEATURES in `backend/routes/permissions.py`.
 */
export const PERMISSION_FEATURE_NAME_KEYS = {
  observations: "nav.observations",
  investigations: "nav.causalEngine",
  actions: "nav.actions",
  tasks: "nav.myTasks",
  scheduler: "nav.taskScheduler",
  forms: "nav.formSubmissions",
  equipment: "nav.equipmentManager",
  library: "nav.library",
  library_ai_tools: "permissions.features.library_ai_tools.name",
  reliability_intelligence: "nav.reliabilityIntelligence",
  chat: "permissions.features.chat.name",
  statistics: "nav.statistics",
  feedback: "nav.feedback",
  users: "nav.userManagement",
  settings: "nav.settings",
};

export const PERMISSION_FEATURE_DESC_KEYS = {
  observations: "permissions.features.observations.description",
  investigations: "permissions.features.investigations.description",
  actions: "permissions.features.actions.description",
  tasks: "permissions.features.tasks.description",
  scheduler: "permissions.features.scheduler.description",
  forms: "permissions.features.forms.description",
  equipment: "permissions.features.equipment.description",
  library: "permissions.features.library.description",
  library_ai_tools: "permissions.features.library_ai_tools.description",
  reliability_intelligence: "permissions.features.reliability_intelligence.description",
  chat: "permissions.features.chat.description",
  statistics: "permissions.features.statistics.description",
  feedback: "permissions.features.feedback.description",
  users: "permissions.features.users.description",
  settings: "permissions.features.settings.description",
};

export const PERMISSION_SECTION_LABEL_KEYS = {
  observations: "permissions.sections.observations",
  operations: "permissions.sections.operations",
  reliability_intelligence: "permissions.sections.reliabilityIntelligence",
  reliability: "permissions.sections.reliability",
  collaboration: "permissions.sections.collaboration",
  administration: "permissions.sections.administration",
};

function resolveI18n(t, key, fallback) {
  if (!key) return fallback;
  const value = t(key);
  return value && value !== key ? value : fallback;
}

export function getPermissionFeatureName(t, featureKey, fallbackName) {
  return resolveI18n(t, PERMISSION_FEATURE_NAME_KEYS[featureKey], fallbackName);
}

export function getPermissionFeatureDescription(t, featureKey, fallbackDescription) {
  return resolveI18n(t, PERMISSION_FEATURE_DESC_KEYS[featureKey], fallbackDescription);
}

export function getPermissionSectionLabel(t, sectionId, fallbackLabel) {
  return resolveI18n(t, PERMISSION_SECTION_LABEL_KEYS[sectionId], fallbackLabel);
}
