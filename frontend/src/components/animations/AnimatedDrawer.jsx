/**
 * AnimatedDrawer
 * Premium sliding drawer/side menu with spring animations
 * Slides from left by default, supports right side as well
 */

import { memo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  slideFromLeftVariants,
  slideFromRightVariants,
  overlayVariants,
  springPresets,
  tweenPresets,
} from "./constants";

const AnimatedDrawer = memo(({
  isOpen,
  onClose,
  children,
  side = "left", // "left" | "right"
  width = "320px",
  maxWidth = "85vw",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = "",
  overlayClassName = "",
  title,
  footer,
}) => {
  // Handle escape key
  useEffect(() => {
    if (!closeOnEscape || !isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, closeOnEscape]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback((e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  const variants = side === "left" ? slideFromLeftVariants : slideFromRightVariants;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] ${overlayClassName}`}
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenPresets.fast}
            onClick={handleOverlayClick}
            data-testid="drawer-overlay"
          />
          
          {/* Drawer Panel */}
          <motion.div
            className={`
              fixed top-0 ${side === "left" ? "left-0" : "right-0"} 
              h-full bg-white dark:bg-slate-900 
              shadow-2xl z-[60] flex flex-col
              ${className}
            `}
            style={{ 
              width,
              maxWidth,
            }}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springPresets.smooth}
            data-testid="animated-drawer"
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                {title && (
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {title}
                  </h2>
                )}
                {showCloseButton && (
                  <motion.button
                    onClick={onClose}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    data-testid="drawer-close-btn"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                )}
              </div>
            )}
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </div>
            
            {/* Footer */}
            {footer && (
              <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 p-4">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

AnimatedDrawer.displayName = "AnimatedDrawer";

export default AnimatedDrawer;
