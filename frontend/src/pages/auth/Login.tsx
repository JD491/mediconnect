import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock } from 'react-icons/fi';
import { useAuth } from '../../lib/AuthContext';
import AmbientBackground from '../../components/AmbientBackground';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) return setError(error.message);
    navigate('/app');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6">
      <AmbientBackground />
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        onSubmit={handleSubmit} className="glass-card w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-xl text-[#0f2340] mb-1">
          <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-8 w-auto" /> MediConnect
        </Link>
        <p className="text-sm text-[#5b7088] mb-6">Log in to your account</p>

        <label className="text-xs font-bold text-[#5b7088] mb-1 block">Email</label>
        <div className="relative mb-4">
          <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="input-field pl-9" placeholder="you@example.com" />
        </div>

        <label className="text-xs font-bold text-[#5b7088] mb-1 block">Password</label>
        <div className="relative mb-2">
          <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="input-field pl-9" placeholder="••••••••" />
        </div>

        {error && <p className="text-rose-500 text-xs font-semibold mt-2">{error}</p>}

        <button disabled={busy} className="btn-primary w-full mt-5">{busy ? 'Signing in...' : 'Log in'}</button>

        <p className="text-xs text-[#5b7088] text-center mt-4">
          No account? <Link to="/signup" className="text-brand-600 font-bold">Sign up</Link>
        </p>
        <p className="text-[10px] text-[#8a9bb0] text-center mt-4 leading-relaxed">
          Demo logins (password <code>MediConnect@123</code>): admin@mediconnect.app ·
          owner@mediconnect.app · doctor@mediconnect.app · nurse@mediconnect.app · customer@mediconnect.app
        </p>
      </motion.form>
    </div>
  );
}
