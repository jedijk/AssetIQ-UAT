/**
 * Guided "Observation Resolution Workflow" tour — spotlights real workspace UI.
 *
 * Scene copy is resolved via i18n in getProgressTourScenes(t).
 */

/** Set false to hide the tour from Help and skip mounting the overlay. */
export const PROGRESS_OBSERVATION_TOUR_ENABLED = true;

const PROGRESS_TOUR_SCENE_DEFS = [
  {
    id: "open-observation",
    chapterKey: "open",
    navigateTo: "threats",
    target: '[data-testid^="threat-item-"]',
    cardPosition: "center",
    pulseTarget: true,
    spotlightZoom: 1.1,
    transition: "fade",
  },
  {
    id: "review-failure-mode",
    chapterKey: "failureMode",
    navigateTo: "workspace",
    target: '[data-testid="workspace-failure-mode-field"]',
    cardPosition: "right",
    pulseTarget: false,
    spotlightZoom: 1.08,
    transition: "fade",
  },
  {
    id: "link-failure-mode",
    chapterKey: "reliability",
    navigateTo: "workspace",
    openWorkspaceEdit: true,
    target: '[data-testid="workspace-failure-mode-edit"], [data-testid="workspace-failure-mode-field"]',
    cardPosition: "right",
    pulseTarget: true,
    spotlightZoom: 1.15,
    transition: "spotlight",
  },
  {
    id: "link-equipment",
    chapterKey: "equipment",
    navigateTo: "workspace",
    openWorkspaceEdit: true,
    target: '[data-testid="workspace-equipment-type-edit"], [data-testid="workspace-equipment-type-field"]',
    cardPosition: "right",
    pulseTarget: true,
    spotlightZoom: 1.15,
    transition: "spotlight",
  },
  {
    id: "ai-insights",
    chapterKey: "insights",
    navigateTo: "workspace",
    closeFullAnalysis: true,
    target: '[data-testid="workspace-reliability-intelligence"]',
    cardPosition: "left",
    pulseTarget: false,
    spotlightZoom: 1.06,
    transition: "fade",
  },
  {
    id: "recommended-actions",
    chapterKey: "recommendations",
    navigateTo: "workspace",
    target: '[data-testid="recommended-actions-panel"]',
    cardPosition: "left",
    pulseTarget: false,
    spotlightZoom: 1.06,
    transition: "pan",
  },
  {
    id: "generate-recommendations",
    chapterKey: "recommendations",
    navigateTo: "workspace",
    target: '[data-testid="run-ai-recommendations-btn"]',
    cardPosition: "left",
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "spotlight",
  },
  {
    id: "build-action-plan",
    chapterKey: "actionPlan",
    navigateTo: "workspace",
    target: '[data-testid="recommended-action-add-btn"]',
    cardPosition: "left",
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "spotlight",
  },
  {
    id: "refine-actions",
    chapterKey: "actionPlan",
    navigateTo: "workspace",
    target: '[data-testid="action-plan-panel"]',
    cardPosition: "left",
    pulseTarget: false,
    spotlightZoom: 1.06,
    transition: "fade",
  },
  {
    id: "validate-plan",
    chapterKey: "actionPlan",
    navigateTo: "workspace",
    target: '[data-testid^="action-plan-edit-"], [data-testid="action-plan-add-btn"]',
    cardPosition: "left",
    pulseTarget: true,
    spotlightZoom: 1.12,
    transition: "pan",
  },
  {
    id: "start-investigation",
    chapterKey: "investigation",
    navigateTo: "workspace",
    openFullAnalysis: true,
    dock: "top",
    target: '[data-testid="start-investigation-btn"], [data-testid="generate-causes-btn"]',
    cardPosition: "center",
    pulseTarget: true,
    spotlightZoom: 1.15,
    transition: "spotlight",
  },
  {
    id: "complete",
    chapterKey: "done",
    navigateTo: "workspace",
    closeFullAnalysis: true,
    target: '[data-testid="workspace-process-journey"], [data-testid="observation-workspace-page"]',
    cardPosition: "center",
    pulseTarget: false,
    spotlightZoom: 1.08,
    transition: "fade",
  },
];

export function getProgressTourScenes(t) {
  return PROGRESS_TOUR_SCENE_DEFS.map((def) => {
    const { chapterKey, ...scene } = def;
    const baseKey = `progressObservationTour.scenes.${def.id}`;
    const badgeKey = `${baseKey}.badge`;
    const badge = def.id === "complete" ? t(badgeKey) : undefined;
    return {
      ...scene,
      title: t(`${baseKey}.title`),
      narration: t(`${baseKey}.narration`),
      actionHint: t(`${baseKey}.actionHint`),
      chapter: t(`progressObservationTour.chapters.${chapterKey}`),
      ...(badge && badge !== badgeKey ? { badge } : {}),
    };
  });
}

export const PROGRESS_AUTO_PLAY_DURATION_MS = 7000;

export const PROGRESS_SCENE_DURATIONS_MS = {
  "open-observation": 9000,
  "review-failure-mode": 9000,
  "link-failure-mode": 10000,
  "link-equipment": 10000,
  "ai-insights": 11000,
  "recommended-actions": 9000,
  "generate-recommendations": 9000,
  "build-action-plan": 10000,
  "refine-actions": 10000,
  "validate-plan": 10000,
  "start-investigation": 11000,
  complete: 9000,
};

export const PROGRESS_TOUR_COMPLETION_STORAGE_KEY =
  "assetiq.progress_observation_tour_v2.completed";
export const PROGRESS_TOUR_LAST_RUN_STORAGE_KEY =
  "assetiq.progress_observation_tour_v2.last_run";
