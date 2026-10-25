export const FREE_DELIVERY_THRESHOLD = 500;
export const FLAT_DELIVERY_FEE = 40;

export interface CartMathLineItem {
  quantity: number;
  price: number;
}

export interface CartMathTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

/**
 * Pure per-store cart math, extracted out of Cart.jsx so it's unit-testable
 * without mounting the whole checkout wizard. This mirrors — but does not
 * replace — the server-side recomputation in
 * `validate_order_total_after_items()` (migrations 0009/0010), which is the
 * actual source of truth once an order is placed; this function only drives
 * what the customer sees *before* checkout.
 */
export function computeCartTotals(items: CartMathLineItem[], discount = 0): CartMathTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const deliveryFee = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : FLAT_DELIVERY_FEE;
  const clampedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const total = Math.max(subtotal - clampedDiscount + deliveryFee, 0);
  return { subtotal, deliveryFee, discount: clampedDiscount, total };
}
