import { useEffect, useState, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { FiPlus, FiTag, FiEyeOff, FiEye } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { StorePageProps } from '../../types/store';
import type { Database } from '../../types/database.types';

type CouponRow = Database['public']['Tables']['coupons']['Row'];
type DiscountType = CouponRow['discount_type'];

interface CouponForm {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  min_order_amount: string;
  max_discount: string;
  start_date: string;
  end_date: string;
  usage_limit: string;
}

const EMPTY_FORM: CouponForm = {
  code: '', discount_type: 'percentage', discount_value: '', min_order_amount: '0',
  max_discount: '', start_date: '', end_date: '', usage_limit: '',
};

export default function Coupons({ store }: StorePageProps) {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('coupons').select('*').eq('store_id', store.store_id).order('created_at', { ascending: false });
    setCoupons(data ?? []);
  }, [store.store_id]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof CouponForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!form.code.trim()) return setError('Coupon code is required.');
    if (!form.discount_value || Number(form.discount_value) <= 0) return setError('Discount value must be greater than 0.');
    if (form.discount_type === 'percentage' && Number(form.discount_value) > 100) return setError('Percentage discount cannot exceed 100.');
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setError('End date must be after start date.');

    setBusy(true);
    const { error: err } = await supabase.from('coupons').insert({
      store_id: store.store_id,
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: Number(form.min_order_amount || 0),
      max_discount: form.max_discount ? Number(form.max_discount) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    });
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? 'You already have a coupon with this code.' : err.message);
      return;
    }
    setForm(EMPTY_FORM);
    load();
  };

  const toggleActive = async (c: CouponRow) => {
    await supabase.from('coupons').update({ is_active: !c.is_active }).eq('coupon_id', c.coupon_id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Create Coupon</h3>
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <input required placeholder="CODE" value={form.code} onChange={set('code')} className="input-field uppercase" />
          <select value={form.discount_type} onChange={set('discount_type')} className="input-field">
            <option value="percentage">Percentage %</option>
            <option value="fixed">Fixed ₹</option>
          </select>
          <input required type="number" step="0.01" placeholder="Discount value" value={form.discount_value} onChange={set('discount_value')} className="input-field" />
          <input type="number" step="0.01" placeholder="Max discount (₹)" value={form.max_discount} onChange={set('max_discount')} className="input-field" />
          <input type="number" step="0.01" placeholder="Min order amount" value={form.min_order_amount} onChange={set('min_order_amount')} className="input-field" />
          <input type="number" min="1" placeholder="Usage limit" value={form.usage_limit} onChange={set('usage_limit')} className="input-field" />
          <label className="text-xs font-bold text-[#5b7088]">Start date<input type="date" value={form.start_date} onChange={set('start_date')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">End date<input type="date" value={form.end_date} onChange={set('end_date')} className="input-field mt-1" /></label>
          <button disabled={busy} className="btn-primary col-span-2 sm:col-span-4 flex items-center justify-center gap-2">
            <FiPlus /> {busy ? 'Creating...' : 'Create Coupon'}
          </button>
        </form>
        {error && <p className="text-rose-500 text-xs font-semibold mt-3">{error}</p>}
      </div>

      <div className="glass-card space-y-2">
        {coupons.map((c) => (
          <div key={c.coupon_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-bold text-[#0f2340] flex items-center gap-1.5"><FiTag className="text-brand-500" /> {c.code}</p>
              <p className="text-[11px] text-[#5b7088]">
                {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                {c.min_order_amount > 0 ? ` · min ₹${c.min_order_amount}` : ''}
                {c.usage_limit ? ` · used ${c.used_count}/${c.usage_limit}` : ` · used ${c.used_count}`}
                {c.end_date ? ` · expires ${c.end_date}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
              <button onClick={() => toggleActive(c)} aria-label={c.is_active ? `Deactivate coupon ${c.code}` : `Activate coupon ${c.code}`} className="btn-ghost !py-1.5 !px-2.5 !text-[11px]">{c.is_active ? <FiEyeOff /> : <FiEye />}</button>
            </div>
          </div>
        ))}
        {coupons.length === 0 && <p className="text-sm text-[#5b7088]">No coupons yet.</p>}
      </div>
    </div>
  );
}
