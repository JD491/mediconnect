import { useCallback, useEffect, useState } from 'react';
import { FiUser, FiPhone, FiMapPin, FiDroplet, FiAlertTriangle, FiCheckCircle, FiActivity, FiSave } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';

interface NurseStats {
  patients: number;
  critical: number;
  tasksDone: number;
  tasksPending: number;
}

export default function NurseProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergies, setAllergies] = useState('');
  const [stats, setStats] = useState<NurseStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setPhone(profile.phone ?? '');
    setAddress(profile.address ?? '');
    setBloodGroup(profile.blood_group ?? '');
    setAllergies((profile.allergies ?? []).join(', '));
  }, [profile]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    const [p, t] = await Promise.all([
      supabase.from('patients').select('patient_id, status').eq('primary_nurse_id', user.id),
      supabase.from('tasks').select('task_id, status').eq('assigned_to', user.id),
    ]);
    const patients = p.data ?? [];
    const tasks = t.data ?? [];
    setStats({
      patients: patients.filter((x) => x.status !== 'discharged').length,
      critical: patients.filter((x) => x.status === 'critical').length,
      tasksDone: tasks.filter((x) => x.status === 'done').length,
      tasksPending: tasks.filter((x) => x.status === 'pending' || x.status === 'in_progress' || x.status === 'escalated').length,
    });
  }, [user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const save = async () => {
    if (!user) return;
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    setMessage('');
    const { error: err } = await supabase.from('profiles').update({
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      blood_group: bloodGroup.trim() || null,
      allergies: allergies.split(',').map((a) => a.trim()).filter(Boolean),
    }).eq('id', user.id);
    if (err) setError(err.message);
    else {
      setMessage('Profile updated.');
      await refreshProfile();
    }
    setSaving(false);
  };

  if (!profile) return <div className="glass-card text-sm text-[#5b7088]">Loading your profile…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="glass-card lg:col-span-1">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white flex items-center justify-center text-xl font-extrabold">
            {profile.name.slice(0, 1)}
          </div>
          <div>
            <p className="font-extrabold text-[#0f2340]">{profile.name}</p>
            <p className="text-[11px] text-[#5b7088]">Staff Nurse · MediConnect City Hospital</p>
            <p className="text-[10px] text-[#7b8fa6]">{profile.email}</p>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-white/60"><p className="text-lg font-extrabold text-[#0f2340]">{stats.patients}</p><p className="text-[10px] font-bold text-[#5b7088]">Assigned patients</p></div>
            <div className="p-2.5 rounded-xl bg-white/60"><p className="text-lg font-extrabold text-rose-600">{stats.critical}</p><p className="text-[10px] font-bold text-[#5b7088]">Critical now</p></div>
            <div className="p-2.5 rounded-xl bg-white/60"><p className="text-lg font-extrabold text-emerald-600">{stats.tasksDone}</p><p className="text-[10px] font-bold text-[#5b7088]">Tasks completed</p></div>
            <div className="p-2.5 rounded-xl bg-white/60"><p className="text-lg font-extrabold text-amber-600">{stats.tasksPending}</p><p className="text-[10px] font-bold text-[#5b7088]">Open tasks</p></div>
          </div>
        )}

        <div className="mt-3 p-2.5 rounded-xl bg-brand-50 border border-brand-200">
          <p className="text-[11px] font-bold text-brand-700 flex items-center gap-1.5"><FiActivity /> Shift: 08:00 – 20:00 · Ward 3</p>
          <p className="text-[10px] text-[#5b7088] mt-0.5">Handover notes are recorded against each patient EHR.</p>
        </div>
      </div>

      <div className="glass-card lg:col-span-2">
        <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiUser /> Contact &amp; clinical details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-[#5b7088] mb-1"><FiUser className="inline" /> Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#5b7088] mb-1"><FiPhone className="inline" /> Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" inputMode="tel" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-[#5b7088] mb-1"><FiMapPin className="inline" /> Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#5b7088] mb-1"><FiDroplet className="inline" /> Blood group</label>
            <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className="input-field">
              <option value="">Select</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#5b7088] mb-1"><FiAlertTriangle className="inline" /> Allergies</label>
            <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Comma separated" className="input-field" />
          </div>
        </div>

        {message && <p className="text-xs font-semibold text-emerald-600 mt-3 flex items-center gap-1.5"><FiCheckCircle /> {message}</p>}
        {error && <p className="text-xs font-semibold text-rose-500 mt-3">{error}</p>}

        <button onClick={save} disabled={saving} className="btn-primary mt-4 flex items-center gap-1.5">
          <FiSave /> {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}
