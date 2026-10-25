import { supabase } from './supabaseClient';

/**
 * Payment abstraction layer.
 *
 * COD is always available. Online payment routes through two Supabase Edge
 * Functions (razorpay-create-order, razorpay-verify-payment) so that:
 *   - RAZORPAY_KEY_SECRET never reaches the browser
 *   - the charged amount is read server-side from the `orders` row, never
 *     trusted from the client
 *   - a payment is only ever marked "paid" after server-side HMAC signature
 *     verification — the frontend cannot mark itself successful
 *
 * If the Edge Functions aren't deployed yet, or RAZORPAY_KEY_ID/SECRET
 * aren't configured as Supabase secrets, both functions return HTTP 503 and
 * this module surfaces a clean "Online payment is currently unavailable"
 * error instead of crashing checkout.
 */

export type PaymentMethod = 'cod' | 'online';

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  available: boolean;
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'cod', label: 'Cash on Delivery', available: true },
  { value: 'online', label: 'Online Payment (UPI / Card / Netbanking)', available: true },
];

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const UNAVAILABLE_MESSAGE = 'Online payment is currently unavailable. Please choose Cash on Delivery instead.';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}

let scriptPromise: Promise<boolean> | null = null;
function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(UNAVAILABLE_MESSAGE));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export interface ProcessPaymentParams {
  method: PaymentMethod;
  orderId?: number;
  amount: number;
  name?: string;
  email?: string;
  contact?: string;
}

export interface ProcessPaymentResult {
  status: 'paid' | 'cod_pending';
  reference: string | null;
}

interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Runs the full online-payment flow for an already-created order:
 * create Razorpay order (server-side) -> open checkout widget -> verify
 * signature (server-side). Resolves on success, rejects with a user-facing
 * Error otherwise (cancelled, failed, or gateway unavailable) — callers
 * should catch and mark the order accordingly.
 */
async function payOnline({ orderId, name, email, contact }: ProcessPaymentParams): Promise<ProcessPaymentResult> {
  const { data: createData, error: createErr } = await supabase.functions.invoke('razorpay-create-order', {
    body: { order_id: orderId },
  });
  if (createErr || createData?.error) {
    throw new Error(createData?.error === 'Online payment is currently unavailable' ? UNAVAILABLE_MESSAGE : (createData?.error || UNAVAILABLE_MESSAGE));
  }

  await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay!({
      key: createData.key_id,
      amount: createData.amount,
      currency: createData.currency,
      order_id: createData.razorpay_order_id,
      name: 'MediConnect',
      description: `Order #${orderId}`,
      prefill: { name, email, contact },
      theme: { color: '#1e4fb8' },
      handler: async (response: RazorpaySuccessResponse) => {
        const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('razorpay-verify-payment', {
          body: {
            order_id: orderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        });
        if (verifyErr || !verifyData?.success) {
          reject(new Error(verifyData?.error || 'Payment verification failed. Please contact support before retrying.'));
          return;
        }
        resolve({ status: 'paid', reference: response.razorpay_payment_id });
      },
      modal: {
        ondismiss: () => reject(new Error('Payment was cancelled.')),
      },
    });
    rz.on('payment.failed', () => reject(new Error('Payment failed. Please try again or choose Cash on Delivery.')));
    rz.open();
  });
}

export async function processPayment(params: ProcessPaymentParams): Promise<ProcessPaymentResult> {
  const { method } = params;
  if (method === 'cod') {
    return { status: 'cod_pending', reference: null };
  }
  if (method === 'online') {
    return payOnline(params);
  }
  throw new Error(`Unknown payment method: ${method as string}`);
}
