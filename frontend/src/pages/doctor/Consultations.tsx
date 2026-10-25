import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiVideo, FiMapPin, FiCalendar, FiClock, FiX, FiCheckCircle, FiCreditCard,
  FiFileText, FiAlertTriangle, FiChevronRight, FiMonitor,
} from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { generatePaymentRef } from '../../lib/payments';
import type { Database } from '../../types/database.types';
import type { DoctorPageProps } from '../../types/doctor';

type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
type AppointmentStatus = AppointmentRow['status'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface AppointmentWithPatient extends AppointmentRow {
  patient: Pick<ProfileRow, 'name' | 'phone' | 'date_of_birth' | 'gender' | 'allergies'> | null;
}

type TabKey = 'today' | 'upcoming' | 'completed' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
  no_show: 'bg-slate-100 text-slate-600',
};

function triageTone(triage: string | null): string {
  if (!triage) return 'bg-slate-100 text-slate-600';
  if (/critical|emergency|urgent|severe/i.test(triage)) return 'bg-rose-100 text-rose-700';
  if (/priority|moderate|watch/i.test(triage)) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Consultations({ doctor }: DoctorPageProps) {
  const [appts, setAppts] = useState<AppointmentWithPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('today');
  const [detail, setDetail] = useState<AppointmentWithPatient | null>(null);
  const [triageDraft, setTriageDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [room, setRoom] = useState<{ appt: AppointmentWithPatient; link: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('appointments')
      .select('*, patient:profiles(name, phone, date_of_birth, gender, allergies)')
      .eq('doctor_id', doctor.doctor_id)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });
    setAppts((data ?? []) as unknown as AppointmentWithPatient[]);
    setLoading(false);
  }, [doctor.doctor_id]);

  useEffect(() => {
    load();
    const channel = supabase.channel('doctor-consultations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctor.doctor_id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, doctor.doctor_id]);

  const openDetail = (a: AppointmentWithPatient) => {
    setDetail(a);
    setTriageDraft(a.triage ?? '');
    setNotesDraft(a.notes ?? '');
    setError('');
    setMessage('');
  };

  const patch = async (a: AppointmentWithPatient, values: Partial<AppointmentRow>, note: string) => {
    setBusyId(a.appointment_id);
    setError('');
    const { error: err } = await supabase.from('appointments').update(values).eq('appointment_id', a.appointment_id);
    if (err) setError(err.message);
    else {
      setMessage(note);
      setDetail((d) => (d && d.appointment_id === a.appointment_id ? { ...d, ...values } as AppointmentWithPatient : d));
    }
    setBusyId(null);
    load();
  };

  const collectAtCounter = async (a: AppointmentWithPatient) => {
    const reference = generatePaymentRef('clinic');
    await patch(
      a,
      { payment_method: 'clinic_counter', payment_status: 'paid', payment_ref: reference, status: a.status === 'pending' ? 'confirmed' : a.status },
      `Counter payment collected · ${reference}`,
    );
  };

  const startConsult = (a: AppointmentWithPatient) => {
    if (a.consultation_mode === 'online') {
      const link = a.meeting_link || `https://meet.jit.si/MediConnect-${a.appointment_id}-${Math.random().toString(36).slice(2, 8)}`;
      setRoom({ appt: a, link });
      if (!a.meeting_link) {
        supabase.from('appointments').update({ meeting_link: link }).eq('appointment_id', a.appointment_id).then(load);
      }
    } else {
      setMessage(`In-person consultation started for ${a.patient?.name ?? 'patient'} — room ${a.appointment_id}.`);
      if (a.status === 'pending') patch(a, { status: 'confirmed' }, 'Appointment confirmed.');
    }
  };

  const saveTriage = async () => {
    if (!detail) return;
    await patch(detail, { triage: triageDraft || null, notes: notesDraft || null }, 'Triage notes saved.');
  };

  const counts = useMemo(() => {
    const today = todayStr();
    return {
      today: appts.filter((a) => a.appointment_date === today && a.status !== 'cancelled').length,
      upcoming: appts.filter((a) => a.appointment_date > today && ['pending', 'confirmed'].includes(a.status)).length,
      completed: appts.filter((a) => a.status === 'completed').length,
      unpaid: appts.filter((a) => a.payment_status === 'cod_pending' || a.payment_status === 'pending' || a.payment_status === 'failed').length,
    };
  }, [appts]);

  const visible = useMemo(() => {
    const today = todayStr();
    switch (tab) {
      case 'today': return appts.filter((a) => a.appointment_date === today && a.status !== 'cancelled');
      case 'upcoming': return appts.filter((a) => a.appointment_date > today && ['pending', 'confirmed'].includes(a.status));
      case 'completed': return appts.filter((a) => a.status === 'completed');
      default: return appts;
    }
  }, [appts, tab]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Today', value: counts.today, icon: FiCalendar },
          { label: 'Upcoming', value: counts.upcoming, icon: FiClock },
          { label: 'Completed', value: counts.completed, icon: FiCheckCircle },
          { label: 'Payment due', value: counts.unpaid, icon: FiCreditCard },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card flex items-center gap-3 !py-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-white flex items-center justify-center"><Icon /></div>
            <div><p className="text-lg font-extrabold text-[#0f2340] leading-tight">{value}</p><p className="text-[11px] font-bold text-[#5b7088]">{label}</p></div>
          </div>
        ))}
      </div>

      <div className="glass-card flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-xs font-bold rounded-xl px-3 py-2 transition-colors ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b] hover:bg-white/90'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {message && <p className="text-xs font-semibold text-emerald-600">{message}</p>}
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}

      <div className="glass-card space-y-2">
        {loading && <p className="text-sm text-[#5b7088]">Loading consultations…</p>}
        {!loading && visible.length === 0 && <p className="text-sm text-[#5b7088]">No consultations in this view.</p>}
        {visible.map((a, i) => (
          <motion.div key={a.appointment_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="p-3 rounded-xl bg-white/55 border border-white/50">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button onClick={() => openDetail(a)} className="text-left min-w-0">
                <p className="text-sm font-extrabold text-[#0f2340] flex items-center gap-2">
                  {a.patient?.name ?? 'Patient'}
                  <span className={`badge ${a.consultation_mode === 'online' ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {a.consultation_mode === 'online' ? <><FiVideo size={10} /> Video</> : <><FiMapPin size={10} /> In-person</>}
                  </span>
                </p>
                <p className="text-[11px] text-[#5b7088]">
                  {a.appointment_date} · {a.appointment_time.slice(0, 5)} · {a.reason || 'General consultation'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className={`badge ${STATUS_STYLE[a.status]}`}>{a.status.replaceAll('_', ' ')}</span>
                  <span className={`badge ${a.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : a.payment_status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.payment_method.replaceAll('_', ' ')} · {a.payment_status.replaceAll('_', ' ')}
                  </span>
                  {a.triage && <span className={`badge ${triageTone(a.triage)}`}><FiAlertTriangle size={10} /> {a.triage.length > 34 ? `${a.triage.slice(0, 34)}…` : a.triage}</span>}
                </div>
              </button>

              <div className="flex flex-wrap gap-1.5 justify-end">
                {a.status === 'pending' && (
                  <button disabled={busyId === a.appointment_id} onClick={() => patch(a, { status: 'confirmed' }, 'Appointment confirmed.')} className="btn-ghost !py-1 !px-2 !text-[11px]">Confirm</button>
                )}
                {['pending', 'confirmed'].includes(a.status) && (
                  <button onClick={() => startConsult(a)} className="btn-primary !py-1 !px-2 !text-[11px] flex items-center gap-1">
                    <FiMonitor /> {a.consultation_mode === 'online' ? 'Join video' : 'Start visit'}
                  </button>
                )}
                {['pending', 'confirmed'].includes(a.status) && (a.payment_status === 'cod_pending' || a.payment_status === 'pending' || a.payment_status === 'failed') && (a.payment_method === 'clinic_counter' || a.payment_method === 'cod') && (
                  <button disabled={busyId === a.appointment_id} onClick={() => collectAtCounter(a)} className="btn-ghost !py-1 !px-2 !text-[11px] flex items-center gap-1">
                    <FiCreditCard /> Collect ₹{doctor.consultation_fee}
                  </button>
                )}
                {['pending', 'confirmed'].includes(a.status) && (
                  <Link to={`/app/doctor/write-prescription?appointment=${a.appointment_id}&patient=${a.patient_id}`} className="btn-ghost !py-1 !px-2 !text-[11px] flex items-center gap-1">
                    <FiFileText /> Prescribe
                  </Link>
                )}
                {['pending', 'confirmed'].includes(a.status) && (
                  <button onClick={() => patch(a, { status: 'completed' }, 'Consultation completed.')} className="btn-ghost !py-1 !px-2 !text-[11px] !text-emerald-600">Complete</button>
                )}
                <button onClick={() => openDetail(a)} aria-label="Open consultation" className="btn-ghost !py-1 !px-1.5 !text-[11px]"><FiChevronRight /></button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {detail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-extrabold text-[#0f2340]">{detail.patient?.name ?? 'Patient'}</h3>
                  <p className="text-[11px] text-[#5b7088]">{detail.patient?.phone} · {detail.appointment_date} at {detail.appointment_time.slice(0, 5)}</p>
                </div>
                <button onClick={() => setDetail(null)} aria-label="Close"><FiX /></button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="p-2 rounded-lg bg-white/60"><p className="text-[10px] uppercase font-bold text-[#5b7088]">Reason</p><p className="text-[#0f2340]">{detail.reason || 'General consultation'}</p></div>
                <div className="p-2 rounded-lg bg-white/60"><p className="text-[10px] uppercase font-bold text-[#5b7088]">Payment</p><p className="text-[#0f2340]">{detail.payment_method.replaceAll('_', ' ')} · {detail.payment_status.replaceAll('_', ' ')}</p></div>
                <div className="p-2 rounded-lg bg-white/60"><p className="text-[10px] uppercase font-bold text-[#5b7088]">Mode</p><p className="text-[#0f2340]">{detail.consultation_mode}</p></div>
                <div className="p-2 rounded-lg bg-white/60"><p className="text-[10px] uppercase font-bold text-[#5b7088]">Reference</p><p className="text-[#0f2340] font-mono text-[11px]">{detail.payment_ref || '—'}</p></div>
              </div>

              {(detail.patient?.allergies?.length ?? 0) > 0 && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 mb-3">
                  <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5"><FiAlertTriangle /> Allergies: {detail.patient?.allergies.join(', ')}</p>
                </div>
              )}

              <label className="block text-[11px] font-bold text-[#5b7088] mb-1">Triage / clinical summary</label>
              <textarea value={triageDraft} onChange={(e) => setTriageDraft(e.target.value)} rows={2} className="input-field mb-3" placeholder="e.g. Priority — intermittent palpitations, stable vitals" />
              <label className="block text-[11px] font-bold text-[#5b7088] mb-1">Consultation notes</label>
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} className="input-field mb-3" placeholder="Findings, advice, follow-up…" />
              <div className="flex flex-wrap gap-2">
                <button onClick={saveTriage} className="btn-primary flex-1 min-w-[140px]">Save Triage</button>
                <Link to={`/app/doctor/write-prescription?appointment=${detail.appointment_id}&patient=${detail.patient_id}`} className="btn-ghost flex-1 min-w-[140px] flex items-center justify-center gap-1.5">
                  <FiFileText /> Write Prescription
                </Link>
              </div>
              {detail.consultation_mode === 'online' && (
                <button onClick={() => startConsult(detail)} className="btn-ghost w-full mt-2 flex items-center justify-center gap-1.5">
                  <FiVideo /> Open video room
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {room && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-6 z-50" role="dialog" aria-modal="true">
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              className="bg-[#0b1424] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2.5 text-white">
                <div>
                  <p className="text-sm font-bold">Video consultation · {room.appt.patient?.name}</p>
                  <p className="text-[10px] text-white/60">{room.appt.payment_status === 'paid' ? 'Prepaid' : 'Payment pending'} · Jitsi secure room</p>
                </div>
                <button onClick={() => setRoom(null)} aria-label="Close video" className="text-white/80 hover:text-white"><FiX size={20} /></button>
              </div>
              <iframe
                title={`Video consultation with ${room.appt.patient?.name ?? 'patient'}`}
                src={`${room.link}#config.prejoinPageEnabled=false&config.startWithAudioMuted=true`}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                className="w-full h-[65vh] bg-black"
              />
              <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 justify-between">
                <p className="text-[11px] text-white/60">If the embedded room is blocked by your browser, open it in a new tab.</p>
                <div className="flex gap-2">
                  <a href={room.link} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-white/90 underline">Open in new tab</a>
                  <button onClick={() => { setRoom(null); setMessage('Video consultation ended.'); }} className="text-[11px] font-bold text-emerald-400">End call</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
