import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiFileText, FiCheck, FiX, FiExternalLink, FiEye } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { EmptyState } from '../../components/UIStates';
import type { StorePageProps } from '../../types/store';
import type { Database, ApprovalStatus } from '../../types/database.types';

type PrescriptionRow = Database['public']['Tables']['prescriptions']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];

interface PrescriptionWithCustomerAndOrder extends PrescriptionRow {
  customer: Pick<ProfileRow, 'name' | 'phone'> | null;
  order: Pick<OrderRow, 'order_id' | 'total_amount'> | null;
}

type FilterKey = ApprovalStatus | 'all';

const TONES: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-700', under_review: 'bg-brand-100 text-brand-700',
  approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-600',
  expired: 'bg-slate-200 text-slate-600', suspended: 'bg-slate-200 text-slate-600',
};

const REVIEWABLE_STATUSES: ApprovalStatus[] = ['pending', 'under_review'];

export default function Prescriptions({ store }: StorePageProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PrescriptionWithCustomerAndOrder[]>([]);
  const [filter, setFilter] = useState<FilterKey>('pending');
  const [rejecting, setRejecting] = useState<PrescriptionWithCustomerAndOrder | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    // Lazily finalize any prescriptions that have sat pending for >7 days — no
    // pg_cron dependency assumed, so this runs opportunistically on page load.
    await supabase.rpc('expire_stale_prescriptions');

    let q = supabase
      .from('prescriptions')
      .select('*, customer:profiles!customer_id(name, phone), order:orders(order_id, total_amount)')
      .eq('store_id', store.store_id)
      .eq('superseded', false)
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setRows((data ?? []) as unknown as PrescriptionWithCustomerAndOrder[]);
  }, [store.store_id, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const view = async (row: PrescriptionWithCustomerAndOrder) => {
    const { data } = await supabase.storage.from('prescriptions').createSignedUrl(row.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };

  const markUnderReview = async (row: PrescriptionWithCustomerAndOrder) => {
    await supabase.from('prescriptions').update({ status: 'under_review' }).eq('prescription_id', row.prescription_id);
    load();
  };

  const approve = async (row: PrescriptionWithCustomerAndOrder) => {
    if (!user) return;
    await supabase.from('prescriptions')
      .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('prescription_id', row.prescription_id);
    load();
  };

  const reject = async () => {
    if (!reason.trim() || !rejecting || !user) return;
    await supabase.from('prescriptions')
      .update({ status: 'rejected', rejection_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('prescription_id', rejecting.prescription_id);
    setRejecting(null);
    setReason('');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {(['pending', 'under_review', 'approved', 'rejected', 'expired', 'all'] as FilterKey[]).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-xs font-bold rounded-xl px-3 py-2 capitalize transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b] hover:bg-white/90'}`}>
            {s.replaceAll('_', ' ')}
          </button>
        ))}
      </div>

      <div className="glass-card space-y-2">
        {rows.length === 0 && <EmptyState icon={FiFileText} title="No prescriptions in this view" />}
        {rows.map((r, i) => (
          <motion.div key={r.prescription_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="p-3 rounded-xl bg-white/50 border border-white/40">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-[#0f2340] flex items-center gap-2">
                  <FiFileText className="text-brand-500" /> Order #{r.order?.order_id} · {r.customer?.name}
                </p>
                <p className="text-[11px] text-[#5b7088]">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <span className={`badge ${TONES[r.status]}`}>{r.status.replaceAll('_', ' ')}</span>
            </div>
            {r.status === 'rejected' && r.rejection_reason && <p className="text-xs text-rose-500 mb-2">Reason: {r.rejection_reason}</p>}
            {r.status === 'expired' && <p className="text-xs text-[#5b7088] mb-2">This prescription expired before review — the customer will need to re-upload.</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => view(r)} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1"><FiExternalLink /> View file</button>
              {r.status === 'pending' && (
                <button onClick={() => markUnderReview(r)} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1"><FiEye /> Mark Under Review</button>
              )}
              {REVIEWABLE_STATUSES.includes(r.status) && (
                <>
                  <button onClick={() => approve(r)} className="btn-primary !py-1.5 !text-xs flex items-center gap-1"><FiCheck /> Approve</button>
                  <button onClick={() => setRejecting(r)} className="btn-ghost !py-1.5 !text-xs !text-rose-500 flex items-center gap-1"><FiX /> Reject</button>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {rejecting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
          <div className="glass-card w-full max-w-sm">
            <h3 className="font-extrabold text-[#0f2340] mb-3">Reject prescription</h3>
            <label htmlFor="rx-reject-reason" className="sr-only">Rejection reason</label>
            <textarea id="rx-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. unclear image, wrong medicine)..." className="input-field mb-3" rows={3} />
            <div className="flex gap-2">
              <button onClick={() => setRejecting(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={reject} className="btn-primary flex-1 !bg-rose-500">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
