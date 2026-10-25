import type { ReactNode, ComponentType } from 'react';
import { motion } from 'framer-motion';
import type { IconBaseProps } from 'react-icons';
import { FiAlertCircle, FiInbox } from 'react-icons/fi';
import { fadeInVariants } from '../lib/motionVariants';

export function LoadingSpinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`rounded-full border-[3px] border-brand-200 border-t-brand-600 animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <motion.div variants={fadeInVariants} initial="hidden" animate="show" className="flex flex-col items-center justify-center gap-3 py-16">
      <LoadingSpinner size={28} />
      <p className="text-sm text-[#5b7088] font-semibold" aria-live="polite">{label}</p>
    </motion.div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <motion.div variants={fadeInVariants} initial="hidden" animate="show" className={`glass-card animate-pulse ${className}`} aria-hidden="true">
      <div className="h-4 w-2/3 bg-brand-100/70 rounded mb-3" />
      <div className="h-3 w-full bg-brand-100/50 rounded mb-2" />
      <div className="h-3 w-4/5 bg-brand-100/50 rounded" />
    </motion.div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <motion.div variants={fadeInVariants} initial="hidden" animate="show" className="glass-card animate-pulse" aria-hidden="true">
      <div className="h-3 w-1/3 bg-brand-100/60 rounded mb-4" />
      {[...Array(rows)].map((_, r) => (
        <div key={r} className="flex gap-4 py-2 border-b border-white/40 last:border-0">
          {[...Array(cols)].map((__, c) => (
            <div key={c} className="h-3 flex-1 bg-brand-100/40 rounded" />
          ))}
        </div>
      ))}
    </motion.div>
  );
}

interface EmptyStateProps {
  icon?: ComponentType<IconBaseProps>;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon = FiInbox, title = 'Nothing here yet', description, action }: EmptyStateProps) {
  return (
    <motion.div variants={fadeInVariants} initial="hidden" animate="show" className="glass-card text-center py-10">
      <Icon className="mx-auto text-[#b8c9db] mb-3" size={30} />
      <p className="text-sm font-bold text-[#0f2340]">{title}</p>
      {description && <p className="text-xs text-[#5b7088] mt-1 max-w-xs mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }: ErrorStateProps) {
  return (
    <motion.div variants={fadeInVariants} initial="hidden" animate="show" role="alert" className="glass-card text-center py-8 !bg-rose-50/70 border-rose-200/70">
      <FiAlertCircle className="mx-auto text-rose-500 mb-2" size={24} />
      <p className="text-sm font-bold text-rose-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost !py-1.5 !text-xs mt-3">Try again</button>
      )}
    </motion.div>
  );
}
