import { deliveryFeeFor } from './geolocation';

export const FREE_DELIVERY_THRESHOLD = 499;
/** Legacy flat fee, retained for the no-location path (and existing callers/tests). */
export const FLAT_DELIVERY_FEE = 40;
export const FREE_DELIVERY_MIN_SUBTOTAL = 499;
export const LOCAL_DELIVERY_FEE = 25;
export const EXTENDED_DELIVERY_FEE = 45;

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

export interface DeliveryFeeOptions {
  /** Distance from the customer to the store, in km. Null/undefined = unknown. */
  distanceKm?: number | null;
  /** Self-pickup waives delivery entirely. */
  selfPickup?: boolean;
}

/**
 * Pure per-store cart math, extracted out of Cart.jsx so it's unit-testable
 * without mounting the whole checkout wizard. This mirrors — but does not
 * replace — the server-side recomputation in
 * `validate_order_total_after_items()` (migrations 0009/0010), which is the
 * actual source of truth once an order is placed; this function only drives
 * what the customer sees *before* checkout.
 *
 * Without a delivery context it keeps the legacy flat ₹40 rule (above ₹499 is
 * free). When the caller knows the distance/self-pickup choice it applies the
 * hyperlocal rules: free ≥ ₹499 or pickup, ₹25 within 3 km, ₹45 beyond.
 */
export function computeCartTotals(
  items: CartMathLineItem[],
  discount = 0,
  delivery?: DeliveryFeeOptions,
): CartMathTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const deliveryFee = delivery
    ? deliveryFeeFor(subtotal, delivery.distanceKm ?? null, delivery.selfPickup ?? false)
    : subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : FLAT_DELIVERY_FEE;
  const clampedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const total = Math.max(subtotal - clampedDiscount + deliveryFee, 0);
  return { subtotal, deliveryFee, discount: clampedDiscount, total };
}
