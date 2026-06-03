import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Plus,
  MousePointerClick,
  MessageSquare,
  Mic,
  Paperclip,
  Send,
  CheckCircle,
  HelpCircle,
  Activity,
  AlertTriangle,
  Target,
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
    description: "There are two ways to start an observation in AssetIQ. Let's walk through both methods!",
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
    description: "The quickest way to report an observation is to tap the blue + button in the bottom right corner. It's always visible on every screen.",
    icon: Plus,
    target: '[data-testid="fab-report-observation"]',
    position: "left",
    ensureChat: "closed",
    ensureHierarchy: "closed",
    prefill: null,
    preview: null,
  },
  {
    id: "way-hierarchy",
    title: "Way 2 — From Equipment",
    description: "Alternatively, you can right-click on any equipment in the hierarchy to report an observation directly for that asset. The equipment will be pre-filled!",
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
    title: "Both Paths Lead Here",
    description: "Whether you use the + button or the hierarchy, both methods open the chat sidebar where you describe what you observed.",
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
    description: "Type your observation here. Be specific about what you noticed — include the equipment, location, and symptoms.",
    icon: MessageSquare,
    target: '[data-testid="sidebar-chat-message-input"]',
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: "Compressor C-201 has high vibration on the drive end bearing",
    preview: null,
  },
  {
    id: "attach-voice",
    title: "Attach Files or Record Voice",
    description: "You can attach photos using the 📎 paperclip button, or record a voice message using the 🎤 microphone. Photos help document visual issues!",
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
    description: "When you're ready, tap the send button. The AI will process your observation and ask follow-up questions if needed.",
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
    title: "Confirm Your Observation",
    description: "The AI will summarize what it understood. You can confirm with 'Yes', ask to 'Revise' if something's wrong, or 'Cancel' to start over.",
    icon: CheckCircle,
    target: null,
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "confirm",
  },
  {
    id: "equipment-picker-preview",
    title: "Select Equipment",
    description: "The AI suggests the most likely equipment matches. Pick the correct one, or tap 'I don't know' if you're unsure.",
    icon: Target,
    target: null,
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "equipment-picker",
  },
  {
    id: "fm-preview",
    title: "Link to Failure Mode",
    description: "The system matches your observation to known failure modes. The RPN score shows the risk level. Select the best match or create a new one.",
    icon: AlertTriangle,
    target: null,
    position: "left",
    ensureChat: "open",
    ensureHierarchy: "closed",
    prefill: null,
    preview: "fm-picker",
  },
  {
    id: "recorded-preview",
    title: "Observation Recorded!",
    description: "Your observation is now saved and linked to the equipment's reliability data. It will appear in the equipment timeline and threat analysis.",
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
    case "attach-legend":
      return <AttachLegend />;
    default:
      return null;
  }
};

// Main ObservationTour component
export const ObservationTour = ({ 
  isOpen, 
  onClose, 
  setChatOpen, 
  setChatPrefillMessage, 
  setHierarchyOpen 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);
  
  const step = TOUR_STEPS[currentStep];
  const StepIcon = step?.icon || HelpCircle;
  
  // Reset step when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);
  
  // Handle sidebar states based on step config
  useEffect(() => {
    if (!isOpen || !step) return;
    
    // Ensure chat state
    if (step.ensureChat === "open") {
      setChatOpen(true);
    } else if (step.ensureChat === "closed") {
      setChatOpen(false);
    }
    
    // Ensure hierarchy state
    if (step.ensureHierarchy === "open") {
      setHierarchyOpen(true);
    } else if (step.ensureHierarchy === "closed") {
      setHierarchyOpen(false);
    }
    
    // Handle prefill
    if (step.prefill) {
      setChatPrefillMessage(step.prefill);
    }
  }, [isOpen, currentStep, step, setChatOpen, setHierarchyOpen, setChatPrefillMessage]);
  
  // Update spotlight position for target elements
  useEffect(() => {
    if (!isOpen || !step?.target) {
      setSpotlightRect(null);
      return;
    }
    
    const updatePosition = () => {
      const element = document.querySelector(step.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        setSpotlightRect({
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        });
      } else {
        setSpotlightRect(null);
      }
    };
    
    // Initial update with delay to allow animations
    const timer = setTimeout(updatePosition, 300);
    
    // Update on resize
    window.addEventListener("resize", updatePosition);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, currentStep, step?.target]);
  
  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  }, [currentStep]);
  
  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);
  
  const handleClose = useCallback(() => {
    // Teardown: close chat and clear prefill
    setChatOpen(false);
    setChatPrefillMessage(null);
    setHierarchyOpen(false);
    onClose();
  }, [setChatOpen, setChatPrefillMessage, setHierarchyOpen, onClose]);
  
  if (!isOpen) return null;
  
  // Calculate tooltip position based on step config and spotlight
  const getTooltipPosition = () => {
    const tooltipWidth = 380;
    const tooltipHeight = 500; // Increased for steps with large previews
    const padding = 20;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Center position for welcome/complete steps
    if (step.position === "center") {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: `${Math.min(tooltipWidth, viewportWidth - padding * 2)}px`,
      };
    }
    
    // For steps without a target but with left/right position (preview steps)
    // Position on the left side of the screen, vertically centered
    if (!spotlightRect) {
      if (step.position === "left") {
        // Position on left side of screen
        return {
          position: "fixed",
          top: "50%",
          left: `${padding}px`,
          transform: "translateY(-50%)",
          width: `${Math.min(tooltipWidth, viewportWidth / 2 - padding * 2)}px`,
          maxHeight: `${viewportHeight - padding * 2 - 60}px`,
        };
      }
      if (step.position === "right") {
        // Position on right side of screen
        return {
          position: "fixed",
          top: "50%",
          right: `${padding}px`,
          transform: "translateY(-50%)",
          width: `${Math.min(tooltipWidth, viewportWidth / 2 - padding * 2)}px`,
          maxHeight: `${viewportHeight - padding * 2 - 60}px`,
        };
      }
      // Fallback to center
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: `${Math.min(tooltipWidth, viewportWidth - padding * 2)}px`,
      };
    }
    
    // Calculate available space on each side
    const spaceLeft = spotlightRect.left - padding;
    const spaceRight = viewportWidth - spotlightRect.left - spotlightRect.width - padding;
    
    // Calculate vertical position - ensure tooltip stays within viewport
    let topPosition = spotlightRect.top;
    // If tooltip would go below viewport, adjust up
    if (topPosition + tooltipHeight > viewportHeight - padding) {
      topPosition = Math.max(padding + 60, viewportHeight - tooltipHeight - padding);
    }
    // Ensure it's not above viewport
    topPosition = Math.max(padding + 60, topPosition); // 60px for header
    
    if (step.position === "left" && spaceLeft >= tooltipWidth) {
      // Position to the left of the target
      return {
        position: "fixed",
        top: `${topPosition}px`,
        left: `${Math.max(padding, spotlightRect.left - tooltipWidth - padding)}px`,
        width: `${Math.min(tooltipWidth, spaceLeft - padding)}px`,
        maxHeight: `${viewportHeight - padding * 2 - 60}px`,
      };
    }
    
    if (step.position === "right" && spaceRight >= tooltipWidth) {
      // Position to the right of the target
      return {
        position: "fixed",
        top: `${topPosition}px`,
        left: `${spotlightRect.left + spotlightRect.width + padding}px`,
        width: `${Math.min(tooltipWidth, spaceRight - padding)}px`,
        maxHeight: `${viewportHeight - padding * 2 - 60}px`,
      };
    }
    
    // Fallback: position based on most available space
    if (spaceRight >= spaceLeft) {
      // More space on right
      return {
        position: "fixed",
        top: `${topPosition}px`,
        left: `${Math.min(spotlightRect.left + spotlightRect.width + padding, viewportWidth - tooltipWidth - padding)}px`,
        width: `${Math.min(tooltipWidth, viewportWidth - padding * 2)}px`,
        maxHeight: `${viewportHeight - padding * 2 - 60}px`,
      };
    } else {
      // More space on left
      return {
        position: "fixed",
        top: `${topPosition}px`,
        left: `${Math.max(padding, spotlightRect.left - tooltipWidth - padding)}px`,
        width: `${Math.min(tooltipWidth, viewportWidth - padding * 2)}px`,
        maxHeight: `${viewportHeight - padding * 2 - 60}px`,
      };
    }
  };
  
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.1 }}
            className="fixed z-[10000]"
            style={getTooltipPosition()}
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
                        Step {currentStep + 1} of {TOUR_STEPS.length}
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
                  {TOUR_STEPS.map((_, idx) => (
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
                  {currentStep === TOUR_STEPS.length - 1 ? (
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
