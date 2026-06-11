import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SPOTLIGHT_INSET = 12;

/**
 * Cinematic spotlight that animates between target rectangles.
 * Uses an animated SVG mask to cut out the dark backdrop.
 *
 * Behavior when there is no resolvable target:
 *  - No cutout is rendered: the full dark backdrop covers the screen.
 *    This is the right look for "cinematic" scenes that don't anchor to a
 *    real DOM element (e.g. the AI detection / next-steps narrative scenes).
 */
export default function SpotlightEngine({
  targetSelector,
  spotlightZoom = 1,
  pulse = false,
  active = true,
}) {
  const [rect, setRect] = useState(null);
  const [viewport, setViewport] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1280, h: typeof window !== "undefined" ? window.innerHeight : 800 });
  const maskIdRef = useRef(`spotlight-mask-${Math.random().toString(36).slice(2, 9)}`);

  const recomputeRect = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport({ w: vw, h: vh });

    if (!targetSelector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(targetSelector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      setRect(null);
      return;
    }
    const baseW = r.width + SPOTLIGHT_INSET * 2;
    const baseH = r.height + SPOTLIGHT_INSET * 2;
    const scaledW = baseW * spotlightZoom;
    const scaledH = baseH * spotlightZoom;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setRect({
      top: Math.max(8, cy - scaledH / 2),
      left: Math.max(8, cx - scaledW / 2),
      width: Math.min(scaledW, vw - 16),
      height: Math.min(scaledH, vh - 16),
    });
  }, [targetSelector, spotlightZoom]);

  useEffect(() => {
    if (!active) return undefined;
    recomputeRect();
    // Re-measure after layout settles
    const raf = requestAnimationFrame(recomputeRect);
    const t1 = setTimeout(recomputeRect, 220);
    const t2 = setTimeout(recomputeRect, 520);

    const onResize = () => recomputeRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, recomputeRect]);

  const hasTarget = !!rect;
  const maskId = maskIdRef.current;

  // When there is no resolvable target, render a full dark backdrop with no cutout.
  if (!hasTarget) {
    return (
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        data-testid="tour-spotlight-engine"
      >
        <div
          className="absolute inset-0"
          style={{ background: "rgba(2, 6, 23, 0.78)" }}
        />
      </div>
    );
  }

  const effectiveRect = rect;

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      aria-hidden="true"
      data-testid="tour-spotlight-engine"
    >
      {/* Dark backdrop with animated cut-out */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.rect
              animate={{
                x: effectiveRect.left,
                y: effectiveRect.top,
                width: effectiveRect.width,
                height: effectiveRect.height,
              }}
              transition={{
                type: "spring",
                stiffness: 140,
                damping: 22,
                mass: 0.9,
              }}
              rx={16}
              ry={16}
              fill="black"
            />
          </mask>
          <radialGradient id={`${maskId}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.0)" />
            <stop offset="75%" stopColor="rgba(59, 130, 246, 0.10)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.0)" />
          </radialGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(2, 6, 23, 0.78)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Glowing border ring around the spotlight */}
      <AnimatePresence>
        <motion.div
          key="spotlight-ring"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="absolute pointer-events-none"
          style={{
            top: effectiveRect.top,
            left: effectiveRect.left,
            width: effectiveRect.width,
            height: effectiveRect.height,
            borderRadius: 16,
            boxShadow:
              "0 0 0 1px rgba(96, 165, 250, 0.55), 0 0 0 6px rgba(59, 130, 246, 0.18), 0 0 60px rgba(59, 130, 246, 0.35)",
          }}
        />
      </AnimatePresence>

      {/* Pulsing accent ring when requested */}
      <AnimatePresence>
        {pulse && (
          <motion.div
            key="spotlight-pulse"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 1.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            className="absolute pointer-events-none"
            style={{
              top: effectiveRect.top,
              left: effectiveRect.left,
              width: effectiveRect.width,
              height: effectiveRect.height,
              borderRadius: 16,
              boxShadow: "0 0 0 3px rgba(96, 165, 250, 0.55)",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export const useSpotlightRect = (selector) => {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };
    measure();
    const t = setTimeout(measure, 240);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);
  return rect;
};
