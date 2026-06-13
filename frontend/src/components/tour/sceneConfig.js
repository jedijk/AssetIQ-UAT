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
    openMobileMenu: true,
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
    closeMobileMenu: true,
    pulseTarget: true,
    spotlightZoom: 1.25,
    transition: "pan",
  },
  {
    id: "hierarchy-select",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid^="hierarchy-node-"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    spotlightEquipmentItem: true,
    pulseTarget: true,
    spotlightZoom: 1.22,
    transition: "fade",
  },
  {
    id: "hierarchy-add",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid="hierarchy-context-menu"], [data-testid="context-menu-add-threat"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    openContextMenu: true,
    pulseTarget: true,
    spotlightZoom: 1.12,
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
    openMobileMenu: true,
    pulseTarget: false,
    spotlightZoom: 1.1,
    transition: "fade",
  },
];

/** Simple mode (operator landing) — same flow, different entry points and copy. */
const SIMPLE_TOUR_SCENE_DEFS = [
  {
    id: "observations",
    chapterKey: "observations",
    mockVisual: null,
    target: '[data-testid="operator-landing"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    ensureDashboard: true,
    pulseTarget: false,
    spotlightZoom: 1.08,
    transition: "fade",
  },
  {
    id: "hierarchy-open",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid="operator-btn-equipment"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    ensureDashboard: true,
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "pan",
  },
  {
    id: "hierarchy-select",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid^="hierarchy-node-"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "open",
    spotlightEquipmentItem: true,
    pulseTarget: true,
    spotlightZoom: 1.22,
    transition: "fade",
  },
  {
    id: "hierarchy-add",
    chapterKey: "hierarchy",
    mockVisual: null,
    target: '[data-testid="hierarchy-context-menu"], [data-testid="context-menu-add-threat"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "open",
    openContextMenu: true,
    pulseTarget: true,
    spotlightZoom: 1.12,
    transition: "spotlight",
  },
  {
    id: "report",
    chapterKey: "report",
    mockVisual: null,
    target: '[data-testid="fab-report-observation"]',
    cardPosition: "center",
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
    cardPosition: "center",
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
    cardPosition: "center",
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
    target:
      '[data-testid="operator-btn-observations"], [data-testid="operator-landing"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    ensureDashboard: true,
    pulseTarget: false,
    spotlightZoom: 1.08,
    transition: "fade",
  },
];

export function getTourScenes(t, { simpleMode = false, mobileMode = false } = {}) {
  const defs = simpleMode ? SIMPLE_TOUR_SCENE_DEFS : TOUR_SCENE_DEFS;
  const copySection = simpleMode ? "simpleScenes" : "scenes";

  const mobilePatches =
    mobileMode && !simpleMode
      ? {
          observations: { target: '[data-testid="mobile-nav-observations"]' },
          complete: { target: '[data-testid="mobile-nav-observations"]' },
        }
      : {};

  return defs.map((def) => {
    const { chapterKey, hasPrefill, ...scene } = { ...def, ...(mobilePatches[def.id] || {}) };
    const baseKey = `observationTour.${copySection}.${def.id}`;
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
