import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiShoppingBag, FiActivity, FiHeart, FiPhoneCall, FiSearch, FiFileText, FiTruck,
  FiShield, FiStar, FiUserPlus, FiMenu, FiX, FiCheckCircle, FiUserCheck,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { useAuth } from '../../lib/AuthContext';
import Reveal, { Stagger, StaggerItem } from '../../components/Reveal';
import AmbientBackground from '../../components/AmbientBackground';
import DeliveryBar from '../../components/DeliveryBar';

const CATEGORIES = ['Pain Relief', 'Cold & Fever', 'Diabetes Care', 'Skin Care', 'Vitamins', 'Baby Care', 'Ayurveda', "Women's Health"];

interface Feature {
  icon: IconType;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { icon: FiShoppingBag, title: 'Compare & Order Medicines', desc: 'Compare prices across verified pharmacies near you and order with a tap.' },
  { icon: FiUserCheck, title: 'Consult Doctors Online', desc: 'Book appointments with verified doctors and manage your consultations.' },
  { icon: FiActivity, title: 'Live Vitals Monitoring', desc: 'Nurses and doctors track patient vitals in real time, with instant alerts.' },
  { icon: FiPhoneCall, title: 'Emergency SOS', desc: 'One tap to reach the nearest ambulance, hospital, or blood bank.' },
];

interface Step {
  step: string;
  title: string;
  desc: string;
}

const HOW_IT_WORKS: Step[] = [
  { step: '01', title: 'Search or Upload', desc: 'Find your medicine, or upload a prescription for our pharmacies to fulfil.' },
  { step: '02', title: 'Compare Stores', desc: 'See live prices and stock across nearby verified pharmacies.' },
  { step: '03', title: 'Checkout Securely', desc: 'Pay by UPI, card, or Cash on Delivery — your choice.' },
  { step: '04', title: 'Track to Doorstep', desc: 'Follow your order in real time, from confirmation to delivery.' },
];

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: '150+', label: 'Verified Pharmacies' },
  { value: '10,000+', label: 'Medicines Listed' },
  { value: '99.2%', label: 'On-time Delivery' },
  { value: '24/7', label: 'Emergency Support' },
];

interface TrustItem {
  icon: IconType;
  title: string;
  desc: string;
}

const TRUST: TrustItem[] = [
  { icon: FiShield, title: 'Verified Pharmacies', desc: 'Every store is manually approved before it can list medicines.' },
  { icon: FiFileText, title: 'Prescription Safety', desc: 'Rx-required medicines are never shipped without pharmacist approval.' },
  { icon: FiTruck, title: 'Real-Time Tracking', desc: 'Know exactly where your order is, from placed to delivered.' },
];

function Navbar() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-white/50">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-9 w-auto" />
          <span className="font-extrabold text-lg text-[#0f2340] hidden sm:inline">MediConnect</span>
        </Link>
        <div className="hidden md:flex items-center gap-3">
          <DeliveryBar variant="light" />
          <Link to="/emergency" className="btn-ghost !py-2 !text-sm !text-rose-600">Emergency</Link>
          {session ? (
            <Link to="/app" className="btn-primary !py-2 !text-sm">Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost !py-2 !text-sm">Log in</Link>
              <Link to="/signup" className="btn-primary !py-2 !text-sm">Get Started</Link>
            </>
          )}
        </div>
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="md:hidden text-[#0f2340] text-xl">
          {open ? <FiX /> : <FiMenu />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-white/50 bg-white/80">
            <div className="flex flex-col gap-2 p-4">
              <DeliveryBar variant="light" className="justify-center" />
              <Link to="/emergency" onClick={() => setOpen(false)} className="btn-ghost !text-sm !text-rose-600 text-center">Emergency</Link>
              {session ? (
                <Link to="/app" onClick={() => setOpen(false)} className="btn-primary !text-sm text-center">Go to Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="btn-ghost !text-sm text-center">Log in</Link>
                  <Link to="/signup" onClick={() => setOpen(false)} className="btn-primary !text-sm text-center">Get Started</Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function HeroSearch() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(query.trim() ? `/login?next=/app/store/medicines&q=${encodeURIComponent(query)}` : '/login');
  };
  return (
    <form onSubmit={submit} className="mt-8 max-w-xl mx-auto flex items-center gap-2 bg-white rounded-2xl p-2 shadow-xl shadow-brand-600/10 border border-white/60">
      <FiSearch className="text-[#8a9bb0] ml-3 shrink-0" size={20} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medicines, doctors & healthcare services..."
        className="flex-1 bg-transparent outline-none text-sm text-[#0f2340] placeholder:text-[#8a9bb0]" />
      <button className="btn-primary !py-2.5 !px-5 !text-sm shrink-0">Search</button>
    </form>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <Navbar />

      {/* Hero */}
      <header className="max-w-4xl mx-auto text-center px-6 pt-16 pb-14">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <img src="/brand/mediconnect-logo.png" alt="MediConnect — Your Health, Our Priority" className="h-28 md:h-32 w-auto mx-auto mb-2" />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-5xl font-extrabold text-[#0f2340] tracking-tight leading-tight">
          Your Health, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-accent-500">Our Priority</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 text-[#5b7088] text-lg max-w-2xl mx-auto">
          Order medicines from verified pharmacies, consult doctors online, and manage your
          family&apos;s healthcare — all in one trusted platform built for India.
        </motion.p>
        <HeroSearch />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 flex justify-center gap-3 flex-wrap">
          <Link to="/signup" className="btn-primary flex items-center gap-2"><FiShoppingBag /> Shop Medicines</Link>
          <Link to="/signup" className="btn-ghost flex items-center gap-2"><FiUserCheck /> Find a Doctor</Link>
        </motion.div>
      </header>

      {/* Quick categories */}
      <Reveal className="max-w-6xl mx-auto px-6 pb-14">
        <div className="flex flex-wrap justify-center gap-2.5">
          {CATEGORIES.map((c) => (
            <Link key={c} to="/signup" className="glass !rounded-full !px-4 !py-2 text-sm font-semibold text-[#33475b] hover:text-brand-700 hover:shadow-md transition-all">
              {c}
            </Link>
          ))}
        </div>
      </Reveal>

      {/* Features */}
      <Stagger className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-6 pb-20">
        {FEATURES.map((f) => (
          <StaggerItem key={f.title}>
            <div className="glass-card h-full card-hover">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 flex items-center justify-center text-white mb-3">
                <f.icon />
              </div>
              <h3 className="font-extrabold text-[#0f2340] mb-1">{f.title}</h3>
              <p className="text-sm text-[#5b7088] leading-relaxed">{f.desc}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* How it works */}
      <section className="bg-gradient-to-b from-brand-50/60 to-transparent py-20">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#0f2340]">How MediConnect Works</h2>
            <p className="text-[#5b7088] mt-2">From search to doorstep, in four simple steps.</p>
          </Reveal>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((s) => (
              <StaggerItem key={s.step}>
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-lg shadow-brand-600/10 flex items-center justify-center mx-auto mb-4 font-extrabold text-brand-600 text-lg">
                    {s.step}
                  </div>
                  <h3 className="font-extrabold text-[#0f2340] mb-1">{s.title}</h3>
                  <p className="text-sm text-[#5b7088]">{s.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Stats */}
      <Reveal className="max-w-5xl mx-auto px-6 py-16">
        <div className="glass-card !rounded-3xl grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-2xl md:text-3xl font-extrabold text-brand-700">{s.value}</p>
              <p className="text-xs text-[#5b7088] font-bold mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Trust & safety */}
      <section className="max-w-6xl mx-auto px-6 py-6 pb-20">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#0f2340]">Why Choose MediConnect</h2>
          <p className="text-[#5b7088] mt-2">Built with safety and trust at the core.</p>
        </Reveal>
        <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TRUST.map((t) => (
            <StaggerItem key={t.title}>
              <div className="glass-card h-full">
                <t.icon className="text-accent-600 w-6 h-6 mb-3" />
                <h3 className="font-extrabold text-[#0f2340] mb-1">{t.title}</h3>
                <p className="text-sm text-[#5b7088] leading-relaxed">{t.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* CTA */}
      <Reveal className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <div className="rounded-3xl bg-gradient-to-r from-brand-700 to-accent-600 text-white px-8 py-14 shadow-2xl shadow-brand-700/20">
          <FiHeart className="mx-auto mb-3" size={28} />
          <h2 className="text-2xl md:text-3xl font-extrabold mb-2">Ready to take charge of your health?</h2>
          <p className="text-white/85 mb-6 max-w-md mx-auto">Join thousands of Indian families who trust MediConnect for medicines, consultations, and care.</p>
          <Link to="/signup" className="inline-flex items-center gap-2 bg-white text-brand-700 font-bold rounded-xl px-6 py-3 hover:shadow-xl transition-all">
            <FiUserPlus /> Create your free account
          </Link>
        </div>
      </Reveal>

      {/* Footer */}
      <footer className="border-t border-white/50 bg-white/50">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-7 w-auto" />
              <span className="font-extrabold text-[#0f2340]">MediConnect</span>
            </div>
            <p className="text-xs text-[#5b7088]">Your Health, Our Priority.</p>
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#0f2340] mb-2 uppercase tracking-wide">Platform</p>
            <div className="flex flex-col gap-1.5 text-sm text-[#5b7088]">
              <Link to="/signup" className="hover:text-brand-600">Medicines</Link>
              <Link to="/signup" className="hover:text-brand-600">Doctors</Link>
              <Link to="/emergency" className="hover:text-brand-600">Emergency</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#0f2340] mb-2 uppercase tracking-wide">Account</p>
            <div className="flex flex-col gap-1.5 text-sm text-[#5b7088]">
              <Link to="/login" className="hover:text-brand-600">Log in</Link>
              <Link to="/signup" className="hover:text-brand-600">Sign up</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#0f2340] mb-2 uppercase tracking-wide flex items-center gap-1"><FiCheckCircle size={12} /> Trust</p>
            <div className="flex flex-col gap-1.5 text-sm text-[#5b7088]">
              <span className="flex items-center gap-1.5"><FiShield size={12} /> Verified Pharmacies</span>
              <span className="flex items-center gap-1.5"><FiStar size={12} /> Rated Doctors</span>
            </div>
          </div>
        </div>
        <div className="border-t border-white/50 text-center text-xs text-[#8a9bb0] py-4">
          © {new Date().getFullYear()} MediConnect. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
