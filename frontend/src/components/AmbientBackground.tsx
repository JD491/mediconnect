import { motion, useReducedMotion } from 'framer-motion';
import { AMBIENT_ORBS, orbAnimation } from '../lib/motionVariants';

const ORB_STYLES = [
  'w-[36rem] h-[36rem] -top-40 -left-32 bg-gradient-to-br from-brand-400 to-brand-600',
  'w-[30rem] h-[30rem] top-1/3 -right-24 bg-gradient-to-br from-accent-400 to-accent-600',
  'w-[26rem] h-[26rem] bottom-0 left-1/4 bg-gradient-to-br from-brand-300 to-accent-400',
];

/**
 * Ambient, decorative-only background: three low-opacity, heavily-blurred
 * gradient orbs that drift very slowly (18-28s loops). Purely visual — never
 * carries information, so it's safe to fully disable for reduced-motion users
 * without losing anything.
 *
 * Usage: place as the first child of a `relative` (or `fixed`) positioned
 * container; this renders `absolute inset-0 -z-10 overflow-hidden`.
 */
export default function AmbientBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {AMBIENT_ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-[0.12] blur-3xl ${ORB_STYLES[i] ?? ''}`}
          animate={reduceMotion ? undefined : orbAnimation(orb)}
        />
      ))}
    </div>
  );
}
