import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiPackage } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '../../lib/orderStatus';
import { PageLoader, EmptyState } from '../../components/UIStates';
import type { OrderWithStoreName } from '../../types/orders';

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithStoreName[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('orders').select('*, store:stores(store_name)')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    setOrders((data ?? []) as unknown as OrderWithStoreName[]);
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

  if (orders === null) return <PageLoader label="Loading your orders..." />;

  if (orders.length === 0) {
    return <EmptyState icon={FiPackage} title="No orders yet" description="Medicines you order will show up here with live tracking." />;
  }

  return (
    <div className="space-y-3">
      {orders.map((o, i) => (
        <motion.div key={o.order_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Link to={`/app/store/orders/${o.order_id}`} className="glass-card flex items-center justify-between card-hover">
            <div>
              <p className="font-bold text-[#0f2340] text-sm">Order #{o.order_id} · {o.store?.store_name}</p>
              <p className="text-xs text-[#5b7088]">{new Date(o.created_at).toLocaleString()} · ₹{o.total_amount}</p>
            </div>
            <span className={`badge ${ORDER_STATUS_TONES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
