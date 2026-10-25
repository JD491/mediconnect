import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { DoctorAvailabilityRow } from '../../types/doctor';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface SlotForm {
  day_of_week: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

interface AvailabilityProps {
  doctorId: number | undefined;
}

export default function Availability({ doctorId }: AvailabilityProps) {
  const [slots, setSlots] = useState<DoctorAvailabilityRow[]>([]);
  const [form, setForm] = useState<SlotForm>({ day_of_week: 'Mon', start_time: '10:00', end_time: '13:00', slot_duration_minutes: 15 });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!doctorId) return;
    const { data } = await supabase.from('doctor_availability').select('*').eq('doctor_id', doctorId).order('day_of_week');
    setSlots(data ?? []);
  }, [doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!doctorId) return;
    if (form.end_time <= form.start_time) return setError('End time must be after start time.');
    const overlapping = slots.some((s) => s.day_of_week === form.day_of_week && form.start_time < s.end_time && form.end_time > s.start_time);
    if (overlapping) return setError('This overlaps with an existing slot on that day.');
    const { error: err } = await supabase.from('doctor_availability').insert({ doctor_id: doctorId, ...form });
    if (err) return setError(err.message);
    load();
  };

  const remove = async (slotId: number) => {
    await supabase.from('doctor_availability').delete().eq('slot_id', slotId);
    load();
  };

  const byDay = DAYS.map((d) => ({ day: d, slots: slots.filter((s) => s.day_of_week === d) }));

  return (
    <div className="space-y-4">
      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Add Availability Slot</h3>
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <label className="text-xs font-bold text-[#5b7088]">Day
            <select value={form.day_of_week} onChange={(e) => setForm((f) => ({ ...f, day_of_week: e.target.value }))} className="input-field mt-1">
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#5b7088]">Start<input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">End<input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Slot (min)<input type="number" min={5} step={5} value={form.slot_duration_minutes} onChange={(e) => setForm((f) => ({ ...f, slot_duration_minutes: Number(e.target.value) }))} className="input-field mt-1" /></label>
          <button className="btn-primary flex items-center justify-center gap-2"><FiPlus /> Add</button>
        </form>
        {error && <p className="text-rose-500 text-xs font-semibold mt-3">{error}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {byDay.map(({ day, slots: daySlots }) => (
          <div key={day} className="glass-card">
            <p className="font-bold text-[#0f2340] text-sm mb-2">{day}</p>
            {daySlots.length === 0 ? (
              <p className="text-xs text-[#5b7088]">Off — no slots configured.</p>
            ) : (
              <div className="space-y-1.5">
                {daySlots.map((s) => (
                  <div key={s.slot_id} className="flex items-center justify-between text-xs bg-white/50 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold text-[#33475b]">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} ({s.slot_duration_minutes} min slots)</span>
                    <button onClick={() => remove(s.slot_id)} className="text-rose-400 hover:text-rose-600"><FiTrash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
