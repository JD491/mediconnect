import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiClipboard } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES, ALL_ORDER_STATUSES } from '../../lib/orderStatus';
import { SkeletonTable, EmptyState } from '../../components/UIStates';
import RevenueReconciliation from '../../components/RevenueReconciliation';
import type { Database, OrderStatus } from '../../types/database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type StoreRow = Database['public']['Tables']['stores']['Row'];

interface OrderWithCustomerAndStore extends OrderRow {
  customer: Pick<ProfileRow, 'name'> | null;
  store: Pick<StoreRow, 'store_name'> | null;
}

type FilterKey = OrderStatus | 'all';

export default function Orders() {
  const [orders, setOrders] = useState<OrderWithCustomerAndStore[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    let q = supabase.from('orders').select('*, customer:profiles(name), store:stores(store_name)').order('created_at', { ascending: false }).limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setOrders((data ?? []) as unknown as OrderWithCustomerAndStore[]);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {(['all', ...ALL_ORDER_STATUSES] as FilterKey[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-bold rounded-xl px-3 py-2 transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b] hover:bg-white/90'}`}>
            {f === 'all' ? 'All' : ORDER_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {orders !== null && <RevenueReconciliation orders={orders} title="Platform settlement" />}

      {orders === null ? (
        <SkeletonTable rows={6} cols={5} />
      ) : orders.length === 0 ? (
        <EmptyState icon={FiClipboard} title="No orders in this view" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass-card overflow-x-auto hidden sm:block">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] text-[#5b7088] font-bold uppercase border-b border-white/50">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Payment</th>
                  <th className="py-2 pr-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id} className="border-b border-white/30 last:border-0">
                    <td className="py-2.5 pr-3 font-bold text-[#0f2340]">#{o.order_id}</td>
                    <td className="py-2.5 pr-3 text-[#33475b]">{o.customer?.name}</td>
                    <td className="py-2.5 pr-3 text-[#33475b]">{o.store?.store_name}</td>
                    <td className="py-2.5 pr-3 text-[#33475b]">₹{o.total_amount}</td>
                    <td className="py-2.5 pr-3"><span className={`badge ${ORDER_STATUS_TONES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span></td>
                    <td className="py-2.5 pr-3"><span className={`badge ${PAYMENT_STATUS_TONES[o.payment_status]}`}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span></td>
                    <td className="py-2.5 pr-3 text-[#5b7088]">{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {orders.map((o, i) => (
              <motion.div key={o.order_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-card !py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-[#0f2340] text-sm">#{o.order_id}</p>
                  <p className="font-bold text-[#0f2340] text-sm">₹{o.total_amount}</p>
                </div>
                <p className="text-xs text-[#5b7088] mb-2">{o.customer?.name} · {o.store?.store_name}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`badge ${ORDER_STATUS_TONES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                  <span className={`badge ${PAYMENT_STATUS_TONES[o.payment_status]}`}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
