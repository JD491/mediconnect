import { FiTrendingUp, FiCreditCard, FiDollarSign, FiRotateCcw, FiClock, FiCheckCircle } from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { computeReconciliation, formatInr, type ReconOrderLike } from '../lib/reconciliation';

interface CardProps {
  icon: IconType;
  label: string;
  value: string;
  hint?: string;
  tone?: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';
}

const TONES: Record<NonNullable<CardProps['tone']>, string> = {
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-500',
  amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500',
  violet: 'from-brand-500 to-accent-500',
};

function Card({ icon: Icon, label, value, hint, tone = 'violet' }: CardProps) {
  return (
    <div className="glass-card !p-3">
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${TONES[tone]} flex items-center justify-center text-white mb-2`}>
        <Icon className="text-sm" />
      </div>
      <p className="text-base font-extrabold text-[#0f2340] leading-tight">{value}</p>
      <p className="text-[10px] text-[#5b7088] font-bold uppercase tracking-wide">{label}</p>
      {hint && <p className="text-[10px] text-[#7b8fa6] mt-0.5">{hint}</p>}
    </div>
  );
}

interface RevenueReconciliationProps {
  orders: ReconOrderLike[];
  title?: string;
  className?: string;
}

/**
 * Shared money-position strip: collected online vs offline, cash still owed,
 * refunds already paid out and refunds in flight.
 */
export default function RevenueReconciliation({ orders, title = 'Revenue reconciliation', className = '' }: RevenueReconciliationProps) {
  const r = computeReconciliation(orders);
  return (
    <div className={`glass-card ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-[#0f2340] flex items-center gap-2"><FiTrendingUp /> {title}</h3>
        <span className="text-[11px] font-bold text-[#5b7088]">{r.counts.orders} orders</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Card icon={FiCheckCircle} label="Net collected" value={formatInr(r.netCollected)} hint="settled minus refunds" tone="emerald" />
        <Card icon={FiCreditCard} label="Online paid" value={formatInr(r.onlineCollected)} hint={`${r.counts.prepaid} prepaid`} tone="sky" />
        <Card icon={FiDollarSign} label="Cash / UPI at door" value={formatInr(r.offlineCollected)} hint={`${r.counts.cod} offline`} tone="amber" />
        <Card icon={FiClock} label="Cash pending" value={formatInr(r.cashPending)} hint="COD / doorstep UPI" tone="violet" />
        <Card icon={FiClock} label="Online pending" value={formatInr(r.onlinePending)} hint="unsettled / failed" tone="violet" />
        <Card icon={FiRotateCcw} label="Refunds" value={formatInr(r.refunded)} hint={r.refundsInFlight > 0 ? `${formatInr(r.refundsInFlight)} in flight` : 'none in flight'} tone="rose" />
      </div>
    </div>
  );
}
