/**
 * AnimatedPresence
 * Utility wrapper for conditionally rendering elements with animations
 */

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeVariants, scaleVariants, springPresets, tweenPresets } from "./constants";

// Simple fade in/out
export const FadePresence = memo(({
  children,
  isVisible,
  className = "",
  duration = 0.2,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={className}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

FadePresence.displayName = "FadePresence";

// Scale + fade (good for tooltips, popovers)
export const ScalePresence = memo(({
  children,
  isVisible,
  className = "",
  origin = "center", // "center" | "top" | "bottom" | "left" | "right"
}) => {
  const originStyles = {
    center: "origin-center",
    top: "origin-top",
    bottom: "origin-bottom",
    left: "origin-left",
    right: "origin-right",
    "top-left": "origin-top-left",
    "top-right": "origin-top-right",
    "bottom-left": "origin-bottom-left",
    "bottom-right": "origin-bottom-right",
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`${originStyles[origin]} ${className}`}
          variants={scaleVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={springPresets.snappy}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ScalePresence.displayName = "ScalePresence";

// Slide animations
export const SlidePresence = memo(({
  children,
  isVisible,
  direction = "up", // "up" | "down" | "left" | "right"
  className = "",
  distance = 10,
}) => {
  const getVariants = () => {
    const directions = {
      up: { y: distance },
      down: { y: -distance },
      left: { x: distance },
      right: { x: -distance },
    };
    
    return {
      initial: { opacity: 0, ...directions[direction] },
      animate: { opacity: 1, x: 0, y: 0 },
      exit: { opacity: 0, ...directions[direction] },
    };
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={className}
          variants={getVariants()}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={springPresets.snappy}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

SlidePresence.displayName = "SlidePresence";

export default { FadePresence, ScalePresence, SlidePresence };
