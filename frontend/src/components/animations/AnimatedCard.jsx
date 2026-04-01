/**
 * AnimatedCard
 * Card component with smooth hover lift effect
 */

import { memo, forwardRef } from "react";
import { motion } from "framer-motion";
import { springPresets } from "./constants";

const AnimatedCard = memo(forwardRef(({
  children,
  onClick,
  className = "",
  hoverEffect = true,
  layoutId,
  ...props
}, ref) => {
  return (
    <motion.div
      ref={ref}
      onClick={onClick}
      className={`
        bg-white dark:bg-slate-800 
        rounded-xl border border-slate-200 dark:border-slate-700
        shadow-sm
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
      layout={!!layoutId}
      layoutId={layoutId}
      whileHover={hoverEffect ? {
        y: -2,
        boxShadow: "0 12px 40px -12px rgba(0,0,0,0.15)",
      } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      transition={springPresets.snappy}
      {...props}
    >
      {children}
    </motion.div>
  );
}));

AnimatedCard.displayName = "AnimatedCard";

export default AnimatedCard;
