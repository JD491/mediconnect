import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiPackage, FiPrinter, FiRefreshCw, FiShoppingBag, FiAlertTriangle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from '../../lib/orderStatus';
import { printGstInvoice } from '../../lib/payments';
import { retryOnlinePayment, switchOrderToCod } from '../../lib/paymentFlows';
import { PageLoader, EmptyState } from '../../components/UIStates';
import type { Database } from '../../types/database.types';
import type { OrderItemWithMedicine } from '../../types/orders';

type OrderRow = Database['public']['Tables']['orders']['Row'];

interface MyOrder extends OrderRow {
  store: { store_name: string } | null;
  order_items: OrderItemWithMedicine[];
}

const RETRYABLE_METHODS = ['online', 'self_pickup'];

export default function MyOrders() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('orders')
      .select('*, store:stores(store_name), order_items(*, medicine:medicines(name, image_url, form, gst_rate))')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    setOrders((data ?? []) as unknown as MyOrder[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    // Realtime: order status changes (e.g. store owner marks "out_for_delivery") reflect instantly.
    const channel = supabase.channel('my-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user]);

  const retry = async (order: MyOrder) => {
    setBusyId(order.order_id);
    setActionMsg('');
    try {
      await retryOnlinePayment({
        orderId: order.order_id, amount: Number(order.total_amount),
        name: order.customer_name ?? profile?.name, email: user?.email, contact: order.customer_phone ?? profile?.phone ?? undefined,
      });
      setActionMsg(`Payment received for order #${order.order_id}.`);
      await load();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Payment failed. You can try again or switch to Cash on Delivery.');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const switchToCod = async (order: MyOrder) => {
    setBusyId(order.order_id);
    setActionMsg('');
    try {
      await switchOrderToCod(order.order_id);
      setActionMsg(`Order #${order.order_id} switched to Cash on Delivery.`);
      await load();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Could not switch to COD.');
    } finally {
      setBusyId(null);
    }
  };

  const printInvoice = (order: MyOrder) => {
    printGstInvoice({
      orderId: order.order_id,
      storeName: order.store?.store_name ?? 'MediConnect Pharmacy',
      customerName: order.customer_name ?? profile?.name ?? 'Customer',
      address: order.delivery_address,
      createdAt: order.created_at,
      items: (order.order_items ?? []).map((i) => ({
        name: i.medicine?.name ?? 'Medicine', quantity: i.quantity, price: i.price, gstRate: i.medicine?.gst_rate ?? 12,
      })),
      deliveryFee: Number(order.delivery_fee),
      discount: Number(order.discount_amount),
      total: Number(order.total_amount),
      paymentMethod: order.payment_method, paymentStatus: order.payment_status,
      paymentRef: order.payment_ref, pickupToken: order.pickup_token,
    });
  };

  if (orders === null) return <PageLoader label="Loading your orders..." />;

  if (orders.length === 0) {
    return <EmptyState icon={FiPackage} title="No orders yet" description="Medicines you order will show up here with live tracking." />;
  }

  return (
    <div className="space-y-3">
      {actionMsg && <div className="glass-card !py-2 !px-4 text-xs font-semibold text-brand-700">{actionMsg}</div>}
      {orders.map((o, i) => {
        const canRetry = RETRYABLE_METHODS.includes(o.payment_method) && ['failed', 'pending'].includes(o.payment_status) && o.status !== 'cancelled';
        return (
          <motion.div key={o.order_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card">
            <Link to={`/app/store/orders/${o.order_id}`} className="flex items-center justify-between gap-2 card-hover">
              <div className="min-w-0">
                <p className="font-bold text-[#0f2340] text-sm truncate">Order #{o.order_id} · {o.store?.store_name}</p>
                <p className="text-xs text-[#5b7088]">{new Date(o.created_at).toLocaleString()} · ₹{o.total_amount}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`badge ${ORDER_STATUS_TONES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                <span className={`badge ${PAYMENT_STATUS_TONES[o.payment_status]}`}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span>
              </div>
            </Link>

            {(o.pickup_token || o.payment_ref || o.payment_failure_reason) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {o.pickup_token && <span className="font-bold text-brand-700 flex items-center gap-1"><FiShoppingBag /> Pickup {o.pickup_token}</span>}
                {o.payment_ref && <span className="text-[#8a9bb0] break-all">Ref {o.payment_ref}</span>}
                {o.payment_failure_reason && <span className="text-rose-500 font-semibold flex items-center gap-1"><FiAlertTriangle /> {o.payment_failure_reason}</span>}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => printInvoice(o)} className="btn-ghost !py-1.5 !text-[11px] flex items-center gap-1"><FiPrinter /> Invoice</button>
              {canRetry && (
                <>
                  <button disabled={busyId === o.order_id} onClick={() => retry(o)} className="btn-primary !py-1.5 !text-[11px] flex items-center gap-1 disabled:opacity-50">
                    <FiRefreshCw /> {busyId === o.order_id ? 'Opening...' : 'Retry payment'}
                  </button>
                  <button disabled={busyId === o.order_id} onClick={() => switchToCod(o)} className="btn-ghost !py-1.5 !text-[11px]">Switch to COD</button>
                </>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
