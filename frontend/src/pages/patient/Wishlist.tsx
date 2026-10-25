import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FiHeart, FiShoppingCart, FiTrash2 } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { PageLoader, EmptyState } from '../../components/UIStates';
import type { Database } from '../../types/database.types';
import type { StockOffer } from '../../types/medicine';

type MedicineRow = Database['public']['Tables']['medicines']['Row'];

interface WishlistRow {
  wishlist_id: number;
  medicine_id: number;
  medicine: MedicineRow | null;
  best?: StockOffer;
}

export default function Wishlist() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: wl } = await supabase
      .from('wishlists')
      .select('wishlist_id, medicine_id, medicine:medicines(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const wishlistRows = (wl ?? []) as unknown as WishlistRow[];
    const withOffers = await Promise.all(
      wishlistRows.map(async (w) => {
        const { data: offers } = await supabase
          .from('stock')
          .select('stock_id, price, mrp, quantity, is_active, store:stores(store_name, approval_status)')
          .eq('medicine_id', w.medicine_id)
          .eq('is_active', true)
          .gt('quantity', 0)
          .order('price', { ascending: true });
        const offerRows = (offers ?? []) as unknown as StockOffer[];
        const best = offerRows.find((o) => o.store?.approval_status === 'approved');
        return { ...w, best };
      }),
    );
    setRows(withOffers);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (medicineId: number) => {
    if (!user) return;
    await supabase.from('wishlists').delete().eq('user_id', user.id).eq('medicine_id', medicineId);
    load();
  };

  const moveToCart = async (row: WishlistRow) => {
    if (!user) return;
    if (!row.best) {
      setToast('Currently unavailable at any store.');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    await supabase.from('cart_items').upsert(
      { user_id: user.id, stock_id: row.best.stock_id, quantity: 1, saved_for_later: false },
      { onConflict: 'user_id,stock_id', ignoreDuplicates: false },
    );
    await supabase.from('wishlists').delete().eq('wishlist_id', row.wishlist_id);
    setToast('Moved to cart.');
    setTimeout(() => setToast(''), 1800);
    load();
  };

  if (loading) return <PageLoader label="Loading your wishlist..." />;

  return (
    <div className="space-y-3">
      {toast && <div className="glass-card !py-2 !px-4 text-xs font-bold text-brand-700 w-fit">{toast}</div>}
      {rows.length === 0 && (
        <EmptyState icon={FiHeart} title="Your wishlist is empty" description="Tap the heart on any medicine to save it here." />
      )}
      {rows.map((row) => (
        <div key={row.wishlist_id} className="glass-card flex items-center justify-between">
          <div>
            <Link to={`/app/store/medicines/${row.medicine_id}`} className="font-bold text-[#0f2340] text-sm hover:text-brand-600">{row.medicine?.name}</Link>
            {row.best ? (
              <p className="text-xs text-[#5b7088]">₹{row.best.price} at {row.best.store?.store_name}</p>
            ) : (
              <p className="text-xs text-rose-500">Currently unavailable</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => moveToCart(row)} className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1"><FiShoppingCart /> Move to cart</button>
            <button onClick={() => remove(row.medicine_id)} aria-label={`Remove ${row.medicine?.name ?? 'item'} from wishlist`} className="text-rose-400 hover:text-rose-600"><FiTrash2 /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
