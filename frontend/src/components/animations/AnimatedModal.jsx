/**
 * AnimatedModal
 * Premium modal/dialog with scale + fade animations
 */

import { memo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  scaleVariants,
  overlayVariants,
  springPresets,
  tweenPresets,
} from "./constants";

const AnimatedModal = memo(({
  isOpen,
  onClose,
  children,
  title,
  footer,
  size = "md", // "sm" | "md" | "lg" | "xl" | "full"
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = "",
  overlayClassName = "",
  contentClassName = "",
}) => {
  // Size presets
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    full: "max-w-[95vw] max-h-[95vh]",
  };

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${overlayClassName}`}
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenPresets.fast}
            onClick={handleOverlayClick}
            data-testid="modal-overlay"
          />
          
          {/* Modal Panel */}
          <motion.div
            className={`
              relative w-full ${sizeClasses[size] || sizeClasses.md}
              bg-white dark:bg-slate-900 
              rounded-2xl shadow-2xl
              flex flex-col max-h-[90vh]
              ${className}
            `}
            variants={scaleVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springPresets.smooth}
            data-testid="animated-modal"
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                {title && (
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {title}
                  </h2>
                )}
                {showCloseButton && (
                  <motion.button
                    onClick={onClose}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    data-testid="modal-close-btn"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                )}
              </div>
            )}
            
            {/* Content */}
            <div className={`flex-1 overflow-y-auto p-6 ${contentClassName}`}>
              {children}
            </div>
            
            {/* Footer */}
            {footer && (
              <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

AnimatedModal.displayName = "AnimatedModal";

export default AnimatedModal;
