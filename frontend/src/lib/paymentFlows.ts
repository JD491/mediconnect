import { supabase } from './supabaseClient';
import { generatePaymentRef, processPayment } from './payments';

/**
 * Order-level money transitions shared by customer + store-owner screens.
 * Keeping them here means "retry", "switch to COD", "verify offline" and the
 * refund chain can't drift between MyOrders, OrderTracking and the store till.
 */

export interface RetryPaymentInput {
  orderId: number;
  amount: number;
  name?: string;
  email?: string;
  contact?: string;
}

/** Retry a failed online payment on an existing (still-pending) order. */
export async function retryOnlinePayment(input: RetryPaymentInput): Promise<{ reference: string }> {
  const payment = await processPayment({
    method: 'online', orderId: input.orderId, amount: input.amount,
    name: input.name, email: input.email, contact: input.contact,
  });
  const { error } = await supabase.from('orders').update({
    payment_method: 'online',
    payment_status: 'paid',
    payment_ref: payment.reference,
    payment_verified: true,
    razorpay_order_id: payment.providerOrderId ?? null,
    razorpay_payment_id: payment.providerPaymentId ?? null,
    payment_failure_reason: null,
  }).eq('order_id', input.orderId);
  if (error) throw error;
  return { reference: payment.reference ?? generatePaymentRef('online') };
}

/** Record a cancelled/failed retry without losing the order. */
export async function recordPaymentFailure(orderId: number, message: string, cancelled: boolean): Promise<void> {
  await supabase.from('orders').update({
    payment_status: cancelled ? 'pending' : 'failed',
    payment_failure_reason: message,
    payment_verified: false,
  }).eq('order_id', orderId);
}

/** Let the customer abandon online payment and pay cash on delivery instead. */
export async function switchOrderToCod(orderId: number): Promise<void> {
  const { error } = await supabase.from('orders').update({
    payment_method: 'cod',
    payment_status: 'cod_pending',
    payment_failure_reason: null,
    payment_verified: false,
    payment_ref: null,
    offline_collection_ref: null,
  }).eq('order_id', orderId);
  if (error) throw error;
}

/**
 * Store owner confirms cash/UPI actually received (doorstep, counter or pickup).
 * Generates the `pay_MC_...` collection reference and marks it verified.
 */
export async function verifyOfflineCollection(
  orderId: number,
  mode: 'cash' | 'upi',
  collectedBy?: string,
): Promise<{ reference: string }> {
  const reference = generatePaymentRef(mode === 'upi' ? 'offline' : 'cod');
  const { error } = await supabase.from('orders').update({
    payment_status: mode === 'cash' ? 'cod_collected' : 'paid',
    payment_verified: true,
    offline_collection_ref: reference,
    payment_ref: reference,
    payment_failure_reason: null,
    cancellation_reason: collectedBy ? `Collected by ${collectedBy}` : null,
  }).eq('order_id', orderId);
  if (error) throw error;
  return { reference };
}

/** Customer asks for a refund on a delivered prepaid order. */
export async function requestOrderRefund(orderId: number): Promise<{ reference: string }> {
  const reference = generatePaymentRef('refund');
  const { error } = await supabase.from('orders').update({
    status: 'refund_requested',
    payment_status: 'processing',
    payment_ref: reference,
  }).eq('order_id', orderId);
  if (error) throw error;
  return { reference };
}

/** Store owner acknowledges the refund and starts it with the gateway/bank. */
export async function initiateOrderRefund(orderId: number): Promise<{ reference: string }> {
  const reference = generatePaymentRef('refund');
  const { error } = await supabase.from('orders').update({
    status: 'refund_initiated',
    payment_status: 'processing',
    payment_ref: reference,
  }).eq('order_id', orderId);
  if (error) throw error;
  return { reference };
}

/** Money has landed back with the customer. */
export async function completeOrderRefund(orderId: number): Promise<void> {
  const { error } = await supabase.from('orders').update({
    status: 'refunded',
    payment_status: 'refunded',
  }).eq('order_id', orderId);
  if (error) throw error;
}
