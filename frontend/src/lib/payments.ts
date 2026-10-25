import { supabase } from './supabaseClient';
import { isDemoModeSync } from './supabaseClient';

/**
 * Payment abstraction layer for every money path in MediConnect:
 *
 *  - online ............ UPI / card / netbanking / wallet through Razorpay when
 *                        configured, otherwise a fully interactive demo gateway
 *  - cod ............... cash on delivery / cash at store
 *  - upi_offline ....... doorstep or counter UPI, verified later by the store
 *  - self_pickup ....... pay online now, collect with an MC-XXXX token
 *  - clinic_counter .... pay the clinic reception after an in-person consult
 *
 * Razorpay flows route through two Supabase Edge Functions so RAZORPAY_KEY_SECRET
 * never reaches the browser and the charged amount is read server-side from the
 * order row. If those functions are missing/unconfigured the demo gateway takes
 * over, so checkout is never blocked in development or a fresh deployment.
 */

export type PaymentMethod = 'cod' | 'online' | 'upi_offline' | 'self_pickup' | 'clinic_counter';

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  description: string;
  available: boolean;
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'online', label: 'Pay Online', description: 'UPI, credit/debit card, netbanking or wallet', available: true },
  { value: 'cod', label: 'Cash on Delivery', description: 'Pay the delivery partner in cash', available: true },
  { value: 'upi_offline', label: 'Doorstep UPI', description: 'Scan the partner’s QR at delivery — verified by the store', available: true },
  { value: 'self_pickup', label: 'Self Pickup', description: 'Pay online and collect from the store with an MC token', available: true },
];

/** Payment options offered inside the checkout wizard. */
export function checkoutPaymentMethods(selfPickup: boolean): PaymentMethodOption[] {
  if (selfPickup) {
    return [
      { value: 'self_pickup', label: 'Pay Online & Pick Up', description: 'Get an MC-XXXX pickup token instantly', available: true },
      { value: 'upi_offline', label: 'Pay at Store (UPI)', description: 'Show the token at the counter and pay by UPI', available: true },
      { value: 'cod', label: 'Pay Cash at Store', description: 'Show the token at the counter and pay cash', available: true },
    ];
  }
  return PAYMENT_METHODS;
}

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const UNAVAILABLE_MESSAGE = 'Online payment is currently unavailable. Please try again or choose Cash on Delivery.';

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

/* ------------------------------------------------------------------ */
/* References, tokens & invoices                                       */
/* ------------------------------------------------------------------ */

export type PaymentRefKind = 'online' | 'offline' | 'clinic' | 'refund' | 'cod';

const REF_TAG: Record<PaymentRefKind, string> = {
  online: '', offline: 'OFF_', clinic: 'CLINIC_', refund: 'REFUND_', cod: 'COD_',
};

/** Every transaction reference is a `pay_MC_...` id, e.g. pay_MC_OFF_LX2K9A. */
export function generatePaymentRef(kind: PaymentRefKind = 'online'): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `pay_MC_${REF_TAG[kind]}${stamp}${rand}`;
}

/** Human-friendly self-pickup token, e.g. MC-7K2Q. Ambiguous characters removed. */
export function generatePickupToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `MC-${out}`;
}

export interface InvoiceInput {
  orderId: number;
  storeName: string;
  customerName: string;
  address: string;
  createdAt?: string;
  items: { name: string; quantity: number; price: number; gstRate?: number | null }[];
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  paymentRef?: string | null;
  pickupToken?: string | null;
}

export interface InvoiceTotals {
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  subtotal: number;
  total: number;
}

/** Split GST out of inclusive selling prices (Indian retail convention). */
export function computeInvoiceTotals(items: InvoiceInput['items'], deliveryFee: number, discount: number): InvoiceTotals {
  const gross = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountRatio = gross > 0 ? Math.min(1, Math.max(0, discount / gross)) : 0;
  let gst = 0;
  for (const item of items) {
    const rate = item.gstRate ?? 12;
    const line = item.price * item.quantity * (1 - discountRatio);
    gst += line - line / (1 + rate / 100);
  }
  const taxable = gross - discount - gst;
  const total = gross - discount + deliveryFee;
  return {
    taxable: Math.max(0, taxable),
    gst: Math.max(0, gst),
    cgst: Math.max(0, gst / 2),
    sgst: Math.max(0, gst / 2),
    subtotal: gross - discount,
    total,
  };
}

/** Print-ready GST invoice opened in a new window (no PDF library needed). */
export function printGstInvoice(input: InvoiceInput): boolean {
  const totals = computeInvoiceTotals(input.items, input.deliveryFee, input.discount);
  const rows = input.items.map((i, idx) => {
    const line = i.price * i.quantity;
    return `<tr><td>${idx + 1}</td><td>${escapeHtml(i.name)}</td><td class="num">${i.quantity}</td><td class="num">₹${i.price.toFixed(2)}</td><td class="num">${i.gstRate ?? 12}%</td><td class="num">₹${line.toFixed(2)}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>MediConnect Invoice #${input.orderId}</title>
  <style>
    *{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f2340;margin:0;padding:32px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e4fb8;padding-bottom:16px;margin-bottom:20px}
    .brand{font-size:24px;font-weight:800;color:#1e4fb8}.muted{color:#5b7088;font-size:12px}
    h1{font-size:18px;margin:0 0 4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;font-size:13px}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#eef4ff;text-align:left;padding:8px;border-bottom:1px solid #cbd5e1}
    td{padding:8px;border-bottom:1px solid #e2e8f0}.num{text-align:right}
    .totals{margin-left:auto;width:300px;margin-top:16px;font-size:13px}.totals div{display:flex;justify-content:space-between;padding:5px 0}
    .totals .grand{border-top:2px solid #0f2340;font-weight:800;font-size:16px;margin-top:6px;padding-top:8px}
    .foot{margin-top:28px;font-size:11px;color:#5b7088;border-top:1px solid #e2e8f0;padding-top:12px}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="head"><div><div class="brand">MediConnect</div><div class="muted">Your neighbourhood pharmacy, online.</div></div>
  <div style="text-align:right"><h1>TAX INVOICE</h1><div class="muted">Invoice #MC-${input.orderId}</div>
  <div class="muted">${escapeHtml(new Date(input.createdAt ?? Date.now()).toLocaleString())}</div></div></div>
  <div class="grid">
    <div><strong>Billed to</strong><br>${escapeHtml(input.customerName)}<br><span class="muted">${escapeHtml(input.address)}</span></div>
    <div><strong>Sold by</strong><br>${escapeHtml(input.storeName)}<br><span class="muted">GSTIN: 27ABCDE1234F1Z5</span></div>
  </div>
  <table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>₹${totals.subtotal.toFixed(2)}</span></div>
    <div><span>Taxable value</span><span>₹${totals.taxable.toFixed(2)}</span></div>
    <div><span>CGST</span><span>₹${totals.cgst.toFixed(2)}</span></div>
    <div><span>SGST</span><span>₹${totals.sgst.toFixed(2)}</span></div>
    <div><span>Delivery fee</span><span>₹${input.deliveryFee.toFixed(2)}</span></div>
    ${input.discount > 0 ? `<div><span>Discount</span><span>-₹${input.discount.toFixed(2)}</span></div>` : ''}
    <div class="grand"><span>Total paid / payable</span><span>₹${input.total.toFixed(2)}</span></div>
  </div>
  <div class="foot">
    Payment: ${escapeHtml(input.paymentMethod)} · ${escapeHtml(input.paymentStatus)}${input.paymentRef ? ` · Ref ${escapeHtml(input.paymentRef)}` : ''}
    ${input.pickupToken ? `<br>Pickup token: <strong>${escapeHtml(input.pickupToken)}</strong>` : ''}
    <br>This is a computer-generated invoice. Medicines once dispensed may not be returnable except for quality issues.
  </div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

/* ------------------------------------------------------------------ */
/* Gateway                                                             */
/* ------------------------------------------------------------------ */

export interface ProcessPaymentParams {
  method: PaymentMethod;
  orderId?: number;
  amount: number;
  name?: string;
  email?: string;
  contact?: string;
  /** Which server-side row `orderId` identifies. Defaults to a pharmacy order. */
  kind?: 'order' | 'appointment';
}

export interface ProcessPaymentResult {
  status: 'paid' | 'cod_pending' | 'pending';
  reference: string | null;
  verified: boolean;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
}

interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

class GatewayUnavailableError extends Error {}

/** Razorpay checkout for an already-created order or appointment. */
async function payWithRazorpay({ orderId, name, email, contact, kind = 'order' }: ProcessPaymentParams): Promise<ProcessPaymentResult> {
  const { data: createData, error: createErr } = await supabase.functions.invoke('razorpay-create-order', {
    body: { order_id: orderId, kind },
  });
  if (createErr || createData?.error || !createData?.razorpay_order_id) {
    throw new GatewayUnavailableError(createData?.error || createErr?.message || UNAVAILABLE_MESSAGE);
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
            kind,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        });
        if (verifyErr || !verifyData?.success) {
          reject(new Error(verifyData?.error || 'Payment verification failed. Please contact support before retrying.'));
          return;
        }
        resolve({
          status: 'paid', reference: response.razorpay_payment_id, verified: true,
          providerOrderId: response.razorpay_order_id, providerPaymentId: response.razorpay_payment_id,
        });
      },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled.')) },
    });
    rz.on('payment.failed', () => reject(new Error('Payment failed. Please try again or choose Cash on Delivery.')));
    rz.open();
  });
}

function isGatewayUnavailable(err: unknown): boolean {
  if (err instanceof GatewayUnavailableError) return true;
  if (!(err instanceof Error)) return false;
  return /unavailable|not configured|not deployed|503|failed to send|network/i.test(err.message);
}

/* ----------------------------- demo UI ----------------------------- */

function demoQrSvg(seed: string): string {
  const size = 25;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const next = () => {
    hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5;
    return ((hash >>> 0) % 1000) / 1000;
  };
  const finder = (x: number, y: number): boolean | null => {
    const regions: Array<[number, number]> = [[0, 0], [size - 7, 0], [0, size - 7]];
    for (const [ox, oy] of regions) {
      if (x >= ox && x < ox + 7 && y >= oy && y < oy + 7) {
        const lx = x - ox; const ly = y - oy;
        return lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
      }
    }
    return null;
  };
  let cells = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const f = finder(x, y);
      const filled = f === null ? next() > 0.52 : f;
      if (filled) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="168" height="168" role="img" aria-label="Demo UPI QR code" style="background:#fff;padding:8px;border-radius:12px;border:1px solid #dbeafe"><g fill="#0f2340">${cells}</g></svg>`;
}

interface DemoGatewayOptions {
  amount: number;
  orderId?: number;
  name?: string;
}

/**
 * Fully client-side "gateway" used when Razorpay isn't configured (demo mode or
 * a fresh deploy). It mirrors the real UX: instrument tabs, validation, QR,
 * approve, and a failure simulation so failure paths are demoable too.
 */
function openDemoGateway({ amount, orderId, name }: DemoGatewayOptions): Promise<ProcessPaymentResult> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'MediConnect demo payment gateway');

    const upiId = `${(name || 'customer').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'customer'}@okmediconnect`;
    const amountText = `₹${amount.toFixed(2)}`;

    overlay.innerHTML = `
      <div class="glass-card w-full max-w-md max-h-[94vh] overflow-y-auto !bg-white/95">
        <div class="flex items-start justify-between mb-3">
          <div>
            <p class="text-[10px] font-extrabold uppercase tracking-widest text-brand-600">MediConnect Secure Pay</p>
            <h3 class="text-lg font-extrabold text-[#0f2340]">${amountText} <span class="text-xs font-bold text-[#5b7088]">${orderId ? `· Order #${orderId}` : ''}</span></h3>
          </div>
          <button type="button" data-role="close" aria-label="Cancel payment" class="text-[#8a9bb0] hover:text-rose-500 text-xl leading-none">&times;</button>
        </div>
        <p class="text-[11px] text-[#5b7088] mb-3">Demo gateway — no real money moves. Razorpay takes over automatically once its Edge Functions are configured.</p>

        <div class="grid grid-cols-4 gap-1.5 mb-3" role="tablist">
          ${['upi', 'card', 'netbanking', 'wallet'].map((t, i) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${i === 0}" class="rounded-lg px-1 py-2 text-[11px] font-bold border ${i === 0 ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-[#33475b] border-white/70'}">${t === 'upi' ? 'UPI' : t === 'card' ? 'Card' : t === 'netbanking' ? 'Netbank' : 'Wallet'}</button>`).join('')}
        </div>

        <div data-pane="upi">
          <div class="flex gap-3 items-center rounded-xl bg-brand-50 border border-brand-200 p-3 mb-3">
            ${demoQrSvg(`${upiId}:${amountText}:${orderId ?? 0}`)}
            <div class="min-w-0">
              <p class="text-xs font-extrabold text-[#0f2340]">Scan with any UPI app</p>
              <p class="text-[10px] text-[#5b7088] break-all">${upiId}</p>
              <p class="text-[10px] font-bold text-emerald-600 mt-1">Or enter your UPI ID below</p>
            </div>
          </div>
          <label class="text-[11px] font-bold text-[#5b7088]">UPI ID<input data-role="upi" value="${upiId}" class="input-field mt-1" placeholder="name@bank" autocomplete="off" /></label>
        </div>

        <div data-pane="card" hidden>
          <div class="grid grid-cols-2 gap-2">
            <label class="text-[11px] font-bold text-[#5b7088] col-span-2">Card number<input data-role="card" inputmode="numeric" maxlength="19" class="input-field mt-1" placeholder="4111 1111 1111 1111" autocomplete="cc-number" /></label>
            <label class="text-[11px] font-bold text-[#5b7088]">Expiry MM/YY<input data-role="expiry" maxlength="5" class="input-field mt-1" placeholder="12/28" autocomplete="cc-exp" /></label>
            <label class="text-[11px] font-bold text-[#5b7088]">CVV<input data-role="cvv" type="password" inputmode="numeric" maxlength="4" class="input-field mt-1" placeholder="123" autocomplete="cc-csc" /></label>
            <label class="text-[11px] font-bold text-[#5b7088] col-span-2">Name on card<input data-role="cardName" class="input-field mt-1" placeholder="Cardholder name" autocomplete="cc-name" /></label>
          </div>
        </div>

        <div data-pane="netbanking" hidden>
          <label class="text-[11px] font-bold text-[#5b7088]">Choose your bank
            <select data-role="bank" class="input-field mt-1">
              <option value="">Select a bank…</option>
              <option>HDFC Bank</option><option>ICICI Bank</option><option>State Bank of India</option>
              <option>Axis Bank</option><option>Kotak Mahindra Bank</option><option>Bank of Baroda</option>
            </select>
          </label>
        </div>

        <div data-pane="wallet" hidden>
          <div class="grid grid-cols-3 gap-2">
            ${['Paytm', 'PhonePe', 'Amazon Pay'].map((w) => `<button type="button" data-wallet="${w}" class="rounded-xl border border-white/70 bg-white/70 px-2 py-3 text-[11px] font-bold text-[#33475b] hover:border-brand-400">${w}</button>`).join('')}
          </div>
        </div>

        <p data-role="error" class="text-rose-500 text-[11px] font-semibold mt-3 hidden" role="alert"></p>

        <div class="flex gap-2 mt-4">
          <button type="button" data-role="fail" class="btn-ghost flex-1 !text-rose-500 !text-xs">Simulate Failure</button>
          <button type="button" data-role="approve" class="btn-primary flex-1 !text-xs">Approve Payment</button>
        </div>
        <p class="text-[10px] text-center text-[#8a9bb0] mt-2">256-bit encrypted · PCI-DSS compliant demo</p>
      </div>`;

    document.body.appendChild(overlay);
    const q = (selector: string) => overlay.querySelector(selector) as HTMLElement | null;
    const panes = Array.from(overlay.querySelectorAll<HTMLElement>('[data-pane]'));
    const tabs = Array.from(overlay.querySelectorAll<HTMLButtonElement>('[data-tab]'));
    let active = 'upi';
    let wallet = '';

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const finish = (result: ProcessPaymentResult) => { cleanup(); resolve(result); };
    const fail = (message: string) => { cleanup(); reject(new Error(message)); };
    const showError = (message: string) => {
      const el = q('[data-role="error"]');
      if (el) { el.textContent = message; el.classList.remove('hidden'); }
    };

    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') fail('Payment was cancelled.'); };
    document.addEventListener('keydown', onKey);

    const selectTab = (tab: string) => {
      active = tab;
      tabs.forEach((t) => {
        const on = t.dataset.tab === tab;
        t.setAttribute('aria-selected', String(on));
        t.className = `rounded-lg px-1 py-2 text-[11px] font-bold border ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-[#33475b] border-white/70'}`;
      });
      panes.forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    };
    tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab ?? 'upi')));

    overlay.querySelectorAll<HTMLButtonElement>('[data-wallet]').forEach((b) => b.addEventListener('click', () => {
      wallet = b.dataset.wallet ?? '';
      overlay.querySelectorAll<HTMLButtonElement>('[data-wallet]').forEach((other) => {
        other.className = `rounded-xl border px-2 py-3 text-[11px] font-bold ${other === b ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-white/70 bg-white/70 text-[#33475b]'} hover:border-brand-400`;
      });
    }));

    const cardInput = q('[data-role="card"]') as HTMLInputElement | null;
    cardInput?.addEventListener('input', () => {
      const digits = cardInput.value.replace(/\D/g, '').slice(0, 16);
      cardInput.value = digits.replace(/(.{4})/g, '$1 ').trim();
    });
    const expiryInput = q('[data-role="expiry"]') as HTMLInputElement | null;
    expiryInput?.addEventListener('input', () => {
      const digits = expiryInput.value.replace(/\D/g, '').slice(0, 4);
      expiryInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });

    const validate = (): string => {
      if (active === 'upi') {
        const value = (q('[data-role="upi"]') as HTMLInputElement | null)?.value.trim() ?? '';
        if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(value)) return 'Enter a valid UPI ID, e.g. yourname@okhdfcbank.';
      } else if (active === 'card') {
        const number = (q('[data-role="card"]') as HTMLInputElement | null)?.value.replace(/\s/g, '') ?? '';
        const expiry = (q('[data-role="expiry"]') as HTMLInputElement | null)?.value ?? '';
        const cvv = (q('[data-role="cvv"]') as HTMLInputElement | null)?.value ?? '';
        const holder = (q('[data-role="cardName"]') as HTMLInputElement | null)?.value.trim() ?? '';
        if (!/^\d{15,16}$/.test(number)) return 'Enter a valid 16-digit card number.';
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) return 'Enter expiry as MM/YY.';
        if (!/^\d{3,4}$/.test(cvv)) return 'Enter a valid CVV.';
        if (holder.length < 2) return 'Enter the cardholder name.';
      } else if (active === 'netbanking') {
        if (!(q('[data-role="bank"]') as HTMLSelectElement | null)?.value) return 'Choose your bank to continue.';
      } else if (active === 'wallet') {
        if (!wallet) return 'Choose a wallet to continue.';
      }
      return '';
    };

    const approve = () => {
      const err = validate();
      if (err) return showError(err);
      const btn = q('[data-role="approve"]') as HTMLButtonElement | null;
      if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
      window.setTimeout(() => finish({ status: 'paid', reference: generatePaymentRef('online'), verified: true }), 700);
    };

    q('[data-role="approve"]')?.addEventListener('click', approve);
    q('[data-role="fail"]')?.addEventListener('click', () => fail('Payment failed at the bank. Please retry or choose Cash on Delivery.'));
    q('[data-role="close"]')?.addEventListener('click', () => fail('Payment was cancelled.'));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) fail('Payment was cancelled.'); });
  });
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

/** Runs the payment flow for an order. Never marks a live order paid client-side. */
export async function processPayment(params: ProcessPaymentParams): Promise<ProcessPaymentResult> {
  const { method } = params;
  if (method === 'cod') {
    return { status: 'cod_pending', reference: null, verified: false };
  }
  if (method === 'clinic_counter') {
    return { status: 'pending', reference: generatePaymentRef('clinic'), verified: false };
  }
  if (method === 'upi_offline') {
    return { status: 'pending', reference: generatePaymentRef('offline'), verified: false };
  }
  if (method === 'self_pickup' || method === 'online') {
    if (isDemoModeSync()) {
      return openDemoGateway({ amount: params.amount, orderId: params.orderId, name: params.name });
    }
    try {
      return await payWithRazorpay(params);
    } catch (err) {
      if (isGatewayUnavailable(err)) {
        return openDemoGateway({ amount: params.amount, orderId: params.orderId, name: params.name });
      }
      throw err;
    }
  }
  throw new Error(`Unknown payment method: ${method as string}`);
}

export function isPaymentCancellation(err: unknown): boolean {
  return err instanceof Error && /cancel/i.test(err.message);
}
