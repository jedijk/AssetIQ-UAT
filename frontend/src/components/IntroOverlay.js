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
    id: "quick-add",
    title: "Quick Add",
    description: "Tap the + button to quickly report a new observation from anywhere in the app. You can also use voice input.",
    icon: Plus,
    target: '[data-testid="fab-report-observation"]',
    position: "left"
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
    position: "center",
    mobileAction: null
  },
  {
    id: "menu-button",
    title: "Open the Menu",
    description: "Tap the menu icon in the top-left corner to access all navigation options.",
    icon: Menu,
    target: '[data-testid="mobile-menu-toggle"]',
    position: "center",
    mobileAction: "highlight-menu-button"
  },
  {
    id: "menu-dashboard",
    title: "Dashboard",
    description: "View your operational metrics, risk scores, and recent activity at a glance.",
    icon: LayoutDashboard,
    target: '[data-testid="mobile-nav-dashboard"]',
    position: "center",
    mobileAction: "open-menu"
  },
  {
    id: "menu-observations",
    title: "Observations",
    description: "Track equipment issues and safety concerns. Each observation is automatically risk-scored.",
    icon: AlertTriangle,
    target: '[data-testid="mobile-nav-observations"]',
    position: "center",
    mobileAction: "keep-menu-open"
  },
  {
    id: "menu-actions",
    title: "Actions",
    description: "Manage corrective and preventive actions assigned to your team.",
    icon: ClipboardList,
    target: '[data-testid="mobile-nav-actions"]',
    position: "center",
    mobileAction: "keep-menu-open"
  },
  {
    id: "menu-tasks",
    title: "My Tasks",
    description: "View and complete your assigned inspections and form submissions.",
    icon: ClipboardList,
    target: '[data-testid="mobile-nav-my-tasks"]',
    position: "center",
    mobileAction: "keep-menu-open"
  },
  {
    id: "close-menu",
    title: "Close Menu",
    description: "Tap the X or anywhere outside to close the menu.",
    icon: X,
    target: null,
    position: "center",
    mobileAction: "close-menu"
  },
  {
    id: "quick-add",
    title: "Quick Add",
    description: "Tap the + button to quickly report a new observation. You can also use voice input!",
    icon: Plus,
    target: '[data-testid="fab-report-observation"]',
    position: "center",
    mobileAction: "highlight-fab"
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "Start exploring AssetIQ on mobile. Some advanced features like Causal Engine are available on desktop.",
    icon: CheckCircle2,
    target: null,
    position: "center",
    mobileAction: null
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

  // Handle mobile menu open/close based on step
  useEffect(() => {
    if (!useMobileSteps) return;
    
    const mobileAction = step.mobileAction;
    const menuToggle = document.querySelector('[data-testid="mobile-menu-toggle"]');
    
    if (mobileAction === "open-menu" || mobileAction === "keep-menu-open") {
      // Check if menu is already open by looking for the mobile nav
      const mobileNav = document.querySelector('[data-testid="mobile-nav"]');
      if (!mobileNav && menuToggle) {
        // Menu is closed, need to open it
        menuToggle.click();
        // Wait for menu to open, then update target position
        setTimeout(() => {
          updateTargetPosition();
        }, 350);
      } else {
        // Menu already open, just update position
        setTimeout(() => {
          updateTargetPosition();
        }, 100);
      }
    } else if (mobileAction === "close-menu") {
      // Close the menu if open
      const mobileNav = document.querySelector('[data-testid="mobile-nav"]');
      if (mobileNav && menuToggle) {
        menuToggle.click();
      }
    } else if (mobileAction === "highlight-fab" || mobileAction === null || mobileAction === "highlight-menu-button") {
      // Close menu before showing FAB or final steps
      const mobileNav = document.querySelector('[data-testid="mobile-nav"]');
      if (mobileNav && menuToggle) {
        menuToggle.click();
        setTimeout(() => {
          updateTargetPosition();
        }, 350);
      }
    }
  }, [currentStep, step.mobileAction, useMobileSteps, updateTargetPosition]);

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
    // For mobile, use fixed positioning with strict centering
    if (useMobileSteps) {
      if (targetRect) {
        const viewportHeight = window.innerHeight;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        
        // If target is in top third, show tooltip lower
        if (targetCenterY < viewportHeight / 3) {
          return {
            position: "fixed",
            top: "auto",
            bottom: "25%",
            left: "5vw",
            right: "5vw",
            width: "90vw",
            maxWidth: "90vw",
            transform: "none"
          };
        } else {
          // If target is lower, show tooltip higher
          return {
            position: "fixed",
            top: "20%",
            left: "5vw",
            right: "5vw",
            width: "90vw",
            maxWidth: "90vw",
            transform: "none"
          };
        }
      }
      
      // No target - center safely
      return {
        position: "fixed",
        top: "30%",
        left: "5vw",
        right: "5vw",
        width: "90vw",
        maxWidth: "90vw",
        transform: "none"
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
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute pointer-events-none"
                style={{
                  top: targetRect.top - (useMobileSteps ? 2 : 4),
                  left: targetRect.left - (useMobileSteps ? 2 : 4),
                  width: targetRect.width + (useMobileSteps ? 4 : 8),
                  height: targetRect.height + (useMobileSteps ? 4 : 8),
                  borderRadius: useMobileSteps ? 10 : 16,
                  border: useMobileSteps ? "2px solid rgba(59, 130, 246, 0.8)" : "3px solid rgba(59, 130, 246, 0.9)",
                  boxShadow: useMobileSteps 
                    ? "0 0 15px rgba(59, 130, 246, 0.4)" 
                    : "0 0 30px rgba(59, 130, 246, 0.5), inset 0 0 20px rgba(59, 130, 246, 0.1)"
                }}
              />
              {/* Pulsing ring for mobile - smaller and subtler */}
              {useMobileSteps && (
                <motion.div
                  initial={{ opacity: 0, scale: 1 }}
                  animate={{ opacity: [0.4, 0], scale: [1, 1.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  className="absolute pointer-events-none"
                  style={{
                    top: targetRect.top - 2,
                    left: targetRect.left - 2,
                    width: targetRect.width + 4,
                    height: targetRect.height + 4,
                    borderRadius: 10,
                    border: "1.5px solid rgba(59, 130, 246, 0.5)"
                  }}
                />
              )}
              {/* Arrow indicator pointing to element on mobile - compact */}
              {useMobileSteps && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: [0, 4, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute pointer-events-none text-blue-500 flex flex-col items-center"
                  style={{
                    top: targetRect.top + targetRect.height + 6,
                    left: targetRect.left + targetRect.width / 2,
                    transform: "translateX(-50%)"
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "rotate(180deg)" }}>
                    <path d="M12 4l-8 8h6v8h4v-8h6z" />
                  </svg>
                  <span className="text-[8px] font-medium mt-0.5 bg-blue-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Tap
                  </span>
                </motion.div>
              )}
            </>
          )}

          {/* Tooltip card */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={getTooltipStyle()}
            className={useMobileSteps ? '' : 'w-[360px] max-w-[calc(100vw-32px)]'}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Progress bar */}
              <div className={`${useMobileSteps ? 'h-0.5' : 'h-1.5'} bg-slate-100`}>
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <div className={`${useMobileSteps ? 'p-2.5 pb-2' : 'p-5'}`}>
                {/* Icon and step indicator */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`${useMobileSteps ? 'p-1' : 'p-2.5'} rounded-xl ${
                      isLastStep ? "bg-green-100" : "bg-blue-100"
                    }`}>
                      <StepIcon className={`${useMobileSteps ? 'w-3.5 h-3.5' : 'w-5 h-5'} ${
                        isLastStep ? "text-green-600" : "text-blue-600"
                      }`} />
                    </div>
                    <span className={`${useMobileSteps ? 'text-[9px]' : 'text-xs'} font-medium text-slate-400 uppercase tracking-wide`}>
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
                <h3 className={`${useMobileSteps ? 'text-sm' : 'text-lg'} font-semibold text-slate-900 mb-0.5`}>
                  {step.title}
                </h3>
                <p className={`${useMobileSteps ? 'text-[10px] leading-snug' : 'text-sm leading-relaxed'} text-slate-600 mb-2`}>
                  {step.description}
                </p>

                {/* Progress dots and Navigation buttons */}
                {useMobileSteps ? (
                  // Mobile: Compact combined row with back, dots, next
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBack}
                      disabled={isFirstStep}
                      className={`${isFirstStep ? "opacity-0 pointer-events-none" : ""} text-[10px] h-6 px-1.5 min-w-0`}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {STEPS.map((_, index) => (
                        <span
                          key={index}
                          onClick={() => setCurrentStep(index)}
                          style={{
                            height: index === currentStep ? '4px' : '4px',
                            width: index === currentStep ? '12px' : '4px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            backgroundColor: index === currentStep 
                              ? '#3b82f6' 
                              : index < currentStep 
                                ? '#93c5fd' 
                                : '#e2e8f0'
                          }}
                        />
                      ))}
                    </div>

                    <Button
                      size="sm"
                      onClick={handleNext}
                      className={`${
                        isLastStep 
                          ? "bg-green-600 hover:bg-green-700" 
                          : "bg-blue-600 hover:bg-blue-700"
                      } text-white px-2 text-[10px] h-6 min-w-0`}
                      data-testid="intro-next-btn"
                    >
                      {isLastStep ? "Start" : "Next"}
                      <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  </div>
                ) : (
                  // Desktop: Separate progress dots and buttons
                  <>
                    <div className="flex items-center justify-center gap-1.5 mb-4">
                      {STEPS.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentStep(index)}
                          className={`h-2 rounded-full transition-all ${
                            index === currentStep
                              ? "w-6 bg-blue-500"
                              : index < currentStep
                                ? "w-2 bg-blue-300"
                                : "w-2 bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBack}
                        disabled={isFirstStep}
                        className={isFirstStep ? "invisible" : ""}
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
                  </>
                )}
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
