import { useEffect, useState } from 'react';
import { FiCalendar, FiStar } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import type { DoctorListing, DoctorAvailabilityRow } from '../../types/doctor';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function slotsForDate(availability: DoctorAvailabilityRow[], dateStr: string): string[] {
  const dow = DAY_NAMES[new Date(dateStr).getDay()];
  const daySlots = availability.filter((a) => a.day_of_week === dow);
  const out: string[] = [];
  for (const slot of daySlots) {
    const [startH, startM] = slot.start_time.split(':');
    const [endHRaw, endMRaw] = slot.end_time.split(':');
    let h = Number(startH);
    let m = Number(startM);
    const endH = Number(endHRaw);
    const endM = Number(endMRaw);
    while (h < endH || (h === endH && m < endM)) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += slot.slot_duration_minutes;
      while (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
  }
  return out;
}

export default function BookAppointment() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<DoctorListing[]>([]);
  const [selected, setSelected] = useState<DoctorListing | null>(null);
  const [availability, setAvailability] = useState<DoctorAvailabilityRow[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [booked, setBooked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('doctor_id, specialization, qualification, experience_years, consultation_fee, rating, profile:profiles(name)')
        .eq('approval_status', 'approved');
      setDoctors((data ?? []) as unknown as DoctorListing[]);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data: av } = await supabase.from('doctor_availability').select('*').eq('doctor_id', selected.doctor_id);
      setAvailability(av ?? []);
      const { data: appts } = await supabase.from('appointments').select('appointment_time')
        .eq('doctor_id', selected.doctor_id).eq('appointment_date', date).neq('status', 'cancelled');
      setBooked((appts ?? []).map((a) => a.appointment_time.slice(0, 5)));
    })();
  }, [selected, date]);

  const book = async (time: string) => {
    if (!selected || !user) return;
    setMessage('');
    const { error } = await supabase.from('appointments').insert({
      patient_id: user.id, doctor_id: selected.doctor_id,
      appointment_date: date, appointment_time: time, reason, status: 'pending',
    });
    setMessage(error ? error.message : `Booked for ${date} at ${time}!`);
    if (!error) setBooked((b) => [...b, time]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-3">
        {doctors.map((d) => (
          <button key={d.doctor_id} onClick={() => setSelected(d)}
            className={`glass-card w-full text-left transition-all ${selected?.doctor_id === d.doctor_id ? 'ring-2 ring-brand-500' : ''}`}>
            <p className="font-extrabold text-[#0f2340]">Dr. {d.profile?.name}</p>
            <p className="text-xs text-[#5b7088]">{d.specialization} · {d.experience_years} yrs exp</p>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="flex items-center gap-1 text-amber-500 font-bold"><FiStar size={12} /> {d.rating}</span>
              <span className="font-bold text-[#0f2340]">₹{d.consultation_fee}</span>
            </div>
          </button>
        ))}
        {doctors.length === 0 && <p className="text-sm text-[#5b7088]">No approved doctors yet.</p>}
      </div>

      <div className="lg:col-span-2">
        {selected ? (
          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiCalendar /> Book Dr. {selected.profile?.name}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <input type="date" value={date} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)} className="input-field" />
              <input placeholder="Reason for visit (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" />
            </div>
            <div className="flex flex-wrap gap-2">
              {slotsForDate(availability, date).map((t) => (
                <button key={t} disabled={booked.includes(t)} onClick={() => book(t)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                    booked.includes(t) ? 'bg-rose-50 text-rose-300 border-rose-100 cursor-not-allowed' : 'bg-white/60 border-white/50 hover:bg-brand-600 hover:text-white'
                  }`}>
                  {t}
                </button>
              ))}
              {slotsForDate(availability, date).length === 0 && <p className="text-xs text-[#5b7088]">No slots on this day.</p>}
            </div>
            {message && <p className="text-xs font-semibold text-brand-700 mt-4">{message}</p>}
          </div>
        ) : (
          <div className="glass-card text-sm text-[#5b7088]">Select a doctor to see available slots.</div>
        )}
      </div>
    </div>
  );
}
