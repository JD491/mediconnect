import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { processPayment, generatePaymentRef, generatePickupToken, isPaymentCancellation } from '../lib/payments';
import { clearRxAttachment, dataUrlToFile, loadRxAttachment } from '../lib/prescriptionOcr';
import type { Database } from '../types/database.types';
import type { CartGroup, CheckoutAddressForm, CheckoutStep, RxFilesByStore } from '../types/cart';
import type { UseCartResult } from './useCart';

type Profile = Database['public']['Tables']['profiles']['Row'];

const LAST_STEP: CheckoutStep = 5;

export function validateAddress(form: CheckoutAddressForm): string {
  if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.city.trim() || !form.pincode.trim()) {
    return 'Please fill in your name, phone, address, city and PIN code.';
  }
  if (!/^\d{4,10}$/.test(form.pincode)) return 'Enter a valid PIN code.';
  if (!/^\+?\d{7,15}$/.test(form.phone.replace(/\s/g, ''))) return 'Enter a valid phone number.';
  return '';
}

export function missingRxStore(groups: CartGroup[], rxFiles: RxFilesByStore): CartGroup | undefined {
  return groups.find((g) => g.needsRx && !rxFiles[g.store.store_id]);
}

export interface CheckoutPaymentError {
  orderId: number;
  message: string;
}

export interface UseCheckoutResult {
  step: CheckoutStep;
  form: CheckoutAddressForm;
  updateForm: (patch: Partial<CheckoutAddressForm>) => void;
  rxFiles: RxFilesByStore;
  setRxFileForStore: (storeId: number, file: File) => void;
  clearRxFileForStore: (storeId: number) => void;
  error: string;
  setError: (message: string) => void;
  placing: boolean;
  placedOrderIds: number[];
  paymentErrors: CheckoutPaymentError[];
  goNext: () => void;
  goBack: () => void;
  placeOrders: () => Promise<void>;
}

/**
 * Drives the 5-step checkout wizard (Address -> Prescription -> Summary ->
 * Payment -> Confirmation) on top of an already-loaded `useCart`. Order
 * placement is per-store: each group becomes its own `orders` row, so a
 * partial failure (e.g. one store's coupon expired) doesn't need to unwind
 * orders already placed at other stores — earlier groups in the same
 * `placeOrders()` call have already committed by the time a later one fails.
 */
export function useCheckout(cart: UseCartResult, user: Session['user'] | null, profile: Profile | null): UseCheckoutResult {
  const [step, setStep] = useState<CheckoutStep>(1);
  const [form, setForm] = useState<CheckoutAddressForm>(() => ({
    name: profile?.name ?? '', phone: profile?.phone ?? '', address: profile?.address ?? '',
    city: '', pincode: '', payment_method: 'cod',
  }));
  const [rxFiles, setRxFiles] = useState<RxFilesByStore>({});
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placedOrderIds, setPlacedOrderIds] = useState<number[]>([]);
  const [paymentErrors, setPaymentErrors] = useState<CheckoutPaymentError[]>([]);

  const updateForm = useCallback((patch: Partial<CheckoutAddressForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const setRxFileForStore = useCallback((storeId: number, file: File) => {
    setRxFiles((f) => ({ ...f, [storeId]: file }));
  }, []);

  const clearRxFileForStore = useCallback((storeId: number) => {
    // Removing the Rx also forgets a scanned attachment, otherwise the effect
    // above would immediately re-attach the same file on the next render.
    clearRxAttachment();
    setRxFiles((f) => {
      if (!f[storeId]) return f;
      const next = { ...f };
      delete next[storeId];
      return next;
    });
  }, []);

  // A prescription scanned on the Prescription Scan page is remembered in
  // localStorage. Auto-attach it to every store that needs an Rx so the
  // customer never has to upload the same photo twice.
  const attachedRxFile = useMemo(() => {
    const saved = loadRxAttachment();
    return saved ? dataUrlToFile(saved) : null;
  }, []);

  useEffect(() => {
    if (!attachedRxFile) return;
    setRxFiles((current) => {
      const next = { ...current };
      let changed = false;
      for (const group of cart.groups) {
        if (group.needsRx && !next[group.store.store_id]) {
          next[group.store.store_id] = attachedRxFile;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [attachedRxFile, cart.groups]);

  const goNext = useCallback(() => {
    setError('');
    if (step === 1) {
      const err = validateAddress(form);
      if (err) return setError(err);
    }
    if (step === 2) {
      const missing = missingRxStore(cart.groups, rxFiles);
      if (missing) return setError(`Please upload a prescription for your order from ${missing.store.store_name}.`);
    }
    if (step === 3 && !cart.canPlace) {
      return setError('Please resolve stock/minimum-order issues before continuing.');
    }
    setStep((s) => (Math.min(s + 1, LAST_STEP) as CheckoutStep));
  }, [step, form, cart.groups, cart.canPlace, rxFiles]);

  const goBack = useCallback(() => {
    setError('');
    setStep((s) => (Math.max(s - 1, 1) as CheckoutStep));
  }, []);

  const placeOrders = useCallback(async () => {
    if (!user) return;
    setError('');
    setPaymentErrors([]);
    const addrErr = validateAddress(form);
    if (addrErr) return setError(addrErr);
    const missing = missingRxStore(cart.groups, rxFiles);
    if (missing) return setError(`Please upload a prescription for your order from ${missing.store.store_name}.`);
    if (!cart.canPlace) return setError('Please resolve stock/minimum-order issues before placing your order.');

    setPlacing(true);
    const method = form.payment_method;
    const selfPickup = cart.selfPickup || method === 'self_pickup';
    const fullAddress = selfPickup
      ? `Self pickup${form.address ? ` · ${form.address}` : ''}, ${form.city} - ${form.pincode}`
      : `${form.address}, ${form.city} - ${form.pincode}`;
    const newOrderIds: number[] = [];
    const failedPayments: CheckoutPaymentError[] = [];
    let rxAttachFailed = false;

    try {
      for (const g of cart.groups) {
        let discountAmount = 0;
        let couponCode: string | null = null;
        const coupon = cart.coupons[g.store.store_id];
        if (coupon?.success) {
          const { data: redeemData, error: redeemErr } = await supabase.rpc('redeem_coupon', {
            p_store_id: g.store.store_id, p_code: coupon.code ?? '', p_order_amount: g.subtotal,
          });
          const redeemResult = redeemData?.[0];
          if (redeemErr || !redeemResult?.success) {
            throw new Error(`Coupon for ${g.store.store_name} is no longer valid: ${redeemResult?.message || redeemErr?.message || 'unknown error'}`);
          }
          discountAmount = redeemResult.discount_amount;
          couponCode = coupon.code ?? null;
        }
        const orderTotal = g.subtotal - discountAmount + g.deliveryFee;
        const pickupToken = selfPickup ? generatePickupToken() : null;

        const { data: order, error: orderErr } = await supabase.from('orders').insert({
          user_id: user.id, store_id: g.store.store_id, delivery_address: fullAddress,
          payment_method: method, payment_status: method === 'cod' ? 'cod_pending' : 'pending',
          delivery_fee: g.deliveryFee, discount_amount: discountAmount, coupon_code: couponCode,
          total_amount: orderTotal, status: 'pending',
          customer_name: form.name, customer_phone: form.phone,
          self_pickup: selfPickup, pickup_token: pickupToken,
          delivery_distance_km: cart.storeDistances[g.store.store_id] ?? null,
          payment_ref: null, payment_failure_reason: null,
        }).select().single();
        if (orderErr || !order) throw orderErr ?? new Error('Could not create order.');

        // A DB trigger on order_items atomically decrements `stock.quantity` (row-locked)
        // and rejects the insert if stock ran out between page-load and checkout — so this
        // can legitimately fail on a race condition, not just a client bug.
        const { error: itemsErr } = await supabase.from('order_items').insert(g.items.map((i) => ({
          order_id: order.order_id, medicine_id: i.stock.medicine_id, stock_id: i.stock.stock_id,
          quantity: i.quantity, price: i.stock.price,
        })));
        if (itemsErr) {
          // Compensate: the order row already committed as its own statement — cancel it
          // rather than leaving an item-less "ghost" order behind.
          await supabase.from('orders').update({
            status: 'cancelled', cancellation_reason: `Could not reserve stock: ${itemsErr.message}`,
          }).eq('order_id', order.order_id);
          throw new Error(`Could not complete your order at ${g.store.store_name} — an item sold out just now. Please review your cart.`);
        }

        const rxFile = rxFiles[g.store.store_id];
        if (g.needsRx && rxFile) {
          const path = `${g.store.store_id}/${order.order_id}/${Date.now()}_${rxFile.name}`;
          const { error: uploadErr } = await supabase.storage.from('prescriptions').upload(path, rxFile);
          if (!uploadErr) {
            const { error: rxInsertErr } = await supabase.from('prescriptions').insert({
              order_id: order.order_id, customer_id: user.id, store_id: g.store.store_id, file_path: path,
            });
            if (rxInsertErr) rxAttachFailed = true;
          } else {
            rxAttachFailed = true;
          }
        }

        // Payment runs AFTER items are reserved. A failed/cancelled online payment
        // does NOT cancel the order: the row stays visible with payment_failed /
        // payment_pending so the customer can retry or switch to COD from Orders.
        try {
          const payment = await processPayment({
            method, orderId: order.order_id, amount: orderTotal,
            name: form.name, email: user.email, contact: form.phone,
          });
          await supabase.from('orders').update({
            payment_status: payment.status,
            payment_ref: payment.reference ?? (method === 'cod' ? null : generatePaymentRef(method === 'clinic_counter' ? 'clinic' : 'offline')),
            payment_verified: payment.verified,
            razorpay_order_id: payment.providerOrderId ?? null,
            razorpay_payment_id: payment.providerPaymentId ?? null,
            offline_collection_ref: payment.verified ? null : (method === 'cod' ? null : payment.reference),
            payment_failure_reason: null,
          }).eq('order_id', order.order_id);
        } catch (payErr) {
          const message = payErr instanceof Error ? payErr.message : 'Online payment failed or was cancelled.';
          await supabase.from('orders').update({
            payment_status: isPaymentCancellation(payErr) ? 'pending' : 'failed',
            payment_failure_reason: message,
            payment_verified: false,
          }).eq('order_id', order.order_id);
          failedPayments.push({ orderId: order.order_id, message });
        }

        await supabase.from('cart_items').delete().in('cart_item_id', g.items.map((i) => i.cart_item_id));
        newOrderIds.push(order.order_id);
      }

      setPlacedOrderIds(newOrderIds);
      setPaymentErrors(failedPayments);
      setRxFiles({});
      if (!rxAttachFailed) clearRxAttachment();
      cart.clearCoupons();
      await cart.reload();
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  }, [user, form, rxFiles, cart]);

  return {
    step, form, updateForm, rxFiles, setRxFileForStore, clearRxFileForStore, error, setError,
    placing, placedOrderIds, paymentErrors, goNext, goBack, placeOrders,
  };
}
