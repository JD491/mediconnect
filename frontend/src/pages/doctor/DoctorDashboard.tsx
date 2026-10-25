import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiGrid, FiCalendar, FiUsers, FiClock, FiUser } from 'react-icons/fi';
import DashboardShell, { type DashboardNavItem } from '../../components/DashboardShell';
import PageTransition from '../../components/PageTransition';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import Availability from './Availability';
import DoctorProfile from './DoctorProfile';
import type { Database } from '../../types/database.types';
import type { DoctorRow } from '../../types/doctor';

type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
type AppointmentStatus = AppointmentRow['status'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type PatientRow = Database['public']['Tables']['patients']['Row'];

const NAV: DashboardNavItem[] = [
  { to: '/app/doctor', end: true, icon: <FiGrid />, label: 'Dashboard' },
  { to: '/app/doctor/availability', icon: <FiClock />, label: 'Availability' },
  { to: '/app/doctor/profile', icon: <FiUser />, label: 'Profile' },
];

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-rose-100 text-rose-700', no_show: 'bg-slate-100 text-slate-600',
};

interface AppointmentWithPatient extends AppointmentRow {
  patient: Pick<ProfileRow, 'name' | 'phone'> | null;
}

function AppointmentsQueue({ doctorId }: { doctorId: number | undefined }) {
  const [appts, setAppts] = useState<AppointmentWithPatient[]>([]);

  const load = useCallback(async () => {
    if (!doctorId) return;
    const { data } = await supabase.from('appointments').select('*, patient:profiles(name, phone)')
      .eq('doctor_id', doctorId).gte('appointment_date', new Date().toISOString().slice(0, 10))
      .order('appointment_date').order('appointment_time');
    setAppts((data ?? []) as unknown as AppointmentWithPatient[]);
  }, [doctorId]);

  useEffect(() => {
    if (!doctorId) return;
    load();
    const channel = supabase.channel('doctor-appts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, doctorId]);

  const setStatus = async (id: number, status: AppointmentStatus) => {
    await supabase.from('appointments').update({ status }).eq('appointment_id', id);
  };

  return (
    <div className="glass-card">
      <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiCalendar /> Upcoming Appointments</h3>
      <div className="space-y-2">
        {appts.map((a) => (
          <div key={a.appointment_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#0f2340]">{a.patient?.name}</p>
              <p className="text-[11px] text-[#5b7088]">{a.appointment_date} · {a.appointment_time.slice(0, 5)} — {a.reason || 'General consultation'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${STATUS_STYLE[a.status]}`}>{a.status}</span>
              {a.status === 'pending' && <button onClick={() => setStatus(a.appointment_id, 'confirmed')} className="btn-ghost !py-1 !px-2 !text-[11px]">Confirm</button>}
              {a.status === 'confirmed' && <button onClick={() => setStatus(a.appointment_id, 'completed')} className="btn-ghost !py-1 !px-2 !text-[11px]">Complete</button>}
              {(['pending', 'confirmed'] as AppointmentStatus[]).includes(a.status) && (
                <button onClick={() => setStatus(a.appointment_id, 'cancelled')} className="btn-ghost !py-1 !px-2 !text-[11px] !text-rose-500">Cancel</button>
              )}
            </div>
          </div>
        ))}
        {appts.length === 0 && <p className="text-xs text-[#5b7088]">No upcoming appointments.</p>}
      </div>
    </div>
  );
}

function AssignedPatients({ doctorId }: { doctorId: number | undefined }) {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  useEffect(() => {
    if (!doctorId) return;
    supabase.from('patients').select('*').eq('primary_doctor_id', doctorId).then(({ data }) => setPatients(data ?? []));
  }, [doctorId]);
  return (
    <div className="glass-card">
      <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiUsers /> Assigned Patients</h3>
      <div className="space-y-2">
        {patients.map((p) => (
          <div key={p.patient_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex justify-between">
            <span className="text-sm font-bold text-[#0f2340]">{p.name}</span>
            <span className="text-[11px] text-[#5b7088]">Room {p.room_number} · {p.status}</span>
          </div>
        ))}
        {patients.length === 0 && <p className="text-xs text-[#5b7088]">No inpatients assigned.</p>}
      </div>
    </div>
  );
}

function Overview({ doctorId }: { doctorId: number | undefined }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <AppointmentsQueue doctorId={doctorId} />
      <AssignedPatients doctorId={doctorId} />
    </div>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState<DoctorRow | null>(null);
  const location = useLocation();

  const loadDoctor = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('doctors').select('*').eq('user_id', user.id).single();
    setDoctor(data || null);
  }, [user]);

  useEffect(() => {
    loadDoctor();
  }, [loadDoctor]);

  return (
    <DashboardShell nav={NAV} title="Doctor Dashboard">
      {doctor && doctor.approval_status !== 'approved' && (
        <div className="glass-card mb-4 !bg-amber-50/70 border-amber-200/70">
          <p className="text-sm font-bold text-amber-700">
            Your profile is <span className="capitalize">{doctor.approval_status}</span>. Patients can only book you once an admin approves your profile.
          </p>
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route index element={<PageTransition><Overview doctorId={doctor?.doctor_id} /></PageTransition>} />
          <Route path="availability" element={<PageTransition><Availability doctorId={doctor?.doctor_id} /></PageTransition>} />
          <Route path="profile" element={<PageTransition>{doctor ? <DoctorProfile doctor={doctor} onSaved={loadDoctor} /> : null}</PageTransition>} />
        </Routes>
      </AnimatePresence>
    </DashboardShell>
  );
}
