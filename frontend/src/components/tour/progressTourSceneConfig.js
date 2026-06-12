/**
 * Scene configuration for the cinematic "Progress an Observation" tour.
 */

export const PROGRESS_TOUR_SCENES = [
  {
    id: "opened",
    title: "Start with the Observation",
    narration:
      "Every reliability improvement starts with an observation. AssetIQ uses the reported problem to identify potential failure modes, investigations and corrective actions.",
    mockVisual: "progressOpened",
    target: null,
    cardPosition: "center",
    transition: "fade",
    chapter: "Observation opened",
    typedText: "High vibration detected on Pump P-101 during operation.",
  },
  {
    id: "suggested-fm",
    title: "Review the Suggested Failure Mode",
    narration:
      "AssetIQ analyses the observation and equipment context to identify the most likely failure mode.",
    mockVisual: "progressSuggestedFm",
    target: null,
    cardPosition: "left",
    transition: "zoom",
    chapter: "Suggested failure mode",
    badge: "AI suggested",
  },
  {
    id: "confirm-fm",
    title: "Apply Engineering Judgement",
    narration:
      "Review whether the suggested failure mode accurately explains the reported problem. Confirm when correct, or search the library to select a better match.",
    mockVisual: "progressConfirmFm",
    target: null,
    cardPosition: "left",
    transition: "spotlight",
    chapter: "Confirm failure mode",
  },
  {
    id: "investigation-decision",
    title: "Do We Understand the Cause?",
    narration:
      "Some observations can move directly to action planning. Others require investigation before corrective actions can be selected.",
    mockVisual: "progressInvestigationDecision",
    target: null,
    cardPosition: "center",
    transition: "fade",
    chapter: "Investigation decision",
  },
  {
    id: "ai-analysis",
    title: "Analyse the Observation",
    narration:
      "AssetIQ AI evaluates the observation, equipment context, reliability knowledge and historical information to identify possible causes and investigative paths.",
    mockVisual: "progressAiAnalysis",
    target: null,
    cardPosition: "left",
    transition: "zoom",
    chapter: "AI analysis",
    badge: "AI processing",
  },
  {
    id: "create-investigation",
    title: "Create an Investigation",
    narration:
      "Convert the AI analysis into a structured investigation and begin collecting evidence.",
    mockVisual: "progressCreateInvestigation",
    target: null,
    cardPosition: "left",
    transition: "fade",
    chapter: "Create investigation",
  },
  {
    id: "investigation-plan",
    title: "Follow the Investigation Plan",
    narration:
      "AssetIQ proposes investigation activities and evidence requirements.",
    mockVisual: "progressInvestigationPlan",
    target: null,
    cardPosition: "left",
    transition: "pan",
    chapter: "Investigation plan",
    badge: "AI generated",
  },
  {
    id: "investigation-results",
    title: "Confirm the Cause",
    narration:
      "Once evidence has been collected, validate the most likely failure mode and continue to action planning.",
    mockVisual: "progressInvestigationResults",
    target: null,
    cardPosition: "center",
    transition: "fade",
    chapter: "Investigation results",
    badge: "Investigation complete",
  },
  {
    id: "recommended-actions",
    title: "Review Recommended Actions",
    narration:
      "AssetIQ recommends actions associated with the selected failure mode and reliability strategy.",
    mockVisual: "progressRecommendedActions",
    target: null,
    cardPosition: "left",
    transition: "pan",
    chapter: "Recommended actions",
  },
  {
    id: "ai-recommendations",
    title: "Need More Actions?",
    narration:
      "If additional mitigations are required, AssetIQ AI can propose further recommendations.",
    mockVisual: "progressAiRecommendations",
    target: null,
    cardPosition: "left",
    transition: "zoom",
    chapter: "AI recommendations",
    badge: "AI generated",
  },
  {
    id: "action-plan",
    title: "Build the Response Plan",
    narration:
      "Select the actions required to reduce risk and resolve the issue.",
    mockVisual: "progressActionPlan",
    target: null,
    cardPosition: "left",
    transition: "fade",
    chapter: "Action plan",
  },
  {
    id: "add-to-plan",
    title: "Add Recommended Actions",
    narration:
      "Recommended actions can be added directly into the action plan.",
    mockVisual: "progressAddToPlan",
    target: null,
    cardPosition: "left",
    transition: "spotlight",
    chapter: "Add to plan",
  },
  {
    id: "edit-actions",
    title: "Tailor Actions to Your Site",
    narration:
      "Recommended actions are a starting point. Adjust them to fit local operating requirements.",
    mockVisual: "progressEditActions",
    target: null,
    cardPosition: "left",
    transition: "fade",
    chapter: "Edit actions",
  },
  {
    id: "manual-action",
    title: "Add Missing Actions",
    narration:
      "Create additional actions whenever work is required that was not suggested by AssetIQ.",
    mockVisual: "progressManualAction",
    target: null,
    cardPosition: "left",
    transition: "fade",
    chapter: "Manual actions",
  },
  {
    id: "review-plan",
    title: "Validate the Plan",
    narration:
      "Review all selected, AI-generated and manually created actions before finalizing.",
    mockVisual: "progressReviewPlan",
    target: null,
    cardPosition: "center",
    transition: "zoom",
    chapter: "Review plan",
  },
  {
    id: "finalize",
    title: "Observation Successfully Progressed",
    narration:
      "The observation now has a validated failure mode and a complete action plan ready for execution.",
    mockVisual: "progressFinalize",
    target: null,
    cardPosition: "center",
    transition: "fade",
    chapter: "Finalize",
    badge: "Observation progressed",
  },
  {
    id: "business-impact",
    title: "From Observation to Exposure Reduction",
    narration:
      "AssetIQ transforms observations into structured reliability improvements that reduce operational exposure.",
    mockVisual: "progressBusinessImpact",
    target: null,
    cardPosition: "center",
    transition: "zoom",
    chapter: "Business impact",
  },
];

export const PROGRESS_AUTO_PLAY_DURATION_MS = 6500;

export const PROGRESS_SCENE_DURATIONS_MS = {
  opened: 7000,
  "suggested-fm": 7500,
  "confirm-fm": 9500,
  "investigation-decision": 8000,
  "ai-analysis": 10000,
  "create-investigation": 8500,
  "investigation-plan": 8500,
  "investigation-results": 9000,
  "recommended-actions": 7500,
  "ai-recommendations": 9000,
  "action-plan": 8000,
  "add-to-plan": 8000,
  "edit-actions": 7500,
  "manual-action": 7500,
  "review-plan": 8500,
  finalize: 9000,
  "business-impact": 11000,
};

export const PROGRESS_TOUR_COMPLETION_STORAGE_KEY =
  "assetiq.progress_observation_tour_v1.completed";
export const PROGRESS_TOUR_LAST_RUN_STORAGE_KEY =
  "assetiq.progress_observation_tour_v1.last_run";
