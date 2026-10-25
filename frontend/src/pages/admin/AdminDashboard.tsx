import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiGrid, FiUsers, FiShoppingBag, FiUserCheck, FiPackage, FiClipboard, FiStar, FiFileText } from 'react-icons/fi';
import DashboardShell, { type DashboardNavItem } from '../../components/DashboardShell';
import PageTransition from '../../components/PageTransition';

import Overview from './Overview';
import Users from './Users';
import Stores from './Stores';
import Doctors from './Doctors';
import MedicineCatalog from './MedicineCatalog';
import Orders from './Orders';
import Reviews from './Reviews';
import AuditLogs from './AuditLogs';

const NAV: DashboardNavItem[] = [
  { to: '/app/admin', end: true, icon: <FiGrid />, label: 'Dashboard' },
  { to: '/app/admin/users', icon: <FiUsers />, label: 'Users' },
  { to: '/app/admin/stores', icon: <FiShoppingBag />, label: 'Stores' },
  { to: '/app/admin/doctors', icon: <FiUserCheck />, label: 'Doctors' },
  { to: '/app/admin/medicines', icon: <FiPackage />, label: 'Medicine Catalog' },
  { to: '/app/admin/orders', icon: <FiClipboard />, label: 'Orders' },
  { to: '/app/admin/reviews', icon: <FiStar />, label: 'Reviews' },
  { to: '/app/admin/audit-logs', icon: <FiFileText />, label: 'Audit Logs' },
];

export default function AdminDashboard() {
  const location = useLocation();
  return (
    <DashboardShell nav={NAV} title="Admin Dashboard">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route index element={<PageTransition><Overview /></PageTransition>} />
          <Route path="users" element={<PageTransition><Users /></PageTransition>} />
          <Route path="stores" element={<PageTransition><Stores /></PageTransition>} />
          <Route path="doctors" element={<PageTransition><Doctors /></PageTransition>} />
          <Route path="medicines" element={<PageTransition><MedicineCatalog /></PageTransition>} />
          <Route path="orders" element={<PageTransition><Orders /></PageTransition>} />
          <Route path="reviews" element={<PageTransition><Reviews /></PageTransition>} />
          <Route path="audit-logs" element={<PageTransition><AuditLogs /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </DashboardShell>
  );
}
