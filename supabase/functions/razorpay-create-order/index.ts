// Supabase Edge Function: razorpay-create-order
//
// Creates a Razorpay order server-side. The client NEVER sees
// RAZORPAY_KEY_SECRET and NEVER decides the amount — the amount is read
// straight from the `orders` row in the database, so a tampered client
// request can't pay less than the real total.
//
// Required secrets (set via `supabase secrets set`):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided by Supabase.)
//
// If the Razorpay secrets are not configured, this returns 503 with a clear
// message instead of crashing — the frontend is built to catch that and show
// "Online payment is currently unavailable" rather than breaking checkout.

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

    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'order_id is required' }, 400);

    const { data: order, error: orderErr } = await supabase
      .from('orders').select('order_id, user_id, total_amount, payment_status, status').eq('order_id', order_id).single();

    if (orderErr || !order) return json({ error: 'Order not found' }, 404);
    if (order.user_id !== userData.user.id) return json({ error: 'Forbidden' }, 403);
    if (order.payment_status === 'paid') return json({ error: 'Order is already paid' }, 409);
    if (order.status === 'cancelled') return json({ error: 'This order was cancelled and cannot be paid for' }, 409);

    const amountPaise = Math.round(Number(order.total_amount) * 100);

    const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`),
      },
      body: JSON.stringify({
        amount: amountPaise, currency: 'INR', receipt: `order_${order.order_id}`,
        payment_capture: 1, // auto-capture so a successful checkout is immediately "captured", never left "authorized"
        notes: { mediconnect_order_id: String(order.order_id) },
      }),
    });

    if (!rpRes.ok) {
      const detail = await rpRes.text();
      return json({ error: 'Could not create payment order', detail }, 502);
    }

    const rpOrder = await rpRes.json();
    await supabase.from('orders').update({ razorpay_order_id: rpOrder.id, payment_status: 'processing' }).eq('order_id', order.order_id);

    return json({ razorpay_order_id: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency, key_id: RAZORPAY_KEY_ID });
  } catch (e) {
    return json({ error: 'Unexpected error', detail: String(e) }, 500);
  }
});
