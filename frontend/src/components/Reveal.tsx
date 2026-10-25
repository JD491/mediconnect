import type { ElementType, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: ElementType;
}

/**
 * Viewport-triggered fade/slide-in wrapper. Animates once, respects
 * prefers-reduced-motion via Framer Motion's built-in handling of the
 * `transition` (durations collapse automatically through our global CSS
 * override in index.css for anything that also uses CSS transitions; for
 * Framer's own JS-driven animation we keep motion subtle and short so it
 * never blocks interaction).
 */
export default function Reveal({ children, delay = 0, y = 16, className = '', as = 'div' }: RevealProps) {
  const Comp = (motion as unknown as Record<string, typeof motion.div>)[as as string] ?? motion.div;
  return (
    <Comp
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </Comp>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  gap?: number;
}

export function Stagger({ children, className = '', gap = 0.08 }: StaggerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  y?: number;
}

export function StaggerItem({ children, className = '', y = 16 }: StaggerItemProps) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
