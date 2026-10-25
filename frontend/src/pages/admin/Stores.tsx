import { useEffect, useState, useCallback } from 'react';
import { FiEye, FiX } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { Database, ApprovalStatus } from '../../types/database.types';

type StoreRow = Database['public']['Tables']['stores']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface StoreWithOwner extends StoreRow {
  owner: Pick<ProfileRow, 'name' | 'email' | 'phone'> | null;
}

type FilterKey = ApprovalStatus | 'all';
// Stores realistically only use these four statuses (see FILTER_KEYS/action buttons below);
// under_review/expired are part of the shared ApprovalStatus enum (used by prescriptions too)
// but included here for type completeness, not because a store can reach them.
const TONES: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-600', suspended: 'bg-slate-200 text-slate-600',
  under_review: 'bg-brand-100 text-brand-700', expired: 'bg-slate-200 text-slate-600',
};
const FILTER_KEYS: FilterKey[] = ['all', 'pending', 'approved', 'rejected', 'suspended'];

export default function Stores() {
  const [stores, setStores] = useState<StoreWithOwner[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [detail, setDetail] = useState<StoreWithOwner | null>(null);
  const [inventoryCount, setInventoryCount] = useState(0);

  const load = useCallback(async () => {
    let q = supabase.from('stores').select('*, owner:profiles(name, email, phone)').order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('approval_status', filter);
    const { data } = await q;
    setStores((data ?? []) as unknown as StoreWithOwner[]);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (storeId: number, approval_status: ApprovalStatus) => {
    await supabase.from('stores').update({ approval_status }).eq('store_id', storeId);
    load();
    if (detail?.store_id === storeId) setDetail((d) => (d ? { ...d, approval_status } : d));
  };

  const openDetail = async (s: StoreWithOwner) => {
    setDetail(s);
    const { count } = await supabase.from('stock').select('*', { count: 'exact', head: true }).eq('store_id', s.store_id);
    setInventoryCount(count ?? 0);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {FILTER_KEYS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-bold rounded-xl px-3 py-2 capitalize ${filter === f ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>{f}</button>
        ))}
      </div>

      <div className="glass-card space-y-2">
        {stores.map((s) => (
          <div key={s.store_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#0f2340]">{s.store_name}</p>
              <p className="text-[11px] text-[#5b7088]">{s.owner?.name} · {s.owner?.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${TONES[s.approval_status]}`}>{s.approval_status}</span>
              <button onClick={() => openDetail(s)} aria-label={`View details for ${s.store_name}`} className="btn-ghost !py-1.5 !px-2.5 !text-[11px]"><FiEye /></button>
            </div>
          </div>
        ))}
        {stores.length === 0 && <p className="text-sm text-[#5b7088]">No stores in this view.</p>}
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
          <div className="glass-card w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold text-[#0f2340]">{detail.store_name}</h3>
              <button onClick={() => setDetail(null)} aria-label="Close"><FiX /></button>
            </div>
            <div className="space-y-1 text-sm text-[#33475b] mb-4">
              <p>Owner: {detail.owner?.name} ({detail.owner?.email})</p>
              <p>Phone: {detail.owner?.phone || detail.phone || '—'}</p>
              <p>Address: {detail.address}</p>
              <p>License #: {detail.license_number}</p>
              <p>Inventory: {inventoryCount} products</p>
              <p>Status: <span className={`badge ${TONES[detail.approval_status]}`}>{detail.approval_status}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.approval_status !== 'approved' && (
                <button onClick={() => setStatus(detail.store_id, 'approved')} className="btn-primary !py-1.5 !text-xs">Approve</button>
              )}
              {detail.approval_status === 'pending' && (
                <button onClick={() => setStatus(detail.store_id, 'rejected')} className="btn-ghost !py-1.5 !text-xs !text-rose-500">Reject</button>
              )}
              {detail.approval_status === 'approved' && (
                <button onClick={() => setStatus(detail.store_id, 'suspended')} className="btn-ghost !py-1.5 !text-xs !text-rose-500">Suspend</button>
              )}
              {detail.approval_status === 'suspended' && (
                <button onClick={() => setStatus(detail.store_id, 'approved')} className="btn-primary !py-1.5 !text-xs">Reactivate</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
