/**
 * AnimatedButton
 * Premium button with micro-interactions
 * Scales up on hover, down on tap with spring physics
 */

import { memo, forwardRef } from "react";
import { motion } from "framer-motion";
import { buttonHover, buttonTap, buttonTransition } from "./constants";

const AnimatedButton = memo(forwardRef(({
  children,
  onClick,
  disabled = false,
  variant = "default", // "default" | "primary" | "secondary" | "ghost" | "danger"
  size = "md", // "sm" | "md" | "lg"
  className = "",
  hoverScale = 1.03,
  tapScale = 0.97,
  ...props
}, ref) => {
  // Variant styles
  const variantClasses = {
    default: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm",
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/20",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20",
  };

  // Size styles
  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm rounded-lg",
    md: "px-4 py-2 text-sm rounded-lg",
    lg: "px-6 py-3 text-base rounded-xl",
  };

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2
        font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant] || variantClasses.default}
        ${sizeClasses[size] || sizeClasses.md}
        ${className}
      `}
      whileHover={disabled ? {} : { scale: hoverScale }}
      whileTap={disabled ? {} : { scale: tapScale }}
      transition={buttonTransition}
      {...props}
    >
      {children}
    </motion.button>
  );
}));

AnimatedButton.displayName = "AnimatedButton";

export default AnimatedButton;
