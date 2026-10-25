import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiFileText, FiExternalLink, FiUpload, FiAlertCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { PageLoader, EmptyState } from '../../components/UIStates';
import type { ApprovalStatus } from '../../types/database.types';
import type { PrescriptionWithStoreAndOrder } from '../../types/orders';

const TONES: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-700', under_review: 'bg-brand-100 text-brand-700',
  approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-600',
  expired: 'bg-slate-200 text-slate-600', suspended: 'bg-slate-200 text-slate-600',
};

const REUPLOADABLE_STATUSES: ApprovalStatus[] = ['rejected', 'expired'];
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function Prescriptions() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PrescriptionWithStoreAndOrder[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('prescriptions')
      .select('*, store:stores(store_name), order:orders(order_id)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    setRows((data ?? []) as unknown as PrescriptionWithStoreAndOrder[]);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const view = async (row: PrescriptionWithStoreAndOrder) => {
    const { data } = await supabase.storage.from('prescriptions').createSignedUrl(row.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };

  const reupload = async (row: PrescriptionWithStoreAndOrder, file: File | undefined) => {
    setError('');
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return setError('File too large — max 5MB.');
    if (!ALLOWED_TYPES.includes(file.type)) return setError('Only PDF, JPG, PNG or WebP files are accepted.');

    setBusy(true);
    try {
      const path = `${row.store_id}/${row.order_id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('prescriptions').upload(path, file);
      if (uploadErr) throw uploadErr;

      await supabase.from('prescriptions').update({ superseded: true }).eq('prescription_id', row.prescription_id);
      const { error: insertErr } = await supabase.from('prescriptions').insert({
        order_id: row.order_id, customer_id: user.id, store_id: row.store_id, file_path: path,
      });
      if (insertErr) throw insertErr;

      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not re-upload prescription.');
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) return <PageLoader label="Loading your prescriptions..." />;

  if (rows.length === 0) {
    return <EmptyState icon={FiFileText} title="No prescriptions yet" description="Prescriptions you upload at checkout will appear here for tracking." />;
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <motion.div key={r.prescription_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-bold text-[#0f2340] flex items-center gap-2">
                <FiFileText className="text-brand-500" /> {r.store?.store_name} · Order #{r.order?.order_id}
              </p>
              <p className="text-[11px] text-[#5b7088]">Uploaded {new Date(r.created_at).toLocaleString()}</p>
            </div>
            <span className={`badge ${TONES[r.status]}`}>{r.status.replaceAll('_', ' ')}{r.superseded ? ' (replaced)' : ''}</span>
          </div>

          {r.status === 'rejected' && r.rejection_reason && (
            <p className="text-xs text-rose-500 mb-2 flex items-start gap-1"><FiAlertCircle className="mt-0.5 shrink-0" /> {r.rejection_reason}</p>
          )}
          {r.status === 'expired' && (
            <p className="text-xs text-[#5b7088] mb-2 flex items-start gap-1"><FiAlertCircle className="mt-0.5 shrink-0" /> This prescription expired before the pharmacy could review it.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => view(r)} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1"><FiExternalLink /> View</button>
            {!r.superseded && REUPLOADABLE_STATUSES.includes(r.status) && (
              <label className="btn-primary !py-1.5 !text-xs inline-flex items-center gap-1 cursor-pointer">
                <FiUpload /> Re-upload
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                  onChange={(e) => reupload(r, e.target.files?.[0])} disabled={busy} />
              </label>
            )}
          </div>
        </motion.div>
      ))}
      {error && <p className="text-rose-500 text-xs font-semibold" role="alert">{error}</p>}
    </div>
  );
}
