import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pageTransitionVariants } from '../lib/motionVariants';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Wraps a route's rendered element so it fades + slides in/out on navigation.
 * Pair with `<AnimatePresence mode="wait">` around the `<Routes>` that renders
 * this, and pass `location={location} key={location.pathname}` to that
 * `<Routes>` (the standard react-router-v6 + framer-motion pattern) so exit
 * animations actually get a chance to run before the new route mounts.
 */
export default function PageTransition({ children }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <motion.div variants={pageTransitionVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>
  );
}
