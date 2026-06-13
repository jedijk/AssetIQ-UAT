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
import {
  getProgressTourScenes,
  PROGRESS_AUTO_PLAY_DURATION_MS,
  PROGRESS_SCENE_DURATIONS_MS,
  PROGRESS_TOUR_COMPLETION_STORAGE_KEY,
  PROGRESS_TOUR_LAST_RUN_STORAGE_KEY,
} from "./progressTourSceneConfig";
import { useLanguage } from "../../contexts/LanguageContext";
import { threatsAPI } from "../../lib/api";

const I18N_NS = "progressObservationTour";

/**
 * Guided "Observation Resolution Workflow" tour — spotlights real workspace UI.
 */
export default function ProgressObservationTour({ isOpen, onClose, navigate }) {
  const { t, language } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [demoThreatId, setDemoThreatId] = useState(null);
  const autoPlayTimerRef = useRef(null);
  const scenes = useMemo(() => getProgressTourScenes(t), [t, language]);
  const scene = scenes[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === scenes.length - 1;

  useEffect(() => {
    if (!isOpen) {
      setDemoThreatId(null);
      return undefined;
    }

    setCurrentIndex(0);
    setIsAutoPlaying(false);
    try {
      localStorage.setItem(PROGRESS_TOUR_LAST_RUN_STORAGE_KEY, new Date().toISOString());
    } catch (e) {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await threatsAPI.getTop(1, { language });
        const first = Array.isArray(data) ? data[0] : data?.threats?.[0];
        if (!cancelled && first?.id) setDemoThreatId(first.id);
      } catch (e) {
        /* ignore — tour still works on observations list */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !scene || typeof navigate !== "function") return;

    if (scene.navigateTo === "threats") {
      navigate("/threats");
      return;
    }

    if (scene.navigateTo === "workspace" && demoThreatId) {
      navigate(`/threats/${demoThreatId}/workspace`);
    }
  }, [isOpen, scene?.id, scene?.navigateTo, navigate, demoThreatId]);

  useEffect(() => {
    if (!isOpen || !scene) return undefined;

    if (scene.openFullAnalysis) {
      window.dispatchEvent(new Event("progress-tour:open-full-analysis"));
    } else if (scene.closeFullAnalysis) {
      window.dispatchEvent(new Event("progress-tour:close-full-analysis"));
    }
  }, [isOpen, scene?.id, scene?.openFullAnalysis, scene?.closeFullAnalysis]);

  useEffect(() => {
    if (!isOpen || !scene) return undefined;
    const fire = () => window.dispatchEvent(new Event("resize"));
    const t1 = setTimeout(fire, 280);
    const t2 = setTimeout(fire, 650);
    const t3 = setTimeout(fire, 1100);
    const t4 = setTimeout(fire, 1800);
    const t5 = scene.openFullAnalysis ? setTimeout(fire, 2800) : null;
    const t6 = scene.openFullAnalysis ? setTimeout(fire, 3800) : null;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      if (t5) clearTimeout(t5);
      if (t6) clearTimeout(t6);
    };
  }, [isOpen, scene?.id, scene?.navigateTo, scene?.openWorkspaceMenu, scene?.openWorkspaceEdit, scene?.openFullAnalysis, scene?.target, scene?.dock]);

  useEffect(() => {
    if (!isOpen || !scene?.target) return undefined;

    const bottomChromeInset = scene.dock === "top" ? 48 : 340;

    const scrollTarget = () => {
      if (scene.scrollPanel) {
        document.querySelector(scene.scrollPanel)?.scrollIntoView?.({
          block: "start",
          behavior: "smooth",
        });
      }

      const el = document.querySelector(scene.target);
      if (!el) {
        window.dispatchEvent(new Event("resize"));
        return;
      }

      const scrollablePanel = el.closest('[data-testid="recommended-actions-panel"]');
      if (scrollablePanel && scene.id === "generate-recommendations") {
        scrollablePanel.scrollTop = 0;
      }

      const dialog = el.closest('[data-testid="full-analysis-dialog"]');
      if (dialog) {
        const dialogRect = dialog.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const overflow = elRect.bottom - (window.innerHeight - bottomChromeInset);
        if (overflow > 0) {
          dialog.scrollTop += overflow + 16;
        } else if (elRect.top < (scene.dock === "top" ? 280 : 80)) {
          dialog.scrollTop += elRect.top - (scene.dock === "top" ? 280 : 80);
        }
      } else {
        el.scrollIntoView?.({
          block: scene.id === "generate-recommendations" ? "center" : scene.dock === "top" ? "center" : "nearest",
          behavior: "smooth",
        });
      }

      window.dispatchEvent(new Event("resize"));
    };

    const timers = [700, 1400, 2200, 3200].map((ms) => setTimeout(scrollTarget, ms));
    return () => timers.forEach(clearTimeout);
  }, [isOpen, scene?.id, scene?.target, scene?.dock, scene?.openFullAnalysis, scene?.scrollPanel]);

  useEffect(() => {
    if (!isOpen || !scene?.openWorkspaceMenu) return undefined;

    let cancelled = false;
    const timers = [];

    const openMenu = () => {
      if (cancelled) return;
      const cancelBtn = document.querySelector('[data-testid="cancel-edit-btn"]');
      if (cancelBtn) cancelBtn.click();
      const btn = document.querySelector('[data-testid="workspace-more-menu"]');
      if (!btn) return;
      btn.click();
      window.dispatchEvent(new Event("resize"));
    };

    timers.push(setTimeout(openMenu, 750));
    timers.push(setTimeout(openMenu, 1300));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    };
  }, [isOpen, scene?.id, scene?.openWorkspaceMenu]);

  useEffect(() => {
    if (!isOpen || !scene?.openWorkspaceEdit) return undefined;

    let cancelled = false;
    const timers = [];

    const enterEdit = () => {
      if (cancelled) return;
      const cancelBtn = document.querySelector('[data-testid="cancel-edit-btn"]');
      const editBtn = document.querySelector('[data-testid="workspace-edit-btn"]');
      if (!cancelBtn && editBtn) editBtn.click();
      window.dispatchEvent(new Event("resize"));
    };

    timers.push(setTimeout(enterEdit, 750));
    timers.push(setTimeout(enterEdit, 1300));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      const cancelBtn = document.querySelector('[data-testid="cancel-edit-btn"]');
      if (cancelBtn) cancelBtn.click();
    };
  }, [isOpen, scene?.id, scene?.openWorkspaceEdit]);

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
    window.dispatchEvent(new Event("progress-tour:close-full-analysis"));
    const cancelEditBtn = document.querySelector('[data-testid="cancel-edit-btn"]');
    if (cancelEditBtn) cancelEditBtn.click();
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
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

  const dockTop = scene.dock === "top";

  const handleSwipe = (_evt, info) => {
    const offsetX = info?.offset?.x ?? 0;
    const velocityX = info?.velocity?.x ?? 0;
    if (offsetX < -60 || velocityX < -500) {
      handleNext();
    } else if (offsetX > 60 || velocityX > 500) {
      handlePrev();
    }
  };

  const tourChrome = (
    <div className="max-w-5xl mx-auto flex flex-col items-center gap-3 sm:gap-4">
      <AnimatePresence mode="wait">
        <FloatingNarrationCard
          key={`card-${scene.id}-${language}`}
          title={scene.title}
          narration={scene.narration}
          badge={scene.badge}
          actionHint={scene.actionHint}
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
          tourLabel={t(`${I18N_NS}.tourLabel`)}
          i18nNamespace={I18N_NS}
        />
      </AnimatePresence>

      <div className="pointer-events-auto w-full max-w-md sm:max-w-xl">
        <ProgressTracker
          scenes={scenes}
          currentIndex={currentIndex}
          onJumpTo={handleJumpTo}
          i18nNamespace={I18N_NS}
        />
      </div>
    </div>
  );

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
          backdropOpacity={0.52}
        />

        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[2] pointer-events-auto inline-flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 transition-colors"
          aria-label={t(`${I18N_NS}.exitTour`)}
          data-testid="progress-observation-tour-close-btn"
        >
          <X className="w-4 h-4" />
        </button>

        <motion.div
          className="relative h-full w-full flex flex-col pointer-events-none"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleSwipe}
        >
          {dockTop ? (
            <div className="shrink-0 px-3 sm:px-4 pt-14 sm:pt-16 pb-2 pointer-events-none">
              {tourChrome}
            </div>
          ) : (
            <div className="flex-1 min-h-0" aria-hidden="true" />
          )}

          {!dockTop && (
          <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-8 pointer-events-none">
            {tourChrome}
          </div>
          )}

          {dockTop && <div className="flex-1 min-h-0" aria-hidden="true" />}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

export { ProgressObservationTour };
