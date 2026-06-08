import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  MousePointerClick,
  MessageSquare,
  Mic,
  Paperclip,
  Send,
  CheckCircle,
  HelpCircle,
  Activity,
  Sparkles,
  Layers,
  Play
} from "lucide-react";
import { Button } from "./ui/button";

// Step configuration
const TOUR_STEPS = [
  {
    id: "welcome",
    title: "Report an Observation",
    description: "Learn how to quickly report observations in AssetIQ. Select equipment from the hierarchy and describe what you observed!",
    icon: Sparkles,
    target: null,
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
  {
    id: "way-hierarchy",
    title: "Start from Equipment",
    description: "Open the equipment hierarchy and select the equipment you want to report an observation for. You can also right-click for quick actions.",
    icon: Layers,
    target: '[data-testid="hierarchy-sidebar"]',
    position: "right",
    ensureChat: "closed",
    ensureHierarchy: "open",
    prefill: null,
    preview: "right-click",
  },
  {
    id: "shared-flow-intro",
    title: "Chat Opens Automatically",
    description: "When you select equipment, the chat sidebar opens with the equipment pre-filled. Now you can describe what you observed.",
    icon: MessageSquare,
    target: '[data-testid="chat-sidebar"]',
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
  {
    id: "input",
    title: "Describe Your Observation",
    description: "Type what you observed - be specific about symptoms, sounds, or visual issues. You can also attach photos or record a voice message.",
    icon: MessageSquare,
    target: '[data-testid="sidebar-chat-message-input"]',
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: "High vibration on the drive end bearing",
    preview: null,
  },
  {
    id: "attach-voice",
    title: "Attach Files or Record Voice",
    description: "Use the 📎 paperclip to attach photos, or 🎤 microphone to record voice. Photos help document visual issues!",
    icon: Paperclip,
    target: '[data-testid="sidebar-voice-record-button"]',
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "attach-legend",
  },
  {
    id: "send",
    title: "Send Your Message",
    description: "Tap send when ready. The AI will summarize your observation and show you what it understood.",
    icon: Send,
    target: '[data-testid="sidebar-send-message-button"]',
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
  {
    id: "confirm-preview",
    title: "Review & Accept",
    description: "The AI shows an improved summary. Click 'Accept' to create the observation, 'Revise' to make changes, or 'Cancel' to start over.",
    icon: CheckCircle,
    target: null,
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "confirm",
  },
  {
    id: "recorded-preview",
    title: "Observation Created!",
    description: "Your observation is saved! AI automatically selects the most likely failure mode. You can edit equipment and failure mode details later if needed.",
    icon: CheckCircle,
    target: null,
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "recorded",
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "That's it! You can replay this tour anytime from Help → Tour: Report Observation. Now go find something to report!",
    icon: Sparkles,
    target: null,
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
];

const MOBILE_LAYOUT_TOUR_STEPS = [
  {
    id: "welcome",
    title: "Report an Observation",
    description: "On mobile you can report from the + button or by tapping equipment in the hierarchy. Let's walk through both!",
    icon: Sparkles,
    target: null,
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
  {
    id: "way-fab",
    title: "Way 1 — The + Button",
    description: "Tap the blue + button in the bottom-right corner. It's always visible while you browse the app.",
    icon: Plus,
    target: '[data-testid="fab-report-observation"]',
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    reserveBottom: 88,
    prefill: null,
    preview: null,
  },
  {
    id: "way-hierarchy",
    title: "Way 2 — From Equipment",
    description: "Open the hierarchy, then tap an equipment name to open its menu and choose Report Observation. The equipment will be pre-filled!",
    icon: Layers,
    target: '[data-testid="mobile-hierarchy-panel"]',
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "open",
    prefill: null,
    preview: "mobile-context-menu",
  },
  ...TOUR_STEPS.slice(3, -1).map((step) => ({
    ...step,
    position: step.position === "left" || step.position === "right" ? "center" : step.position,
    reserveBottom: step.id === "input" || step.id === "attach-voice" || step.id === "send" ? 24 : 0,
  })),
  TOUR_STEPS[TOUR_STEPS.length - 1],
];

const MOBILE_APP_TOUR_STEPS = [
  {
    id: "welcome",
    title: "Report an Observation",
    description: "Use the Report button in the bottom nav or pick equipment on Home. We'll show the mobile reporting flow.",
    icon: Sparkles,
    target: null,
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    ensureMobileTab: "home",
    prefill: null,
    preview: null,
  },
  {
    id: "way-report",
    title: "Way 1 — Report Button",
    description: "Tap the orange Report button in the bottom navigation to open the observation chat.",
    icon: Plus,
    target: '[data-testid="mobile-nav-post"]',
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    ensureMobileTab: "home",
    reserveBottom: 96,
    prefill: null,
    preview: null,
  },
  {
    id: "way-equipment",
    title: "Way 2 — From Equipment",
    description: "On the Home tab, tap any equipment name to open its menu, then choose Report Observation.",
    icon: Layers,
    target: '[data-testid="mobile-hierarchy"]',
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    ensureMobileTab: "home",
    prefill: null,
    preview: "mobile-context-menu",
  },
  {
    id: "shared-flow-intro",
    title: "Describe What You Saw",
    description: "The Report flow opens a full-screen chat where you describe the issue in plain language.",
    icon: MessageSquare,
    target: '[data-testid="mobile-chat"]',
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    ensureMobileTab: "home",
    prefill: null,
    preview: null,
  },
  {
    id: "input",
    title: "Describe Your Observation",
    description: "Type what you observed — include equipment, location, and symptoms.",
    icon: MessageSquare,
    target: '[data-testid="chat-input"]',
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: "Compressor C-201 has high vibration on the drive end bearing",
    preview: null,
    reserveBottom: 120,
  },
  {
    id: "attach-voice",
    title: "Record Voice",
    description: "Tap the microphone to dictate your observation instead of typing.",
    icon: Mic,
    target: '[data-testid="voice-btn"]',
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "attach-legend",
    reserveBottom: 120,
  },
  {
    id: "send",
    title: "Send Your Message",
    description: "Tap send when ready. The AI will process your observation and ask follow-up questions if needed.",
    icon: Send,
    target: '[data-testid="send-btn"]',
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
    reserveBottom: 120,
  },
  {
    id: "confirm-preview",
    title: "Confirm Your Observation",
    description: "The AI summarizes what it understood. Confirm with Yes, Revise, or Cancel.",
    icon: CheckCircle,
    target: null,
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "confirm",
  },
  {
    id: "equipment-picker-preview",
    title: "Select Equipment",
    description: "Pick the correct equipment match, or tap I don't know if you're unsure.",
    icon: Target,
    target: null,
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "equipment-picker",
  },
  {
    id: "fm-preview",
    title: "Link to Failure Mode",
    description: "Select the best failure mode match. RPN shows the risk level.",
    icon: AlertTriangle,
    target: null,
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "fm-picker",
  },
  {
    id: "recorded-preview",
    title: "Observation Recorded!",
    description: "Your observation is saved and linked to the equipment reliability data.",
    icon: CheckCircle,
    target: null,
    position: "center",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "recorded",
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "Replay this tour anytime from Help → Tour: Report Observation on desktop, or the ? button on mobile.",
    icon: Sparkles,
    target: null,
    position: "center",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
];

// Static preview components for different steps
const ConfirmPreview = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
    <div className="text-sm text-slate-600 mb-3">
      <span className="font-medium text-slate-800">AI Summary:</span>
      <p className="mt-1">High vibration detected on Compressor C-201, specifically on the drive end bearing.</p>
    </div>
    <div className="flex gap-2">
      <button className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
        ✓ Yes
      </button>
      <button className="flex-1 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
        ↻ Revise
      </button>
      <button className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">
        ✕ Cancel
      </button>
    </div>
  </div>
);

const EquipmentPickerPreview = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
    <div className="text-sm text-slate-600 mb-3">
      <span className="font-medium text-slate-800">Select Equipment:</span>
    </div>
    <div className="space-y-2">
      <button className="w-full px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm text-left hover:bg-blue-100 flex items-center gap-2">
        <Target className="w-4 h-4" />
        <span className="font-medium">C-201</span>
        <span className="text-slate-500">— Compressor, Main Process</span>
      </button>
      <button className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm text-left hover:bg-slate-100 flex items-center gap-2">
        <Target className="w-4 h-4" />
        <span className="font-medium">C-202</span>
        <span className="text-slate-500">— Compressor, Backup</span>
      </button>
      <button className="w-full px-3 py-2 bg-slate-100 text-slate-500 rounded-lg text-sm text-center hover:bg-slate-200">
        🤷 I don't know
      </button>
    </div>
  </div>
);

const FmPickerPreview = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
    <div className="text-sm text-slate-600 mb-3">
      <span className="font-medium text-slate-800">Matching Failure Modes:</span>
    </div>
    <div className="space-y-2">
      <button className="w-full px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-left hover:bg-red-100">
        <div className="flex items-center justify-between">
          <span className="font-medium text-red-800">Bearing Wear</span>
          <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded">RPN: 320</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Excessive vibration, heat, noise from rotating equipment</p>
      </button>
      <button className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-left hover:bg-amber-100">
        <div className="flex items-center justify-between">
          <span className="font-medium text-amber-800">Misalignment</span>
          <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded">RPN: 240</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Shaft misalignment causing vibration and premature wear</p>
      </button>
      <button className="w-full px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-left hover:bg-yellow-100">
        <div className="flex items-center justify-between">
          <span className="font-medium text-yellow-800">Imbalance</span>
          <span className="text-xs bg-yellow-600 text-white px-2 py-0.5 rounded">RPN: 180</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Rotating component imbalance causing periodic vibration</p>
      </button>
    </div>
  </div>
);

const RecordedPreview = () => (
  <div className="bg-green-50 rounded-lg border border-green-200 p-4 shadow-sm">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
        <CheckCircle className="w-6 h-6 text-white" />
      </div>
      <div>
        <h4 className="font-medium text-green-800">Observation Recorded!</h4>
        <p className="text-sm text-green-700 mt-1">
          High vibration on C-201 drive end bearing
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs text-green-600">
          <span>Equipment: C-201</span>
          <span>•</span>
          <span>Failure Mode: Bearing Wear</span>
          <span>•</span>
          <span>RPN: 320</span>
        </div>
      </div>
    </div>
  </div>
);

const RightClickPreview = () => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-1 w-48">
    <div className="text-xs text-slate-500 px-3 py-1.5 border-b border-slate-100">Equipment: P-101</div>
    <button className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 rounded flex items-center gap-2 text-blue-600">
      <Plus className="w-4 h-4" />
      Report Observation
    </button>
    <button className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 rounded flex items-center gap-2 text-slate-600">
      <Activity className="w-4 h-4" />
      View Timeline
    </button>
  </div>
);

const MobileContextMenuPreview = () => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-1 w-52">
    <div className="text-xs text-slate-500 px-3 py-1.5 border-b border-slate-100">Tap equipment name → menu</div>
    <button className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 rounded flex items-center gap-2 text-blue-600">
      <Plus className="w-4 h-4" />
      Report Observation
    </button>
    <button className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 rounded flex items-center gap-2 text-slate-600">
      <Activity className="w-4 h-4" />
      Show Details
    </button>
  </div>
);

const AttachLegend = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
          <Paperclip className="w-4 h-4 text-slate-600" />
        </span>
        <span className="text-slate-600">Attach photo</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
          <Mic className="w-4 h-4 text-slate-600" />
        </span>
        <span className="text-slate-600">Voice message</span>
      </div>
    </div>
  </div>
);

// Preview renderer
const PreviewRenderer = ({ previewId }) => {
  switch (previewId) {
    case "confirm":
      return <ConfirmPreview />;
    case "equipment-picker":
      return <EquipmentPickerPreview />;
    case "fm-picker":
      return <FmPickerPreview />;
    case "recorded":
      return <RecordedPreview />;
    case "right-click":
      return <RightClickPreview />;
    case "mobile-context-menu":
      return <MobileContextMenuPreview />;
    case "attach-legend":
      return <AttachLegend />;
    default:
      return null;
  }
};

const TOOLTIP_WIDTH = 380;
const VIEWPORT_PADDING = 12;
const SPOTLIGHT_INSET = 8;
const CHAT_SIDEBAR_SELECTOR = '[data-testid="chat-sidebar"]';
const MOBILE_BREAKPOINT = 640;

const resolveTourMode = (modeProp) => {
  if (modeProp === "mobile-app") return "mobile-app";
  if (modeProp === "desktop") return "desktop";
  if (document.querySelector('[data-testid="mobile-app"]')) return "mobile-app";
  if (window.innerWidth < MOBILE_BREAKPOINT) return "mobile-layout";
  return "desktop";
};

const getStepsForMode = (mode) => {
  if (mode === "mobile-app") return MOBILE_APP_TOUR_STEPS;
  if (mode === "mobile-layout") return MOBILE_LAYOUT_TOUR_STEPS;
  return TOUR_STEPS;
};

const getAnchorSelector = (step, mode) => {
  if (step?.target) return step.target;
  if (step?.ensureChat === "open") {
    return mode === "mobile-app" ? '[data-testid="mobile-chat"]' : CHAT_SIDEBAR_SELECTOR;
  }
  return null;
};

const computeMobileTooltipStyle = ({
  anchorRect,
  tooltipHeight,
  tooltipWidth,
  viewportWidth,
  viewportHeight,
  reserveBottom = 0,
}) => {
  const bottomInset = Math.max(reserveBottom, 72) + VIEWPORT_PADDING;
  const maxHeight = viewportHeight - VIEWPORT_PADDING * 2;
  const width = Math.min(tooltipWidth, viewportWidth - VIEWPORT_PADDING * 2);
  const left = (viewportWidth - width) / 2;

  if (!anchorRect) {
    const top = Math.max(
      VIEWPORT_PADDING,
      Math.min(
        (viewportHeight - bottomInset - tooltipHeight) / 2,
        viewportHeight - bottomInset - tooltipHeight - VIEWPORT_PADDING
      )
    );
    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.min(maxHeight, viewportHeight - top - VIEWPORT_PADDING)}px`,
      transform: "none",
    };
  }

  const spaceAbove = anchorRect.top - VIEWPORT_PADDING;
  const spaceBelow = viewportHeight - anchorRect.top - anchorRect.height - bottomInset;
  let top;

  if (spaceBelow >= tooltipHeight + VIEWPORT_PADDING && spaceBelow >= spaceAbove) {
    top = anchorRect.top + anchorRect.height + VIEWPORT_PADDING;
  } else if (spaceAbove >= tooltipHeight + VIEWPORT_PADDING) {
    top = anchorRect.top - tooltipHeight - VIEWPORT_PADDING;
  } else {
    top = Math.max(
      VIEWPORT_PADDING,
      Math.min(
        anchorRect.top + anchorRect.height + VIEWPORT_PADDING,
        viewportHeight - bottomInset - tooltipHeight - VIEWPORT_PADDING
      )
    );
  }

  top = Math.max(
    VIEWPORT_PADDING,
    Math.min(top, viewportHeight - bottomInset - tooltipHeight - VIEWPORT_PADDING)
  );

  return {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(maxHeight, viewportHeight - top - VIEWPORT_PADDING)}px`,
    transform: "none",
  };
};

// Main ObservationTour component
export const ObservationTour = ({ 
  isOpen, 
  onClose, 
  setChatOpen, 
  setChatPrefillMessage, 
  setHierarchyOpen,
  setMobileTab,
  mode = "auto",
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const [tourMode, setTourMode] = useState("desktop");
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const syncMode = () => setTourMode(resolveTourMode(mode));
    syncMode();
    window.addEventListener("resize", syncMode);
    return () => window.removeEventListener("resize", syncMode);
  }, [isOpen, mode]);

  const steps = getStepsForMode(tourMode);
  const step = steps[currentStep];
  const StepIcon = step?.icon || HelpCircle;
  
  // Reset step when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentStep >= steps.length) {
      setCurrentStep(0);
    }
  }, [currentStep, steps.length]);
  
  // Handle sidebar / tab states based on step config
  useEffect(() => {
    if (!isOpen || !step) return;

    if (step.ensureMobileTab && setMobileTab) {
      setMobileTab(step.ensureMobileTab);
    }
    
    // Ensure chat state
    if (step.ensureChat === "open") {
      setChatOpen(true);
    } else if (step.ensureChat === "closed") {
      setChatOpen(false);
    }
    
    // Ensure hierarchy state (desktop / responsive layout overlay)
    if (tourMode === "mobile-app") {
      if (step.ensureHierarchy === "open" && setMobileTab) {
        setMobileTab("home");
      }
    } else if (step.ensureHierarchy === "open") {
      setHierarchyOpen(true);
    } else if (step.ensureHierarchy === "closed") {
      setHierarchyOpen(false);
    }
    
    // Handle prefill
    if (step.prefill) {
      setChatPrefillMessage(step.prefill);
    } else if (step.ensureChat === "open") {
      setChatPrefillMessage(null);
    }
  }, [isOpen, currentStep, step, setChatOpen, setHierarchyOpen, setChatPrefillMessage, setMobileTab, tourMode]);
  
  const updatePositions = useCallback(() => {
    if (!isOpen || !step) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isCompactView = tourMode !== "desktop";
    const anchorSelector = getAnchorSelector(step, tourMode);
    let anchorRect = null;

    if (anchorSelector) {
      const element = document.querySelector(anchorSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        anchorRect = {
          top: rect.top - SPOTLIGHT_INSET,
          left: rect.left - SPOTLIGHT_INSET,
          width: rect.width + SPOTLIGHT_INSET * 2,
          height: rect.height + SPOTLIGHT_INSET * 2,
        };
      }
    }

    setSpotlightRect(anchorRect);

    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 280;
    const tooltipWidth = Math.min(TOOLTIP_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);

    if (step.position === "center" || !anchorRect || isCompactView) {
      if (isCompactView) {
        setTooltipStyle(
          computeMobileTooltipStyle({
            anchorRect: step.position === "center" || !anchorRect ? null : anchorRect,
            tooltipHeight,
            tooltipWidth,
            viewportWidth,
            viewportHeight,
            reserveBottom: step.reserveBottom || 0,
          })
        );
        return;
      }

      setTooltipStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: `${tooltipWidth}px`,
        maxHeight: `${viewportHeight - VIEWPORT_PADDING * 2}px`,
      });
      return;
    }

    const anchorCenterY = anchorRect.top + anchorRect.height / 2;
    let top = anchorCenterY - tooltipHeight / 2;
    top = Math.max(
      VIEWPORT_PADDING,
      Math.min(top, viewportHeight - tooltipHeight - VIEWPORT_PADDING)
    );

    let left;
    if (step.position === "right") {
      left = anchorRect.left + anchorRect.width + VIEWPORT_PADDING;
      left = Math.min(left, viewportWidth - tooltipWidth - VIEWPORT_PADDING);
    } else {
      left = anchorRect.left - tooltipWidth - VIEWPORT_PADDING;
      left = Math.max(VIEWPORT_PADDING, left);
    }

    setTooltipStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      maxHeight: `${viewportHeight - VIEWPORT_PADDING * 2}px`,
    });
  }, [isOpen, step, tourMode]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePositions();
    const raf = requestAnimationFrame(updatePositions);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, currentStep, step, tourMode, updatePositions]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(updatePositions, 320);
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions, true);
    };
  }, [isOpen, currentStep, tourMode, updatePositions]);

  const handleClose = useCallback(() => {
    setChatOpen(false);
    setChatPrefillMessage(null);
    setHierarchyOpen(false);
    onClose();
  }, [setChatOpen, setChatPrefillMessage, setHierarchyOpen, onClose]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  }, [currentStep, handleClose, steps.length]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  if (!isOpen) return null;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999]"
            data-testid="observation-tour-overlay"
          >
            {/* Dark overlay with spotlight cutout */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <mask id="spotlight-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  {spotlightRect && (
                    <rect
                      x={spotlightRect.left}
                      y={spotlightRect.top}
                      width={spotlightRect.width}
                      height={spotlightRect.height}
                      rx="8"
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="rgba(0, 0, 0, 0.75)"
                mask="url(#spotlight-mask)"
              />
            </svg>
            
            {/* Spotlight border glow */}
            {spotlightRect && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute pointer-events-none"
                style={{
                  top: spotlightRect.top,
                  left: spotlightRect.left,
                  width: spotlightRect.width,
                  height: spotlightRect.height,
                  borderRadius: "8px",
                  boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.5), 0 0 24px rgba(59, 130, 246, 0.3)",
                }}
              />
            )}
          </motion.div>
          
          {/* Tooltip */}
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.1 }}
            className="fixed z-[10000]"
            style={tooltipStyle}
            data-testid="observation-tour-tooltip"
          >
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden overflow-y-auto" style={{ maxHeight: 'inherit' }}>
              {/* Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <StepIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{step.title}</h3>
                      <p className="text-sm text-blue-100">
                        Step {currentStep + 1} of {steps.length}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    data-testid="observation-tour-close-btn"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Content */}
              <div className="px-5 py-4">
                <p className="text-slate-600 leading-relaxed">{step.description}</p>
                
                {/* Preview card */}
                {step.preview && (
                  <div className="mt-4">
                    <PreviewRenderer previewId={step.preview} />
                  </div>
                )}
              </div>
              
              {/* Progress bar */}
              <div className="px-5 pb-2">
                <div className="flex gap-1">
                  {steps.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        idx <= currentStep ? "bg-blue-500" : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className="text-slate-600"
                  data-testid="observation-tour-back-btn"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="observation-tour-next-btn"
                >
                  {currentStep === steps.length - 1 ? (
                    <>
                      <Play className="w-4 h-4 mr-1" />
                      Start Reporting
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ObservationTour;
