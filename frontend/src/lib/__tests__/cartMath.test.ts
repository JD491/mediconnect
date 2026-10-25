import { describe, it, expect } from 'vitest';
import { computeCartTotals, FREE_DELIVERY_THRESHOLD, FLAT_DELIVERY_FEE } from '../cartMath';

describe('computeCartTotals', () => {
  it('returns all zeros for an empty cart', () => {
    expect(computeCartTotals([])).toEqual({ subtotal: 0, deliveryFee: 0, discount: 0, total: 0 });
  });

  it('sums quantity × price across multiple line items', () => {
    const { subtotal } = computeCartTotals([
      { quantity: 2, price: 50 },
      { quantity: 1, price: 120 },
    ]);
    expect(subtotal).toBe(220);
  });

  it('charges the flat delivery fee below the free-delivery threshold', () => {
    const { deliveryFee } = computeCartTotals([{ quantity: 1, price: FREE_DELIVERY_THRESHOLD - 1 }]);
    expect(deliveryFee).toBe(FLAT_DELIVERY_FEE);
  });

  it('waives delivery at or above the free-delivery threshold', () => {
    expect(computeCartTotals([{ quantity: 1, price: FREE_DELIVERY_THRESHOLD }]).deliveryFee).toBe(0);
    expect(computeCartTotals([{ quantity: 1, price: FREE_DELIVERY_THRESHOLD + 50 }]).deliveryFee).toBe(0);
  });

  it('applies a discount and folds it into the total', () => {
    const totals = computeCartTotals([{ quantity: 1, price: 1000 }], 100);
    expect(totals.discount).toBe(100);
    expect(totals.total).toBe(1000 - 100); // >= free-delivery threshold, so no delivery fee
  });

  it('clamps a discount larger than the subtotal instead of going negative', () => {
    const totals = computeCartTotals([{ quantity: 1, price: 50 }], 9999);
    expect(totals.discount).toBe(50);
    expect(totals.total).toBe(FLAT_DELIVERY_FEE); // subtotal fully discounted, delivery fee still applies
  });

  it('never returns a negative discount even if a caller passes one', () => {
    expect(computeCartTotals([{ quantity: 1, price: 100 }], -50).discount).toBe(0);
  });

  it('never returns a negative total', () => {
    const totals = computeCartTotals([{ quantity: 1, price: 10 }], 10);
    expect(totals.total).toBeGreaterThanOrEqual(0);
  });
});
