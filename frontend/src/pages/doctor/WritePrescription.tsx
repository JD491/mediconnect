import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FiSearch, FiPlus, FiTrash2, FiPrinter, FiSave, FiUser, FiActivity,
  FiAlertTriangle, FiChevronLeft, FiCheckCircle,
} from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { printPrescription } from '../../lib/prescriptionPrint';
import type { Database, EPrescriptionItem } from '../../types/database.types';
import type { DoctorPageProps } from '../../types/doctor';

type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
type PatientRow = Database['public']['Tables']['patients']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type EPrescriptionRow = Database['public']['Tables']['e_prescriptions']['Row'];

const DOSAGES = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', '1-1-0', 'SOS', '1 puff BD', '5 ml TDS'];
const DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '30 days'];

function ageFrom(dob: string | null): string {
  if (!dob) return '';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return Number.isFinite(years) && years > 0 ? String(years) : '';
}

interface VitalsDraft {
  temperature: string;
  bp_systolic: string;
  bp_diastolic: string;
  heart_rate: string;
  spo2: string;
  respiratory_rate: string;
  glucose: string;
  weight_kg: string;
}

const EMPTY_VITALS: VitalsDraft = {
  temperature: '', bp_systolic: '', bp_diastolic: '', heart_rate: '',
  spo2: '', respiratory_rate: '', glucose: '', weight_kg: '',
};

export default function WritePrescription({ doctor }: DoctorPageProps) {
  const { user, profile: doctorProfile } = useAuth();
  const [params] = useSearchParams();
  const appointmentId = Number(params.get('appointment') || 0) || null;
  const initialPatient = params.get('patient') || '';

  const [appointment, setAppointment] = useState<AppointmentRow | null>(null);
  const [profilePatient, setProfilePatient] = useState<ProfileRow | null>(null);
  const [inpatients, setInpatients] = useState<PatientRow[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientPhone, setPatientPhone] = useState('');

  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MedicineRow[]>([]);
  const [items, setItems] = useState<EPrescriptionItem[]>([]);
  const [manual, setManual] = useState('');
  const [manualDosage, setManualDosage] = useState('1-0-1');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<EPrescriptionRow | null>(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<EPrescriptionRow[]>([]);
  const [recentFor, setRecentFor] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (appointmentId) {
      const { data } = await supabase.from('appointments').select('*').eq('appointment_id', appointmentId).maybeSingle();
      setAppointment(data ?? null);
      if (data) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', data.patient_id).maybeSingle();
        if (p) applyProfile(p, data.patient_id, data.reason ?? '');
      }
    } else if (initialPatient) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', initialPatient).maybeSingle();
      if (p) applyProfile(p, initialPatient, '');
    }

    const { data: ip } = await supabase.from('patients').select('*').eq('primary_doctor_id', doctor.doctor_id).order('name');
    setInpatients(ip ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, initialPatient, doctor.doctor_id]);

  const applyProfile = (p: ProfileRow, profileId: string, reason: string) => {
    setProfilePatient(p);
    setPatientName(p.name);
    setPatientAge(ageFrom(p.date_of_birth));
    setPatientGender(p.gender ?? '');
    setPatientPhone(p.phone ?? '');
    setDiagnosis((d) => d || reason);
    setRecentFor(profileId);
    supabase.from('patients').select('*').eq('profile_id', profileId).maybeSingle().then(({ data }) => {
      if (data) setPatientId(data.patient_id);
    });
  };

  useEffect(() => { loadContext(); }, [loadContext]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const handle = setTimeout(async () => {
      const { data } = await supabase.from('medicines').select('*').ilike('name', `%${query.trim()}%`).eq('is_active', true).limit(8);
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!recentFor) { setRecent([]); return; }
    supabase.from('e_prescriptions').select('*').eq('doctor_id', doctor.doctor_id).eq('patient_profile_id', recentFor)
      .order('created_at', { ascending: false }).limit(4)
      .then(({ data }) => setRecent((data ?? []) as unknown as EPrescriptionRow[]));
  }, [recentFor, doctor.doctor_id, saved]);

  const addMedicine = (m: MedicineRow) => {
    if (items.some((i) => i.medicine_id === m.medicine_id)) return;
    setItems((list) => [...list, {
      medicine_id: m.medicine_id, medicine_name: m.name, dosage: '1-0-1', duration: '5 days', instructions: null,
    }]);
    setQuery('');
    setResults([]);
  };

  const addManual = () => {
    if (!manual.trim()) return;
    setItems((list) => [...list, {
      medicine_id: null, medicine_name: manual.trim(), dosage: manualDosage, duration: '5 days', instructions: null,
    }]);
    setManual('');
  };

  const updateItem = (index: number, patch: Partial<EPrescriptionItem>) => {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const filledVitals = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [key, raw] of Object.entries(vitals)) {
      const n = Number(raw);
      out[key] = raw.trim() && Number.isFinite(n) ? n : null;
    }
    return out;
  }, [vitals]);

  const ensurePatient = async (): Promise<number | null> => {
    if (patientId) return patientId;
    if (profilePatient?.id) {
      const { data: existing } = await supabase.from('patients').select('patient_id').eq('profile_id', profilePatient.id).maybeSingle();
      if (existing) { setPatientId(existing.patient_id); return existing.patient_id; }
      const { data: created } = await supabase.from('patients').insert({
        name: patientName, profile_id: profilePatient.id, primary_doctor_id: doctor.doctor_id,
        age: patientAge ? Number(patientAge) : null, gender: patientGender || null,
        phone: patientPhone || null, status: 'stable', blood_group: profilePatient.blood_group,
        allergies: profilePatient.allergies ?? [], admitted_at: new Date().toISOString(),
      }).select().maybeSingle();
      if (created) { setPatientId(created.patient_id); return created.patient_id; }
    }
    return null;
  };

  const save = async () => {
    setError('');
    if (!patientName.trim()) { setError('Choose a patient before saving.'); return; }
    if (!diagnosis.trim()) { setError('Add a diagnosis.'); return; }
    if (items.length === 0) { setError('Add at least one medicine.'); return; }
    setSaving(true);
    try {
      const pid = await ensurePatient();
      if (pid) {
        const hasVitals = Object.values(filledVitals).some((v) => v !== null);
        if (hasVitals) {
          await supabase.from('vitals').insert({
            patient_id: pid, recorded_by: user?.id ?? null, ...filledVitals, recorded_at: new Date().toISOString(),
          });
        }
      }

      const { data, error: rxErr } = await supabase.from('e_prescriptions').insert({
        doctor_id: doctor.doctor_id,
        appointment_id: appointmentId,
        patient_profile_id: profilePatient?.id ?? null,
        patient_id: pid,
        diagnosis: diagnosis.trim(),
        advice: advice.trim() || null,
        follow_up_date: followUp || null,
        items,
        vitals: filledVitals,
        created_at: new Date().toISOString(),
      }).select().maybeSingle();
      if (rxErr || !data) throw new Error(rxErr?.message ?? 'Could not save the prescription.');

      const savedRow = data as unknown as EPrescriptionRow;
      setSaved(savedRow);

      if (pid) {
        await supabase.from('notes').insert({
          patient_id: pid, created_by: user?.id ?? null,
          content: `E-prescription #MC-RX-${savedRow.e_prescription_id}: ${diagnosis.trim()}. ${items.map((i) => `${i.medicine_name} ${i.dosage} × ${i.duration}`).join('; ')}`,
        });
      }

      if (appointment) {
        await supabase.from('appointments').update({
          status: 'completed',
          notes: [appointment.notes, `Rx #MC-RX-${savedRow.e_prescription_id} issued`].filter(Boolean).join(' · '),
        }).eq('appointment_id', appointment.appointment_id);
      }

      printPrescription({
        id: savedRow.e_prescription_id,
        date: savedRow.created_at,
        doctorName: `Dr. ${doctorProfile?.name ?? 'Doctor'}`,
        qualification: doctor.qualification,
        registrationNumber: doctor.registration_number,
        clinic: doctor.hospital_clinic,
        patientName,
        patientAge: patientAge || null,
        patientGender: patientGender || null,
        patientPhone: patientPhone || null,
        diagnosis: diagnosis.trim(),
        advice: advice.trim() || null,
        followUpDate: followUp || null,
        vitals: filledVitals,
        items,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the prescription.');
    } finally {
      setSaving(false);
    }
  };

  const chooseInpatient = (p: PatientRow) => {
    setPatientId(p.patient_id);
    setProfilePatient(p.profile_id ? { id: p.profile_id } as ProfileRow : null);
    setPatientName(p.name);
    setPatientAge(p.age ? String(p.age) : '');
    setPatientGender(p.gender ?? '');
    setPatientPhone(p.phone ?? '');
    setRecentFor(p.profile_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/app/doctor/consultations" className="text-xs font-bold text-brand-600 flex items-center gap-1"><FiChevronLeft /> All consultations</Link>
        {appointment && <span className="badge bg-brand-100 text-brand-700">Appointment #{appointment.appointment_id} · {appointment.consultation_mode}</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiUser /> Patient</h3>
            {!appointment && !initialPatient && (
              <div className="mb-3">
                <label className="block text-[11px] font-bold text-[#5b7088] mb-1">Select an admitted patient</label>
                <select className="input-field" value={patientId ?? ''} onChange={(e) => {
                  const p = inpatients.find((x) => x.patient_id === Number(e.target.value));
                  if (p) chooseInpatient(p);
                }}>
                  <option value="">— Walk-in / choose patient —</option>
                  {inpatients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.name}{p.room_number ? ` · Room ${p.room_number}` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input placeholder="Patient name" value={patientName} onChange={(e) => setPatientName(e.target.value)} className="input-field col-span-2" />
              <input placeholder="Age" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} className="input-field" inputMode="numeric" />
              <input placeholder="Gender" value={patientGender} onChange={(e) => setPatientGender(e.target.value)} className="input-field" />
              <input placeholder="Phone" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} className="input-field col-span-2" />
              <div className="col-span-2 flex items-center text-[11px] text-[#5b7088]">
                {profilePatient?.allergies?.length ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1"><FiAlertTriangle /> Allergies: {profilePatient.allergies.join(', ')}</span>
                ) : 'No known allergies recorded.'}
              </div>
            </div>
          </div>

          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiActivity /> Vitals (optional)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ['temperature', 'Temp °F'], ['heart_rate', 'Heart rate'], ['spo2', 'SpO₂ %'], ['respiratory_rate', 'Resp rate'],
                ['bp_systolic', 'BP systolic'], ['bp_diastolic', 'BP diastolic'], ['glucose', 'Glucose'], ['weight_kg', 'Weight kg'],
              ] as [keyof VitalsDraft, string][]).map(([key, label]) => (
                <input key={key} placeholder={label} value={vitals[key]} inputMode="decimal"
                  onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))} className="input-field" />
              ))}
            </div>
            <p className="text-[10px] text-[#5b7088] mt-2">Entered vitals are saved to the patient EHR chart when you issue the prescription.</p>
          </div>

          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3">Diagnosis &amp; advice</h3>
            <input placeholder="Diagnosis (required)" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="input-field mb-2" />
            <textarea placeholder="Advice, lifestyle, red-flag warnings…" value={advice} onChange={(e) => setAdvice(e.target.value)} rows={3} className="input-field mb-2" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-[#5b7088] mb-1">Follow-up date</label>
                <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3">Medication</h3>
            <div className="relative mb-3">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b7088]" />
              <input placeholder="Search medicine catalog…" value={query} onChange={(e) => setQuery(e.target.value)} className="input-field !pl-9" />
              {results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-200 max-h-56 overflow-y-auto">
                  {results.map((m) => (
                    <button key={m.medicine_id} onClick={() => addMedicine(m)} className="w-full text-left px-3 py-2 hover:bg-brand-50 border-b border-slate-100 last:border-0">
                      <p className="text-sm font-bold text-[#0f2340]">{m.name}</p>
                      <p className="text-[10px] text-[#5b7088]">{[m.dosage, m.form, m.manufacturer].filter(Boolean).join(' · ')}{m.prescription_required ? ' · Rx' : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 mb-3">
              {items.map((it, i) => (
                <div key={`${it.medicine_name}-${i}`} className="p-2.5 rounded-xl bg-white/60 border border-white/60">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-[#0f2340]">{it.medicine_name}</p>
                    <button onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))} aria-label="Remove medicine" className="text-rose-400 hover:text-rose-600"><FiTrash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
                    <select value={it.dosage} onChange={(e) => updateItem(i, { dosage: e.target.value })} className="input-field !py-1.5 !text-xs">
                      {[...new Set([it.dosage, ...DOSAGES])].map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <select value={it.duration} onChange={(e) => updateItem(i, { duration: e.target.value })} className="input-field !py-1.5 !text-xs">
                      {[...new Set([it.duration, ...DURATIONS])].map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <input placeholder="Instructions" value={it.instructions ?? ''} onChange={(e) => updateItem(i, { instructions: e.target.value || null })} className="input-field !py-1.5 !text-xs col-span-2" />
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-[#5b7088]">No medicines added yet.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input placeholder="Or type a medicine name" value={manual} onChange={(e) => setManual(e.target.value)} className="input-field" />
              <select value={manualDosage} onChange={(e) => setManualDosage(e.target.value)} className="input-field sm:w-28">
                {DOSAGES.map((d) => <option key={d}>{d}</option>)}
              </select>
              <button onClick={addManual} className="btn-ghost flex items-center justify-center gap-1.5"><FiPlus /> Add</button>
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
          {saved && <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5"><FiCheckCircle /> Prescription #MC-RX-{saved.e_prescription_id} issued and sent to the pharmacy queue.</p>}

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="btn-primary flex-1 min-w-[160px] flex items-center justify-center gap-1.5">
              <FiSave /> {saving ? 'Issuing…' : 'Save & Print Prescription'}
            </button>
            {saved && (
              <button onClick={() => printPrescription({
                id: saved.e_prescription_id, date: saved.created_at, doctorName: `Dr. ${doctorProfile?.name ?? 'Doctor'}`,
                qualification: doctor.qualification, registrationNumber: doctor.registration_number, clinic: doctor.hospital_clinic,
                patientName, patientAge: patientAge || null, patientGender: patientGender || null, patientPhone: patientPhone || null,
                diagnosis, advice: advice || null, followUpDate: followUp || null, vitals: filledVitals, items,
              })} className="btn-ghost flex items-center gap-1.5">
                <FiPrinter /> Print again
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-2">Current visit</h3>
            <p className="text-xs text-[#33475b] mb-1">{patientName || 'No patient selected'}</p>
            <p className="text-[11px] text-[#5b7088]">{diagnosis || 'Diagnosis pending'}</p>
            <div className="mt-3 text-[11px] text-[#5b7088] space-y-1">
              <p>{items.length} medicine{items.length === 1 ? '' : 's'} on this Rx</p>
              <p>{Object.values(filledVitals).filter((v) => v !== null).length} vitals recorded</p>
              <p>Follow-up: {followUp || 'not set'}</p>
            </div>
          </div>

          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-2">Recent e-prescriptions</h3>
            {recent.length === 0 && <p className="text-xs text-[#5b7088]">No earlier prescriptions for this patient.</p>}
            <div className="space-y-2">
              {recent.map((rx) => (
                <div key={rx.e_prescription_id} className="p-2 rounded-lg bg-white/60 border border-white/60">
                  <p className="text-[11px] font-bold text-[#0f2340]">MC-RX-{rx.e_prescription_id} · {new Date(rx.created_at).toLocaleDateString()}</p>
                  <p className="text-[10px] text-[#5b7088]">{rx.diagnosis}</p>
                  <p className="text-[10px] text-[#5b7088]">{rx.items.length} medicine{rx.items.length === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
