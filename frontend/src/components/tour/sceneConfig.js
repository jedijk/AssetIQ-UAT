/**
 * Scene configuration for the cinematic "Create Your First Observation" tour.
 *
 * Each scene defines:
 *  - id:            unique identifier (used for analytics + LocalStorage)
 *  - title:         large headline (Apple-style)
 *  - narration:     concise body copy (max ~2 short sentences)
 *  - mockVisual:    key identifier for SceneMocks renderer (or null)
 *  - target:        CSS selector for the real DOM element to spotlight (or null)
 *  - cardPosition:  'center' | 'left' | 'right' | 'bottom' — preferred narration position
 *  - ensureChat:    'open' | 'closed' | null — UI state pre-requisite
 *  - ensureHierarchy: 'open' | 'closed' | null
 *  - pulseTarget:   show a pulsing ring around the spotlighted DOM element
 *  - spotlightZoom: cinematic scale multiplier applied to the spotlight (default 1)
 *  - transition:    'fade' | 'zoom' | 'pan' | 'spotlight' (controls Framer animation preset)
 *  - typedText:     text rendered with the typewriter animation inside mock visuals
 *  - badge:         optional status badge text shown in narration card
 */

export const TOUR_SCENES = [
  {
    id: "welcome",
    title: "Observations are where reliability intelligence begins",
    narration:
      "Observations capture problems, abnormalities and opportunities for improvement. Every threat, investigation and action starts with an observation.",
    mockVisual: "workspace",
    target: '[data-testid="hierarchy-sidebar"]',
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "open",
    pulseTarget: true,
    spotlightZoom: 1,
    transition: "fade",
    chapter: "Welcome",
  },
  {
    id: "select-equipment",
    title: "Find the affected equipment",
    narration:
      "Navigate through the hierarchy and select the equipment where the issue was observed.",
    mockVisual: "hierarchyZoom",
    target: '[data-testid="hierarchy-sidebar"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    pulseTarget: false,
    spotlightZoom: 1.05,
    transition: "zoom",
    chapter: "Select equipment",
  },
  {
    id: "context-menu",
    title: "Create directly from the hierarchy",
    narration: "Right-click any equipment and select Add Observation.",
    mockVisual: "contextMenu",
    target: '[data-testid="hierarchy-sidebar"]',
    cardPosition: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    pulseTarget: false,
    spotlightZoom: 1.05,
    transition: "spotlight",
    chapter: "From the hierarchy",
  },
  {
    id: "quick-add",
    title: "Use the Quick Add button",
    narration:
      "You can also create an observation using the + button available throughout AssetIQ.",
    mockVisual: "quickAdd",
    target: '[data-testid="fab-report-observation"]',
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: true,
    spotlightZoom: 1.4,
    transition: "pan",
    chapter: "Quick add",
  },
  {
    id: "ai-detection",
    title: "AssetIQ identifies the equipment automatically",
    narration:
      "Describe the issue in natural language. AssetIQ will attempt to identify the affected equipment from your description.",
    mockVisual: "aiDetection",
    target: null,
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1,
    transition: "fade",
    typedText: "Oil leak observed on Pump P-101 near mechanical seal.",
    badge: "Equipment matched",
    chapter: "AI detection",
  },
  {
    id: "clarification",
    title: "When equipment is unclear",
    narration:
      "If AssetIQ cannot confidently determine the affected equipment, it will help you find the correct asset.",
    mockVisual: "clarification",
    target: null,
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1,
    transition: "fade",
    typedText: "Found oil leak near production area.",
    badge: "Needs clarification",
    chapter: "Clarification",
  },
  {
    id: "describe",
    title: "Capture what was observed",
    narration:
      "Describe the issue as clearly as possible. AssetIQ uses this information for risk analysis and recommendations.",
    mockVisual: "describe",
    target: null,
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1,
    transition: "fade",
    typedText:
      "High vibration detected on Pump P-101. Abnormal noise present during operation.",
    chapter: "Describe the problem",
  },
  {
    id: "submit",
    title: "Create the observation",
    narration:
      "Submit the observation to begin AssetIQ's intelligence workflow.",
    mockVisual: "submit",
    target: null,
    cardPosition: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1,
    transition: "fade",
    chapter: "Submit",
  },
  {
    id: "next-steps",
    title: "AssetIQ goes to work",
    narration:
      "The observation becomes the foundation for threat assessment, AI risk analysis, investigations and recommended actions.",
    mockVisual: "nextSteps",
    target: null,
    cardPosition: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    pulseTarget: false,
    spotlightZoom: 1,
    transition: "fade",
    chapter: "What happens next",
  },
];

export const AUTO_PLAY_DURATION_MS = 6000;

/**
 * Per-scene auto-play durations (ms). Scenes that contain typewriter or
 * multi-step internal animations need more time so auto-play doesn't skip
 * mid-animation. Falls back to AUTO_PLAY_DURATION_MS.
 */
export const SCENE_DURATIONS_MS = {
  welcome: 6000,
  "select-equipment": 6000,
  "context-menu": 8000,        // context menu + cursor + success state
  "quick-add": 6000,
  "ai-detection": 8500,        // typewriter (~2s) + analyzing (1.1s) + read time
  clarification: 10000,         // typewriter + dialog + search animation + selection
  describe: 8500,               // longer typewriter + AI tag extraction
  submit: 7000,                 // submit pulse + success slide
  "next-steps": 9000,           // 6-step flow stagger + counter animations
};

export const TOUR_COMPLETION_STORAGE_KEY = "assetiq.observation_tour_v2.completed";
export const TOUR_LAST_RUN_STORAGE_KEY = "assetiq.observation_tour_v2.last_run";
