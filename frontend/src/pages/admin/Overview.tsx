import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IconType } from 'react-icons';
import { FiUsers, FiShoppingBag, FiUserCheck, FiPackage, FiClipboard, FiTrendingUp, FiCheckCircle } from 'react-icons/fi';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import { Stagger, StaggerItem } from '../../components/Reveal';
import type { Database } from '../../types/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ApprovalDecision = 'approved' | 'rejected';

interface PendingDoctor {
  doctor_id: number;
  specialization: string;
  profile: Pick<ProfileRow, 'name' | 'email'> | null;
}
interface PendingStore {
  store_id: number;
  store_name: string;
  owner: Pick<ProfileRow, 'name' | 'email'> | null;
}

type Tone = 'violet' | 'amber' | 'emerald' | 'sky';
const TONES: Record<Tone, string> = {
  violet: 'from-brand-500 to-accent-500', amber: 'from-amber-500 to-orange-500',
  emerald: 'from-emerald-500 to-teal-500', sky: 'from-sky-500 to-blue-500',
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
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${TONES[tone]} flex items-center justify-center text-white shrink-0`}><Icon /></div>
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-[#0f2340] leading-tight">{value}</p>
        <p className="text-[11px] text-[#5b7088] font-bold truncate">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block card-hover rounded-2xl">{content}</Link> : content;
}

function Approvals() {
  const [doctors, setDoctors] = useState<PendingDoctor[]>([]);
  const [stores, setStores] = useState<PendingStore[]>([]);

  const load = async () => {
    const { data: d } = await supabase.from('doctors').select('doctor_id, specialization, profile:profiles(name,email)').eq('approval_status', 'pending');
    const { data: s } = await supabase.from('stores').select('store_id, store_name, owner:profiles(name,email)').eq('approval_status', 'pending');
    setDoctors((d ?? []) as unknown as PendingDoctor[]);
    setStores((s ?? []) as unknown as PendingStore[]);
  };

  useEffect(() => {
    load();
  }, []);

  const decideDoctor = async (doctorId: number, approval_status: ApprovalDecision) => {
    await supabase.from('doctors').update({ approval_status }).eq('doctor_id', doctorId);
    load();
  };
  const decideStore = async (storeId: number, approval_status: ApprovalDecision) => {
    await supabase.from('stores').update({ approval_status }).eq('store_id', storeId);
    load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiCheckCircle /> Pending Doctors</h3>
        <div className="space-y-2">
          {doctors.map((d) => (
            <div key={d.doctor_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between">
              <div><p className="text-sm font-bold text-[#0f2340]">Dr. {d.profile?.name}</p><p className="text-[11px] text-[#5b7088]">{d.specialization}</p></div>
              <div className="flex gap-2">
                <button onClick={() => decideDoctor(d.doctor_id, 'approved')} className="btn-primary !py-1 !px-3 !text-[11px]">Approve</button>
                <button onClick={() => decideDoctor(d.doctor_id, 'rejected')} className="btn-ghost !py-1 !px-3 !text-[11px]">Reject</button>
              </div>
            </div>
          ))}
          {doctors.length === 0 && <p className="text-xs text-[#5b7088]">No pending doctor approvals.</p>}
        </div>
      </div>

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiCheckCircle /> Pending Stores</h3>
        <div className="space-y-2">
          {stores.map((s) => (
            <div key={s.store_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between">
              <div><p className="text-sm font-bold text-[#0f2340]">{s.store_name}</p><p className="text-[11px] text-[#5b7088]">{s.owner?.name}</p></div>
              <div className="flex gap-2">
                <button onClick={() => decideStore(s.store_id, 'approved')} className="btn-primary !py-1 !px-3 !text-[11px]">Approve</button>
                <button onClick={() => decideStore(s.store_id, 'rejected')} className="btn-ghost !py-1 !px-3 !text-[11px]">Reject</button>
              </div>
            </div>
          ))}
          {stores.length === 0 && <p className="text-xs text-[#5b7088]">No pending store approvals.</p>}
        </div>
      </div>
    </div>
  );
}

interface AdminStats {
  users: number;
  stores: number;
  doctors: number;
  medicines: number;
  orders: number;
  appointments: number;
  totalRevenue: number;
}

interface ChartPoint {
  day: string;
  orders: number;
  revenue: number;
}

export default function Overview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  useEffect(() => {
    (async () => {
      const [users, stores, doctors, medicines, orders, appointments] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('stores').select('*', { count: 'exact', head: true }),
        supabase.from('doctors').select('*', { count: 'exact', head: true }),
        supabase.from('medicines').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('total_amount, created_at'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
      ]);

      const orderRows = orders.data ?? [];
      const days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const data = days.map((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const dayOrders = orderRows.filter((o) => new Date(o.created_at) >= d && new Date(o.created_at) < next);
        return {
          day: d.toLocaleDateString(undefined, { weekday: 'short' }),
          orders: dayOrders.length,
          revenue: dayOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
        };
      });
      setChartData(data);

      setStats({
        users: users.count ?? 0, stores: stores.count ?? 0, doctors: doctors.count ?? 0,
        medicines: medicines.count ?? 0, orders: orderRows.length, appointments: appointments.count ?? 0,
        totalRevenue: orderRows.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      });
    })();
  }, []);

  return (
    <div className="space-y-4">
      {stats && (
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem><StatCard icon={FiUsers} label="Total Users" value={stats.users} to="/app/admin/users" /></StaggerItem>
          <StaggerItem><StatCard icon={FiShoppingBag} label="Stores" value={stats.stores} to="/app/admin/stores" tone="sky" /></StaggerItem>
          <StaggerItem><StatCard icon={FiUserCheck} label="Doctors" value={stats.doctors} to="/app/admin/doctors" tone="amber" /></StaggerItem>
          <StaggerItem><StatCard icon={FiPackage} label="Medicines" value={stats.medicines} to="/app/admin/medicines" /></StaggerItem>
          <StaggerItem><StatCard icon={FiClipboard} label="Orders" value={stats.orders} to="/app/admin/orders" tone="sky" /></StaggerItem>
          <StaggerItem><StatCard icon={FiTrendingUp} label="Total Revenue" value={`₹${stats.totalRevenue.toFixed(0)}`} tone="emerald" /></StaggerItem>
          <StaggerItem><StatCard icon={FiUsers} label="Appointments" value={stats.appointments} tone="amber" /></StaggerItem>
        </Stagger>
      )}

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Orders & Revenue — last 7 days</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="orders" stroke="#8b5cf6" strokeWidth={2} name="Orders" />
            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue (₹)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Approvals />
    </div>
  );
}
