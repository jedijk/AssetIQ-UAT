import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  LayoutDashboard,
  AlertTriangle,
  Zap,
  ClipboardList,
  GitBranch,
  Settings,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { Button } from "./ui/button";

const INTRO_STEPS = [
  {
    id: "welcome",
    title: "Welcome to AssetIQ",
    description: "Your AI-powered asset management platform. Let's take a quick tour of the key features.",
    icon: Sparkles,
    target: null, // No spotlight for welcome
    position: "center"
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Get a complete overview of your operational metrics, risk scores, and recent activity at a glance.",
    icon: LayoutDashboard,
    target: '[data-testid="nav-dashboard"], [href="/dashboard"]',
    position: "right"
  },
  {
    id: "observations",
    title: "Observations",
    description: "Track equipment issues, safety concerns, and maintenance needs. Each observation is automatically risk-scored.",
    icon: AlertTriangle,
    target: '[data-testid="nav-observations"], [href="/threats"]',
    position: "right"
  },
  {
    id: "causal-engine",
    title: "Causal Engine",
    description: "Use AI-powered root cause analysis to investigate failures and identify patterns across your equipment.",
    icon: Zap,
    target: '[data-testid="nav-causal-engine"], [href="/causal-engine"]',
    position: "right"
  },
  {
    id: "my-tasks",
    title: "My Tasks",
    description: "View and complete your assigned tasks, inspections, and form submissions from anywhere.",
    icon: ClipboardList,
    target: '[data-testid="nav-my-tasks"], [href="/tasks"]',
    position: "right"
  },
  {
    id: "hierarchy",
    title: "Equipment Hierarchy",
    description: "Browse your assets organized by location, system, and equipment type. Right-click for quick actions.",
    icon: GitBranch,
    target: '[data-testid="hierarchy-panel"], .hierarchy-sidebar',
    position: "right"
  },
  {
    id: "settings",
    title: "Settings",
    description: "Configure your profile, manage users, customize risk calculations, and access system settings.",
    icon: Settings,
    target: 'svg.lucide-settings',
    position: "left"
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "Start exploring AssetIQ. You can replay this tour anytime from the Help menu.",
    icon: CheckCircle2,
    target: null,
    position: "center"
  }
];

const IntroOverlay = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isVisible, setIsVisible] = useState(true);

  const step = INTRO_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === INTRO_STEPS.length - 1;
  const progress = ((currentStep + 1) / INTRO_STEPS.length) * 100;

  // Find and highlight target element
  const updateTargetPosition = useCallback(() => {
    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect({
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16
        });
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  }, [step.target]);

  useEffect(() => {
    updateTargetPosition();
    window.addEventListener("resize", updateTargetPosition);
    return () => window.removeEventListener("resize", updateTargetPosition);
  }, [currentStep, updateTargetPosition]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(() => {
      localStorage.setItem("assetiq_intro_seen", "true");
      onSkip?.();
    }, 300);
  };

  const handleComplete = () => {
    setIsVisible(false);
    setTimeout(() => {
      localStorage.setItem("assetiq_intro_seen", "true");
      onComplete?.();
    }, 300);
  };

  // Calculate tooltip position
  const getTooltipStyle = () => {
    // Check if mobile (width < 640px)
    const isMobile = window.innerWidth < 640;
    
    if (step.position === "center" || !targetRect || isMobile) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      };
    }

    const padding = 20;
    const tooltipWidth = 360;
    
    if (step.position === "right") {
      return {
        position: "fixed",
        top: Math.max(padding, Math.min(targetRect.top, window.innerHeight - 300)),
        left: Math.min(targetRect.left + targetRect.width + padding, window.innerWidth - tooltipWidth - padding)
      };
    }
    
    if (step.position === "left") {
      return {
        position: "fixed",
        top: Math.max(padding, Math.min(targetRect.top, window.innerHeight - 300)),
        left: Math.max(padding, targetRect.left - tooltipWidth - padding)
      };
    }

    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)"
    };
  };

  const StepIcon = step.icon;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999]"
          data-testid="intro-overlay"
        >
          {/* Dark overlay with spotlight cutout */}
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {targetRect && (
                  <motion.rect
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    x={targetRect.left}
                    y={targetRect.top}
                    width={targetRect.width}
                    height={targetRect.height}
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

          {/* Spotlight ring animation */}
          {targetRect && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute pointer-events-none"
              style={{
                top: targetRect.top - 4,
                left: targetRect.left - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
                borderRadius: 12,
                border: "2px solid rgba(59, 130, 246, 0.8)",
                boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)"
              }}
            />
          )}

          {/* Tooltip card */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={getTooltipStyle()}
            className="w-[360px] max-w-[calc(100vw-40px)]"
          >
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Progress bar */}
              <div className="h-1 bg-slate-100">
                <motion.div
                  className="h-full bg-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <div className="p-5">
                {/* Icon and step indicator */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${
                      isLastStep ? "bg-green-100" : "bg-blue-100"
                    }`}>
                      <StepIcon className={`w-5 h-5 ${
                        isLastStep ? "text-green-600" : "text-blue-600"
                      }`} />
                    </div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      Step {currentStep + 1} of {INTRO_STEPS.length}
                    </span>
                  </div>
                  <button
                    onClick={handleSkip}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    data-testid="intro-skip-btn"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Title and description */}
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  {step.description}
                </p>

                {/* Progress dots */}
                <div className="flex items-center justify-center gap-1.5 mb-5">
                  {INTRO_STEPS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentStep
                          ? "w-6 bg-blue-500"
                          : index < currentStep
                            ? "bg-blue-300"
                            : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    disabled={isFirstStep}
                    className={`${isFirstStep ? "invisible" : ""}`}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleNext}
                    className={`${
                      isLastStep 
                        ? "bg-green-600 hover:bg-green-700" 
                        : "bg-blue-600 hover:bg-blue-700"
                    } text-white px-6`}
                    data-testid="intro-next-btn"
                  >
                    {isLastStep ? (
                      <>
                        Get Started
                        <CheckCircle2 className="w-4 h-4 ml-1" />
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Hook to check if intro should be shown
export const useIntroOverlay = () => {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    const hasSeenIntro = localStorage.getItem("assetiq_intro_seen");
    if (!hasSeenIntro) {
      // Small delay to let the app render first
      setTimeout(() => setShowIntro(true), 1000);
    }
  }, []);

  const triggerIntro = () => {
    setShowIntro(true);
  };

  const dismissIntro = () => {
    setShowIntro(false);
  };

  const resetIntro = () => {
    localStorage.removeItem("assetiq_intro_seen");
    setShowIntro(true);
  };

  return { showIntro, triggerIntro, dismissIntro, resetIntro };
};

export default IntroOverlay;
