import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiGrid, FiUsers, FiCheckSquare, FiActivity, FiUser } from 'react-icons/fi';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import DashboardShell, { type DashboardNavItem } from '../../components/DashboardShell';
import PageTransition from '../../components/PageTransition';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import VitalsTriage from './VitalsTriage';
import MedicationTasks from './MedicationTasks';
import NurseProfile from './NurseProfile';
import type { Database, PatientStatus, TaskPriority, TaskStatus } from '../../types/database.types';

type PatientRow = Database['public']['Tables']['patients']['Row'];
type VitalRow = Database['public']['Tables']['vitals']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

const NAV: DashboardNavItem[] = [
  { to: '/app/nurse', end: true, icon: <FiGrid />, label: 'Overview' },
  { to: '/app/nurse/vitals', icon: <FiActivity />, label: 'Vitals & Triage' },
  { to: '/app/nurse/medications', icon: <FiCheckSquare />, label: 'Medication Tasks' },
  { to: '/app/nurse/profile', icon: <FiUser />, label: 'My Profile' },
];

const STATUS_DOT: Record<PatientStatus, string> = {
  stable: 'bg-emerald-400', monitoring: 'bg-amber-400', critical: 'bg-rose-500', discharged: 'bg-slate-300',
};
const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-amber-100 text-amber-700', urgent: 'bg-rose-100 text-rose-700',
};

interface PatientListProps {
  patients: PatientRow[];
  selected: PatientRow | null;
  onSelect: (p: PatientRow) => void;
}

function PatientList({ patients, selected, onSelect }: PatientListProps) {
  return (
    <div className="glass-card">
      <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiUsers /> My Patients</h3>
      <div className="space-y-2">
        {patients.map((p) => (
          <button key={p.patient_id} onClick={() => onSelect(p)}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              selected?.patient_id === p.patient_id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/50 border-white/40'
            }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{p.name}</span>
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status]}`} />
            </div>
            <p className={`text-[11px] ${selected?.patient_id === p.patient_id ? 'text-brand-100' : 'text-[#5b7088]'}`}>
              Room {p.room_number} · {p.age}{p.gender?.[0]}
            </p>
          </button>
        ))}
        {patients.length === 0 && <p className="text-xs text-[#5b7088]">No patients assigned yet.</p>}
      </div>
    </div>
  );
}

interface VitalChartPoint extends VitalRow {
  time: string;
}

interface VitalsForm {
  heart_rate: string;
  bp_systolic: string;
  bp_diastolic: string;
  temperature: string;
  spo2: string;
}

const EMPTY_VITALS_FORM: VitalsForm = { heart_rate: '', bp_systolic: '', bp_diastolic: '', temperature: '', spo2: '' };

function VitalsPanel({ patient }: { patient: PatientRow | null }) {
  const [vitals, setVitals] = useState<VitalChartPoint[]>([]);
  const [form, setForm] = useState<VitalsForm>(EMPTY_VITALS_FORM);
  const { user } = useAuth();

  const load = useCallback(async () => {
    if (!patient) {
      setVitals([]);
      return;
    }
    const { data } = await supabase.from('vitals').select('*').eq('patient_id', patient.patient_id).order('recorded_at', { ascending: true }).limit(20);
    setVitals((data ?? []).map((v) => ({ ...v, time: new Date(v.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })));
  }, [patient]);

  useEffect(() => {
    load();
    if (!patient) return; // nothing to subscribe to yet — load() already cleared the chart above
    const channel = supabase.channel('vitals-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vitals', filter: `patient_id=eq.${patient.patient_id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, patient]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!patient || !user) return;
    await supabase.from('vitals').insert({
      patient_id: patient.patient_id, recorded_by: user.id,
      heart_rate: form.heart_rate ? Number(form.heart_rate) : null, bp_systolic: form.bp_systolic ? Number(form.bp_systolic) : null,
      bp_diastolic: form.bp_diastolic ? Number(form.bp_diastolic) : null, temperature: form.temperature ? Number(form.temperature) : null,
      spo2: form.spo2 ? Number(form.spo2) : null,
    });
    setForm(EMPTY_VITALS_FORM);
  };

  if (!patient) return <div className="glass-card text-sm text-[#5b7088]">Select a patient to view vitals.</div>;

  return (
    <div className="glass-card">
      <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiActivity /> Vitals — {patient.name}</h3>
      <div className="h-56 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={vitals}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="heart_rate" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Heart Rate" />
            <Line type="monotone" dataKey="spo2" stroke="#f472b6" strokeWidth={2} dot={false} name="SpO2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <form onSubmit={submit} className="grid grid-cols-5 gap-2">
        <input placeholder="HR" value={form.heart_rate} onChange={(e) => setForm((f) => ({ ...f, heart_rate: e.target.value }))} className="input-field !py-2 text-xs" />
        <input placeholder="Sys" value={form.bp_systolic} onChange={(e) => setForm((f) => ({ ...f, bp_systolic: e.target.value }))} className="input-field !py-2 text-xs" />
        <input placeholder="Dia" value={form.bp_diastolic} onChange={(e) => setForm((f) => ({ ...f, bp_diastolic: e.target.value }))} className="input-field !py-2 text-xs" />
        <input placeholder="Temp" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))} className="input-field !py-2 text-xs" />
        <input placeholder="SpO2" value={form.spo2} onChange={(e) => setForm((f) => ({ ...f, spo2: e.target.value }))} className="input-field !py-2 text-xs" />
        <button className="btn-primary col-span-5 !py-2 !text-xs mt-1">Log reading</button>
      </form>
    </div>
  );
}

interface NoteWithAuthor extends NoteRow {
  author: Pick<ProfileRow, 'name'> | null;
}

function NotesPanel({ patient }: { patient: PatientRow | null }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteWithAuthor[]>([]);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    if (!patient) {
      setNotes([]);
      return;
    }
    const { data } = await supabase.from('notes').select('*, author:profiles(name)').eq('patient_id', patient.patient_id).order('created_at', { ascending: false });
    setNotes((data ?? []) as unknown as NoteWithAuthor[]);
  }, [patient]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim() || !patient || !user) return;
    await supabase.from('notes').insert({ patient_id: patient.patient_id, created_by: user.id, content: text.trim() });
    setText('');
    load();
  };

  if (!patient) return null;

  return (
    <div className="glass-card">
      <h3 className="font-extrabold text-[#0f2340] mb-3">Nursing Notes — {patient.name}</h3>
      <form onSubmit={submit} className="flex gap-2 mb-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note..." className="input-field flex-1" />
        <button className="btn-primary !px-4">Add</button>
      </form>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {notes.map((n) => (
          <div key={n.note_id} className="p-2.5 rounded-xl bg-white/50 border border-white/40">
            <p className="text-sm text-[#33475b]">{n.content}</p>
            <p className="text-[10px] text-[#8a9bb0] mt-1">{n.author?.name || 'Staff'} · {new Date(n.created_at).toLocaleString()}</p>
          </div>
        ))}
        {notes.length === 0 && <p className="text-xs text-[#5b7088]">No notes yet for this patient.</p>}
      </div>
    </div>
  );
}

interface TaskWithPatient extends TaskRow {
  patient: Pick<PatientRow, 'name'> | null;
}

function TaskBoard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithPatient[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('tasks').select('*, patient:patients(name)')
      .eq('assigned_to', user.id).order('created_at', { ascending: false });
    setTasks((data ?? []) as unknown as TaskWithPatient[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase.channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user]);

  const advance = async (task: TaskWithPatient) => {
    const next: TaskStatus = task.status === 'pending' ? 'in_progress' : 'done';
    await supabase.from('tasks').update({ status: next }).eq('task_id', task.task_id);
  };

  return (
    <div className="glass-card">
      <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiCheckSquare /> My Tasks</h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.task_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#0f2340]">{t.title}</p>
              <p className="text-[11px] text-[#5b7088]">{t.patient?.name || 'General'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
              {t.status !== 'done' && (
                <button onClick={() => advance(t)} className="btn-ghost !py-1 !px-2 !text-[11px]">
                  {t.status === 'pending' ? 'Start' : 'Complete'}
                </button>
              )}
              {t.status === 'done' && <span className="badge bg-emerald-100 text-emerald-700">done</span>}
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-xs text-[#5b7088]">No tasks assigned.</p>}
      </div>
    </div>
  );
}

function Overview() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selected, setSelected] = useState<PatientRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('patients').select('*').eq('primary_nurse_id', user.id).neq('status', 'discharged');
    setPatients(data ?? []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase.channel('patients-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients', filter: `primary_nurse_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <PatientList patients={patients} selected={selected} onSelect={setSelected} />
      <div className="lg:col-span-2 space-y-4">
        <VitalsPanel patient={selected} />
        <NotesPanel patient={selected} />
        <TaskBoard />
      </div>
    </div>
  );
}

export default function NurseDashboard() {
  const location = useLocation();
  return (
    <DashboardShell nav={NAV} title="Nurse Dashboard">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route index element={<PageTransition><Overview /></PageTransition>} />
          <Route path="vitals" element={<PageTransition><VitalsTriage /></PageTransition>} />
          <Route path="medications" element={<PageTransition><MedicationTasks /></PageTransition>} />
          <Route path="profile" element={<PageTransition><NurseProfile /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </DashboardShell>
  );
}
