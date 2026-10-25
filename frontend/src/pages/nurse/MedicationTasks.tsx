import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheckCircle, FiClock, FiAlertTriangle, FiPlus, FiX, FiCreditCard,
  FiUserPlus, FiActivity, FiRefreshCw,
} from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { generatePaymentRef } from '../../lib/payments';
import type { Database, TaskPriority, TaskStatus } from '../../types/database.types';

type TaskRow = Database['public']['Tables']['tasks']['Row'];
type PatientRow = Database['public']['Tables']['patients']['Row'];

interface TaskWithPatient extends TaskRow {
  patient: Pick<PatientRow, 'name' | 'room_number'> | null;
}

type TabKey = 'pending' | 'administered' | 'escalated' | 'walkins';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'Pending MAR' },
  { key: 'administered', label: 'Administered' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'walkins', label: 'Walk-ins & fees' },
];

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700', urgent: 'bg-rose-100 text-rose-700',
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  pending: 'bg-amber-100 text-amber-700', in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-emerald-100 text-emerald-700', escalated: 'bg-rose-100 text-rose-700',
};

function timeLabel(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MedicationTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithPatient[] | null>(null);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [tab, setTab] = useState<TabKey>('pending');
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [escalate, setEscalate] = useState<TaskWithPatient | null>(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkIn, setWalkIn] = useState({ patient_id: '', title: '', fee: '', dosage: '' });

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('tasks').select('*, patient:patients(name, room_number)')
      .eq('assigned_to', user.id).order('scheduled_at', { ascending: true });
    setTasks((data ?? []) as unknown as TaskWithPatient[]);
    const { data: ps } = await supabase.from('patients').select('*').neq('status', 'discharged').order('name');
    setPatients((ps ?? []) as PatientRow[]);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase.channel('nurse-mar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, user]);

  const patch = async (task: TaskWithPatient, values: Partial<TaskRow>, note: string) => {
    setBusy(task.task_id);
    setError('');
    const { error: err } = await supabase.from('tasks').update(values).eq('task_id', task.task_id);
    if (err) setError(err.message);
    else setMessage(note);
    setBusy(null);
    load();
  };

  const administer = async (task: TaskWithPatient) => {
    await patch(task, { status: 'done', administered_at: new Date().toISOString(), escalated_reason: null },
      `${task.medication_name ?? task.title} administered to ${task.patient?.name ?? 'patient'}.`);
    if (user && task.patient_id) {
      await supabase.from('notes').insert({
        patient_id: task.patient_id, created_by: user.id,
        content: `MAR: ${task.medication_name ?? task.title} ${task.dosage ?? ''} administered at ${new Date().toLocaleTimeString()}.`,
      });
    }
  };

  const start = async (task: TaskWithPatient) => {
    await patch(task, { status: 'in_progress' }, `${task.title} started.`);
  };

  const submitEscalation = async () => {
    if (!escalate || !escalateReason.trim()) return;
    await patch(escalate, { status: 'escalated', escalated_reason: escalateReason.trim() },
      `${escalate.title} escalated to the doctor.`);
    setEscalate(null);
    setEscalateReason('');
  };

  const reopen = async (task: TaskWithPatient) => {
    await patch(task, { status: 'pending', escalated_reason: null }, `${task.title} returned to the pending MAR.`);
  };

  const verifyFee = async (task: TaskWithPatient) => {
    const reference = generatePaymentRef('clinic');
    await patch(task, { fee_verified: true, fee_ref: reference, status: 'done', administered_at: new Date().toISOString() },
      `Walk-in fee ₹${task.fee_amount ?? 0} verified · ${reference}`);
  };

  const addWalkIn = async () => {
    if (!user) return;
    if (!walkIn.title.trim()) { setError('Add a procedure or walk-in description.'); return; }
    const p = patients.find((x) => x.patient_id === Number(walkIn.patient_id));
    const { error: err } = await supabase.from('tasks').insert({
      patient_id: p?.patient_id ?? null, assigned_to: user.id, created_by: user.id,
      title: walkIn.title.trim(), description: p ? `Walk-in for ${p.name}` : 'Walk-in patient',
      status: 'in_progress', priority: 'medium', due_at: new Date().toISOString(), created_at: new Date().toISOString(),
      task_type: 'walk_in', medication_name: walkIn.dosage || null, dosage: walkIn.dosage || null,
      scheduled_at: new Date().toISOString(), administered_at: null, escalated_reason: null,
      fee_amount: walkIn.fee ? Number(walkIn.fee) : null, fee_verified: false, fee_ref: null,
    });
    if (err) { setError(err.message); return; }
    setShowWalkIn(false);
    setWalkIn({ patient_id: '', title: '', fee: '', dosage: '' });
    setMessage('Walk-in added — collect and verify the fee once paid.');
    setTab('walkins');
    load();
  };

  const counts = useMemo(() => {
    const list = tasks ?? [];
    return {
      pending: list.filter((t) => t.status === 'pending' || t.status === 'in_progress').length,
      administered: list.filter((t) => t.status === 'done').length,
      escalated: list.filter((t) => t.status === 'escalated').length,
      walkins: list.filter((t) => t.task_type === 'walk_in').length,
      feesDue: list.filter((t) => t.task_type === 'walk_in' && !t.fee_verified && (t.fee_amount ?? 0) > 0).length,
    };
  }, [tasks]);

  const visible = useMemo(() => {
    const list = tasks ?? [];
    switch (tab) {
      case 'pending': return list.filter((t) => t.status === 'pending' || t.status === 'in_progress');
      case 'administered': return list.filter((t) => t.status === 'done' && t.task_type !== 'walk_in');
      case 'escalated': return list.filter((t) => t.status === 'escalated');
      case 'walkins': return list.filter((t) => t.task_type === 'walk_in');
      default: return list;
    }
  }, [tasks, tab]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Due now', value: counts.pending, icon: FiClock },
          { label: 'Administered', value: counts.administered, icon: FiCheckCircle },
          { label: 'Escalated', value: counts.escalated, icon: FiAlertTriangle },
          { label: 'Fees to verify', value: counts.feesDue, icon: FiCreditCard },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card flex items-center gap-3 !py-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-white flex items-center justify-center"><Icon /></div>
            <div><p className="text-lg font-extrabold text-[#0f2340] leading-tight">{value}</p><p className="text-[11px] font-bold text-[#5b7088]">{label}</p></div>
          </div>
        ))}
      </div>

      <div className="glass-card flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-xs font-bold rounded-xl px-3 py-2 transition-colors ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b] hover:bg-white/90'}`}>
            {t.label}
            {t.key === 'walkins' && counts.walkins > 0 ? ` (${counts.walkins})` : ''}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1.5"><FiRefreshCw /> Refresh</button>
          <button onClick={() => setShowWalkIn(true)} className="btn-primary !py-1.5 !text-xs flex items-center gap-1.5"><FiUserPlus /> Add walk-in</button>
        </div>
      </div>

      {message && <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5"><FiCheckCircle /> {message}</p>}
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}

      <div className="glass-card space-y-2">
        {tasks === null && <p className="text-sm text-[#5b7088]">Loading medication rounds…</p>}
        {tasks !== null && visible.length === 0 && (
          <p className="text-sm text-[#5b7088]">
            {tab === 'pending' ? 'No medication due — the MAR is clear.' : tab === 'escalated' ? 'No escalated tasks.' : 'Nothing in this view.'}
          </p>
        )}
        {visible.map((t, i) => (
          <motion.div key={t.task_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="p-3 rounded-xl bg-white/55 border border-white/50">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#0f2340] flex items-center gap-2 flex-wrap">
                  {t.medication_name ?? t.title}
                  <span className={`badge ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                  <span className={`badge ${STATUS_STYLE[t.status]}`}>{t.status.replaceAll('_', ' ')}</span>
                </p>
                <p className="text-[11px] text-[#5b7088]">
                  {t.patient?.name ?? 'Walk-in'}{t.patient?.room_number ? ` · Room ${t.patient.room_number}` : ''} · {t.task_type.replaceAll('_', ' ')}
                  {t.dosage ? ` · ${t.dosage}` : ''}
                </p>
                <p className="text-[11px] text-[#5b7088]">Scheduled {timeLabel(t.scheduled_at ?? t.due_at)}</p>
                {t.dosage && t.medication_name && <p className="text-[11px] text-[#33475b]">Ordered: {t.medication_name} — {t.dosage}</p>}
                {t.escalated_reason && <p className="text-[11px] text-rose-600 font-semibold mt-1">Escalated: {t.escalated_reason}</p>}
                {t.task_type === 'walk_in' && (t.fee_amount ?? 0) > 0 && (
                  <p className="text-[11px] mt-1">
                    Fee ₹{t.fee_amount}
                    {t.fee_verified
                      ? <span className="ml-2 text-emerald-600 font-bold">✓ Verified {t.fee_ref ?? ''}</span>
                      : <span className="ml-2 text-amber-600 font-bold">Awaiting verification</span>}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 justify-end">
                {t.status === 'pending' && (
                  <button disabled={busy === t.task_id} onClick={() => start(t)} className="btn-ghost !py-1 !px-2 !text-[11px]">Start</button>
                )}
                {t.status !== 'done' && (
                  <button disabled={busy === t.task_id} onClick={() => administer(t)} className="btn-primary !py-1 !px-2 !text-[11px] flex items-center gap-1">
                    <FiCheckCircle /> Administer
                  </button>
                )}
                {t.status !== 'done' && t.status !== 'escalated' && (
                  <button onClick={() => { setEscalate(t); setEscalateReason(''); }} className="btn-ghost !py-1 !px-2 !text-[11px] !text-rose-500 flex items-center gap-1">
                    <FiAlertTriangle /> Escalate
                  </button>
                )}
                {t.status === 'escalated' && (
                  <button onClick={() => reopen(t)} className="btn-ghost !py-1 !px-2 !text-[11px]">Reopen</button>
                )}
                {t.task_type === 'walk_in' && (t.fee_amount ?? 0) > 0 && !t.fee_verified && (
                  <button onClick={() => verifyFee(t)} className="btn-primary !py-1 !px-2 !text-[11px] flex items-center gap-1">
                    <FiCreditCard /> Verify ₹{t.fee_amount}
                  </button>
                )}
                {t.status === 'done' && <span className="text-[10px] text-[#5b7088] self-center">{timeLabel(t.administered_at)}</span>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {escalate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card w-full max-w-md">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-extrabold text-[#0f2340] text-sm">Escalate task</h3>
                <button onClick={() => setEscalate(null)} aria-label="Close"><FiX /></button>
              </div>
              <p className="text-xs text-[#5b7088] mb-2">{escalate.medication_name ?? escalate.title} · {escalate.patient?.name ?? 'Walk-in'}</p>
              <textarea value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} rows={3}
                placeholder="Reason (e.g. patient refused, BP too low, medication unavailable…)" className="input-field mb-2" />
              <div className="flex gap-2">
                <button onClick={() => setEscalate(null)} className="btn-ghost flex-1 !py-1.5 !text-xs">Cancel</button>
                <button onClick={submitEscalation} disabled={!escalateReason.trim()} className="btn-primary flex-1 !py-1.5 !text-xs !bg-rose-500">Escalate to doctor</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWalkIn && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card w-full max-w-md">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-extrabold text-[#0f2340] text-sm flex items-center gap-1.5"><FiActivity /> New walk-in</h3>
                <button onClick={() => setShowWalkIn(false)} aria-label="Close"><FiX /></button>
              </div>
              <div className="space-y-2">
                <select value={walkIn.patient_id} onChange={(e) => setWalkIn((w) => ({ ...w, patient_id: e.target.value }))} className="input-field !py-2 text-sm">
                  <option value="">— Walk-in (not registered) —</option>
                  {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.name}{p.room_number ? ` · Room ${p.room_number}` : ''}</option>)}
                </select>
                <input value={walkIn.title} onChange={(e) => setWalkIn((w) => ({ ...w, title: e.target.value }))} placeholder="Procedure (e.g. dressing change, injection)" className="input-field !py-2 text-sm" />
                <input value={walkIn.dosage} onChange={(e) => setWalkIn((w) => ({ ...w, dosage: e.target.value }))} placeholder="Medicine / consumable (optional)" className="input-field !py-2 text-sm" />
                <input value={walkIn.fee} onChange={(e) => setWalkIn((w) => ({ ...w, fee: e.target.value }))} placeholder="Offline fee ₹" inputMode="decimal" className="input-field !py-2 text-sm" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setShowWalkIn(false)} className="btn-ghost flex-1 !py-1.5 !text-xs">Cancel</button>
                <button onClick={addWalkIn} className="btn-primary flex-1 !py-1.5 !text-xs"><FiPlus /> Add walk-in</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
