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
  CheckCircle2,
  Menu,
  Plus,
  MessageSquare
} from "lucide-react";
import { Button } from "./ui/button";

// Desktop steps - highlights sidebar navigation
const DESKTOP_STEPS = [
  {
    id: "welcome",
    title: "Welcome to AssetIQ",
    description: "Your AI-powered asset management platform. Let's take a quick tour of the key features.",
    icon: Sparkles,
    target: null,
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
    target: '[data-testid="hierarchy-sidebar"], [data-testid="hierarchy-toggle"]',
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

// Mobile steps - highlights mobile-specific UI elements
const MOBILE_STEPS = [
  {
    id: "welcome",
    title: "Welcome to AssetIQ",
    description: "Your AI-powered asset management platform. Let's take a quick tour of the mobile experience.",
    icon: Sparkles,
    target: null,
    position: "center"
  },
  {
    id: "menu",
    title: "Navigation Menu",
    description: "Tap the menu icon to access all features: Dashboard, Observations, Actions, Tasks, and more.",
    icon: Menu,
    target: '[data-testid="mobile-menu-toggle"]',
    position: "bottom"
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "View your operational metrics, risk scores, and recent activity in a mobile-optimized layout.",
    icon: LayoutDashboard,
    target: null,
    position: "center"
  },
  {
    id: "observations",
    title: "Observations",
    description: "Track equipment issues on the go. Swipe cards for quick actions, tap for details.",
    icon: AlertTriangle,
    target: null,
    position: "center"
  },
  {
    id: "quick-add",
    title: "Quick Add",
    description: "Tap the + button to quickly create new observations, actions, or tasks from anywhere.",
    icon: Plus,
    target: '[data-testid="quick-add-button"], .fixed.bottom-4.right-4 button',
    position: "top"
  },
  {
    id: "ai-chat",
    title: "AI Assistant",
    description: "Get instant help with equipment analysis, failure modes, and reliability insights.",
    icon: MessageSquare,
    target: '[data-testid="ai-chat-button"]',
    position: "top"
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "Start exploring AssetIQ on mobile. Access the tour anytime from the menu.",
    icon: CheckCircle2,
    target: null,
    position: "center"
  }
];

const IntroOverlay = ({ onComplete, onSkip, isMobile = false }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isVisible, setIsVisible] = useState(true);
  const [detectedMobile, setDetectedMobile] = useState(false);

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setDetectedMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const useMobileSteps = isMobile || detectedMobile;
  const STEPS = useMobileSteps ? MOBILE_STEPS : DESKTOP_STEPS;
  
  const step = STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === STEPS.length - 1;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

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
    window.addEventListener("scroll", updateTargetPosition);
    return () => {
      window.removeEventListener("resize", updateTargetPosition);
      window.removeEventListener("scroll", updateTargetPosition);
    };
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

  // Calculate tooltip position based on screen size and target
  const getTooltipStyle = () => {
    // For mobile, center the tooltip more towards the top
    if (useMobileSteps) {
      return {
        position: "fixed",
        top: "40%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      };
    }
    
    // For desktop center position or no target
    if (step.position === "center" || !targetRect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      };
    }

    // Desktop positioning with spotlight
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
                    rx="12"
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
              fill="rgba(0, 0, 0, 0.8)"
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
                borderRadius: 16,
                border: "3px solid rgba(59, 130, 246, 0.9)",
                boxShadow: "0 0 30px rgba(59, 130, 246, 0.5), inset 0 0 20px rgba(59, 130, 246, 0.1)"
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
            className={`${useMobileSteps ? 'w-[300px]' : 'w-[360px]'} max-w-[calc(100vw-32px)]`}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Progress bar */}
              <div className={`${useMobileSteps ? 'h-1' : 'h-1.5'} bg-slate-100`}>
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <div className={`${useMobileSteps ? 'p-3' : 'p-5'}`}>
                {/* Icon and step indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`${useMobileSteps ? 'p-1.5' : 'p-2.5'} rounded-xl ${
                      isLastStep ? "bg-green-100" : "bg-blue-100"
                    }`}>
                      <StepIcon className={`${useMobileSteps ? 'w-4 h-4' : 'w-5 h-5'} ${
                        isLastStep ? "text-green-600" : "text-blue-600"
                      }`} />
                    </div>
                    <span className={`${useMobileSteps ? 'text-[10px]' : 'text-xs'} font-medium text-slate-400 uppercase tracking-wide`}>
                      Step {currentStep + 1} of {STEPS.length}
                    </span>
                  </div>
                  <button
                    onClick={handleSkip}
                    className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
                    data-testid="intro-skip-btn"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Title and description */}
                <h3 className={`${useMobileSteps ? 'text-sm' : 'text-lg'} font-semibold text-slate-900 mb-1`}>
                  {step.title}
                </h3>
                <p className={`${useMobileSteps ? 'text-[11px] leading-relaxed' : 'text-sm leading-relaxed'} text-slate-600 mb-3`}>
                  {step.description}
                </p>

                {/* Progress dots */}
                <div className={`flex items-center justify-center gap-1 ${useMobileSteps ? 'mb-3' : 'mb-4'}`}>
                  {STEPS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={`${useMobileSteps ? 'h-1.5' : 'h-2'} rounded-full transition-all ${
                        index === currentStep
                          ? `${useMobileSteps ? 'w-4' : 'w-6'} bg-blue-500`
                          : index < currentStep
                            ? `${useMobileSteps ? 'w-1.5' : 'w-2'} bg-blue-300`
                            : `${useMobileSteps ? 'w-1.5' : 'w-2'} bg-slate-200`
                      }`}
                    />
                  ))}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    disabled={isFirstStep}
                    className={`${isFirstStep ? "invisible" : ""} ${useMobileSteps ? 'text-xs h-8' : ''}`}
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
                    } text-white ${useMobileSteps ? 'px-4 text-xs h-8' : 'px-6'}`}
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
    // Check localStorage first (for quick check)
    const hasSeenIntroLocal = localStorage.getItem("assetiq_intro_seen");
    if (!hasSeenIntroLocal) {
      // Small delay to let the app render first
      setTimeout(() => setShowIntro(true), 1000);
    }
  }, []);

  const triggerIntro = () => {
    setShowIntro(true);
  };

  const dismissIntro = async () => {
    setShowIntro(false);
    // Save to localStorage
    localStorage.setItem("assetiq_intro_seen", "true");
    // Also save to backend
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/mark-intro-seen`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (err) {
      console.error("Failed to mark intro as seen:", err);
    }
  };

  const resetIntro = () => {
    localStorage.removeItem("assetiq_intro_seen");
    setShowIntro(true);
  };

  return { showIntro, triggerIntro, dismissIntro, resetIntro };
};

export default IntroOverlay;
