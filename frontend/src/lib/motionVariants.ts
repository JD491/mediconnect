import type { Variants } from 'framer-motion';

/**
 * Shared easing curve used across the app for a calm, premium feel —
 * a gentle deceleration rather than a bouncy/playful spring. Healthcare
 * UI should feel steady and trustworthy, not flashy.
 */
export const EASE_CALM: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ---------------------------------------------------------------------------
// Page transitions — subtle fade + slight vertical slide (y: 12 -> 0)
// ---------------------------------------------------------------------------
export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_CALM } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: EASE_CALM } },
};

// ---------------------------------------------------------------------------
// Staggered content — dashboard cards, medicine lists, order items, stats
// ---------------------------------------------------------------------------
export function staggerContainer(staggerChildren = 0.08, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren, delayChildren } },
  };
}

export function staggerItem(y = 16): Variants {
  return {
    hidden: { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_CALM } },
  };
}

// ---------------------------------------------------------------------------
// Micro-interactions — buttons and cards
// ---------------------------------------------------------------------------
export const buttonTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.15, ease: EASE_CALM },
};

export const cardHover = {
  whileHover: { y: -4 },
  transition: { duration: 0.2, ease: EASE_CALM },
};

// ---------------------------------------------------------------------------
// Loading / empty states — smooth fade-in when content appears
// ---------------------------------------------------------------------------
export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: EASE_CALM } },
};

// ---------------------------------------------------------------------------
// Ambient background orbs — very low opacity, slow (15-30s), blurred.
// Each orb gets a distinct duration/delay so multiple orbs don't move in sync.
// ---------------------------------------------------------------------------
export interface OrbConfig {
  duration: number;
  delay: number;
  xRange: [number, number, number];
  yRange: [number, number, number];
}

export const AMBIENT_ORBS: OrbConfig[] = [
  { duration: 22, delay: 0, xRange: [0, 40, 0], yRange: [0, -30, 0] },
  { duration: 28, delay: 2, xRange: [0, -50, 0], yRange: [0, 25, 0] },
  { duration: 18, delay: 4, xRange: [0, 30, 0], yRange: [0, 40, 0] },
];

export function orbAnimation(orb: OrbConfig) {
  return {
    x: orb.xRange,
    y: orb.yRange,
    transition: { duration: orb.duration, delay: orb.delay, repeat: Infinity, ease: 'easeInOut' as const },
  };
}
