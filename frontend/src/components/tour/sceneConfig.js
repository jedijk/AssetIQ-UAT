/**
 * Guided "Create Your First Observation" tour — spotlights real UI controls.
 *
 * Scene copy is resolved via i18n in getTourScenes(t).
 */

const TOUR_SCENE_DEFS = [
  {
    id: "observations",
    chapterKey: "observations",
    mockVisual: null,
    target: '[data-testid="nav-observations"], [data-testid="mobile-nav-observations"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1.15,
    transition: "fade",
  },
  {
    id: "hierarchy-open",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid="hierarchy-toggle"], [data-testid="mobile-menu-toggle"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.25,
    transition: "pan",
  },
  {
    id: "hierarchy-select",
    chapterKey: "hierarchy",
    mockVisual: null,
    target:
      '[data-testid="hierarchy-sidebar"], [data-testid="mobile-hierarchy-panel"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    pulseTarget: false,
    spotlightZoom: 1.05,
    transition: "fade",
  },
  {
    id: "hierarchy-add",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid="context-menu-add-threat"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    openContextMenu: true,
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "spotlight",
  },
  {
    id: "report",
    chapterKey: "report",
    mockVisual: null,
    target: '[data-testid="fab-report-observation"]',
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.35,
    transition: "pan",
  },
  {
    id: "describe",
    chapterKey: "describe",
    mockVisual: null,
    target: '[data-testid="sidebar-chat-message-input"]',
    cardPosition: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    hasPrefill: true,
    pulseTarget: false,
    spotlightZoom: 1.08,
    transition: "fade",
  },
  {
    id: "send",
    chapterKey: "submit",
    mockVisual: null,
    target: '[data-testid="sidebar-send-message-button"]',
    cardPosition: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "spotlight",
  },
  {
    id: "complete",
    chapterKey: "done",
    mockVisual: null,
    target: '[data-testid="nav-observations"], [data-testid="mobile-nav-observations"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1.1,
    transition: "fade",
  },
];

export function getTourScenes(t) {
  return TOUR_SCENE_DEFS.map((def) => {
    const { chapterKey, hasPrefill, ...scene } = def;
    const baseKey = `observationTour.scenes.${def.id}`;
    return {
      ...scene,
      title: t(`${baseKey}.title`),
      narration: t(`${baseKey}.narration`),
      actionHint: t(`${baseKey}.actionHint`),
      chapter: t(`observationTour.chapters.${chapterKey}`),
      ...(hasPrefill ? { prefillMessage: t(`${baseKey}.prefillMessage`) } : {}),
    };
  });
}

export const AUTO_PLAY_DURATION_MS = 8000;

export const SCENE_DURATIONS_MS = {
  observations: 8000,
  "hierarchy-open": 9000,
  "hierarchy-select": 10000,
  "hierarchy-add": 10000,
  report: 10000,
  describe: 12000,
  send: 10000,
  complete: 8000,
};

export const TOUR_COMPLETION_STORAGE_KEY = "assetiq.observation_tour_v2.completed";
export const TOUR_LAST_RUN_STORAGE_KEY = "assetiq.observation_tour_v2.last_run";
