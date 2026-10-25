import type { OrderStatus, PaymentStatus } from '../types/database.types';

// Single source of truth for order + payment status labels, colors, and the
// allowed forward transitions — so Store Owner / Customer / Admin views can't
// drift out of sync with each other or with the DB enum/trigger (see
// migrations 0008 and 0009's trg_enforce_order_status_transitions, which this
// object's ORDER_STATUS_NEXT mirrors exactly on the client side).
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered',
];

export const ORDER_STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready_for_dispatch',
  ready_for_dispatch: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing',
  ready_for_dispatch: 'Ready for Dispatch', out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered', cancelled: 'Cancelled',
  refund_requested: 'Refund Requested', refunded: 'Refunded',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, string> = {
  pending: 'bg-sky-100 text-sky-700', confirmed: 'bg-indigo-100 text-indigo-700',
  preparing: 'bg-amber-100 text-amber-700', ready_for_dispatch: 'bg-amber-100 text-amber-700',
  out_for_delivery: 'bg-brand-100 text-brand-700', delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-600', refund_requested: 'bg-orange-100 text-orange-700',
  refunded: 'bg-slate-200 text-slate-600',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Payment Pending', processing: 'Processing Payment', paid: 'Paid',
  failed: 'Payment Failed', refunded: 'Refunded',
  cod_pending: 'COD — Pending Collection', cod_collected: 'COD — Collected',
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, string> = {
  pending: 'bg-slate-100 text-slate-600', processing: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-600', refunded: 'bg-slate-200 text-slate-600',
  cod_pending: 'bg-amber-100 text-amber-700', cod_collected: 'bg-emerald-100 text-emerald-700',
};

export const ALL_ORDER_STATUSES: OrderStatus[] = [...ORDER_STATUS_FLOW, 'cancelled', 'refund_requested', 'refunded'];

/**
 * Client-side mirror of the database's `trg_enforce_order_status_transitions`
 * (see `0009_security_hardening_pass.sql`). This does NOT replace the DB
 * trigger as the source of truth — it exists so the UI can disable/hide
 * invalid actions *before* round-tripping to Postgres, and so this exact
 * logic is unit-testable (see `orderStatus.test.ts`).
 */
export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  const graph: Partial<Record<OrderStatus, OrderStatus[]>> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready_for_dispatch', 'cancelled'],
    ready_for_dispatch: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered', 'cancelled'],
    delivered: ['refund_requested'],
    refund_requested: ['refunded'],
  };
  return graph[from]?.includes(to) ?? false;
}
