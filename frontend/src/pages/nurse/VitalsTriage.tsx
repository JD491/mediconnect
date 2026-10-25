import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiPlus, FiUser } from 'react-icons/fi';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import type { Database, PatientStatus } from '../../types/database.types';

type PatientRow = Database['public']['Tables']['patients']['Row'];
type VitalRow = Database['public']['Tables']['vitals']['Row'];

interface VitalsForm {
  bp_systolic: string;
  bp_diastolic: string;
  heart_rate: string;
  spo2: string;
  temperature: string;
  glucose: string;
  weight_kg: string;
  respiratory_rate: string;
}

const EMPTY: VitalsForm = {
  bp_systolic: '', bp_diastolic: '', heart_rate: '', spo2: '', temperature: '',
  glucose: '', weight_kg: '', respiratory_rate: '',
};

interface Alert { level: 'critical' | 'warning' | 'ok'; text: string }

/** Colour-coded interpretation of a single reading. */
export function evaluateVitals(v: {
  bp_systolic?: number | null; bp_diastolic?: number | null; heart_rate?: number | null;
  spo2?: number | null; temperature?: number | null; glucose?: number | null;
}): Alert[] {
  const alerts: Alert[] = [];
  const { bp_systolic: sys, bp_diastolic: dia, heart_rate: hr, spo2, temperature: temp, glucose } = v;

  if (sys != null && dia != null) {
    if (sys >= 180 || dia >= 120) alerts.push({ level: 'critical', text: `Hypertensive crisis ${sys}/${dia} — notify doctor now` });
    else if (sys >= 140 || dia >= 90) alerts.push({ level: 'warning', text: `BP elevated ${sys}/${dia} — recheck in 30 min` });
    else if (sys < 90 || dia < 60) alerts.push({ level: 'warning', text: `BP low ${sys}/${dia} — watch for dizziness` });
    else alerts.push({ level: 'ok', text: `BP ${sys}/${dia} within range` });
  } else if (sys != null || dia != null) {
    alerts.push({ level: 'warning', text: 'Record both systolic and diastolic BP' });
  }

  if (hr != null) {
    if (hr > 120 || hr < 50) alerts.push({ level: 'critical', text: `Heart rate ${hr} bpm — urgent review` });
    else if (hr > 100 || hr < 60) alerts.push({ level: 'warning', text: `Heart rate ${hr} bpm — monitor` });
    else alerts.push({ level: 'ok', text: `Heart rate ${hr} bpm normal` });
  }

  if (spo2 != null) {
    if (spo2 < 90) alerts.push({ level: 'critical', text: `SpO₂ ${spo2}% — start oxygen, call doctor` });
    else if (spo2 < 95) alerts.push({ level: 'warning', text: `SpO₂ ${spo2}% — borderline, recheck` });
    else alerts.push({ level: 'ok', text: `SpO₂ ${spo2}% normal` });
  }

  if (temp != null) {
    if (temp >= 103) alerts.push({ level: 'critical', text: `Temperature ${temp}°F — high fever` });
    else if (temp >= 100.4) alerts.push({ level: 'warning', text: `Temperature ${temp}°F — febrile` });
    else if (temp < 96) alerts.push({ level: 'warning', text: `Temperature ${temp}°F — low` });
    else alerts.push({ level: 'ok', text: `Temperature ${temp}°F normal` });
  }

  if (glucose != null) {
    if (glucose >= 250 || glucose < 70) alerts.push({ level: 'critical', text: `Glucose ${glucose} mg/dL — urgent` });
    else if (glucose >= 180 || glucose > 140) alerts.push({ level: 'warning', text: `Glucose ${glucose} mg/dL — elevated` });
    else alerts.push({ level: 'ok', text: `Glucose ${glucose} mg/dL normal` });
  }

  return alerts;
}

function overallStatus(alerts: Alert[]): PatientStatus {
  if (alerts.some((a) => a.level === 'critical')) return 'critical';
  if (alerts.some((a) => a.level === 'warning')) return 'monitoring';
  return 'stable';
}

const STATUS_DOT: Record<PatientStatus, string> = {
  stable: 'bg-emerald-400', monitoring: 'bg-amber-400', critical: 'bg-rose-500', discharged: 'bg-slate-300',
};

function numberOrNull(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() && Number.isFinite(n) ? n : null;
}

export default function VitalsTriage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [selected, setSelected] = useState<PatientRow | null>(null);
  const [vitals, setVitals] = useState<VitalRow[]>([]);
  const [form, setForm] = useState<VitalsForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadPatients = useCallback(async () => {
    if (!user) return;
    const assigned = await supabase.from('patients').select('*').eq('primary_nurse_id', user.id).neq('status', 'discharged').order('name');
    const rows = (assigned.data ?? []) as PatientRow[];
    if (rows.length > 0) {
      setPatients(rows);
      if (!selected || !rows.some((p) => p.patient_id === selected.patient_id)) setSelected(rows[0] ?? null);
      return;
    }
    const fallback = await supabase.from('patients').select('*').neq('status', 'discharged').order('name');
    const all = (fallback.data ?? []) as PatientRow[];
    setPatients(all);
    if (!selected) setSelected(all[0] ?? null);
  }, [user, selected]);

  // Rev-load when the signed-in nurse changes; loadPatients also depends on the
  // current selection, which must not re-trigger this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPatients(); }, [user?.id]);

  const loadVitals = useCallback(async () => {
    if (!selected) { setVitals([]); return; }
    const { data } = await supabase.from('vitals').select('*').eq('patient_id', selected.patient_id)
      .order('recorded_at', { ascending: true }).limit(50);
    setVitals((data ?? []) as VitalRow[]);
  }, [selected]);

  useEffect(() => { loadVitals(); }, [loadVitals]);

  const livePreview = useMemo(() => evaluateVitals({
    bp_systolic: numberOrNull(form.bp_systolic), bp_diastolic: numberOrNull(form.bp_diastolic),
    heart_rate: numberOrNull(form.heart_rate), spo2: numberOrNull(form.spo2),
    temperature: numberOrNull(form.temperature), glucose: numberOrNull(form.glucose),
  }), [form]);

  const latest = vitals[vitals.length - 1];
  const latestAlerts = latest ? evaluateVitals(latest) : [];

  const chart = useMemo(() => vitals.map((v) => ({
    time: new Date(v.recorded_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }),
    systolic: v.bp_systolic, diastolic: v.bp_diastolic, hr: v.heart_rate,
    spo2: v.spo2, glucose: v.glucose,
  })), [vitals]);

  const filtered = useMemo(() => {
    const list = patients ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || (p.room_number ?? '').toLowerCase().includes(q)) : list;
  }, [patients, search]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !user) return;
    setSaving(true);
    setError('');
    setMessage('');
    const reading = {
      bp_systolic: numberOrNull(form.bp_systolic), bp_diastolic: numberOrNull(form.bp_diastolic),
      heart_rate: numberOrNull(form.heart_rate), spo2: numberOrNull(form.spo2),
      temperature: numberOrNull(form.temperature), glucose: numberOrNull(form.glucose),
      weight_kg: numberOrNull(form.weight_kg), respiratory_rate: numberOrNull(form.respiratory_rate),
    };
    if (Object.values(reading).every((v) => v === null)) {
      setError('Enter at least one vital sign.');
      setSaving(false);
      return;
    }
    const { error: insertErr } = await supabase.from('vitals').insert({
      patient_id: selected.patient_id, recorded_by: user.id, ...reading,
      recorded_at: new Date().toISOString(),
    });
    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    const alerts = evaluateVitals(reading);
    const status = overallStatus(alerts);
    await supabase.from('patients').update({ status }).eq('patient_id', selected.patient_id);

    const critical = alerts.filter((a) => a.level === 'critical');
    if (critical.length > 0) {
      await supabase.from('notes').insert({
        patient_id: selected.patient_id, created_by: user.id,
        content: `[AUTO ALERT] ${critical.map((a) => a.text).join('; ')}`,
      });
      await supabase.from('tasks').insert({
        patient_id: selected.patient_id, assigned_to: null, created_by: user.id,
        title: `Urgent review — ${selected.name}`, description: critical.map((a) => a.text).join('; '),
        status: 'pending', priority: 'urgent', due_at: new Date().toISOString(), created_at: new Date().toISOString(),
        task_type: 'observation',
      });
    }

    setSelected({ ...selected, status });
    setForm(EMPTY);
    setMessage(critical.length > 0
      ? `Reading saved. ${critical.length} critical alert${critical.length === 1 ? '' : 's'} raised — doctor notified.`
      : 'Vitals saved to the patient chart.');
    setSaving(false);
    loadVitals();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card order-2 lg:order-1">
          <h3 className="font-extrabold text-[#0f2340] mb-2 flex items-center gap-2"><FiUser /> Patients</h3>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient…" className="input-field !py-1.5 !text-xs mb-2" />
          <div className="space-y-1.5 max-h-[540px] overflow-y-auto">
            {filtered.map((p) => (
              <button key={p.patient_id} onClick={() => { setSelected(p); setMessage(''); setError(''); }}
                className={`w-full text-left p-2.5 rounded-xl border transition-all ${selected?.patient_id === p.patient_id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/50 border-white/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{p.name}</span>
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status]}`} />
                </div>
                <p className={`text-[11px] ${selected?.patient_id === p.patient_id ? 'text-brand-100' : 'text-[#5b7088]'}`}>
                  {p.room_number ? `Room ${p.room_number}` : 'Outpatient'} · {p.age ? `${p.age}y` : '—'}{p.gender ? ` · ${p.gender[0]}` : ''}
                </p>
              </button>
            ))}
            {patients !== null && filtered.length === 0 && <p className="text-xs text-[#5b7088]">No patients found.</p>}
            {patients === null && <p className="text-xs text-[#5b7088]">Loading…</p>}
          </div>
        </div>

        <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
          {selected ? (
            <>
              <div className="glass-card">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-extrabold text-[#0f2340] flex items-center gap-2"><FiActivity /> Vitals triage — {selected.name}</h3>
                    <p className="text-[11px] text-[#5b7088]">
                      {selected.age ?? '—'} yrs · {selected.gender ?? '—'} · {selected.blood_group ?? '—'}
                      {selected.room_number ? ` · Room ${selected.room_number}` : ''} · {selected.status}
                    </p>
                  </div>
                  {selected.allergies.length > 0 && (
                    <span className="badge bg-rose-100 text-rose-700"><FiAlertTriangle size={10} /> {selected.allergies.join(', ')}</span>
                  )}
                </div>

                <div className="space-y-1.5 mb-3">
                  {latestAlerts.map((a, i) => (
                    <div key={i} className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 ${
                      a.level === 'critical' ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : a.level === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {a.level === 'ok' ? <FiCheckCircle size={12} /> : <FiAlertTriangle size={12} />}
                      Latest: {a.text}
                    </div>
                  ))}
                  {!latest && <p className="text-xs text-[#5b7088]">No vitals recorded yet for this patient.</p>}
                </div>

                {chart.length >= 2 && (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="systolic" stroke="#e11d48" strokeWidth={2} dot={false} name="Systolic" />
                        <Line type="monotone" dataKey="diastolic" stroke="#f59e0b" strokeWidth={2} dot={false} name="Diastolic" />
                        <Line type="monotone" dataKey="hr" stroke="#2563eb" strokeWidth={2} dot={false} name="Heart rate" />
                        <Line type="monotone" dataKey="spo2" stroke="#059669" strokeWidth={2} dot={false} name="SpO₂" />
                        <Line type="monotone" dataKey="glucose" stroke="#7c3aed" strokeWidth={2} dot={false} name="Glucose" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="glass-card">
                <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiPlus /> Record vitals</h3>
                <form onSubmit={submit}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    {([
                      ['bp_systolic', 'BP systolic'], ['bp_diastolic', 'BP diastolic'],
                      ['heart_rate', 'Heart rate'], ['spo2', 'SpO₂ %'],
                      ['temperature', 'Temp °F'], ['glucose', 'Glucose mg/dL'],
                      ['weight_kg', 'Weight kg'], ['respiratory_rate', 'Resp rate'],
                    ] as [keyof VitalsForm, string][]).map(([key, label]) => (
                      <input key={key} placeholder={label} inputMode="decimal" value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="input-field !py-2 !text-sm" />
                    ))}
                  </div>

                  {form.bp_systolic || form.heart_rate || form.spo2 || form.temperature || form.glucose ? (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {livePreview.map((a, i) => (
                        <span key={i} className={`badge ${a.level === 'critical' ? 'bg-rose-100 text-rose-700' : a.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {a.text}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {error && <p className="text-xs font-semibold text-rose-500 mb-2">{error}</p>}
                  {message && <p className="text-xs font-semibold text-emerald-600 mb-2">{message}</p>}

                  <button disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save reading & update status'}</button>
                </form>
              </div>

              <div className="glass-card">
                <h3 className="font-extrabold text-[#0f2340] mb-2">Recent readings</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-[#5b7088] border-b border-white/50">
                        <th className="py-1.5 pr-2">Time</th><th className="py-1.5 pr-2">BP</th><th className="py-1.5 pr-2">HR</th>
                        <th className="py-1.5 pr-2">SpO₂</th><th className="py-1.5 pr-2">Temp</th><th className="py-1.5 pr-2">Glucose</th><th className="py-1.5">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...vitals].reverse().slice(0, 12).map((v) => {
                        const alerts = evaluateVitals(v);
                        const level = alerts.some((a) => a.level === 'critical') ? 'critical' : alerts.some((a) => a.level === 'warning') ? 'warning' : 'ok';
                        return (
                          <tr key={v.vital_id} className="border-b border-white/30 last:border-0">
                            <td className="py-1.5 pr-2 text-[#5b7088]">{new Date(v.recorded_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="py-1.5 pr-2 font-bold text-[#0f2340]">{v.bp_systolic ?? '—'}/{v.bp_diastolic ?? '—'}</td>
                            <td className="py-1.5 pr-2">{v.heart_rate ?? '—'}</td>
                            <td className="py-1.5 pr-2">{v.spo2 ?? '—'}</td>
                            <td className="py-1.5 pr-2">{v.temperature ?? '—'}</td>
                            <td className="py-1.5 pr-2">{v.glucose ?? '—'}</td>
                            <td className="py-1.5">
                              <span className={`badge ${level === 'critical' ? 'bg-rose-100 text-rose-700' : level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{level}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {vitals.length === 0 && <p className="text-xs text-[#5b7088] mt-2">No readings yet.</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="glass-card text-sm text-[#5b7088]">Select a patient to record vitals.</div>
          )}
        </div>
      </div>
    </div>
  );
}
