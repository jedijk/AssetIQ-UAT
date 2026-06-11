import React from "react";
import { motion } from "framer-motion";

/**
 * Progress dots + chapter label, Apple-style.
 */
export default function ProgressTracker({ scenes, currentIndex, onJumpTo }) {
  if (!scenes || scenes.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        className="flex items-center gap-1 sm:gap-1.5"
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
              onClick={() => onJumpTo && onJumpTo(idx)}
              aria-label={`Go to scene ${idx + 1}: ${scene.chapter || scene.title}`}
              aria-current={isActive ? "step" : undefined}
              role="tab"
              className={`group relative cursor-pointer h-1 sm:h-2 ${
                isActive ? "w-[18px] sm:w-9" : "w-1 sm:w-2.5"
              }`}
              data-testid={`tour-progress-dot-${idx}`}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                className={`absolute inset-0 rounded-full transition-colors ${
                  isActive
                    ? "bg-white"
                    : isDone
                    ? "bg-white/65"
                    : "bg-white/25 group-hover:bg-white/45"
                }`}
              />
            </button>
          );
        })}
      </div>
      <div className="text-[11px] uppercase tracking-[0.25em] text-white/55">
        Scene {currentIndex + 1} / {scenes.length}
        {scenes[currentIndex]?.chapter ? (
          <span className="ml-2 text-white/40">— {scenes[currentIndex].chapter}</span>
        ) : null}
      </div>
    </div>
  );
}
