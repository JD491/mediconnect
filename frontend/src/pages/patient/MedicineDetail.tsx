import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiShield, FiHeart, FiStar, FiPlus, FiAlertCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { PageLoader } from '../../components/UIStates';
import type { Database } from '../../types/database.types';
import type { StockOffer, MedicineWithStock, MedicineAlternative, ReviewWithReviewer } from '../../types/medicine';

type MedicineRow = Database['public']['Tables']['medicines']['Row'];

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((n) => <FiStar key={n} fill={n <= Math.round(value) ? 'currentColor' : 'none'} size={14} />)}
    </span>
  );
}

export default function MedicineDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [medicine, setMedicine] = useState<MedicineRow | null>(null);
  const [offers, setOffers] = useState<StockOffer[]>([]);
  const [alternatives, setAlternatives] = useState<MedicineAlternative[]>([]);
  const [reviews, setReviews] = useState<ReviewWithReviewer[]>([]);
  const [inWishlist, setInWishlist] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || !user) return;
    const medicineId = Number(id);
    setLoading(true);
    const { data: med } = await supabase.from('medicines').select('*').eq('medicine_id', medicineId).single();
    setMedicine(med);
    if (!med) {
      setLoading(false);
      return;
    }

    const [offersRes, reviewsRes, wishlistRes, purchaseRes, myReviewRes] = await Promise.all([
      supabase.from('stock').select('*, store:stores(store_id, store_name, rating, city, approval_status)')
        .eq('medicine_id', medicineId).eq('is_active', true).order('price', { ascending: true }),
      supabase.from('reviews').select('*, reviewer:profiles(name)').eq('target_type', 'medicine').eq('target_id', id).order('created_at', { ascending: false }),
      supabase.from('wishlists').select('wishlist_id').eq('user_id', user.id).eq('medicine_id', medicineId).maybeSingle(),
      supabase.from('order_items').select('order_item_id, order:orders!inner(status, user_id)').eq('medicine_id', medicineId).eq('order.user_id', user.id).eq('order.status', 'delivered'),
      supabase.from('reviews').select('review_id').eq('target_type', 'medicine').eq('target_id', id).eq('user_id', user.id).maybeSingle(),
    ]);

    setOffers(((offersRes.data ?? []) as unknown as StockOffer[]).filter((o) => o.store?.approval_status === 'approved'));
    setReviews((reviewsRes.data ?? []) as unknown as ReviewWithReviewer[]);
    setInWishlist(!!wishlistRes.data);
    setCanReview((purchaseRes.data ?? []).length > 0);
    setAlreadyReviewed(!!myReviewRes.data);

    if (med.generic_name) {
      const { data: alts } = await supabase
        .from('medicines')
        .select('*, stock:stock(price, mrp, quantity, is_active, store:stores(store_name, approval_status))')
        .eq('generic_name', med.generic_name)
        .neq('medicine_id', medicineId)
        .eq('is_active', true);
      const altRows = (alts ?? []) as unknown as MedicineWithStock[];
      setAlternatives(
        altRows
          .map((a) => {
            const best = a.stock
              .filter((s) => s.is_active && s.quantity > 0 && s.store?.approval_status === 'approved')
              .sort((x, y) => x.price - y.price)[0];
            return best ? { medicine_id: a.medicine_id, name: a.name, best } : null;
          })
          .filter((a): a is MedicineAlternative => a !== null),
      );
    } else {
      setAlternatives([]);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    load();
  }, [load]);

  const addToCart = async (stockId: number) => {
    if (!user) return;
    const { error } = await supabase.from('cart_items').upsert(
      { user_id: user.id, stock_id: stockId, quantity: 1, saved_for_later: false },
      { onConflict: 'user_id,stock_id', ignoreDuplicates: false },
    );
    setToast(error ? 'Could not add to cart' : 'Added to cart');
    setTimeout(() => setToast(''), 1800);
  };

  const toggleWishlist = async () => {
    if (!user || !id) return;
    if (inWishlist) {
      await supabase.from('wishlists').delete().eq('user_id', user.id).eq('medicine_id', Number(id));
      setInWishlist(false);
    } else {
      await supabase.from('wishlists').insert({ user_id: user.id, medicine_id: Number(id) });
      setInWishlist(true);
    }
  };

  const submitReview = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !id) return;
    const { error } = await supabase.from('reviews').insert({
      user_id: user.id, target_type: 'medicine', target_id: id,
      rating: Number(reviewForm.rating), comment: reviewForm.comment || null,
    });
    if (!error) {
      setAlreadyReviewed(true);
      setReviewForm({ rating: 5, comment: '' });
      load();
    }
  };

  if (loading) return <PageLoader label="Loading medicine details..." />;
  if (!medicine) return <p className="text-sm text-[#5b7088]">Medicine not found.</p>;

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-4">
      {toast && <div className="glass-card !py-2 !px-4 text-xs font-bold text-brand-700 w-fit">{toast}</div>}

      <div className="glass-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0f2340]">{medicine.name}</h2>
            <p className="text-sm text-[#5b7088]">{medicine.generic_name} {medicine.brand ? `· ${medicine.brand}` : ''}</p>
          </div>
          <motion.button onClick={toggleWishlist} whileTap={{ scale: 0.8 }} animate={inWishlist ? { scale: [1, 1.35, 1] } : { scale: 1 }} transition={{ duration: 0.3 }}
            className={`shrink-0 ${inWishlist ? 'text-rose-500' : 'text-[#b8c9db]'}`} aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={inWishlist}>
            <FiHeart fill={inWishlist ? 'currentColor' : 'none'} size={22} />
          </motion.button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {medicine.prescription_required && <span className="badge bg-amber-100 text-amber-700 flex items-center gap-1"><FiShield size={10} /> Prescription required</span>}
          {medicine.category && <span className="badge bg-brand-100 text-brand-700">{medicine.category}</span>}
          {medicine.form && <span className="badge bg-slate-100 text-slate-600 capitalize">{medicine.form}</span>}
          {medicine.dosage && <span className="badge bg-slate-100 text-slate-600">{medicine.dosage}</span>}
          {medicine.pack_size && <span className="badge bg-slate-100 text-slate-600">{medicine.pack_size}</span>}
        </div>

        {reviews.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <Stars value={avgRating} /> <span className="text-xs text-[#5b7088] font-bold">{avgRating.toFixed(1)} ({reviews.length} reviews)</span>
          </div>
        )}

        {medicine.description && <p className="text-sm text-[#33475b] mt-3">{medicine.description}</p>}
        {medicine.manufacturer && <p className="text-xs text-[#5b7088] mt-2">Manufacturer: {medicine.manufacturer}</p>}
      </div>

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Available at {offers.length} store{offers.length !== 1 ? 's' : ''}</h3>
        <div className="space-y-2">
          {offers.map((o) => (
            <div key={o.stock_id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/40">
              <div>
                <p className="text-sm font-bold text-[#0f2340]">{o.store?.store_name}</p>
                <p className="text-[11px] text-[#5b7088]">{o.store?.city || ''} {o.store?.rating ? `· ${o.store.rating}★` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-extrabold text-[#0f2340]">₹{o.price}</p>
                  {o.mrp > o.price && <p className="text-[11px] text-[#8a9bb0] line-through">₹{o.mrp}</p>}
                </div>
                {o.quantity > 0 ? (
                  <button onClick={() => addToCart(o.stock_id)} className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1"><FiPlus /> Add</button>
                ) : (
                  <span className="badge bg-rose-100 text-rose-600">Out of stock</span>
                )}
              </div>
            </div>
          ))}
          {offers.length === 0 && <p className="text-sm text-[#5b7088]">No store currently stocks this medicine.</p>}
        </div>
      </div>

      {alternatives.length > 0 && (
        <div className="glass-card">
          <h3 className="font-extrabold text-[#0f2340] mb-1">Alternatives (same generic composition)</h3>
          <p className="text-[11px] text-[#5b7088] mb-3 flex items-center gap-1">
            <FiAlertCircle /> Shown because they share the active ingredient. Confirm suitability with a pharmacist or doctor before switching.
          </p>
          <div className="space-y-2">
            {alternatives.map((a) => (
              <div key={a.medicine_id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/40">
                <div>
                  <Link to={`/app/store/medicines/${a.medicine_id}`} className="text-sm font-bold text-[#0f2340] hover:text-brand-600">{a.name}</Link>
                  <p className="text-[11px] text-[#5b7088]">{a.best.store?.store_name}</p>
                </div>
                <p className="font-extrabold text-[#0f2340]">₹{a.best.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Reviews</h3>
        {canReview && !alreadyReviewed && (
          <form onSubmit={submitReview} className="mb-4 p-3 rounded-xl bg-brand-50 border border-brand-200">
            <p className="text-xs font-bold text-[#5b7088] mb-2">You&apos;ve purchased this — share your experience:</p>
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setReviewForm((f) => ({ ...f, rating: n }))} className={n <= reviewForm.rating ? 'text-amber-400' : 'text-slate-300'}>
                  <FiStar fill="currentColor" size={20} />
                </button>
              ))}
            </div>
            <textarea value={reviewForm.comment} onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))} placeholder="Optional comment..." className="input-field mb-2" rows={2} />
            <button className="btn-primary !py-1.5 !text-xs">Submit Review</button>
          </form>
        )}
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.review_id} className="border-b border-white/40 pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[#0f2340]">{r.reviewer?.name || 'Anonymous'}</p>
                <Stars value={r.rating} />
              </div>
              {r.comment && <p className="text-xs text-[#5b7088] mt-1">{r.comment}</p>}
            </div>
          ))}
          {reviews.length === 0 && <p className="text-sm text-[#5b7088]">No reviews yet.</p>}
        </div>
      </div>
    </div>
  );
}
