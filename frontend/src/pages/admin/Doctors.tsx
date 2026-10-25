import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Database, ApprovalStatus } from '../../types/database.types';

type DoctorRow = Database['public']['Tables']['doctors']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface DoctorWithProfile extends DoctorRow {
  profile: Pick<ProfileRow, 'name' | 'email' | 'phone'> | null;
}

type FilterKey = ApprovalStatus | 'all';
// See admin/Stores.tsx for why this is a full ApprovalStatus record even though
// doctors realistically only use the four statuses in FILTER_KEYS below.
const TONES: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-600', suspended: 'bg-slate-200 text-slate-600',
  under_review: 'bg-brand-100 text-brand-700', expired: 'bg-slate-200 text-slate-600',
};
const FILTER_KEYS: FilterKey[] = ['all', 'pending', 'approved', 'rejected', 'suspended'];

export default function Doctors() {
  const [doctors, setDoctors] = useState<DoctorWithProfile[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    let q = supabase.from('doctors').select('*, profile:profiles(name, email, phone)').order('doctor_id', { ascending: false });
    if (filter !== 'all') q = q.eq('approval_status', filter);
    const { data } = await q;
    setDoctors((data ?? []) as unknown as DoctorWithProfile[]);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (doctorId: number, approval_status: ApprovalStatus) => {
    await supabase.from('doctors').update({ approval_status }).eq('doctor_id', doctorId);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {FILTER_KEYS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-bold rounded-xl px-3 py-2 capitalize ${filter === f ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>{f}</button>
        ))}
      </div>

      <div className="glass-card space-y-2">
        {doctors.map((d) => (
          <div key={d.doctor_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-bold text-[#0f2340]">Dr. {d.profile?.name}</p>
              <p className="text-[11px] text-[#5b7088]">{d.specialization} · {d.qualification || 'Qualification not listed'} · {d.experience_years || 0} yrs</p>
              <p className="text-[11px] text-[#5b7088]">Reg. #{d.registration_number || '—'} · {d.profile?.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${TONES[d.approval_status]}`}>{d.approval_status}</span>
              {d.approval_status !== 'approved' && <button onClick={() => setStatus(d.doctor_id, 'approved')} className="btn-primary !py-1 !px-3 !text-[11px]">Approve</button>}
              {d.approval_status === 'pending' && <button onClick={() => setStatus(d.doctor_id, 'rejected')} className="btn-ghost !py-1 !px-3 !text-[11px] !text-rose-500">Reject</button>}
              {d.approval_status === 'approved' && <button onClick={() => setStatus(d.doctor_id, 'suspended')} className="btn-ghost !py-1 !px-3 !text-[11px] !text-rose-500">Suspend</button>}
            </div>
          </div>
        ))}
        {doctors.length === 0 && <p className="text-sm text-[#5b7088]">No doctors in this view.</p>}
      </div>
    </div>
  );
}
