// FIX: role-specific insert errors (e.g. doctors/stores row) are now logged instead of being silently discarded, and reflected to the user without changing the sign-up flow.
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../lib/AuthContext';
import { supabase, getDataMode } from '../../lib/supabaseClient';
import AmbientBackground from '../../components/AmbientBackground';

// Roles a person can self-register as. Doctors/store owners additionally get an
// `approval_status = pending` row created in doctors/stores which the admin approves.
type SelfSignupRole = 'customer' | 'store_owner' | 'doctor' | 'nurse';

const ROLES: { value: SelfSignupRole; label: string }[] = [
  { value: 'customer', label: 'Patient / Customer' },
  { value: 'store_owner', label: 'Pharmacy / Store Owner' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
];

interface SignupForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  role: SelfSignupRole;
}

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<SignupForm>({ name: '', email: '', phone: '', address: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof SignupForm) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error } = await signUp(form);
    if (error) { setBusy(false); return setError(error.message); }

    // Doctors/store owners need a role-specific row (pending admin approval).
    // Local fallback signups already get their role row seeded by AuthContext,
    // so only touch Supabase when the live database is authoritative.
    const userId = data.user?.id;
    const mode = await getDataMode();
    let roleRowError: { message: string } | null = null;
    if (mode === 'live' && userId && form.role === 'doctor') {
      const { error: docErr } = await supabase.from('doctors').insert({
        user_id: userId, specialization: 'General Physician', approval_status: 'pending',
      });
      roleRowError = docErr;
    }
    if (mode === 'live' && userId && form.role === 'store_owner') {
      const { error: storeErr } = await supabase.from('stores').insert({
        owner_id: userId, store_name: `${form.name}'s Store`, license_number: 'PENDING',
        address: form.address, approval_status: 'pending',
      });
      roleRowError = storeErr;
    }
    if (roleRowError) {
      // Most common cause: the Supabase project has "Confirm email" enabled, so there is
      // no active session yet and RLS blocks this insert. Surface it instead of failing silently.
      // eslint-disable-next-line no-console
      console.error('Could not create role record:', roleRowError.message);
    }

    setBusy(false);
    navigate(data.session ? '/app' : '/login');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6 py-10">
      <AmbientBackground />
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        onSubmit={handleSubmit} className="glass-card w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-xl text-[#0f2340] mb-1">
          <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-8 w-auto" /> MediConnect
        </Link>
        <p className="text-sm text-[#5b7088] mb-6">Create your account</p>

        <label className="text-xs font-bold text-[#5b7088] mb-1 block">I am a...</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {ROLES.map((r) => (
            <button type="button" key={r.value} onClick={() => setForm((f) => ({ ...f, role: r.value }))}
              className={`text-xs font-bold rounded-xl px-3 py-2.5 border transition-all ${
                form.role === r.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#0f2340]'
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Full name" value={form.name} onChange={set('name')} className="input-field col-span-2" />
          <input required type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input-field col-span-2" />
          <input placeholder="Phone" value={form.phone} onChange={set('phone')} className="input-field" />
          <input placeholder="Address" value={form.address} onChange={set('address')} className="input-field" />
          <input required type="password" minLength={6} placeholder="Password (min 6 chars)"
            value={form.password} onChange={set('password')} className="input-field col-span-2" />
        </div>

        {(form.role === 'doctor' || form.role === 'store_owner') && (
          <p className="text-[11px] text-amber-600 font-semibold mt-3 bg-amber-50 rounded-lg px-3 py-2">
            {form.role === 'doctor' ? 'Doctor' : 'Store'} accounts require admin approval before you can accept patients/orders.
          </p>
        )}

        {error && <p className="text-rose-500 text-xs font-semibold mt-3">{error}</p>}

        <button disabled={busy} className="btn-primary w-full mt-5">{busy ? 'Creating account...' : 'Sign up'}</button>

        <p className="text-xs text-[#5b7088] text-center mt-4">
          Already have an account? <Link to="/login" className="text-brand-600 font-bold">Log in</Link>
        </p>
      </motion.form>
    </div>
  );
}
