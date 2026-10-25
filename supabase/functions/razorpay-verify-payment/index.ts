// Supabase Edge Function: razorpay-verify-payment
//
// This is the ONLY place a payment is ever marked "paid". The frontend
// cannot do this itself. Verification has two independent layers:
//   1. HMAC-SHA256 signature check (proves the callback wasn't forged)
//   2. A direct server-to-server call to Razorpay's Payments API to confirm
//      the payment actually exists, was captured, is in INR, and its amount
//      matches this order's total exactly — so a forged-but-correctly-signed
//      payload for a *different, cheaper* payment can't be replayed here.
// A payment_id already attached to a different order is rejected outright
// (also enforced at the DB layer via a unique constraint, as defense in depth).
//
// Required secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided.)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function hmacHex(secret: string, message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return json({ error: 'Online payment is currently unavailable' }, 503);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);

    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Missing verification fields' }, 400);
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders').select('order_id, user_id, total_amount, razorpay_order_id, razorpay_payment_id, payment_status')
      .eq('order_id', order_id).single();

    if (orderErr || !order) return json({ error: 'Order not found' }, 404);
    if (order.user_id !== userData.user.id) return json({ error: 'Forbidden' }, 403);
    if (order.razorpay_order_id !== razorpay_order_id) return json({ error: 'Order mismatch' }, 400);

    if (order.payment_status === 'paid') {
      // Idempotent: a duplicate client retry should not double-process.
      return json({ success: true, already_verified: true });
    }

    // Layer 1: signature.
    const expected = await hmacHex(RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (expected !== razorpay_signature) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('order_id', order_id);
      return json({ error: 'Signature verification failed' }, 400);
    }

    // Duplicate-processing guard: this payment_id must not already be on a different order.
    const { data: dupe } = await supabase
      .from('orders').select('order_id').eq('razorpay_payment_id', razorpay_payment_id).neq('order_id', order_id).maybeSingle();
    if (dupe) {
      return json({ error: 'This payment has already been used for a different order' }, 409);
    }

    // Layer 2: ask Razorpay directly what actually happened with this payment —
    // never trust the checkout.js success callback's own claims about itself.
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`) },
    });
    if (!payRes.ok) {
      return json({ error: 'Could not verify payment with Razorpay' }, 502);
    }
    const payment = await payRes.json();

    const expectedAmountPaise = Math.round(Number(order.total_amount) * 100);
    const checks = {
      order_id_matches: payment.order_id === razorpay_order_id,
      captured: payment.status === 'captured',
      currency_inr: payment.currency === 'INR',
      amount_matches: payment.amount === expectedAmountPaise,
    };
    if (!Object.values(checks).every(Boolean)) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('order_id', order_id);
      return json({ error: 'Payment could not be verified', detail: checks }, 400);
    }

    await supabase.from('orders').update({
      payment_status: 'paid', payment_verified: true, razorpay_payment_id,
    }).eq('order_id', order_id);

    return json({ success: true });
  } catch (e) {
    return json({ error: 'Unexpected error', detail: String(e) }, 500);
  }
});
