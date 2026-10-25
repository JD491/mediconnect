import { describe, it, expect } from 'vitest';
import { isValidOrderTransition, ORDER_STATUS_NEXT, ORDER_STATUS_FLOW } from '../orderStatus';
import type { OrderStatus } from '../../types/database.types';

/**
 * These tests exist to catch drift between the client-side transition graph
 * and the database's `trg_enforce_order_status_transitions`
 * (0009_security_hardening_pass.sql) — if someone edits one without the
 * other, this file should fail before a customer ever sees the mismatch.
 */
describe('isValidOrderTransition', () => {
  it('allows the full normal fulfillment sequence, one step at a time', () => {
    const sequence: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered'];
    for (let i = 0; i < sequence.length - 1; i++) {
      expect(isValidOrderTransition(sequence[i]!, sequence[i + 1]!)).toBe(true);
    }
  });

  it('allows cancellation from every state before delivery — delivered orders are refunded, not cancelled', () => {
    const cancellableStates = ORDER_STATUS_FLOW.slice(0, -1); // everything except the final 'delivered' step
    for (const state of cancellableStates) {
      expect(isValidOrderTransition(state, 'cancelled')).toBe(true);
    }
  });

  it('does NOT allow cancelling a delivered order — only a refund request', () => {
    expect(isValidOrderTransition('delivered', 'cancelled')).toBe(false);
  });

  it('allows the refund branch: delivered -> refund_requested -> refunded', () => {
    expect(isValidOrderTransition('delivered', 'refund_requested')).toBe(true);
    expect(isValidOrderTransition('refund_requested', 'refunded')).toBe(true);
  });

  it('rejects skipping ahead in the fulfillment sequence', () => {
    expect(isValidOrderTransition('pending', 'delivered')).toBe(false);
    expect(isValidOrderTransition('pending', 'refunded')).toBe(false);
    expect(isValidOrderTransition('confirmed', 'delivered')).toBe(false);
    expect(isValidOrderTransition('confirmed', 'out_for_delivery')).toBe(false);
  });

  it('rejects refunding without first requesting a refund', () => {
    expect(isValidOrderTransition('delivered', 'refunded')).toBe(false);
  });

  it('rejects any transition out of a terminal state', () => {
    expect(isValidOrderTransition('cancelled', 'pending')).toBe(false);
    expect(isValidOrderTransition('cancelled', 'confirmed')).toBe(false);
    expect(isValidOrderTransition('refunded', 'delivered')).toBe(false);
  });

  it('rejects a no-op "transition" to the same state', () => {
    expect(isValidOrderTransition('pending', 'pending')).toBe(false);
  });
});

describe('ORDER_STATUS_NEXT', () => {
  it('every "next" step is itself a valid transition', () => {
    for (const [from, to] of Object.entries(ORDER_STATUS_NEXT)) {
      expect(isValidOrderTransition(from as OrderStatus, to as OrderStatus)).toBe(true);
    }
  });

  it('has no "next" step defined past delivered (the wizard-driven flow ends there)', () => {
    expect(ORDER_STATUS_NEXT.delivered).toBeUndefined();
  });
});
