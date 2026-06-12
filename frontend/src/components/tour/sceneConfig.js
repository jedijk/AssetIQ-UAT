/**
 * Guided "Create Your First Observation" tour — spotlights real UI controls.
 *
 * Each scene:
 *  - target: CSS selector for a live DOM element (required for guided steps)
 *  - ensureChat / ensureHierarchy: prep the app before spotlighting
 *  - prefillMessage: optional chat input prefill when chat opens
 *  - actionHint: short instruction shown under the narration
 *  - mockVisual: null (no cinematic mocks — use the real product)
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
    id: "report",
    title: "Start a new report",
    narration:
      "Click the + button to open the observation assistant. It works from any page.",
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
      "Confirmed observations appear in the list. From there, validate the failure mode, build an action plan, and track exposure reduction.",
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
  report: 10000,
  describe: 12000,
  send: 10000,
  complete: 8000,
};

export const TOUR_COMPLETION_STORAGE_KEY = "assetiq.observation_tour_v2.completed";
export const TOUR_LAST_RUN_STORAGE_KEY = "assetiq.observation_tour_v2.last_run";
