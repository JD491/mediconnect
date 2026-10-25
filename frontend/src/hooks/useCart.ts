import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { computeCartTotals } from '../lib/cartMath';
import { useLocation } from '../lib/LocationContext';
import type { CartItem, CartGroup, CouponResult, CouponsByStore } from '../types/cart';

const CART_SELECT =
  'cart_item_id, quantity, saved_for_later, ' +
  'stock:stock(stock_id, price, mrp, quantity, store_id, medicine_id, ' +
  'medicine:medicines(name, prescription_required, form, image_url), ' +
  'store:stores(store_id, store_name, min_order_amount, latitude, longitude, delivery_radius_km))';

export interface CartGroupOptions {
  /** Distance in km keyed by store id — absent entries fall back to the flat fee. */
  distances?: Record<number, number | null>;
  selfPickup?: boolean;
}

/**
 * Groups cart items by store and computes each group's totals, prescription
 * requirement, minimum-order violation, and out-of-stock items. Pure and
 * side-effect-free — kept at module level (rather than inline in the useMemo
 * below) so it's directly unit-testable without mounting the hook, which
 * needs a Supabase client.
 */
export function computeCartGroups(items: CartItem[], coupons: CouponsByStore, options: CartGroupOptions = {}): CartGroup[] {
  const byStore = new Map<number, { store: NonNullable<CartItem['stock']['store']>; items: CartItem[] }>();
  for (const i of items) {
    if (!i.stock.store) continue;
    const storeId = i.stock.store_id;
    if (!byStore.has(storeId)) byStore.set(storeId, { store: i.stock.store, items: [] });
    byStore.get(storeId)!.items.push(i);
  }
  return [...byStore.values()].map((g) => {
    const coupon = coupons[g.store.store_id];
    const discount = coupon?.success ? coupon.discount_amount : 0;
    const totals = computeCartTotals(
      g.items.map((i) => ({ quantity: i.quantity, price: i.stock.price })),
      discount,
      { distanceKm: options.distances?.[g.store.store_id] ?? null, selfPickup: options.selfPickup },
    );
    const needsRx = g.items.some((i) => i.stock.medicine?.prescription_required);
    const belowMinOrder = g.store.min_order_amount > 0 && totals.subtotal < g.store.min_order_amount;
    const outOfStock = g.items.filter((i) => i.quantity > i.stock.quantity);
    return { ...g, ...totals, needsRx, belowMinOrder, outOfStock };
  });
}

export interface UseCartResult {
  items: CartItem[];
  saved: CartItem[];
  loading: boolean;
  groups: CartGroup[];
  coupons: CouponsByStore;
  couponInput: Record<number, string>;
  grandTotal: number;
  canPlace: boolean;
  selfPickup: boolean;
  setSelfPickup: (value: boolean) => void;
  storeDistances: Record<number, number | null>;
  reload: () => Promise<void>;
  updateQty: (row: CartItem, quantity: number) => Promise<void>;
  remove: (cartItemId: number) => Promise<void>;
  setSavedFlag: (cartItemId: number, savedForLater: boolean) => Promise<void>;
  setCouponInputForStore: (storeId: number, value: string) => void;
  applyCoupon: (storeId: number, subtotal: number) => Promise<void>;
  removeCoupon: (storeId: number) => void;
  clearCoupons: () => void;
}

/**
 * Owns everything about "what's in the cart right now": loading cart_items
 * (split into active vs. saved-for-later), per-item mutations, and the
 * derived per-store groups (totals, prescription requirement, stock/min-order
 * violations, coupon state) that both the cart summary and the checkout
 * wizard read from. Pure order-placement (the multi-step checkout flow) is
 * intentionally NOT here — see useCheckout — so this hook stays focused and
 * independently testable.
 */
export function useCart(userId: string | undefined): UseCartResult {
  const [items, setItems] = useState<CartItem[]>([]);
  const [saved, setSaved] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [couponInput, setCouponInput] = useState<Record<number, string>>({});
  const [coupons, setCoupons] = useState<CouponsByStore>({});
  const [selfPickup, setSelfPickup] = useState(false);
  const { distanceTo } = useLocation();

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('cart_items')
      .select(CART_SELECT)
      .eq('user_id', userId)
      .order('cart_item_id', { ascending: true });
    const rows = (data ?? []) as unknown as CartItem[];
    setItems(rows.filter((i) => !i.saved_for_later));
    setSaved(rows.filter((i) => i.saved_for_later));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateQty = useCallback(async (row: CartItem, quantity: number) => {
    if (quantity < 1) return;
    const clamped = Math.min(quantity, row.stock.quantity);
    await supabase.from('cart_items').update({ quantity: clamped }).eq('cart_item_id', row.cart_item_id);
    await reload();
  }, [reload]);

  const remove = useCallback(async (cartItemId: number) => {
    await supabase.from('cart_items').delete().eq('cart_item_id', cartItemId);
    await reload();
  }, [reload]);

  const setSavedFlag = useCallback(async (cartItemId: number, savedForLater: boolean) => {
    await supabase.from('cart_items').update({ saved_for_later: savedForLater }).eq('cart_item_id', cartItemId);
    await reload();
  }, [reload]);

  const storeDistances = useMemo(() => {
    const distances: Record<number, number | null> = {};
    for (const item of items) {
      if (!item.stock.store) continue;
      distances[item.stock.store_id] = distanceTo(item.stock.store);
    }
    return distances;
  }, [items, distanceTo]);

  const groups = useMemo(
    () => computeCartGroups(items, coupons, { distances: storeDistances, selfPickup }),
    [items, coupons, storeDistances, selfPickup],
  );

  const applyCoupon = useCallback(async (storeId: number, subtotal: number) => {
    const code = (couponInput[storeId] ?? '').trim().toUpperCase();
    if (!code) return;
    const { data, error: rpcErr } = await supabase.rpc('preview_coupon', {
      p_store_id: storeId, p_code: code, p_order_amount: subtotal,
    });
    const result = data?.[0];
    if (rpcErr || !result) {
      setCoupons((c) => ({ ...c, [storeId]: { success: false, message: 'Could not validate coupon.', discount_amount: 0 } }));
    } else {
      const applied: CouponResult = { ...result, code };
      setCoupons((c) => ({ ...c, [storeId]: applied }));
    }
  }, [couponInput]);

  const removeCoupon = useCallback((storeId: number) => {
    setCoupons((c) => {
      const next = { ...c };
      delete next[storeId];
      return next;
    });
    setCouponInput((c) => ({ ...c, [storeId]: '' }));
  }, []);

  const setCouponInputForStore = useCallback((storeId: number, value: string) => {
    setCouponInput((c) => ({ ...c, [storeId]: value }));
  }, []);

  const clearCoupons = useCallback(() => setCoupons({}), []);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const canPlace = groups.length > 0 && groups.every((g) => !g.belowMinOrder && g.outOfStock.length === 0);

  return {
    items, saved, loading, groups, coupons, couponInput, grandTotal, canPlace,
    selfPickup, setSelfPickup, storeDistances,
    reload, updateQty, remove, setSavedFlag, setCouponInputForStore, applyCoupon, removeCoupon, clearCoupons,
  };
}
