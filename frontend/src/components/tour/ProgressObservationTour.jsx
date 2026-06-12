import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import SpotlightEngine from "./SpotlightEngine";
import ProgressTracker from "./ProgressTracker";
import FloatingNarrationCard from "./FloatingNarrationCard";
import ProgressSceneMocks from "./ProgressSceneMocks";
import AutoFitScale from "./AutoFitScale";
import {
  PROGRESS_TOUR_SCENES,
  PROGRESS_AUTO_PLAY_DURATION_MS,
  PROGRESS_SCENE_DURATIONS_MS,
  PROGRESS_TOUR_COMPLETION_STORAGE_KEY,
  PROGRESS_TOUR_LAST_RUN_STORAGE_KEY,
} from "./progressTourSceneConfig";

const TOUR_LABEL = "Progress an Observation";

/**
 * Cinematic "Progress an Observation" reliability journey tour.
 */
export default function ProgressObservationTour({ isOpen, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayTimerRef = useRef(null);
  const scenes = PROGRESS_TOUR_SCENES;
  const scene = scenes[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === scenes.length - 1;

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsAutoPlaying(true);
      try {
        localStorage.setItem(PROGRESS_TOUR_LAST_RUN_STORAGE_KEY, new Date().toISOString());
      } catch (e) {
        /* ignore */
      }
    }
  }, [isOpen]);

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(PROGRESS_TOUR_COMPLETION_STORAGE_KEY, new Date().toISOString());
    } catch (e) {
      /* ignore */
    }
  }, []);

  const closeTour = useCallback(() => {
    setIsAutoPlaying(false);
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (typeof onClose === "function") onClose();
  }, [onClose]);

  const handleNext = useCallback(() => {
    setIsAutoPlaying(false);
    if (currentIndex < scenes.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      markCompleted();
      closeTour();
    }
  }, [currentIndex, scenes.length, markCompleted, closeTour]);

  const handlePrev = useCallback(() => {
    setIsAutoPlaying(false);
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const handleSkip = useCallback(() => {
    markCompleted();
    closeTour();
  }, [markCompleted, closeTour]);

  const handleJumpTo = useCallback(
    (idx) => {
      setIsAutoPlaying(false);
      if (idx >= 0 && idx < scenes.length) setCurrentIndex(idx);
    },
    [scenes.length]
  );

  const handleToggleAutoPlay = useCallback(() => {
    setIsAutoPlaying((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isOpen || !isAutoPlaying) return undefined;
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    const duration =
      (scene && PROGRESS_SCENE_DURATIONS_MS[scene.id]) || PROGRESS_AUTO_PLAY_DURATION_MS;
    autoPlayTimerRef.current = setTimeout(() => {
      if (currentIndex < scenes.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsAutoPlaying(false);
      }
    }, duration);
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [isOpen, isAutoPlaying, currentIndex, scene, scenes.length]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onVisibility = () => {
      if (document.hidden) setIsAutoPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeTour();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === " ") {
        e.preventDefault();
        handleToggleAutoPlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeTour, handleNext, handlePrev, handleToggleAutoPlay]);

  const transitionVariant = useMemo(
    () => ({
      fade: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      },
      zoom: {
        initial: { opacity: 0, scale: 1.06, filter: "blur(8px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.98, filter: "blur(6px)" },
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
      },
      pan: {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -16 },
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      },
      spotlight: {
        initial: { opacity: 0, scale: 0.985 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.01 },
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      },
    }),
    []
  );

  if (!isOpen || !scene) return null;

  const variant = transitionVariant[scene.transition] || transitionVariant.fade;

  const handleSwipe = (_evt, info) => {
    const offsetX = info?.offset?.x ?? 0;
    const velocityX = info?.velocity?.x ?? 0;
    if (offsetX < -60 || velocityX < -500) {
      handleNext();
    } else if (offsetX > 60 || velocityX > 500) {
      handlePrev();
    }
  };

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="progress-tour-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-[10000] overflow-hidden"
        data-testid="progress-observation-tour-overlay"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 35%, rgba(168,85,247,0.14) 0%, transparent 75%)",
          }}
        />

        <SpotlightEngine
          targetSelector={scene.target}
          spotlightZoom={scene.spotlightZoom || 1}
          pulse={!!scene.pulseTarget}
          active
        />

        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[2] inline-flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 transition-colors"
          aria-label="Exit tour"
          data-testid="progress-observation-tour-close-btn"
        >
          <X className="w-4 h-4" />
        </button>

        <motion.div
          className="relative h-full w-full flex flex-col"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleSwipe}
        >
          <div
            className={`flex-1 min-h-0 flex items-stretch px-3 sm:px-4 pt-14 sm:pt-10 pb-2 sm:pb-4 overflow-hidden ${
              scene.cardPosition === "left"
                ? "justify-center sm:justify-start sm:pl-6 lg:pl-10"
                : scene.cardPosition === "right"
                ? "justify-center sm:justify-end sm:pr-6 lg:pr-10"
                : "justify-center"
            }`}
          >
            <AnimatePresence mode="wait">
              {scene.mockVisual && (
                <motion.div
                  key={`mock-${scene.id}`}
                  initial={variant.initial}
                  animate={variant.animate}
                  exit={variant.exit}
                  transition={variant.transition}
                  className="w-full max-w-full flex items-center justify-center pointer-events-auto"
                  data-testid={`progress-tour-scene-${scene.id}`}
                >
                  <AutoFitScale minScale={0.28} maxScale={1}>
                    <div style={{ width: "min(92vw, 880px)" }}>
                      <ProgressSceneMocks mockKey={scene.mockVisual} typedText={scene.typedText} />
                    </div>
                  </AutoFitScale>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-8 pointer-events-none">
            <div className="max-w-5xl mx-auto flex flex-col items-center gap-3 sm:gap-4">
              <AnimatePresence mode="wait">
                <FloatingNarrationCard
                  key={`card-${scene.id}`}
                  title={scene.title}
                  narration={scene.narration}
                  badge={scene.badge}
                  sceneIndex={currentIndex}
                  totalScenes={scenes.length}
                  isFirst={isFirst}
                  isLast={isLast}
                  isAutoPlaying={isAutoPlaying}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  onSkip={handleSkip}
                  onToggleAutoPlay={handleToggleAutoPlay}
                  position={scene.cardPosition}
                  tourLabel={TOUR_LABEL}
                />
              </AnimatePresence>

              <div className="pointer-events-auto w-full max-w-md sm:max-w-xl">
                <ProgressTracker
                  scenes={scenes}
                  currentIndex={currentIndex}
                  onJumpTo={handleJumpTo}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

export { ProgressObservationTour };
