import { Suspense, lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import PageTransition from './components/PageTransition';
import type { UserRole } from './types/database.types';

import Landing from './pages/shared/Landing';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import EmergencyPage from './pages/shared/EmergencyPage';

// Role dashboards are lazy-loaded: a given user only ever needs one of these
// five, so there's no reason to ship all five in the initial bundle.
const PatientDashboard = lazy(() => import('./pages/patient/PatientDashboard'));
const NurseDashboard = lazy(() => import('./pages/nurse/NurseDashboard'));
const DoctorDashboard = lazy(() => import('./pages/doctor/DoctorDashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const StoreOwnerDashboard = lazy(() => import('./pages/store/StoreOwnerDashboard'));

const ROLE_HOME: Record<UserRole, string> = {
  customer: '/app/store',
  store_owner: '/app/store-owner',
  doctor: '/app/doctor',
  nurse: '/app/nurse',
  admin: '/app/admin',
};

/** Where a logged-in user of this role should land. Pure + exported so it's unit-testable without rendering. */
export function resolveHomeForRole(role: UserRole | null): string {
  return (role && ROLE_HOME[role]) || '/';
}

/** Is this role allowed on a route guarded by `allow`? No `allow` list means "any authenticated role" — but an absent/null role is always denied, fail-closed. */
export function isRoleAllowed(role: UserRole | null, allow?: UserRole[]): boolean {
  if (!role) return false;
  if (!allow) return true;
  return allow.includes(role);
}

interface ProtectedProps {
  allow?: UserRole[];
  boundaryName?: string;
  children: ReactNode;
}

/** Blocks a route until we know the session + role, then enforces `allow`. */
function Protected({ allow, boundaryName, children }: ProtectedProps) {
  const { session, role, loading } = useAuth();
  if (loading) return <FullscreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isRoleAllowed(role, allow)) return <Navigate to="/" replace />;
  return (
    <ErrorBoundary boundaryName={boundaryName}>
      <Suspense fallback={<FullscreenLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function FullscreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <img src="/brand/mediconnect-icon.png" alt="MediConnect" className="h-14 w-auto animate-pulse" />
      <div className="w-8 h-8 rounded-full border-4 border-brand-300 border-t-brand-600 animate-spin" role="status" aria-label="Loading" />
    </div>
  );
}

/** Sends a freshly-logged-in user straight to their role's dashboard. */
function RoleRedirect() {
  const { role } = useAuth();
  return <Navigate to={resolveHomeForRole(role)} replace />;
}

export default function App() {
  const location = useLocation();
  return (
    <>
      {/* Public pages: safe to give AnimatePresence a location-keyed <Routes> of
          their own since none of these lazy-load or hold cross-navigation state.
          Kept separate from the dashboard routes below so that internal
          dashboard navigation (e.g. /app/store -> /app/store/medicines) never
          forces this outer tree to remount a lazy-loaded dashboard. */}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />
          <Route path="/emergency" element={<PageTransition><EmergencyPage /></PageTransition>} />
        </Routes>
      </AnimatePresence>

      <Routes>
        <Route path="/app" element={<Protected><RoleRedirect /></Protected>} />

        {/* Customer / patient-facing commerce + clinical-lite features */}
        <Route path="/app/store/*" element={<Protected allow={['customer']} boundaryName="Patient Dashboard"><PatientDashboard /></Protected>} />

        {/* Clinical staff */}
        <Route path="/app/nurse/*" element={<Protected allow={['nurse']} boundaryName="Nurse Dashboard"><NurseDashboard /></Protected>} />
        <Route path="/app/doctor/*" element={<Protected allow={['doctor']} boundaryName="Doctor Dashboard"><DoctorDashboard /></Protected>} />

        {/* Operations */}
        <Route path="/app/store-owner/*" element={<Protected allow={['store_owner']} boundaryName="Store Owner Dashboard"><StoreOwnerDashboard /></Protected>} />
        <Route path="/app/admin/*" element={<Protected allow={['admin']} boundaryName="Admin Dashboard"><AdminDashboard /></Protected>} />

        {/* Unknown /app paths -> home. Scoped to /app/* so this fallback never
            hijacks the public routes rendered by the outer <Routes> above
            (otherwise navigating to / or /login instantly bounces back to /). */}
        <Route path="/app/*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
