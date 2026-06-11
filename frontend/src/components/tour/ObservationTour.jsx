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
import SceneMocks from "./SceneMocks";
import AutoFitScale from "./AutoFitScale";
import {
  TOUR_SCENES,
  AUTO_PLAY_DURATION_MS,
  SCENE_DURATIONS_MS,
  TOUR_COMPLETION_STORAGE_KEY,
  TOUR_LAST_RUN_STORAGE_KEY,
} from "./sceneConfig";

/**
 * Cinematic "Create Your First Observation" tour.
 *
 * Public API (kept identical to the previous ObservationTour for drop-in):
 *  - isOpen, onClose
 *  - setChatOpen, setChatPrefillMessage, setHierarchyOpen (used to drive real UI)
 */
export default function ObservationTour({
  isOpen,
  onClose,
  setChatOpen,
  setChatPrefillMessage,
  setHierarchyOpen,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayTimerRef = useRef(null);
  const scenes = TOUR_SCENES;
  const scene = scenes[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === scenes.length - 1;

  /* ------------------------------------------------------------------
   * Lifecycle
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      // Auto-play is ON by default; the user can pause from the controls.
      setIsAutoPlaying(true);
      try {
        localStorage.setItem(TOUR_LAST_RUN_STORAGE_KEY, new Date().toISOString());
      } catch (e) {
        /* ignore */
      }
    }
  }, [isOpen]);

  /* ------------------------------------------------------------------
   * Drive real AssetIQ UI when scenes require it
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen || !scene) return;

    if (scene.ensureChat === "open" && typeof setChatOpen === "function") {
      setChatOpen(true);
    } else if (scene.ensureChat === "closed" && typeof setChatOpen === "function") {
      setChatOpen(false);
    }

    if (
      scene.ensureHierarchy === "open" &&
      typeof setHierarchyOpen === "function"
    ) {
      setHierarchyOpen(true);
    } else if (
      scene.ensureHierarchy === "closed" &&
      typeof setHierarchyOpen === "function"
    ) {
      setHierarchyOpen(false);
    }

    if (typeof setChatPrefillMessage === "function") {
      // The cinematic tour does not pre-fill the live chat; clear any leftover.
      setChatPrefillMessage(null);
    }
  }, [
    isOpen,
    scene,
    setChatOpen,
    setHierarchyOpen,
    setChatPrefillMessage,
  ]);

  /* ------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------ */

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(TOUR_COMPLETION_STORAGE_KEY, new Date().toISOString());
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
    if (typeof setChatOpen === "function") setChatOpen(false);
    if (typeof setHierarchyOpen === "function") setHierarchyOpen(false);
    if (typeof setChatPrefillMessage === "function") setChatPrefillMessage(null);
    if (typeof onClose === "function") onClose();
  }, [onClose, setChatOpen, setChatPrefillMessage, setHierarchyOpen]);

  const handleNext = useCallback(() => {
    // Any manual advance pauses auto-play so the user can read at their own pace.
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

  /* ------------------------------------------------------------------
   * Auto-play loop — per-scene durations, pause when tab hidden
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen || !isAutoPlaying) return undefined;
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    const duration =
      (scene && SCENE_DURATIONS_MS[scene.id]) || AUTO_PLAY_DURATION_MS;
    autoPlayTimerRef.current = setTimeout(() => {
      if (currentIndex < scenes.length - 1) {
        // Auto-advance does NOT use handleNext, so it doesn't toggle isAutoPlaying off.
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

  // Pause auto-play when the browser tab is hidden (sensible auto-pause).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onVisibility = () => {
      if (document.hidden) setIsAutoPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isOpen]);

  /* ------------------------------------------------------------------
   * Keyboard nav
   * ------------------------------------------------------------------ */

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
    // Threshold suited for thumb-flicks
    if (offsetX < -60 || velocityX < -500) {
      handleNext();
    } else if (offsetX > 60 || velocityX > 500) {
      handlePrev();
    }
  };

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-[10000] overflow-hidden"
        data-testid="observation-tour-overlay"
      >
        {/* Subtle gradient halo behind everything */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 35%, rgba(59,130,246,0.12) 0%, transparent 75%)",
          }}
        />

        {/* The cinematic spotlight cuts a hole in the dark backdrop for the real DOM target. */}
        <SpotlightEngine
          targetSelector={scene.target}
          spotlightZoom={scene.spotlightZoom || 1}
          pulse={!!scene.pulseTarget}
          active
        />

        {/* Top-right close affordance (mirrors Skip but always visible) */}
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[2] inline-flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 transition-colors"
          aria-label="Exit tour"
          data-testid="observation-tour-close-btn"
        >
          <X className="w-4 h-4" />
        </button>

        {/*
         * Flex column layout: mock visual on top (shrinks/scrolls to fit),
         * narration card + progress docked at the bottom. This guarantees
         * the two never overlap on small screens.
         */}
        <motion.div
          className="relative h-full w-full flex flex-col"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleSwipe}
        >
          {/* Mock visual stage — fills available space and auto-scales to fit
              via AutoFitScale (no scrolling, no overlap with the narration
              dock below). When cardPosition is "left"/"right" we bias the
              mock to the same side as the narration card so it never overlaps
              with a spotlight on the opposite edge of the screen. */}
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
                  data-testid={`tour-scene-${scene.id}`}
                >
                  <AutoFitScale minScale={0.3} maxScale={1}>
                    <div style={{ width: "min(92vw, 880px)" }}>
                      <SceneMocks mockKey={scene.mockVisual} typedText={scene.typedText} />
                    </div>
                  </AutoFitScale>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom dock: narration card + progress */}
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
                />
              </AnimatePresence>

              <div className="pointer-events-auto">
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

export { ObservationTour };
