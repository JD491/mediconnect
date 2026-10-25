import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch, FiX, FiAlertTriangle, FiActivity, FiFileText, FiPlus,
  FiPrinter, FiHeart, FiUser,
} from 'react-icons/fi';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { printPrescription } from '../../lib/prescriptionPrint';
import type { Database } from '../../types/database.types';
import type { DoctorPageProps } from '../../types/doctor';

type PatientRow = Database['public']['Tables']['patients']['Row'];
type VitalRow = Database['public']['Tables']['vitals']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];
type EPrescriptionRow = Database['public']['Tables']['e_prescriptions']['Row'];

const STATUS_STYLE: Record<PatientRow['status'], string> = {
  stable: 'bg-emerald-100 text-emerald-700',
  monitoring: 'bg-amber-100 text-amber-700',
  critical: 'bg-rose-100 text-rose-700',
  discharged: 'bg-slate-100 text-slate-600',
};

function vitalTone(v: VitalRow): 'critical' | 'watch' | 'ok' {
  if ((v.spo2 !== null && v.spo2 < 92) || (v.bp_systolic !== null && v.bp_systolic >= 160) || (v.heart_rate !== null && v.heart_rate > 120) || (v.temperature !== null && v.temperature >= 102)) return 'critical';
  if ((v.spo2 !== null && v.spo2 < 95) || (v.bp_systolic !== null && v.bp_systolic >= 140) || (v.heart_rate !== null && v.heart_rate > 100) || (v.temperature !== null && v.temperature >= 100)) return 'watch';
  return 'ok';
}

export default function Patients({ doctor }: DoctorPageProps) {
  const { user, profile: doctorProfile } = useAuth();
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<PatientRow | null>(null);
  const [vitals, setVitals] = useState<VitalRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [rx, setRx] = useState<EPrescriptionRow[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('patients').select('*').eq('primary_doctor_id', doctor.doctor_id).order('name');
    setPatients(data ?? []);
  }, [doctor.doctor_id]);

  useEffect(() => { load(); }, [load]);

  const openPatient = async (p: PatientRow) => {
    setActive(p);
    setDrawerLoading(true);
    setNoteDraft('');
    const [v, n, r] = await Promise.all([
      supabase.from('vitals').select('*').eq('patient_id', p.patient_id).order('recorded_at', { ascending: true }).limit(40),
      supabase.from('notes').select('*').eq('patient_id', p.patient_id).order('created_at', { ascending: false }).limit(20),
      p.profile_id
        ? supabase.from('e_prescriptions').select('*').or(`patient_profile_id.eq.${p.profile_id},patient_id.eq.${p.patient_id}`).order('created_at', { ascending: false }).limit(10)
        : supabase.from('e_prescriptions').select('*').eq('patient_id', p.patient_id).order('created_at', { ascending: false }).limit(10),
    ]);
    setVitals((v.data ?? []) as VitalRow[]);
    setNotes((n.data ?? []) as NoteRow[]);
    setRx((r.data ?? []) as unknown as EPrescriptionRow[]);
    setDrawerLoading(false);
  };

  const addNote = async () => {
    if (!active || !noteDraft.trim()) return;
    setSavingNote(true);
    await supabase.from('notes').insert({ patient_id: active.patient_id, created_by: user?.id ?? null, content: noteDraft.trim() });
    setNoteDraft('');
    const { data } = await supabase.from('notes').select('*').eq('patient_id', active.patient_id).order('created_at', { ascending: false }).limit(20);
    setNotes((data ?? []) as NoteRow[]);
    setSavingNote(false);
  };

  const filtered = useMemo(() => {
    const list = patients ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      p.name.toLowerCase().includes(q)
      || (p.room_number ?? '').toLowerCase().includes(q)
      || (p.blood_group ?? '').toLowerCase().includes(q)
      || p.status.includes(q));
  }, [patients, search]);

  const chartData = useMemo(() => vitals.map((v) => ({
    time: new Date(v.recorded_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }),
    systolic: v.bp_systolic,
    diastolic: v.bp_diastolic,
    heartRate: v.heart_rate,
    spo2: v.spo2,
    glucose: v.glucose,
  })), [vitals]);

  const latest = vitals[vitals.length - 1];

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b7088]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients, room, blood group…" className="input-field !pl-9" />
        </div>
        <span className="text-[11px] font-bold text-[#5b7088]">{filtered.length} patient{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {patients === null ? (
        <p className="text-sm text-[#5b7088]">Loading patient list…</p>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-sm text-[#5b7088]">No patients match “{search}”.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p, i) => (
            <motion.button key={p.patient_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              onClick={() => openPatient(p)} className="glass-card text-left card-hover">
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <p className="text-sm font-extrabold text-[#0f2340]">{p.name}</p>
                  <p className="text-[11px] text-[#5b7088]">{p.age ?? '—'} yrs · {p.gender ?? '—'} · {p.blood_group ?? '—'}</p>
                </div>
                <span className={`badge ${STATUS_STYLE[p.status]}`}>{p.status}</span>
              </div>
              <p className="text-[11px] text-[#5b7088]">{p.room_number ? `Room ${p.room_number}` : 'Outpatient'} · {p.phone ?? 'no phone'}</p>
              {p.allergies.length > 0 && (
                <p className="text-[11px] font-bold text-rose-600 mt-1.5 flex items-center gap-1"><FiAlertTriangle size={11} /> {p.allergies.join(', ')}</p>
              )}
              <div className="flex gap-2 mt-2 text-[11px] font-bold text-brand-600">
                <span className="flex items-center gap-1"><FiActivity size={11} /> EHR</span>
                <span className="flex items-center gap-1"><FiFileText size={11} /> Prescriptions</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex justify-end" role="dialog" aria-modal="true">
            <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}
              className="bg-white/95 backdrop-blur-xl w-full max-w-2xl h-full overflow-y-auto p-4 sm:p-6 shadow-2xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-extrabold text-[#0f2340]">{active.name}</h3>
                  <p className="text-xs text-[#5b7088]">
                    {active.age ?? '—'} yrs · {active.gender ?? '—'} · {active.blood_group ?? '—'} · {active.room_number ? `Room ${active.room_number}` : 'Outpatient'}
                  </p>
                  <p className="text-[11px] text-[#5b7088]">{active.phone ?? 'no phone'} · admitted {new Date(active.admitted_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => setActive(null)} aria-label="Close record"><FiX size={20} /></button>
              </div>

              {active.allergies.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 mb-4">
                  <p className="text-xs font-bold text-rose-600 flex items-center gap-1.5"><FiAlertTriangle /> Allergies: {active.allergies.join(', ')}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link to={`/app/doctor/write-prescription?patient=${active.profile_id ?? ''}`}
                  className={`btn-primary !py-1.5 !text-xs flex items-center gap-1.5 ${active.profile_id ? '' : 'pointer-events-none opacity-50'}`}>
                  <FiPlus /> New prescription
                </Link>
                {rx[0] && (
                  <button onClick={() => printPrescription({
                    id: rx[0]!.e_prescription_id, date: rx[0]!.created_at, doctorName: `Dr. ${doctorProfile?.name ?? 'Doctor'}`,
                    qualification: doctor.qualification, registrationNumber: doctor.registration_number, clinic: doctor.hospital_clinic,
                    patientName: active.name, patientAge: active.age, patientGender: active.gender, patientPhone: active.phone,
                    diagnosis: rx[0]!.diagnosis, advice: rx[0]!.advice, followUpDate: rx[0]!.follow_up_date,
                    vitals: rx[0]!.vitals, items: rx[0]!.items,
                  })} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1.5"><FiPrinter /> Print latest Rx</button>
                )}
              </div>

              {drawerLoading ? (
                <p className="text-sm text-[#5b7088]">Loading EHR…</p>
              ) : (
                <>
                  <div className="glass-card !bg-white/70 mb-4">
                    <h4 className="font-extrabold text-[#0f2340] mb-2 flex items-center gap-2"><FiHeart /> Vitals trend</h4>
                    {latest && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className={`badge ${vitalTone(latest) === 'critical' ? 'bg-rose-100 text-rose-700' : vitalTone(latest) === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          Latest: {latest.bp_systolic ?? '—'}/{latest.bp_diastolic ?? '—'} mmHg · HR {latest.heart_rate ?? '—'} · SpO₂ {latest.spo2 ?? '—'}%
                        </span>
                        <span className="badge bg-slate-100 text-slate-600">{latest.temperature ?? '—'}°F · {latest.glucose ?? '—'} mg/dL</span>
                      </div>
                    )}
                    {chartData.length >= 2 ? (
                      <ResponsiveContainer width="100%" height={190}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="time" fontSize={9} interval="preserveStartEnd" />
                          <YAxis fontSize={10} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line type="monotone" dataKey="systolic" stroke="#e11d48" strokeWidth={2} dot={false} name="Systolic" />
                          <Line type="monotone" dataKey="diastolic" stroke="#f59e0b" strokeWidth={2} dot={false} name="Diastolic" />
                          <Line type="monotone" dataKey="heartRate" stroke="#2563eb" strokeWidth={2} dot={false} name="Heart rate" />
                          <Line type="monotone" dataKey="spo2" stroke="#059669" strokeWidth={2} dot={false} name="SpO₂" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-[#5b7088]">Not enough vitals recorded to chart a trend.</p>
                    )}
                  </div>

                  <div className="glass-card !bg-white/70 mb-4">
                    <h4 className="font-extrabold text-[#0f2340] mb-2 flex items-center gap-2"><FiFileText /> E-prescriptions</h4>
                    {rx.length === 0 && <p className="text-xs text-[#5b7088]">No e-prescriptions issued yet.</p>}
                    <div className="space-y-2">
                      {rx.map((r) => (
                        <div key={r.e_prescription_id} className="p-2.5 rounded-lg bg-white border border-slate-100">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-[#0f2340]">MC-RX-{r.e_prescription_id} · {new Date(r.created_at).toLocaleDateString()}</p>
                            <button onClick={() => printPrescription({
                              id: r.e_prescription_id, date: r.created_at, doctorName: `Dr. ${doctorProfile?.name ?? 'Doctor'}`,
                              qualification: doctor.qualification, registrationNumber: doctor.registration_number, clinic: doctor.hospital_clinic,
                              patientName: active.name, patientAge: active.age, patientGender: active.gender, patientPhone: active.phone,
                              diagnosis: r.diagnosis, advice: r.advice, followUpDate: r.follow_up_date, vitals: r.vitals, items: r.items,
                            })} aria-label="Print prescription" className="text-brand-600"><FiPrinter size={13} /></button>
                          </div>
                          <p className="text-[11px] text-[#33475b]">{r.diagnosis}</p>
                          <ul className="text-[10px] text-[#5b7088] mt-1 list-disc list-inside">
                            {r.items.map((it, idx) => <li key={idx}>{it.medicine_name} · {it.dosage} · {it.duration}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card !bg-white/70">
                    <h4 className="font-extrabold text-[#0f2340] mb-2 flex items-center gap-2"><FiUser /> Clinical notes</h4>
                    <div className="flex gap-2 mb-3">
                      <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add observation to EHR…" className="input-field !py-1.5 !text-xs" />
                      <button onClick={addNote} disabled={savingNote || !noteDraft.trim()} className="btn-primary !py-1.5 !text-xs">Add</button>
                    </div>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {notes.map((n) => (
                        <p key={n.note_id} className="text-[11px] text-[#33475b] bg-white rounded-lg p-2 border border-slate-100">
                          <span className="text-[10px] text-[#7b8fa6] block">{new Date(n.created_at).toLocaleString()}</span>
                          {n.content}
                        </p>
                      ))}
                      {notes.length === 0 && <p className="text-xs text-[#5b7088]">No notes yet.</p>}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
