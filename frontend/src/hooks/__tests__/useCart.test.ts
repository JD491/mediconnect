import { describe, it, expect } from 'vitest';
import { computeCartGroups } from '../useCart';
import type { CartItem, CouponsByStore } from '../../types/cart';

function makeItem(overrides: {
  cart_item_id: number;
  quantity: number;
  price: number;
  storeId: number;
  storeName?: string;
  minOrderAmount?: number;
  stockQuantity?: number;
  prescriptionRequired?: boolean;
}): CartItem {
  return {
    cart_item_id: overrides.cart_item_id,
    quantity: overrides.quantity,
    saved_for_later: false,
    stock: {
      stock_id: overrides.cart_item_id * 10,
      price: overrides.price,
      mrp: overrides.price,
      quantity: overrides.stockQuantity ?? 100,
      store_id: overrides.storeId,
      medicine_id: overrides.cart_item_id * 100,
      medicine: { name: `Medicine ${overrides.cart_item_id}`, prescription_required: overrides.prescriptionRequired ?? false, form: 'tablet', image_url: null },
      store: { store_id: overrides.storeId, store_name: overrides.storeName ?? `Store ${overrides.storeId}`, min_order_amount: overrides.minOrderAmount ?? 0 },
    },
  };
}

describe('computeCartGroups', () => {
  it('returns no groups for an empty cart', () => {
    expect(computeCartGroups([], {})).toEqual([]);
  });

  it('splits items into separate groups by store', () => {
    const items = [
      makeItem({ cart_item_id: 1, quantity: 1, price: 100, storeId: 1 }),
      makeItem({ cart_item_id: 2, quantity: 1, price: 200, storeId: 2 }),
    ];
    const groups = computeCartGroups(items, {});
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.store.store_id).sort()).toEqual([1, 2]);
  });

  it('combines items from the same store into one group with a correct subtotal', () => {
    const items = [
      makeItem({ cart_item_id: 1, quantity: 2, price: 100, storeId: 1 }),
      makeItem({ cart_item_id: 2, quantity: 1, price: 50, storeId: 1 }),
    ];
    const [group] = computeCartGroups(items, {});
    expect(group?.items).toHaveLength(2);
    expect(group?.subtotal).toBe(250); // 2*100 + 1*50
  });

  it('skips items whose stock has no linked store (e.g. deleted store)', () => {
    const orphan = makeItem({ cart_item_id: 1, quantity: 1, price: 100, storeId: 1 });
    orphan.stock.store = null;
    const valid = makeItem({ cart_item_id: 2, quantity: 1, price: 50, storeId: 2 });
    const groups = computeCartGroups([orphan, valid], {});
    expect(groups).toHaveLength(1);
    expect(groups[0]?.store.store_id).toBe(2);
  });

  it('flags needsRx when any item in the group requires a prescription', () => {
    const items = [
      makeItem({ cart_item_id: 1, quantity: 1, price: 100, storeId: 1, prescriptionRequired: false }),
      makeItem({ cart_item_id: 2, quantity: 1, price: 50, storeId: 1, prescriptionRequired: true }),
    ];
    const [group] = computeCartGroups(items, {});
    expect(group?.needsRx).toBe(true);
  });

  it('does not flag needsRx when no item requires a prescription', () => {
    const items = [makeItem({ cart_item_id: 1, quantity: 1, price: 100, storeId: 1, prescriptionRequired: false })];
    const [group] = computeCartGroups(items, {});
    expect(group?.needsRx).toBe(false);
  });

  it('flags belowMinOrder when the store subtotal is under its minimum order amount', () => {
    const items = [makeItem({ cart_item_id: 1, quantity: 1, price: 100, storeId: 1, minOrderAmount: 500 })];
    const [group] = computeCartGroups(items, {});
    expect(group?.belowMinOrder).toBe(true);
  });

  it('does not flag belowMinOrder when the store has no minimum order requirement', () => {
    const items = [makeItem({ cart_item_id: 1, quantity: 1, price: 10, storeId: 1, minOrderAmount: 0 })];
    const [group] = computeCartGroups(items, {});
    expect(group?.belowMinOrder).toBe(false);
  });

  it('lists items whose requested quantity exceeds available stock as outOfStock', () => {
    const items = [
      makeItem({ cart_item_id: 1, quantity: 5, price: 100, storeId: 1, stockQuantity: 2 }),
      makeItem({ cart_item_id: 2, quantity: 1, price: 50, storeId: 1, stockQuantity: 10 }),
    ];
    const [group] = computeCartGroups(items, {});
    expect(group?.outOfStock).toHaveLength(1);
    expect(group?.outOfStock[0]?.cart_item_id).toBe(1);
  });

  it('applies a successful coupon discount only to the matching store', () => {
    const items = [
      makeItem({ cart_item_id: 1, quantity: 1, price: 1000, storeId: 1 }),
      makeItem({ cart_item_id: 2, quantity: 1, price: 1000, storeId: 2 }),
    ];
    const coupons: CouponsByStore = { 1: { success: true, message: 'Applied', discount_amount: 100, code: 'SAVE100' } };
    const groups = computeCartGroups(items, coupons);
    const storeOne = groups.find((g) => g.store.store_id === 1);
    const storeTwo = groups.find((g) => g.store.store_id === 2);
    expect(storeOne?.discount).toBe(100);
    expect(storeTwo?.discount).toBe(0);
  });

  it('ignores a failed coupon result and applies no discount', () => {
    const items = [makeItem({ cart_item_id: 1, quantity: 1, price: 1000, storeId: 1 })];
    const coupons: CouponsByStore = { 1: { success: false, message: 'Invalid code', discount_amount: 0 } };
    const [group] = computeCartGroups(items, coupons);
    expect(group?.discount).toBe(0);
  });
});
