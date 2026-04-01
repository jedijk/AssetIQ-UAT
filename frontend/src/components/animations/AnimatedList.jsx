/**
 * AnimatedList
 * List container with staggered children animations
 */

import { memo } from "react";
import { motion } from "framer-motion";
import {
  staggerContainerVariants,
  staggerItemVariants,
  springPresets,
} from "./constants";

// Container that staggers its children
export const AnimatedList = memo(({
  children,
  className = "",
  staggerDelay = 0.05,
  initialDelay = 0.1,
}) => {
  const containerVariants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
      },
    },
    exit: {
      transition: {
        staggerChildren: staggerDelay / 2,
        staggerDirection: -1,
      },
    },
  };

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  );
});

AnimatedList.displayName = "AnimatedList";

// Individual list item with fade + slide animation
export const AnimatedListItem = memo(({
  children,
  className = "",
  layoutId,
  layout = false,
}) => {
  return (
    <motion.div
      className={className}
      variants={staggerItemVariants}
      transition={springPresets.snappy}
      layout={layout || !!layoutId}
      layoutId={layoutId}
    >
      {children}
    </motion.div>
  );
});

AnimatedListItem.displayName = "AnimatedListItem";

export default AnimatedList;
