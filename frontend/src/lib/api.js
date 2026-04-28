export { api, aiApi, API_URL } from "./apiClient";

export { authAPI } from "./apis/auth";
export { chatAPI, voiceAPI } from "./apis/chat";
export { threatsAPI, observationsAPI } from "./apis/threats";
export { statsAPI, reliabilityAPI } from "./apis/stats";
export { failureModesAPI } from "./apis/failureModes";
export { equipmentHierarchyAPI } from "./apis/equipment";
export { investigationAPI } from "./apis/investigations";
export { actionsAPI } from "./apis/actions";
export { aiRiskAPI } from "./apis/aiRisk";
export { maintenanceStrategyAPI } from "./apis/maintenanceStrategies";
export { usersAPI, rbacAPI } from "./apis/users";
export { feedbackAPI } from "./apis/feedback";
export { imageAnalysisAPI } from "./apis/imageAnalysis";
export { permissionsAPI } from "./apis/permissions";
export { qrCodeAPI } from "./apis/qr";
export { taskSchedulerAPI, myTasksAPI } from "./apis/tasks";
export { definitionsAPI, preferencesAPI, userStatsAPI } from "./apis/definitions";
export { productionAPI, getErrorMessage } from "./apis/production";
export { gdprAPI } from "./apis/gdpr";
export { labelsAPI } from "./apis/labels";

export { api as default } from "./apiClient";
