/**
 * Animation Constants
 * Premium animation presets for consistent, smooth interactions
 */

// Spring configurations for different use cases
export const springPresets = {
  // Snappy, responsive feel - good for buttons and small elements
  snappy: {
    type: "spring",
    stiffness: 400,
    damping: 30,
  },
  // Smooth, natural feel - good for panels and modals
  smooth: {
    type: "spring",
    stiffness: 260,
    damping: 30,
  },
  // Gentle, slow feel - good for page transitions
  gentle: {
    type: "spring",
    stiffness: 120,
    damping: 20,
  },
  // Bouncy feel - good for attention-grabbing elements
  bouncy: {
    type: "spring",
    stiffness: 300,
    damping: 15,
  },
};

// Tween configurations for precise timing
export const tweenPresets = {
  fast: {
    type: "tween",
    duration: 0.2,
    ease: [0.25, 0.1, 0.25, 1], // ease-out
  },
  medium: {
    type: "tween",
    duration: 0.3,
    ease: [0.25, 0.1, 0.25, 1],
  },
  slow: {
    type: "tween",
    duration: 0.4,
    ease: [0.25, 0.1, 0.25, 1],
  },
};

// Page transition variants
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -8,
  },
};

export const pageTransition = {
  type: "tween",
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1],
};

// Fade variants
export const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// Scale variants for modals/panels
export const scaleVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 10,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
  },
};

// Slide variants for drawers
export const slideFromLeftVariants = {
  initial: { x: "-100%" },
  animate: { x: 0 },
  exit: { x: "-100%" },
};

export const slideFromRightVariants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};

export const slideFromBottomVariants = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
};

// Overlay variants
export const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// Stagger children variants
export const staggerContainerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const staggerItemVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

// Button interaction values
export const buttonHover = { scale: 1.03 };
export const buttonTap = { scale: 0.97 };
export const buttonTransition = springPresets.snappy;

// Card hover
export const cardHover = { 
  scale: 1.02,
  y: -2,
  boxShadow: "0 10px 40px -10px rgba(0,0,0,0.15)",
};
export const cardTap = { scale: 0.98 };
