/**
 * Animation Components - Central Export
 * Premium animation system using Framer Motion
 */

// Constants
export * from "./constants";

// Layout & Page Transitions
export { default as AnimatedLayout } from "./AnimatedLayout";

// Drawer / Side Menu
export { default as AnimatedDrawer } from "./AnimatedDrawer";

// Modal / Dialog
export { default as AnimatedModal } from "./AnimatedModal";

// Interactive Button
export { default as AnimatedButton } from "./AnimatedButton";

// Card with hover effects
export { default as AnimatedCard } from "./AnimatedCard";

// List with stagger animations
export { AnimatedList, AnimatedListItem } from "./AnimatedList";

// Presence animations
export { FadePresence, ScalePresence, SlidePresence } from "./AnimatedPresence";

// Hooks
export { useAnimatedNavigation } from "./useAnimatedNavigation";

// Re-export framer-motion essentials for convenience
export { 
  motion, 
  AnimatePresence, 
  LayoutGroup,
  useAnimation,
  useInView,
  useScroll,
  useTransform,
} from "framer-motion";
