import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShoppingBag, FiX, FiFileText, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { ORDER_STATUS_NEXT, ORDER_STATUS_LABELS, ORDER_STATUS_TONES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES, ALL_ORDER_STATUSES } from '../../lib/orderStatus';
import type { StorePageProps } from '../../types/store';
import type { Database, OrderStatus } from '../../types/database.types';
import type { OrderItemWithMedicine } from '../../types/orders';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type PrescriptionRow = Database['public']['Tables']['prescriptions']['Row'];

interface OrderWithCustomer extends OrderRow {
  customer: Pick<ProfileRow, 'name' | 'phone'> | null;
}

type StatusFilterKey = 'active' | 'all' | OrderStatus;
const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled', 'refunded'];

export default function Orders({ store }: StorePageProps) {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('active');
  const [detail, setDetail] = useState<OrderWithCustomer | null>(null);
  const [items, setItems] = useState<OrderItemWithMedicine[]>([]);
  const [prescription, setPrescription] = useState<PrescriptionRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    let q = supabase.from('orders').select('*, customer:profiles(name, phone)').eq('store_id', store.store_id).order('created_at', { ascending: false });
    if (statusFilter === 'active') q = q.not('status', 'in', '(delivered,cancelled,refunded)');
    else if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setOrders((data ?? []) as unknown as OrderWithCustomer[]);
  }, [store.store_id, statusFilter]);

  useEffect(() => {
    load();
    const channel = supabase.channel('store-orders-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${store.store_id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, store.store_id]);

  const openDetail = async (o: OrderWithCustomer) => {
    setDetail(o);
    setActionError('');
    const [itemsRes, rxRes] = await Promise.all([
      supabase.from('order_items').select('*, medicine:medicines(name)').eq('order_id', o.order_id),
      supabase.from('prescriptions').select('*').eq('order_id', o.order_id).eq('superseded', false).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setItems((itemsRes.data ?? []) as unknown as OrderItemWithMedicine[]);
    setPrescription(rxRes.data ?? null);
  };

  const advance = async (o: OrderWithCustomer) => {
    setActionError('');
    const next = ORDER_STATUS_NEXT[o.status];
    if (!next) return;
    const { error } = await supabase.from('orders').update({ status: next }).eq('order_id', o.order_id);
    if (error) return setActionError(error.message.includes('prescription') ? 'This order has an unapproved prescription — approve it first under Prescriptions.' : error.message);
    load();
    if (detail?.order_id === o.order_id) setDetail((d) => (d ? { ...d, status: next } : d));
  };

  const markCodCollected = async (o: OrderWithCustomer) => {
    await supabase.from('orders').update({ payment_status: 'cod_collected' }).eq('order_id', o.order_id);
    load();
    if (detail?.order_id === o.order_id) setDetail((d) => (d ? { ...d, payment_status: 'cod_collected' } : d));
  };

  const markRefunded = async (o: OrderWithCustomer) => {
    await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('order_id', o.order_id);
    load();
    setDetail(null);
  };

  const cancel = async () => {
    if (!cancelReason.trim() || !detail) return;
    await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancelReason }).eq('order_id', detail.order_id);
    setShowCancel(false);
    setCancelReason('');
    setDetail(null);
    load();
  };

  const detailNextStatus = detail ? ORDER_STATUS_NEXT[detail.status] : undefined;

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {(['active', ...ALL_ORDER_STATUSES, 'all'] as StatusFilterKey[]).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs font-bold rounded-xl px-3 py-2 transition-colors ${statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b] hover:bg-white/90'}`}>
            {s === 'active' ? 'Active' : s === 'all' ? 'All' : ORDER_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="glass-card space-y-2">
        {orders.length === 0 && <p className="text-sm text-[#5b7088]">No orders in this view.</p>}
        {orders.map((o, i) => (
          <motion.button key={o.order_id} onClick={() => openDetail(o)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="w-full text-left p-3 rounded-xl bg-white/50 hover:bg-white/80 border border-white/40 flex items-center justify-between transition-colors">
            <div>
              <p className="text-sm font-bold text-[#0f2340] flex items-center gap-2">
                <FiShoppingBag className="text-brand-500" /> #{o.order_id} · {o.customer?.name}
              </p>
              <p className="text-[11px] text-[#5b7088]">₹{o.total_amount} · {new Date(o.created_at).toLocaleString()}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`badge ${ORDER_STATUS_TONES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
              <span className={`badge ${PAYMENT_STATUS_TONES[o.payment_status]}`}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {detail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-[#0f2340]">Order #{detail.order_id}</h3>
                <button onClick={() => setDetail(null)} aria-label="Close"><FiX /></button>
              </div>
              <p className="text-sm font-bold text-[#0f2340]">{detail.customer?.name}</p>
              <p className="text-xs text-[#5b7088] mb-1">{detail.customer?.phone}</p>
              <p className="text-xs text-[#5b7088] mb-3">{detail.delivery_address}</p>

              {prescription && (
                <div className="p-2.5 rounded-xl bg-brand-50 border border-brand-200 mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold text-brand-700 flex items-center gap-1.5"><FiFileText /> Prescription: {prescription.status.replaceAll('_', ' ')}</p>
                  <a href="#" onClick={async (e) => {
                    e.preventDefault();
                    const { data } = await supabase.storage.from('prescriptions').createSignedUrl(prescription.file_path, 300);
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
                  }} className="text-[11px] font-bold text-brand-600 underline">View</a>
                </div>
              )}

              <div className="space-y-1.5 mb-3">
                {items.map((it) => (
                  <div key={it.order_item_id} className="flex justify-between text-sm">
                    <span className="text-[#33475b]">{it.medicine?.name} × {it.quantity}</span>
                    <span className="font-bold text-[#0f2340]">₹{(it.price * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-extrabold border-t border-white/50 pt-2 mb-4">
                <span>Total</span><span>₹{detail.total_amount}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={`badge ${ORDER_STATUS_TONES[detail.status]}`}>{ORDER_STATUS_LABELS[detail.status]}</span>
                <span className={`badge ${PAYMENT_STATUS_TONES[detail.payment_status]}`}>{PAYMENT_STATUS_LABELS[detail.payment_status]}</span>
                <span className="text-[11px] text-[#5b7088] uppercase font-bold">{detail.payment_method}</span>
              </div>
              {detail.status === 'cancelled' && detail.cancellation_reason && (
                <p className="text-xs text-rose-500 mb-3">Reason: {detail.cancellation_reason}</p>
              )}
              {actionError && <p className="text-xs text-rose-500 font-semibold mb-3">{actionError}</p>}

              <div className="flex flex-wrap gap-2">
                {!TERMINAL_STATUSES.includes(detail.status) && detailNextStatus && (
                  <button onClick={() => advance(detail)} className="btn-primary flex-1 min-w-[140px]">Mark {ORDER_STATUS_LABELS[detailNextStatus]}</button>
                )}
                {!TERMINAL_STATUSES.includes(detail.status) && (
                  <button onClick={() => setShowCancel(true)} className="btn-ghost flex-1 min-w-[140px] !text-rose-500">Cancel Order</button>
                )}
                {detail.payment_method === 'cod' && detail.payment_status === 'cod_pending' && detail.status === 'delivered' && (
                  <button onClick={() => markCodCollected(detail)} className="btn-primary flex-1 min-w-[140px] flex items-center justify-center gap-1.5">
                    <FiCheckCircle /> Mark COD Collected
                  </button>
                )}
                {detail.status === 'refund_requested' && (
                  <button onClick={() => markRefunded(detail)} className="btn-primary flex-1 min-w-[140px]">Mark Refunded</button>
                )}
              </div>

              {showCancel && (
                <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." className="input-field mb-2" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCancel(false)} className="btn-ghost flex-1 !py-1.5 !text-xs">Back</button>
                    <button onClick={cancel} className="btn-primary flex-1 !py-1.5 !text-xs !bg-rose-500">Confirm Cancel</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
