import { describe, expect, it } from 'vitest';
import { computeReconciliation, formatInr, type ReconOrderLike } from '../reconciliation';

function order(patch: Partial<ReconOrderLike>): ReconOrderLike {
  return {
    total_amount: 100,
    payment_method: 'online',
    payment_status: 'paid',
    status: 'delivered',
    ...patch,
  };
}

describe('computeReconciliation', () => {
  it('separates prepaid, offline-collected, pending cash and refunds', () => {
    const result = computeReconciliation([
      order({ total_amount: 500, payment_method: 'online', payment_status: 'paid' }),
      order({ total_amount: 200, payment_method: 'cod', payment_status: 'cod_collected' }),
      order({ total_amount: 150, payment_method: 'cod', payment_status: 'cod_pending', status: 'out_for_delivery' }),
      order({ total_amount: 100, payment_method: 'online', payment_status: 'processing', status: 'refund_initiated' }),
      order({ total_amount: 80, payment_method: 'online', payment_status: 'refunded', status: 'refunded' }),
      order({ total_amount: 300, payment_method: 'online', payment_status: 'paid', status: 'cancelled' }),
    ]);

    expect(result.onlineCollected).toBe(500);
    expect(result.offlineCollected).toBe(200);
    expect(result.cashPending).toBe(150);
    expect(result.refundsInFlight).toBe(100);
    expect(result.refunded).toBe(80);
    expect(result.gross).toBe(950);
    expect(result.netCollected).toBe(620);
    expect(result.counts).toEqual({ orders: 6, prepaid: 4, cod: 2, refunds: 2 });
  });

  it('treats doorstep UPI and clinic counter payments as offline money', () => {
    const result = computeReconciliation([
      order({ total_amount: 120, payment_method: 'upi_offline', payment_status: 'paid' }),
      order({ total_amount: 300, payment_method: 'clinic_counter', payment_status: 'paid' }),
    ]);
    expect(result.offlineCollected).toBe(420);
    expect(result.onlineCollected).toBe(0);
    expect(result.counts.cod).toBe(2);
  });

  it('counts pending online money without calling it collected', () => {
    const result = computeReconciliation([
      order({ total_amount: 250, payment_method: 'online', payment_status: 'failed' }),
      order({ total_amount: 90, payment_method: 'online', payment_status: 'pending' }),
    ]);
    expect(result.onlinePending).toBe(340);
    expect(result.onlineCollected).toBe(0);
    expect(result.netCollected).toBe(0);
  });

  it('excludes cancelled orders entirely', () => {
    const result = computeReconciliation([
      order({ total_amount: 999, status: 'cancelled', payment_status: 'pending' }),
    ]);
    expect(result.gross).toBe(0);
    expect(result.onlinePending).toBe(0);
    expect(result.netCollected).toBe(0);
  });

  it('handles an empty book', () => {
    expect(computeReconciliation([])).toEqual({
      gross: 0, onlineCollected: 0, offlineCollected: 0, cashPending: 0,
      onlinePending: 0, refunded: 0, refundsInFlight: 0, netCollected: 0,
      counts: { orders: 0, prepaid: 0, cod: 0, refunds: 0 },
    });
  });
});

describe('formatInr', () => {
  it('uses Indian digit grouping', () => {
    expect(formatInr(123456)).toBe('₹1,23,456');
    expect(formatInr(1234.5, 1)).toBe('₹1,234.5');
  });
});
