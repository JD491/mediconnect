import { useEffect, useState, useCallback, useMemo } from 'react';
import { FiDownload, FiTrendingUp } from 'react-icons/fi';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import { PageLoader } from '../../components/UIStates';
import RevenueReconciliation from '../../components/RevenueReconciliation';
import type { StorePageProps } from '../../types/store';
import type { Database, OrderStatus } from '../../types/database.types';
import type { OrderItemWithMedicine } from '../../types/orders';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' }, { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' }, { key: 'custom', label: 'Custom range' },
];

const NON_COMPLETED_STATUSES: OrderStatus[] = ['cancelled', 'refund_requested', 'refund_initiated', 'refunded'];

interface CustomRange {
  from: string;
  to: string;
}

function rangeToDates(key: RangeKey, custom: CustomRange): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  switch (key) {
    case 'today': return { from: startOfToday, to: new Date() };
    case 'yesterday': {
      const y = new Date(startOfToday);
      y.setDate(y.getDate() - 1);
      return { from: y, to: startOfToday };
    }
    case '7d': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 6);
      return { from: d, to: new Date() };
    }
    case '30d': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 29);
      return { from: d, to: new Date() };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d, to: new Date() };
    }
    case 'custom':
      return {
        from: custom.from ? new Date(custom.from) : startOfToday,
        to: custom.to ? new Date(new Date(custom.to).setHours(23, 59, 59, 999)) : new Date(),
      };
    default:
      return { from: startOfToday, to: new Date() };
  }
}

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => `"${String(r[h] ?? '').replaceAll('"', '""')}"`).join(','));
  return lines.join('\n');
}

export default function Reports({ store }: StorePageProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<OrderItemWithMedicine[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => rangeToDates(rangeKey, custom), [rangeKey, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ords } = await supabase.from('orders').select('*').eq('store_id', store.store_id)
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString()).order('created_at', { ascending: true });
    setOrders(ords ?? []);
    if (ords?.length) {
      const { data: its } = await supabase.from('order_items').select('*, medicine:medicines(name)').in('order_id', ords.map((o) => o.order_id));
      setItems((its ?? []) as unknown as OrderItemWithMedicine[]);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [store.store_id, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const completed = orders.filter((o) => !NON_COMPLETED_STATUSES.includes(o.status));
  const cancelled = orders.filter((o) => NON_COMPLETED_STATUSES.includes(o.status));
  const totalSales = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const avgOrderValue = completed.length ? totalSales / completed.length : 0;

  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const parentOrder = orders.find((o) => o.order_id === it.order_id);
      if (parentOrder && NON_COMPLETED_STATUSES.includes(parentOrder.status)) continue;
      const key = it.medicine?.name || 'Unknown';
      map.set(key, (map.get(key) || 0) + it.quantity);
    }
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [items, orders]);

  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of completed) {
      const day = new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      map.set(day, (map.get(day) || 0) + Number(o.total_amount));
    }
    return [...map.entries()].map(([day, revenue]) => ({ day, revenue }));
  }, [completed]);

  const exportCsv = () => {
    const csv = toCsv(orders.map((o) => ({
      order_id: o.order_id, date: new Date(o.created_at).toLocaleString(), status: o.status,
      subtotal: o.total_amount - o.delivery_fee + o.discount_amount, discount: o.discount_amount,
      delivery_fee: o.delivery_fee, total: o.total_amount, payment_method: o.payment_method, payment_status: o.payment_status,
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.store_name.replace(/\s+/g, '_')}_orders_${rangeKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRangeKey(r.key)} className={`text-xs font-bold rounded-xl px-3 py-2 ${rangeKey === r.key ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>{r.label}</button>
        ))}
        {rangeKey === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="input-field !py-1.5 !text-xs !w-36" />
            <span className="text-xs text-[#5b7088]">to</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="input-field !py-1.5 !text-xs !w-36" />
          </div>
        )}
        <button onClick={exportCsv} disabled={orders.length === 0} className="btn-ghost !py-2 !text-xs flex items-center gap-1.5 ml-auto disabled:opacity-40">
          <FiDownload /> Export CSV
        </button>
      </div>

      {loading ? (
        <PageLoader label="Loading report..." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card"><p className="text-lg font-extrabold text-[#0f2340]">₹{totalSales.toFixed(0)}</p><p className="text-[11px] text-[#5b7088] font-bold">Total Sales</p></div>
            <div className="glass-card"><p className="text-lg font-extrabold text-[#0f2340]">{completed.length}</p><p className="text-[11px] text-[#5b7088] font-bold">Completed Orders</p></div>
            <div className="glass-card"><p className="text-lg font-extrabold text-[#0f2340]">{cancelled.length}</p><p className="text-[11px] text-[#5b7088] font-bold">Cancelled Orders</p></div>
            <div className="glass-card"><p className="text-lg font-extrabold text-[#0f2340]">₹{avgOrderValue.toFixed(0)}</p><p className="text-[11px] text-[#5b7088] font-bold">Avg Order Value</p></div>
          </div>

          <RevenueReconciliation orders={orders} title="Payment reconciliation" />

          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiTrendingUp /> Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3">Top Products</h3>
            <div className="space-y-1.5">
              {topProducts.map((p) => (
                <div key={p.name} className="flex justify-between text-sm">
                  <span className="text-[#33475b]">{p.name}</span>
                  <span className="font-bold text-[#0f2340]">{p.qty} sold</span>
                </div>
              ))}
              {topProducts.length === 0 && <p className="text-xs text-[#5b7088]">No sales in this period.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
