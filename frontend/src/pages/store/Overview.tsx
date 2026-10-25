import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IconType } from 'react-icons';
import { FiShoppingBag, FiPackage, FiAlertTriangle, FiClock, FiFileText, FiTrendingUp } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { Stagger, StaggerItem } from '../../components/Reveal';
import { PageLoader } from '../../components/UIStates';
import type { StorePageProps } from '../../types/store';

type Tone = 'violet' | 'amber' | 'rose' | 'emerald';

const TONES: Record<Tone, string> = {
  violet: 'from-brand-500 to-accent-500',
  amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500',
  emerald: 'from-emerald-500 to-teal-500',
};

interface StatCardProps {
  icon: IconType;
  label: string;
  value: string | number;
  to?: string;
  tone?: Tone;
}

function StatCard({ icon: Icon, label, value, to, tone = 'violet' }: StatCardProps) {
  const content = (
    <div className="glass-card flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${TONES[tone]} flex items-center justify-center text-white shrink-0`}>
        <Icon />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-[#0f2340] leading-tight">{value}</p>
        <p className="text-[11px] text-[#5b7088] font-bold truncate">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block card-hover rounded-2xl">{content}</Link> : content;
}

interface Stats {
  todaySales: number;
  todayOrders: number;
  pendingOrders: number;
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  pendingRx: number;
}

export default function Overview({ store }: StorePageProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [ordersToday, pendingOrders, stockRows, pendingRx] = await Promise.all([
        supabase.from('orders').select('order_id, total_amount').eq('store_id', store.store_id).gte('created_at', todayStart.toISOString()),
        supabase.from('orders').select('order_id', { count: 'exact', head: true }).eq('store_id', store.store_id).eq('status', 'pending'),
        supabase.from('stock').select('stock_id, quantity, min_stock_level, expiry_date, is_active').eq('store_id', store.store_id),
        supabase.from('prescriptions').select('prescription_id', { count: 'exact', head: true }).eq('store_id', store.store_id).eq('status', 'pending'),
      ]);

      if (!active) return;
      const stock = stockRows.data ?? [];
      const today = new Date();
      const in90 = new Date();
      in90.setDate(in90.getDate() + 90);

      setStats({
        todaySales: (ordersToday.data ?? []).reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        todayOrders: (ordersToday.data ?? []).length,
        pendingOrders: pendingOrders.count ?? 0,
        totalProducts: stock.filter((s) => s.is_active).length,
        lowStock: stock.filter((s) => s.is_active && s.quantity > 0 && s.quantity <= s.min_stock_level).length,
        outOfStock: stock.filter((s) => s.is_active && s.quantity === 0).length,
        expiringSoon: stock.filter((s) => s.is_active && s.expiry_date && new Date(s.expiry_date) >= today && new Date(s.expiry_date) <= in90).length,
        pendingRx: pendingRx.count ?? 0,
      });
    })();
    return () => {
      active = false;
    };
  }, [store.store_id]);

  if (!stats) return <PageLoader label="Loading dashboard..." />;

  return (
    <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StaggerItem><StatCard icon={FiTrendingUp} label="Today's Sales" value={`₹${stats.todaySales.toFixed(0)}`} tone="emerald" /></StaggerItem>
      <StaggerItem><StatCard icon={FiShoppingBag} label="Today's Orders" value={stats.todayOrders} to="/app/store-owner/orders" /></StaggerItem>
      <StaggerItem><StatCard icon={FiClock} label="Pending Orders" value={stats.pendingOrders} to="/app/store-owner/orders" tone="amber" /></StaggerItem>
      <StaggerItem><StatCard icon={FiPackage} label="Total Products" value={stats.totalProducts} to="/app/store-owner/inventory" /></StaggerItem>
      <StaggerItem><StatCard icon={FiAlertTriangle} label="Low Stock" value={stats.lowStock} to="/app/store-owner/inventory?filter=low_stock" tone="rose" /></StaggerItem>
      <StaggerItem><StatCard icon={FiAlertTriangle} label="Out of Stock" value={stats.outOfStock} to="/app/store-owner/inventory?filter=out_of_stock" tone="rose" /></StaggerItem>
      <StaggerItem><StatCard icon={FiClock} label="Expiring in 90d" value={stats.expiringSoon} to="/app/store-owner/inventory?filter=expiring_soon" tone="amber" /></StaggerItem>
      <StaggerItem><StatCard icon={FiFileText} label="Prescriptions to Review" value={stats.pendingRx} to="/app/store-owner/prescriptions" tone="amber" /></StaggerItem>
    </Stagger>
  );
}
