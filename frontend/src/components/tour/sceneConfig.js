/**
 * Guided "Create Your First Observation" tour — spotlights real UI controls.
 *
 * Each scene:
 *  - target: CSS selector for a live DOM element (required for guided steps)
 *  - ensureChat / ensureHierarchy: prep the app before spotlighting
 *  - prefillMessage: optional chat input prefill when chat opens
 *  - actionHint: short instruction shown under the narration
 *  - openContextMenu: demo hierarchy row menu for the Add Observation step
 */

export const TOUR_SCENES = [
  {
    id: "observations",
    title: "Where observations live",
    narration:
      "Observations record equipment issues. AssetIQ scores them and drives investigations and actions.",
    actionHint: "Open Observations anytime from the menu.",
    mockVisual: null,
    target: '[data-testid="nav-observations"], [data-testid="mobile-nav-observations"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1.15,
    transition: "fade",
    chapter: "Observations",
  },
  {
    id: "hierarchy-open",
    title: "Open the equipment hierarchy",
    narration:
      "You can start from the equipment tree. Open the hierarchy panel to browse assets by site, area, and unit.",
    actionHint:
      "Desktop: use the panel icon in the header. Mobile: Menu → Equipment Hierarchy.",
    mockVisual: null,
    target: '[data-testid="hierarchy-toggle"], [data-testid="mobile-menu-toggle"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.25,
    transition: "pan",
    chapter: "Hierarchy",
  },
  {
    id: "hierarchy-select",
    title: "Select equipment",
    narration:
      "Search or expand the tree until you find the affected equipment. Click a row to open its actions.",
    actionHint:
      "Desktop: right-click a row. Mobile: tap the equipment name.",
    mockVisual: null,
    target:
      '[data-testid="hierarchy-sidebar"], [data-testid="mobile-hierarchy-panel"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    pulseTarget: false,
    spotlightZoom: 1.05,
    transition: "fade",
    chapter: "Hierarchy",
  },
  {
    id: "hierarchy-add",
    title: "Add observation from hierarchy",
    narration:
      "Choose Add Observation to open the assistant with that equipment already linked.",
    actionHint: "Try Add Observation — or tap Next to continue the tour.",
    mockVisual: null,
    target: '[data-testid="context-menu-add-threat"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    openContextMenu: true,
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "spotlight",
    chapter: "Hierarchy",
  },
  {
    id: "report",
    title: "Or use the + button",
    narration:
      "You can also report from anywhere with the + button — useful when you already know what to describe.",
    actionHint: "Try clicking the + button now.",
    mockVisual: null,
    target: '[data-testid="fab-report-observation"]',
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.35,
    transition: "pan",
    chapter: "Report",
  },
  {
    id: "describe",
    title: "Describe what you saw",
    narration:
      "Type the issue in plain language. Mention equipment name or tag if you can — AssetIQ will match equipment and suggest a failure mode.",
    actionHint: "Edit the example text or type your own issue, then continue.",
    mockVisual: null,
    target: '[data-testid="sidebar-chat-message-input"]',
    cardPosition: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefillMessage: "High vibration on Pump P-101 during operation.",
    pulseTarget: false,
    spotlightZoom: 1.08,
    transition: "fade",
    chapter: "Describe",
  },
  {
    id: "send",
    title: "Submit the report",
    narration:
      "Press Send. AssetIQ summarises your report, matches equipment, and asks you to confirm before creating the observation.",
    actionHint: "Click Send when you are ready — or tap Next to continue the tour.",
    mockVisual: null,
    target: '[data-testid="sidebar-send-message-button"]',
    cardPosition: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.2,
    transition: "spotlight",
    chapter: "Submit",
  },
  {
    id: "complete",
    title: "You are ready",
    narration:
      "You can record observations from the hierarchy or the + button. Then validate the failure mode, build an action plan, and track exposure reduction.",
    actionHint: "Finish the tour and try reporting a real observation.",
    mockVisual: null,
    target: '[data-testid="nav-observations"], [data-testid="mobile-nav-observations"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1.1,
    transition: "fade",
    chapter: "Done",
  },
];

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
