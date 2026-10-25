import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import { useAuth } from '../lib/AuthContext';
import NotificationBell from './NotificationBell';
import AmbientBackground from './AmbientBackground';
import DeliveryBar from './DeliveryBar';

export interface DashboardNavItem {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
  badge?: number;
}

interface DashboardShellProps {
  nav: DashboardNavItem[];
  title: string;
  children: ReactNode;
}

interface NavLinksProps {
  onNavigate?: () => void;
}

/**
 * Shared shell for every role dashboard (patient/nurse/doctor/admin/store owner).
 * `nav` = [{ to, icon: <Icon/>, label }]. Keeps the MediConnect aesthetic
 * consistent across all five roles instead of five different layouts.
 */
export default function DashboardShell({ nav, title, children }: DashboardShellProps) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavLinks = ({ onNavigate }: NavLinksProps) => (
    <nav className="flex-1 space-y-1">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
              isActive ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-[#33475b] hover:bg-white/60'
            }`
          }
        >
          {item.icon} {item.label}
          {!!item.badge && (
            <motion.span key={item.badge} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {item.badge > 9 ? '9+' : item.badge}
            </motion.span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen relative flex">
      <AmbientBackground />
      {/* Desktop sidebar */}
      <aside className="w-64 shrink-0 p-4 hidden md:flex flex-col">
        <div className="glass-card flex-1 flex flex-col">
          <div className="flex items-center gap-2 font-extrabold text-lg text-[#0f2340] mb-6 px-1">
            <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-8 w-auto" /> MediConnect
          </div>
          <NavLinks />
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 mt-2">
            <FiLogOut /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 glass !rounded-none flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-extrabold text-[#0f2340]">
          <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-7 w-auto" /> MediConnect
        </div>
        <button onClick={() => setMobileOpen(true)} className="text-[#0f2340] text-xl" aria-label="Open menu">
          <FiMenu />
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-40" />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'tween', duration: 0.25 }}
              className="md:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-50 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 font-extrabold text-[#0f2340]">
                  <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-8 w-auto" /> MediConnect
                </div>
                <button onClick={() => setMobileOpen(false)} aria-label="Close menu"><FiX /></button>
              </div>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
              <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 mt-2">
                <FiLogOut /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 p-4 pt-20 md:pt-4 md:pl-0">
        <div className="glass-card mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold text-[#0f2340]">{title}</h1>
            <p className="text-xs text-[#5b7088] font-medium">Welcome back, {profile?.name?.split(' ')[0] || '...'}</p>
          </div>
          <div className="flex items-center gap-3">
            <DeliveryBar />
            <NotificationBell />
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white font-bold">
              {profile?.name?.[0] || '?'}
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
