import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiGrid, FiPackage, FiPlusCircle, FiShoppingBag, FiFileText, FiHome, FiTag, FiBarChart2 } from 'react-icons/fi';
import DashboardShell, { type DashboardNavItem } from '../../components/DashboardShell';
import PageTransition from '../../components/PageTransition';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { PageLoader } from '../../components/UIStates';
import type { StoreRow } from '../../types/store';

import Overview from './Overview';
import Inventory from './Inventory';
import AddMedicine from './AddMedicine';
import Orders from './Orders';
import Prescriptions from './Prescriptions';
import StoreProfile from './StoreProfile';
import Coupons from './Coupons';
import Reports from './Reports';

const NAV: DashboardNavItem[] = [
  { to: '/app/store-owner', end: true, icon: <FiGrid />, label: 'Dashboard' },
  { to: '/app/store-owner/inventory', icon: <FiPackage />, label: 'Inventory' },
  { to: '/app/store-owner/add-medicine', icon: <FiPlusCircle />, label: 'Add Medicine' },
  { to: '/app/store-owner/orders', icon: <FiShoppingBag />, label: 'Orders' },
  { to: '/app/store-owner/prescriptions', icon: <FiFileText />, label: 'Prescriptions' },
  { to: '/app/store-owner/coupons', icon: <FiTag />, label: 'Offers & Coupons' },
  { to: '/app/store-owner/reports', icon: <FiBarChart2 />, label: 'Sales & Reports' },
  { to: '/app/store-owner/profile', icon: <FiHome />, label: 'Store Profile' },
];

export default function StoreOwnerDashboard() {
  const { user } = useAuth();
  const [store, setStore] = useState<StoreRow | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const loadStore = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('stores').select('*').eq('owner_id', user.id).single();
    setStore(data || null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  if (loading) {
    return (
      <DashboardShell nav={NAV} title="Store Owner Dashboard">
        <PageLoader label="Loading your store..." />
      </DashboardShell>
    );
  }

  if (!store) {
    return (
      <DashboardShell nav={NAV} title="Store Owner Dashboard">
        <div className="glass-card">
          <p className="text-sm text-[#5b7088]">
            No store record was found for your account. This shouldn&apos;t happen for a store-owner
            signup — please contact support.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell nav={NAV} title={store.store_name || 'Store Owner Dashboard'}>
      {store.approval_status !== 'approved' && (
        <div className="glass-card mb-4 !bg-amber-50/70 border-amber-200/70">
          <p className="text-sm font-bold text-amber-700">
            Your store is <span className="capitalize">{store.approval_status}</span>.{' '}
            {store.approval_status === 'pending'
              ? 'An admin needs to approve it before customers can place orders with you. You can still set up your profile and inventory in the meantime.'
              : 'Please contact support for details.'}
          </p>
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route index element={<PageTransition><Overview store={store} /></PageTransition>} />
          <Route path="inventory" element={<PageTransition><Inventory store={store} /></PageTransition>} />
          <Route path="add-medicine" element={<PageTransition><AddMedicine store={store} /></PageTransition>} />
          <Route path="orders" element={<PageTransition><Orders store={store} /></PageTransition>} />
          <Route path="prescriptions" element={<PageTransition><Prescriptions store={store} /></PageTransition>} />
          <Route path="coupons" element={<PageTransition><Coupons store={store} /></PageTransition>} />
          <Route path="reports" element={<PageTransition><Reports store={store} /></PageTransition>} />
          <Route path="profile" element={<PageTransition><StoreProfile store={store} onSaved={loadStore} /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </DashboardShell>
  );
}
