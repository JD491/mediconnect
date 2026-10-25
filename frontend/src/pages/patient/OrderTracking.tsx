import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck, FiPrinter, FiRotateCcw, FiPhone, FiMail, FiX, FiRefreshCw, FiFileText } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from '../../lib/orderStatus';
import { PageLoader } from '../../components/UIStates';
import type { Database, OrderStatus } from '../../types/database.types';
import type { OrderTrackingOrder, OrderItemWithMedicine } from '../../types/orders';

type PrescriptionRow = Database['public']['Tables']['prescriptions']['Row'];

const STEPS = ORDER_STATUS_FLOW.map((key) => ({ key, label: ORDER_STATUS_LABELS[key] }));
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed'];
const REFUND_STATES: OrderStatus[] = ['refund_requested', 'refunded'];

export default function OrderTracking() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderTrackingOrder | null>(null);
  const [items, setItems] = useState<OrderItemWithMedicine[]>([]);
  const [prescription, setPrescription] = useState<PrescriptionRow | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [reorderMsg, setReorderMsg] = useState('');
  const [refundMsg, setRefundMsg] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const orderId = Number(id);
    const { data: o } = await supabase.from('orders').select('*, store:stores(store_id, store_name, phone, email, address)').eq('order_id', orderId).single();
    setOrder((o as unknown as OrderTrackingOrder) ?? null);
    if (o) {
      const [itemsRes, rxRes] = await Promise.all([
        supabase.from('order_items').select('*, medicine:medicines(name)').eq('order_id', orderId),
        supabase.from('prescriptions').select('*').eq('order_id', orderId).eq('superseded', false).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setItems((itemsRes.data ?? []) as unknown as OrderItemWithMedicine[]);
      setPrescription(rxRes.data ?? null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!order) return <PageLoader label="Loading order..." />;

  const stepIndex = STEPS.findIndex((s) => s.key === order.status);
  const cancelled = order.status === 'cancelled';
  const isRefundState = REFUND_STATES.includes(order.status);
  const canRequestRefund = order.status === 'delivered' && order.payment_status === 'paid';

  const cancelOrder = async () => {
    if (!cancelReason.trim()) return;
    await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancelReason }).eq('order_id', order.order_id);
    setShowCancel(false);
    load();
  };

  const requestRefund = async () => {
    await supabase.from('orders').update({ status: 'refund_requested' }).eq('order_id', order.order_id);
    setRefundMsg('Refund requested — the store will review and process it.');
    load();
  };

  const reorder = async () => {
    if (!user) return;
    setReorderMsg('');
    const unavailable: string[] = [];
    for (const it of items) {
      const { data: stockRow } = await supabase.from('stock').select('*').eq('stock_id', it.stock_id).maybeSingle();
      if (!stockRow || !stockRow.is_active || stockRow.quantity <= 0) {
        if (it.medicine?.name) unavailable.push(it.medicine.name);
        continue;
      }
      const qty = Math.min(it.quantity, stockRow.quantity);
      await supabase.from('cart_items').upsert(
        { user_id: user.id, stock_id: it.stock_id, quantity: qty, saved_for_later: false },
        { onConflict: 'user_id,stock_id', ignoreDuplicates: false },
      );
    }
    if (unavailable.length > 0) {
      setReorderMsg(`Added available items to cart. Currently unavailable: ${unavailable.join(', ')}.`);
    } else {
      navigate('/app/store/cart');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="glass-card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-extrabold text-[#0f2340]">Order #{order.order_id}</h2>
          <button onClick={() => window.print()} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1 print:hidden">
            <FiPrinter /> Invoice
          </button>
        </div>
        <p className="text-xs text-[#5b7088] mb-4">{order.store?.store_name} · {new Date(order.created_at).toLocaleString()}</p>

        {cancelled ? (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
            <p className="text-sm font-bold text-rose-600">Order Cancelled</p>
            {order.cancellation_reason && <p className="text-xs text-rose-500 mt-1">Reason: {order.cancellation_reason}</p>}
          </div>
        ) : isRefundState ? (
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
            <p className="text-sm font-bold text-orange-700 flex items-center gap-1.5"><FiRefreshCw /> {ORDER_STATUS_LABELS[order.status]}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <div key={s.key} className="flex-1 flex flex-col items-center relative">
                {idx > 0 && (
                  <div className="absolute top-3 right-1/2 w-full h-0.5 bg-slate-200 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: idx <= stepIndex ? '100%' : 0 }} transition={{ duration: 0.4 }} className="h-full bg-brand-500" />
                  </div>
                )}
                <motion.div initial={false} animate={{ scale: idx === stepIndex ? 1.15 : 1 }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs z-10 ${idx <= stepIndex ? 'bg-brand-600' : 'bg-slate-300'}`}>
                  {idx <= stepIndex ? <FiCheck size={12} /> : idx + 1}
                </motion.div>
                <p className="text-[9px] sm:text-[10px] text-[#5b7088] font-bold mt-1.5 text-center">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {prescription && (
        <div className="glass-card !py-3 flex items-center justify-between">
          <p className="text-sm font-bold text-[#0f2340] flex items-center gap-2"><FiFileText className="text-brand-500" /> Prescription</p>
          <span className={`badge ${prescription.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : prescription.status === 'rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>
            {prescription.status.replaceAll('_', ' ')}
          </span>
        </div>
      )}

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Items</h3>
        <div className="space-y-1.5 mb-3">
          {items.map((it) => (
            <div key={it.order_item_id} className="flex justify-between text-sm">
              <span className="text-[#33475b]">{it.medicine?.name} × {it.quantity}</span>
              <span className="font-bold text-[#0f2340]">₹{(it.price * it.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/50 pt-2 space-y-1">
          {order.discount_amount > 0 && (
            <div className="flex justify-between text-xs text-emerald-600 font-semibold"><span>Coupon discount</span><span>-₹{order.discount_amount}</span></div>
          )}
          <div className="flex justify-between text-xs text-[#5b7088]"><span>Delivery fee</span><span>{Number(order.delivery_fee) === 0 ? 'Free' : `₹${order.delivery_fee}`}</span></div>
          <div className="flex justify-between text-sm font-extrabold text-[#0f2340]"><span>Total</span><span>₹{order.total_amount}</span></div>
        </div>
        <p className="text-xs text-[#5b7088] mt-3">Delivering to: {order.delivery_address}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-[#5b7088] uppercase font-bold">{order.payment_method}</span>
          <span className={`badge ${PAYMENT_STATUS_TONES[order.payment_status]}`}>{PAYMENT_STATUS_LABELS[order.payment_status]}</span>
        </div>
      </div>

      <div className="glass-card flex flex-wrap gap-2 print:hidden">
        {CANCELLABLE_STATUSES.includes(order.status) && (
          <button onClick={() => setShowCancel(true)} className="btn-ghost !text-rose-500 flex items-center gap-2"><FiX /> Cancel Order</button>
        )}
        {order.status === 'delivered' && (
          <button onClick={reorder} className="btn-primary flex items-center gap-2"><FiRotateCcw /> Buy Again</button>
        )}
        {canRequestRefund && (
          <button onClick={requestRefund} className="btn-ghost flex items-center gap-2 !text-orange-600"><FiRefreshCw /> Request Refund</button>
        )}
        {order.store?.phone && <a href={`tel:${order.store.phone}`} className="btn-ghost flex items-center gap-2"><FiPhone /> Call Store</a>}
        {order.store?.email && <a href={`mailto:${order.store.email}`} className="btn-ghost flex items-center gap-2"><FiMail /> Email Store</a>}
        <Link to="/app/store/orders" className="btn-ghost">Back to Orders</Link>
      </div>

      {reorderMsg && <p className="text-xs font-semibold text-amber-600">{reorderMsg}</p>}
      {refundMsg && <p className="text-xs font-semibold text-orange-600">{refundMsg}</p>}

      <AnimatePresence>
        {showCancel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-card w-full max-w-sm">
              <h3 className="font-extrabold text-[#0f2340] mb-3">Cancel this order?</h3>
              <label htmlFor="cancel-reason" className="sr-only">Reason for cancellation</label>
              <textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." className="input-field mb-3" rows={2} />
              <div className="flex gap-2">
                <button onClick={() => setShowCancel(false)} className="btn-ghost flex-1">Back</button>
                <button onClick={cancelOrder} className="btn-primary flex-1 !bg-rose-500">Confirm Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
