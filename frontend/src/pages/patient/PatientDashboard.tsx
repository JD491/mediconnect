import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiGrid, FiShoppingBag, FiShoppingCart, FiCalendar, FiActivity, FiPackage, FiPhoneCall, FiHeart, FiFileText, FiCamera } from 'react-icons/fi';
import type { IconType } from 'react-icons';
import DashboardShell, { type DashboardNavItem } from '../../components/DashboardShell';
import { Stagger, StaggerItem } from '../../components/Reveal';
import PageTransition from '../../components/PageTransition';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import MedicineStore from './MedicineStore';
import MedicineDetail from './MedicineDetail';
import Wishlist from './Wishlist';
import Cart from './Cart';
import BookAppointment from './BookAppointment';
import SymptomChecker from './SymptomChecker';
import MyOrders from './MyOrders';
import OrderTracking from './OrderTracking';
import Prescriptions from './Prescriptions';
import PrescriptionScan from './PrescriptionScan';

const NAV_BASE: DashboardNavItem[] = [
  { to: '/app/store', end: true, icon: <FiGrid />, label: 'Overview' },
  { to: '/app/store/medicines', icon: <FiShoppingBag />, label: 'Medicine Store' },
  { to: '/app/store/wishlist', icon: <FiHeart />, label: 'Wishlist' },
  { to: '/app/store/cart', icon: <FiShoppingCart />, label: 'Cart' },
  { to: '/app/store/orders', icon: <FiPackage />, label: 'My Orders' },
  { to: '/app/store/prescriptions', icon: <FiFileText />, label: 'Prescriptions' },
  { to: '/app/store/prescription-scan', icon: <FiCamera />, label: 'Scan Prescription' },
  { to: '/app/store/appointments', icon: <FiCalendar />, label: 'Appointments' },
  { to: '/app/store/symptom-checker', icon: <FiActivity />, label: 'Symptom Checker' },
];

interface OverviewCard {
  to: string;
  icon: IconType;
  title: string;
  desc: string;
}

function Overview() {
  const cards: OverviewCard[] = [
    { to: '/app/store/medicines', icon: FiShoppingBag, title: 'Order Medicines', desc: 'Browse & compare prices across pharmacies near you.' },
    { to: '/app/store/appointments', icon: FiCalendar, title: 'Book a Doctor', desc: 'See available doctors and book a consultation slot.' },
    { to: '/app/store/symptom-checker', icon: FiActivity, title: 'Check Symptoms', desc: 'Get quick, transparent guidance on what you might have.' },
    { to: '/emergency', icon: FiPhoneCall, title: 'Emergency', desc: 'One tap to reach ambulance, hospital or blood bank.' },
  ];
  return (
    <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((c) => (
        <StaggerItem key={c.to}>
          <Link to={c.to} className="glass-card h-full block card-hover">
            <c.icon className="text-brand-600 w-6 h-6 mb-3" />
            <h3 className="font-extrabold text-[#0f2340] mb-1">{c.title}</h3>
            <p className="text-sm text-[#5b7088]">{c.desc}</p>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const loadCount = async () => {
      const { count } = await supabase.from('cart_items').select('cart_item_id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('saved_for_later', false);
      setCartCount(count || 0);
    };
    loadCount();
    const channel = supabase.channel('cart-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${user.id}` }, loadCount)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const nav = NAV_BASE.map((item) => (item.label === 'Cart' ? { ...item, badge: cartCount } : item));
  const location = useLocation();

  return (
    <DashboardShell nav={nav} title="Patient Dashboard">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route index element={<PageTransition><Overview /></PageTransition>} />
          <Route path="medicines" element={<PageTransition><MedicineStore /></PageTransition>} />
          <Route path="medicines/:id" element={<PageTransition><MedicineDetail /></PageTransition>} />
          <Route path="wishlist" element={<PageTransition><Wishlist /></PageTransition>} />
          <Route path="cart" element={<PageTransition><Cart /></PageTransition>} />
          <Route path="orders" element={<PageTransition><MyOrders /></PageTransition>} />
          <Route path="orders/:id" element={<PageTransition><OrderTracking /></PageTransition>} />
          <Route path="prescriptions" element={<PageTransition><Prescriptions /></PageTransition>} />
          <Route path="prescription-scan" element={<PageTransition><PrescriptionScan /></PageTransition>} />
          <Route path="appointments" element={<PageTransition><BookAppointment /></PageTransition>} />
          <Route path="symptom-checker" element={<PageTransition><SymptomChecker /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </DashboardShell>
  );
}
