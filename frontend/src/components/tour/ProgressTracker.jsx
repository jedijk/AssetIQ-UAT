import React from "react";
import { motion } from "framer-motion";

/**
 * Progress dots + chapter label, Apple-style.
 */
export default function ProgressTracker({ scenes, currentIndex, onJumpTo }) {
  if (!scenes || scenes.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2 select-none">
      <div
        className="flex items-center justify-center gap-0.5 sm:gap-1.5 max-w-full px-1"
        role="tablist"
        aria-label="Tour scene progress"
      >
        {scenes.map((scene, idx) => {
          const isActive = idx === currentIndex;
          const isDone = idx < currentIndex;
          return (
            <button
              key={scene.id}
              type="button"
              data-tour-progress-dot
              onClick={() => onJumpTo && onJumpTo(idx)}
              aria-label={`Go to scene ${idx + 1}: ${scene.chapter || scene.title}`}
              aria-current={isActive ? "step" : undefined}
              role="tab"
              className="group relative cursor-pointer flex items-center justify-center p-1 min-h-0 min-w-0 h-auto w-auto shrink-0"
              data-testid={`tour-progress-dot-${idx}`}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                className={`block rounded-full transition-colors ${
                  isActive
                    ? "h-1 w-3.5 sm:h-2 sm:w-9 bg-white"
                    : isDone
                    ? "h-1 w-1 sm:h-2 sm:w-2.5 bg-white/65"
                    : "h-1 w-1 sm:h-2 sm:w-2.5 bg-white/25 group-hover:bg-white/45"
                }`}
              />
            </button>
          );
        })}
      </div>
      <div className="text-[9px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.25em] text-white/55 text-center px-2">
        Scene {currentIndex + 1} / {scenes.length}
        {scenes[currentIndex]?.chapter ? (
          <span className="ml-1 sm:ml-2 text-white/40">— {scenes[currentIndex].chapter}</span>
        ) : null}
      </div>
    </div>
  );
}
