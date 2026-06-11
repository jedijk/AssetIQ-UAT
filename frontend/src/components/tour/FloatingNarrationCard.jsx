import React from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipForward,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { Button } from "../ui/button";

/**
 * Apple-style floating narration card.
 * Sits over the cinematic backdrop, contains title, narration, optional badge,
 * keyboard hint, and the primary controls (Prev / Next / Skip / Auto-play toggle).
 */
export default function FloatingNarrationCard({
  title,
  narration,
  badge,
  sceneIndex,
  totalScenes,
  isFirst,
  isLast,
  isAutoPlaying,
  onPrev,
  onNext,
  onSkip,
  onToggleAutoPlay,
  position = "center",
  children,
}) {
  // We intentionally don't fight the SpotlightEngine: this card is anchored
  // bottom-center via parent layout, while the spotlight handles direction
  // cues. We use the `position` prop to subtly bias horizontal alignment.
  const horizontalAlign =
    position === "left"
      ? "sm:ml-0 sm:mr-auto"
      : position === "right"
      ? "sm:mr-0 sm:ml-auto"
      : "mx-auto";

  return (
    <motion.div
      key={`narration-${sceneIndex}`}
      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-auto w-full max-w-2xl ${horizontalAlign}`}
      data-testid="tour-narration-card"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        {/* Decorative gradient sheen */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, rgba(59,130,246,0.18) 0%, transparent 60%), radial-gradient(120% 80% at 100% 100%, rgba(168,85,247,0.12) 0%, transparent 60%)",
          }}
        />

        <div className="relative px-6 sm:px-8 pt-6 pb-5">
          {/* Header row: badge + sparkles */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-blue-300/90">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Create Your First Observation</span>
            </div>
            {badge ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-xs font-medium px-2.5 py-1"
                data-testid="tour-narration-badge"
              >
                <CheckCircle className="w-3 h-3" />
                {badge}
              </motion.span>
            ) : null}
          </div>

          <h2
            className="text-white text-2xl sm:text-3xl font-semibold tracking-tight leading-tight"
            data-testid="tour-narration-title"
          >
            {title}
          </h2>
          <p
            className="mt-3 text-slate-300 text-[15px] sm:text-base leading-relaxed"
            data-testid="tour-narration-body"
          >
            {narration}
          </p>

          {children ? <div className="mt-4">{children}</div> : null}
        </div>

        {/* Controls */}
        <div className="relative flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-white/10 bg-black/20">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-slate-300 hover:text-white hover:bg-white/10"
              data-testid="tour-skip-btn"
            >
              <SkipForward className="w-4 h-4 mr-1.5" />
              Skip tour
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleAutoPlay}
              className="text-slate-300 hover:text-white hover:bg-white/10"
              aria-pressed={isAutoPlaying}
              data-testid="tour-autoplay-btn"
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-4 h-4 mr-1.5" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1.5" />
                  Auto-play
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onPrev}
              disabled={isFirst}
              className="text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-40"
              data-testid="tour-prev-btn"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onNext}
              className="bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/30"
              data-testid="tour-next-btn"
            >
              {isLast ? (
                <>
                  Finish
                  <CheckCircle className="w-4 h-4 ml-1.5" />
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

      {/* Keyboard hint */}
      <div className="mt-3 text-center text-[11px] text-white/40 tracking-wide">
        Use
        <kbd className="mx-1 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/70 text-[10px]">←</kbd>
        <kbd className="mx-0.5 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/70 text-[10px]">→</kbd>
        to navigate ·
        <kbd className="mx-1 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/70 text-[10px]">Space</kbd>
        to play / pause ·
        <kbd className="mx-1 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/70 text-[10px]">Esc</kbd>
        to exit
      </div>
    </motion.div>
  );
}
