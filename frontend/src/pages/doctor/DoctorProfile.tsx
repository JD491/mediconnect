import { useState, type ChangeEvent, type FormEvent } from 'react';
import { FiSave, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { DoctorPageProps } from '../../types/doctor';

interface DoctorProfileForm {
  specialization: string;
  qualification: string;
  registration_number: string;
  experience_years: number;
  consultation_fee: number;
  hospital_clinic: string;
  bio: string;
  profile_image_url: string;
}

interface DoctorProfileProps extends DoctorPageProps {
  onSaved?: () => void;
}

export default function DoctorProfile({ doctor, onSaved }: DoctorProfileProps) {
  const [form, setForm] = useState<DoctorProfileForm>({
    specialization: doctor.specialization || '', qualification: doctor.qualification || '',
    registration_number: doctor.registration_number || '', experience_years: doctor.experience_years ?? 0,
    consultation_fee: doctor.consultation_fee ?? 0, hospital_clinic: doctor.hospital_clinic || '',
    bio: doctor.bio || '', profile_image_url: doctor.profile_image_url || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const setText = (k: keyof DoctorProfileForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNumber = (k: 'experience_years' | 'consultation_fee') => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.specialization.trim()) return setError('Specialization is required.');
    if (form.consultation_fee < 0) return setError('Consultation fee cannot be negative.');
    if (form.experience_years < 0) return setError('Experience cannot be negative.');

    setBusy(true);
    const { error: updErr } = await supabase.from('doctors').update({
      specialization: form.specialization, qualification: form.qualification || null,
      registration_number: form.registration_number || null, experience_years: form.experience_years,
      consultation_fee: form.consultation_fee, hospital_clinic: form.hospital_clinic || null,
      bio: form.bio || null, profile_image_url: form.profile_image_url || null,
    }).eq('doctor_id', doctor.doctor_id);
    setBusy(false);
    if (updErr) return setError(updErr.message);
    setSuccess('Profile updated.');
    onSaved?.();
  };

  return (
    <form onSubmit={submit} className="glass-card space-y-3 max-w-xl">
      <h3 className="font-extrabold text-[#0f2340] mb-1">Doctor Profile</h3>
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Specialization *" value={form.specialization} onChange={setText('specialization')} className="input-field" />
        <input placeholder="Qualification" value={form.qualification} onChange={setText('qualification')} className="input-field" />
        <input placeholder="Registration number" value={form.registration_number} onChange={setText('registration_number')} className="input-field" />
        <input type="number" min="0" placeholder="Experience (years)" value={form.experience_years} onChange={setNumber('experience_years')} className="input-field" />
        <input type="number" min="0" placeholder="Consultation fee (₹)" value={form.consultation_fee} onChange={setNumber('consultation_fee')} className="input-field" />
        <input placeholder="Hospital / Clinic" value={form.hospital_clinic} onChange={setText('hospital_clinic')} className="input-field" />
        <input placeholder="Profile image URL" value={form.profile_image_url} onChange={setText('profile_image_url')} className="input-field col-span-2" />
        <textarea placeholder="Bio" value={form.bio} onChange={setText('bio')} className="input-field col-span-2" rows={3} />
      </div>
      {error && <p className="text-rose-500 text-xs font-semibold">{error}</p>}
      {success && <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><FiCheckCircle /> {success}</p>}
      <button disabled={busy} className="btn-primary flex items-center justify-center gap-2"><FiSave /> {busy ? 'Saving...' : 'Save Profile'}</button>
    </form>
  );
}
