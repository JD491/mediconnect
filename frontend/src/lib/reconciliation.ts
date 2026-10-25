import type { OrderPaymentMethod, OrderStatus, PaymentStatus } from '../types/database.types';

/**
 * Pure revenue-reconciliation maths. Used by the store Reports/Overview
 * screens and the admin Orders console so the same definition of
 * "collected", "pending" and "refunded" applies everywhere.
 */
export interface ReconOrderLike {
  total_amount: number;
  payment_method: OrderPaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
}

export interface Reconciliation {
  /** Value of every order that was not cancelled/refunded. */
  gross: number;
  /** Prepaid online (UPI/card/netbanking/wallet) actually captured. */
  onlineCollected: number;
  /** Cash or on-delivery UPI marked collected at the store/door. */
  offlineCollected: number;
  /** Cash still owed on delivered/pending COD, doorstep-UPI or pickup orders. */
  cashPending: number;
  /** Online/counter money that has not settled yet (pending/processing/failed). */
  onlinePending: number;
  /** Money already returned to customers. */
  refunded: number;
  /** Money out for refund but not yet settled. */
  refundsInFlight: number;
  /** onlineCollected + offlineCollected - refunded */
  netCollected: number;
  counts: {
    orders: number;
    prepaid: number;
    cod: number;
    refunds: number;
  };
}

const CANCELLED: OrderStatus[] = ['cancelled'];

export function computeReconciliation(orders: ReconOrderLike[]): Reconciliation {
  const result: Reconciliation = {
    gross: 0,
    onlineCollected: 0,
    offlineCollected: 0,
    cashPending: 0,
    onlinePending: 0,
    refunded: 0,
    refundsInFlight: 0,
    netCollected: 0,
    counts: { orders: orders.length, prepaid: 0, cod: 0, refunds: 0 },
  };

  for (const o of orders) {
    const amount = Number(o.total_amount || 0);
    if (o.payment_method === 'cod' || o.payment_method === 'upi_offline' || o.payment_method === 'self_pickup' || o.payment_method === 'clinic_counter') {
      result.counts.cod += 1;
    } else {
      result.counts.prepaid += 1;
    }

    if (o.payment_status === 'refunded' || o.status === 'refunded') {
      result.refunded += amount;
      result.counts.refunds += 1;
      continue;
    }
    if (CANCELLED.includes(o.status)) continue;

    result.gross += amount;

    if (o.status === 'refund_initiated' || o.status === 'refund_requested' || o.payment_status === 'processing') {
      result.refundsInFlight += amount;
      result.counts.refunds += 1;
      continue;
    }

    if (o.payment_status === 'paid') {
      if (o.payment_method === 'online') result.onlineCollected += amount;
      else result.offlineCollected += amount;
    } else if (o.payment_status === 'cod_collected') {
      result.offlineCollected += amount;
    } else if (o.payment_status === 'cod_pending') {
      result.cashPending += amount;
    } else {
      result.onlinePending += amount;
    }
  }

  result.netCollected = result.onlineCollected + result.offlineCollected - result.refunded;
  return result;
}

/** `₹1,23,456` — Indian grouping, no decimals unless requested. */
export function formatInr(value: number, decimals = 0): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
