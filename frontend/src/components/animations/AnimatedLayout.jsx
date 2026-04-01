/**
 * AnimatedLayout
 * Wraps routes with AnimatePresence for smooth page transitions
 */

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { pageVariants, pageTransition } from "./constants";

const AnimatedLayout = memo(({ children, className = "" }) => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        className={className}
        style={{ width: "100%", height: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
});

AnimatedLayout.displayName = "AnimatedLayout";

export default AnimatedLayout;
