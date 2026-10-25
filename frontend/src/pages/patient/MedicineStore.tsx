import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { FiSearch, FiPlus, FiShield, FiHeart, FiFilter, FiMapPin, FiZap } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useLocation } from '../../lib/LocationContext';
import { formatDistance, isServiceable, speedLabel } from '../../lib/geolocation';
import { Stagger, StaggerItem } from '../../components/Reveal';
import { PageLoader } from '../../components/UIStates';
import MedicineImage from '../../components/MedicineImage';
import type { StockWithMedicineAndStore, MedicineCatalogGroup } from '../../types/medicine';

type PrescriptionFilter = 'all' | 'required' | 'otc';
type AvailabilityFilter = 'in_stock' | 'all';
type SortBy = 'nearest' | 'price_asc' | 'price_desc' | 'name';

interface OfferMeta {
  distance: number | null;
  serviceable: boolean;
}

export default function MedicineStore() {
  const { user } = useAuth();
  const { distanceTo, location } = useLocation();
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
  const [sortBy, setSortBy] = useState<SortBy>('nearest');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [stockRes, wishlistRes] = await Promise.all([
        supabase
          .from('stock')
          .select('stock_id, price, mrp, quantity, is_active, medicine:medicines(medicine_id,name,generic_name,brand,category,prescription_required,description,is_active,manufacturer,form,pack_size,salt_composition,gst_rate,image_url), store:stores(store_id,store_name,rating,approval_status,city,latitude,longitude,delivery_radius_km)')
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

  const offerMeta = useMemo(() => {
    const meta: Record<number, OfferMeta> = {};
    for (const r of rows) {
      const distance = distanceTo(r.store);
      meta[r.stock_id] = {
        distance,
        serviceable: isServiceable(distance, r.store?.delivery_radius_km),
      };
    }
    return meta;
  }, [rows, distanceTo]);

  const grouped = useMemo<MedicineCatalogGroup[]>(() => {
    const byMed = new Map<number, MedicineCatalogGroup>();
    for (const r of rows) {
      if (!r.medicine || !r.medicine.is_active) continue;
      if (r.store?.approval_status !== 'approved') continue;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${r.medicine.name} ${r.medicine.generic_name || ''} ${r.medicine.brand || ''} ${r.medicine.category || ''} ${r.medicine.salt_composition || ''}`.toLowerCase();
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
    const distanceOf = (r: StockWithMedicineAndStore) => offerMeta[r.stock_id]?.distance ?? Number.POSITIVE_INFINITY;
    list.forEach((g) => g.offers.sort((a, b) => {
      const aService = offerMeta[a.stock_id]?.serviceable ? 0 : 1;
      const bService = offerMeta[b.stock_id]?.serviceable ? 0 : 1;
      if (aService !== bService) return aService - bService;
      if (distanceOf(a) !== distanceOf(b)) return distanceOf(a) - distanceOf(b);
      return a.price - b.price;
    }));
    const cheapestOf = (g: MedicineCatalogGroup) => {
      const serviceable = g.offers.filter((o) => offerMeta[o.stock_id]?.serviceable);
      return (serviceable[0] ?? g.offers[0])!;
    };
    // offers[0] is safe here: list was filtered to groups with offers.length > 0 above.
    if (sortBy === 'price_asc') list.sort((a, b) => cheapestOf(a).price - cheapestOf(b).price);
    else if (sortBy === 'price_desc') list.sort((a, b) => cheapestOf(b).price - cheapestOf(a).price);
    else if (sortBy === 'name') list.sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
    else list.sort((a, b) => distanceOf(a.offers[0]!) - distanceOf(b.offers[0]!));
    return list;
  }, [rows, query, category, prescriptionFilter, availability, maxPrice, sortBy, offerMeta]);

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
            <option value="nearest">Nearest first</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name">Name: A-Z</option>
          </select>
          <input type="number" min="0" placeholder="Max price (₹)" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="input-field col-span-2 sm:col-span-1" />
        </div>
      )}

      {toast && <div className="glass-card !py-2 !px-4 mb-3 text-xs font-bold text-brand-700 w-fit">{toast}</div>}

      <div className="flex items-center gap-2 mb-3 text-[11px] font-bold text-[#5b7088]">
        <FiMapPin className="text-brand-600" />
        Showing pharmacies near <span className="text-[#0f2340]">{location.label}</span>
        <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><FiZap size={10} /> Nearest first</span>
      </div>

      {loading ? (
        <PageLoader label="Loading medicines..." />
      ) : (
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.map(({ medicine, offers }) => {
            const cheapest = offers[0];
            if (!cheapest) return null; // invariant: grouped only contains entries with offers.length > 0
            const inWishlist = wishlist.has(medicine.medicine_id);
            const meta = offerMeta[cheapest.stock_id];
            const discountPct = cheapest.mrp > cheapest.price ? Math.round(((cheapest.mrp - cheapest.price) / cheapest.mrp) * 100) : 0;
            return (
              <StaggerItem key={medicine.medicine_id}>
                <div className="glass-card flex flex-col card-hover">
                <div className="flex gap-3">
                  <MedicineImage name={medicine.name} form={medicine.form} src={medicine.image_url}
                    className="h-[92px] w-[92px] shrink-0 rounded-2xl border border-white/60" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/app/store/medicines/${medicine.medicine_id}`} className="font-extrabold text-[#0f2340] hover:text-brand-600 leading-snug">
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
                    <p className="text-xs text-[#5b7088] mt-2 truncate">{medicine.category || 'Uncategorized'}{medicine.brand ? ` · ${medicine.brand}` : ''}</p>
                    <p className="text-[10px] text-[#8a9bb0] mt-0.5 truncate">
                      {medicine.pack_size ? `${medicine.pack_size}` : ''}{medicine.manufacturer ? ` · ${medicine.manufacturer}` : ''}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-[#5b7088] mt-2 mb-1 line-clamp-2">{medicine.description}</p>
                {medicine.salt_composition && medicine.salt_composition !== '—' && (
                  <p className="text-[10px] text-[#8a9bb0] mb-2 truncate">Salt: {medicine.salt_composition}</p>
                )}

                <div className="mt-auto">
                  {cheapest.quantity > 0 ? (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-lg font-extrabold text-[#0f2340]">₹{cheapest.price}</span>
                      {cheapest.mrp > cheapest.price && <span className="text-xs text-[#8a9bb0] line-through">₹{cheapest.mrp}</span>}
                      {discountPct > 0 && <span className="badge bg-emerald-100 text-emerald-700">{discountPct}% OFF</span>}
                      <span className="text-[11px] text-[#5b7088] ml-auto">{offers.length} store{offers.length > 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <p className="badge bg-rose-100 text-rose-600 w-fit mb-2">Out of stock</p>
                  )}
                  <p className="text-[11px] text-[#5b7088] mb-1 flex items-center gap-1">
                    <span className={meta?.serviceable === false ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                      {meta?.serviceable === false ? 'Pickup only' : speedLabel(meta?.distance)}
                    </span>
                    {meta?.distance != null && <span>· {formatDistance(meta.distance)} away</span>}
                    {discountPct > 0 && <span className="ml-auto">GST {medicine.gst_rate}%</span>}
                  </p>
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
