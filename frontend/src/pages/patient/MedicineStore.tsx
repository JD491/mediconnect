import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { FiSearch, FiPlus, FiShield, FiHeart, FiFilter } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { Stagger, StaggerItem } from '../../components/Reveal';
import { PageLoader } from '../../components/UIStates';
import type { StockWithMedicineAndStore, MedicineCatalogGroup } from '../../types/medicine';

type PrescriptionFilter = 'all' | 'required' | 'otc';
type AvailabilityFilter = 'in_stock' | 'all';
type SortBy = 'price_asc' | 'price_desc' | 'name';

export default function MedicineStore() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<StockWithMedicineAndStore[]>([]);
  const [wishlist, setWishlist] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [category, setCategory] = useState('all');
  const [prescriptionFilter, setPrescriptionFilter] = useState<PrescriptionFilter>('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('in_stock');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('price_asc');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [stockRes, wishlistRes] = await Promise.all([
        supabase
          .from('stock')
          .select('stock_id, price, mrp, quantity, is_active, medicine:medicines(medicine_id,name,generic_name,brand,category,prescription_required,description,is_active), store:stores(store_id,store_name,rating,approval_status)')
          .eq('is_active', true)
          .order('price', { ascending: true }),
        supabase.from('wishlists').select('medicine_id').eq('user_id', user.id),
      ]);
      if (!stockRes.error) setRows((stockRes.data ?? []) as unknown as StockWithMedicineAndStore[]);
      if (!wishlistRes.error) setWishlist(new Set((wishlistRes.data ?? []).map((w) => w.medicine_id)));
      setLoading(false);
    })();
  }, [user]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.medicine?.category && set.add(r.medicine.category));
    return ['all', ...[...set].sort()];
  }, [rows]);

  const grouped = useMemo<MedicineCatalogGroup[]>(() => {
    const byMed = new Map<number, MedicineCatalogGroup>();
    for (const r of rows) {
      if (!r.medicine || !r.medicine.is_active) continue;
      if (r.store?.approval_status !== 'approved') continue;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${r.medicine.name} ${r.medicine.generic_name || ''} ${r.medicine.brand || ''} ${r.medicine.category || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (category !== 'all' && r.medicine.category !== category) continue;
      if (prescriptionFilter === 'required' && !r.medicine.prescription_required) continue;
      if (prescriptionFilter === 'otc' && r.medicine.prescription_required) continue;
      if (availability === 'in_stock' && r.quantity <= 0) continue;
      if (maxPrice && r.price > Number(maxPrice)) continue;

      const key = r.medicine.medicine_id;
      if (!byMed.has(key)) byMed.set(key, { medicine: r.medicine, offers: [] });
      byMed.get(key)!.offers.push(r);
    }
    const list = [...byMed.values()].filter((g) => g.offers.length > 0);
    list.forEach((g) => g.offers.sort((a, b) => a.price - b.price));
    // offers[0] is safe here: list was filtered to groups with offers.length > 0 above.
    if (sortBy === 'price_asc') list.sort((a, b) => a.offers[0]!.price - b.offers[0]!.price);
    else if (sortBy === 'price_desc') list.sort((a, b) => b.offers[0]!.price - a.offers[0]!.price);
    else if (sortBy === 'name') list.sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
    return list;
  }, [rows, query, category, prescriptionFilter, availability, maxPrice, sortBy]);

  const addToCart = async (stockId: number) => {
    if (!user) return;
    const { error } = await supabase.from('cart_items').upsert(
      { user_id: user.id, stock_id: stockId, quantity: 1, saved_for_later: false },
      { onConflict: 'user_id,stock_id', ignoreDuplicates: false },
    );
    setToast(error ? 'Could not add to cart' : 'Added to cart');
    setTimeout(() => setToast(''), 1800);
  };

  const toggleWishlist = async (medicineId: number) => {
    if (!user) return;
    if (wishlist.has(medicineId)) {
      await supabase.from('wishlists').delete().eq('user_id', user.id).eq('medicine_id', medicineId);
      setWishlist((w) => {
        const n = new Set(w);
        n.delete(medicineId);
        return n;
      });
    } else {
      await supabase.from('wishlists').insert({ user_id: user.id, medicine_id: medicineId });
      setWishlist((w) => new Set(w).add(medicineId));
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
          <input value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder="Search medicines, generic name, brand..." className="input-field pl-11" />
        </div>
        <button onClick={() => setShowFilters((s) => !s)} className="btn-ghost !px-4 flex items-center gap-2">
          <FiFilter /> <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {showFilters && (
        <div className="glass-card mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
            {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
          </select>
          <select value={prescriptionFilter} onChange={(e) => setPrescriptionFilter(e.target.value as PrescriptionFilter)} className="input-field">
            <option value="all">Rx: All</option>
            <option value="required">Prescription required</option>
            <option value="otc">No prescription (OTC)</option>
          </select>
          <select value={availability} onChange={(e) => setAvailability(e.target.value as AvailabilityFilter)} className="input-field">
            <option value="in_stock">In stock only</option>
            <option value="all">Include out of stock</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="input-field">
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name">Name: A-Z</option>
          </select>
          <input type="number" min="0" placeholder="Max price (₹)" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="input-field col-span-2 sm:col-span-1" />
        </div>
      )}

      {toast && <div className="glass-card !py-2 !px-4 mb-3 text-xs font-bold text-brand-700 w-fit">{toast}</div>}

      {loading ? (
        <PageLoader label="Loading medicines..." />
      ) : (
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.map(({ medicine, offers }) => {
            const cheapest = offers[0];
            if (!cheapest) return null; // invariant: grouped only contains entries with offers.length > 0
            const inWishlist = wishlist.has(medicine.medicine_id);
            return (
              <StaggerItem key={medicine.medicine_id}>
                <div className="glass-card flex flex-col card-hover">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/app/store/medicines/${medicine.medicine_id}`} className="font-extrabold text-[#0f2340] hover:text-brand-600">
                    {medicine.name}
                  </Link>
                  <button onClick={() => toggleWishlist(medicine.medicine_id)} className={inWishlist ? 'text-rose-500' : 'text-[#b8c9db]'}
                    title="Wishlist" aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={inWishlist}>
                    <FiHeart fill={inWishlist ? 'currentColor' : 'none'} />
                  </button>
                </div>
                {medicine.prescription_required && (
                  <span className="badge bg-amber-100 text-amber-700 flex items-center gap-1 w-fit mt-1"><FiShield size={10} /> Rx required</span>
                )}
                <p className="text-xs text-[#5b7088] mt-2">{medicine.category || 'Uncategorized'}{medicine.brand ? ` · ${medicine.brand}` : ''}</p>
                <p className="text-xs text-[#5b7088] mb-3 line-clamp-2">{medicine.description}</p>

                <div className="mt-auto">
                  {cheapest.quantity > 0 ? (
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-lg font-extrabold text-[#0f2340]">₹{cheapest.price}</span>
                      {cheapest.mrp > cheapest.price && <span className="text-xs text-[#8a9bb0] line-through">₹{cheapest.mrp}</span>}
                      <span className="text-[11px] text-[#5b7088] ml-auto">{offers.length} store{offers.length > 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <p className="badge bg-rose-100 text-rose-600 w-fit mb-2">Out of stock</p>
                  )}
                  <p className="text-[11px] text-[#5b7088] mb-3">Best price at {cheapest.store?.store_name}</p>
                  <div className="flex gap-2">
                    <Link to={`/app/store/medicines/${medicine.medicine_id}`} className="btn-ghost !py-2 !text-sm flex-1 text-center">Details</Link>
                    <button disabled={cheapest.quantity <= 0} onClick={() => addToCart(cheapest.stock_id)}
                      className="btn-primary !py-2 !text-sm flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                      <FiPlus /> Add
                    </button>
                  </div>
                </div>
                </div>
              </StaggerItem>
            );
          })}
          {grouped.length === 0 && <p className="text-sm text-[#5b7088]">No medicines match your filters.</p>}
        </Stagger>
      )}
    </div>
  );
}
