import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "../../contexts/LanguageContext";

/**
 * Progress dots + chapter label, Apple-style.
 */
export default function ProgressTracker({ scenes, currentIndex, onJumpTo, i18nNamespace = "observationTour" }) {
  const { t } = useLanguage();
  if (!scenes || scenes.length === 0) return null;
  return (
    <div className="tour-progress-tracker flex flex-col items-center gap-0.5 sm:gap-2 select-none">
      <div
        className="tour-progress-dots flex items-center justify-center gap-px sm:gap-1.5 max-w-full px-1 overflow-x-auto flex-nowrap scrollbar-none"
        role="tablist"
        aria-label={t(`${i18nNamespace}.progressAriaLabel`)}
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
              aria-label={t(`${i18nNamespace}.goToScene`, {
                index: idx + 1,
                chapter: scene.chapter || scene.title,
              })}
              aria-current={isActive ? "step" : undefined}
              role="tab"
              className="tour-progress-dot-btn group relative cursor-pointer flex items-center justify-center shrink-0 sm:p-1"
              data-testid={`tour-progress-dot-${idx}`}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                className={`tour-progress-dot-visual block rounded-full transition-colors sm:h-2 ${
                  isActive
                    ? "bg-white sm:w-9"
                    : isDone
                    ? "bg-white/65 sm:w-2.5"
                    : "bg-white/25 group-hover:bg-white/45 sm:w-2.5"
                }`}
              />
            </button>
          );
        })}
      </div>
      <div className="text-[8px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.25em] text-white/55 text-center px-2">
        {t(`${i18nNamespace}.sceneProgress`, {
          current: currentIndex + 1,
          total: scenes.length,
        })}
        {scenes[currentIndex]?.chapter ? (
          <span className="ml-1 sm:ml-2 text-white/40">— {scenes[currentIndex].chapter}</span>
        ) : null}
      </div>
    </div>
  );
}
