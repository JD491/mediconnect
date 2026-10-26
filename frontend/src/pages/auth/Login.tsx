import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiActivity, FiHome, FiHeart, FiShield, FiZap, FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../../lib/AuthContext';
import { DEMO_PASSWORD } from '../../lib/demoData';
import type { UserRole } from '../../types/database.types';
import AmbientBackground from '../../components/AmbientBackground';

const DEMO_BUTTONS: {
  role: UserRole;
  label: string;
  hint: string;
  icon: typeof FiUser;
  className: string;
}[] = [
  { role: 'customer', label: 'Patient', hint: 'Shop · book · track', icon: FiUser, className: 'from-brand-600 to-brand-500' },
  { role: 'doctor', label: 'Doctor', hint: 'Consults · Rx · EHR', icon: FiActivity, className: 'from-emerald-600 to-teal-500' },
  { role: 'store_owner', label: 'Pharmacy Owner', hint: 'Stock · orders · payouts', icon: FiHome, className: 'from-amber-500 to-orange-500' },
  { role: 'nurse', label: 'Nurse', hint: 'Vitals · medication rounds', icon: FiHeart, className: 'from-rose-500 to-pink-500' },
  { role: 'admin', label: 'Admin', hint: 'Users · revenue · audit', icon: FiShield, className: 'from-slate-700 to-slate-500' },
];

export default function Login() {
  const { signIn, signInDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState<UserRole | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) return setError(error.message);
    navigate('/app');
  };

  const handleDemo = async (role: UserRole) => {
    setDemoBusy(role);
    setError('');
    const { error } = await signInDemo(role);
    setDemoBusy(null);
    if (error) return setError(error.message);
    navigate('/app');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6 py-10">
      <AmbientBackground />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        <form onSubmit={handleSubmit} className="glass-card w-full">
          <Link to="/" className="flex items-center gap-2 font-extrabold text-xl text-[#0f2340] mb-1">
            <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-8 w-auto" /> MediConnect
          </Link>
          <p className="text-sm text-[#5b7088] mb-5">Log in to your account</p>

          <label htmlFor="login-email" className="text-xs font-bold text-[#5b7088] mb-1 block">Email</label>
          <div className="relative mb-4">
            <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
            <input id="login-email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="input-field pl-9" placeholder="you@example.com" />
          </div>

          <label htmlFor="login-password" className="text-xs font-bold text-[#5b7088] mb-1 block">Password</label>
          <div className="relative mb-2">
            <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
            <input id="login-password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} className="input-field pl-9" placeholder="••••••••" />
          </div>

          {error && <p className="text-rose-500 text-xs font-semibold mt-2">{error}</p>}

          <button disabled={busy || demoBusy !== null} className="btn-primary w-full mt-5">
            {busy ? 'Signing in...' : 'Log in'}
          </button>

          <p className="text-xs text-[#5b7088] text-center mt-4">
            No account? <Link to="/signup" className="text-brand-600 font-bold">Sign up</Link>
          </p>

          <details className="mt-5 rounded-2xl bg-brand-50/70 border border-brand-100 overflow-hidden group">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-700">
              <span className="flex items-center gap-1.5"><FiZap /> Quick demo login <span className="font-semibold normal-case tracking-normal text-brand-700/70">(optional)</span></span>
              <FiChevronDown className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-2">
                {DEMO_BUTTONS.map(({ role, label, hint, icon: Icon, className }) => (
                  <button
                    key={role}
                    type="button"
                    disabled={demoBusy !== null || busy}
                    onClick={() => handleDemo(role)}
                    className={`text-left rounded-xl px-3 py-2.5 text-white bg-gradient-to-br ${className} shadow-sm disabled:opacity-60 transition-transform hover:-translate-y-0.5 ${
                      role === 'admin' ? 'col-span-2' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-extrabold">
                      <Icon /> {demoBusy === role ? 'Signing in…' : label}
                    </span>
                    <span className="block text-[10px] text-white/85 font-medium mt-0.5">{hint}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-brand-700/80 mt-2 leading-snug">
                Review aid only — the email and password form above is the standard sign-in.
                Demo data is stored locally, so carts, orders, prescriptions and vitals persist on this device.
              </p>
              <p className="text-[10px] text-[#8a9bb0] mt-2 leading-relaxed">
                Manual demo logins (password <code className="font-bold">{DEMO_PASSWORD}</code>):<br />
                customer@mediconnect.app · doctor@mediconnect.app · owner@mediconnect.app ·
                nurse@mediconnect.app · admin@mediconnect.app
              </p>
            </div>
          </details>
        </form>
      </motion.div>
    </div>
  );
}
