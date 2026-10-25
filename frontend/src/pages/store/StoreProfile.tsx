import { useState, type ChangeEvent, type FormEvent } from 'react';
import { FiSave, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { StorePageProps } from '../../types/store';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface StoreProfileForm {
  store_name: string;
  store_owner_name: string;
  logo_url: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
  description: string;
  opening_time: string;
  closing_time: string;
  weekly_holidays: string[];
  license_number: string;
  delivery_radius_km: string;
  min_order_amount: number;
  is_open: boolean;
}

interface StoreProfileProps extends StorePageProps {
  onSaved?: () => void;
}

export default function StoreProfile({ store, onSaved }: StoreProfileProps) {
  const [form, setForm] = useState<StoreProfileForm>({
    store_name: store.store_name || '', store_owner_name: store.store_owner_name || '',
    logo_url: store.logo_url || '', phone: store.phone || '', email: store.email || '',
    address: store.address || '', city: store.city || '', pincode: store.pincode || '',
    description: store.description || '', opening_time: store.opening_time || '', closing_time: store.closing_time || '',
    weekly_holidays: store.weekly_holidays || [], license_number: store.license_number || '',
    delivery_radius_km: store.delivery_radius_km != null ? String(store.delivery_radius_km) : '', min_order_amount: store.min_order_amount ?? 0,
    is_open: store.is_open ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const set = (k: keyof StoreProfileForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const toggleDay = (d: string) => setForm((f) => ({
    ...f,
    weekly_holidays: f.weekly_holidays.includes(d) ? f.weekly_holidays.filter((x) => x !== d) : [...f.weekly_holidays, d],
  }));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.store_name.trim()) return setError('Store name is required.');
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setError('Enter a valid email address.');
    if (form.pincode && !/^\d{4,10}$/.test(form.pincode)) return setError('Enter a valid PIN code.');
    if (form.phone && !/^\+?\d{7,15}$/.test(form.phone.replace(/\s/g, ''))) return setError('Enter a valid phone number.');
    if (Number(form.min_order_amount) < 0) return setError('Minimum order amount cannot be negative.');
    if (form.opening_time && form.closing_time && form.closing_time <= form.opening_time) {
      return setError('Closing time must be after opening time.');
    }

    setBusy(true);
    const { error: updErr } = await supabase.from('stores').update({
      store_name: form.store_name,
      store_owner_name: form.store_owner_name || null,
      logo_url: form.logo_url || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      pincode: form.pincode || null,
      description: form.description || null,
      license_number: form.license_number || null,
      opening_time: form.opening_time || null,
      closing_time: form.closing_time || null,
      weekly_holidays: form.weekly_holidays,
      delivery_radius_km: form.delivery_radius_km === '' ? null : Number(form.delivery_radius_km),
      min_order_amount: Number(form.min_order_amount),
      is_open: form.is_open,
    }).eq('store_id', store.store_id);
    setBusy(false);
    if (updErr) return setError(updErr.message);
    setSuccess('Store profile updated.');
    onSaved?.();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Basic Info</h3>
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Store name *" value={form.store_name} onChange={set('store_name')} className="input-field col-span-2" />
          <input placeholder="Owner name" value={form.store_owner_name} onChange={set('store_owner_name')} className="input-field" />
          <input placeholder="License / registration number" value={form.license_number} onChange={set('license_number')} className="input-field" />
          <input placeholder="Logo URL" value={form.logo_url} onChange={set('logo_url')} className="input-field col-span-2" />
          <input placeholder="Phone" value={form.phone} onChange={set('phone')} className="input-field" />
          <input placeholder="Email" value={form.email} onChange={set('email')} className="input-field" />
          <textarea placeholder="Store description" value={form.description} onChange={set('description')} className="input-field col-span-2" rows={2} />
        </div>
      </div>

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Location & Delivery</h3>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Address" value={form.address} onChange={set('address')} className="input-field col-span-2" />
          <input placeholder="City" value={form.city} onChange={set('city')} className="input-field" />
          <input placeholder="PIN code" value={form.pincode} onChange={set('pincode')} className="input-field" />
          <input type="number" step="0.1" min="0" placeholder="Delivery radius (km)" value={form.delivery_radius_km} onChange={set('delivery_radius_km')} className="input-field" />
          <input type="number" step="1" min="0" placeholder="Minimum order amount (₹)" value={form.min_order_amount}
            onChange={(e) => setForm((f) => ({ ...f, min_order_amount: Number(e.target.value) }))} className="input-field" />
        </div>
      </div>

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Hours & Availability</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs font-bold text-[#5b7088]">Opening time<input type="time" value={form.opening_time} onChange={set('opening_time')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Closing time<input type="time" value={form.closing_time} onChange={set('closing_time')} className="input-field mt-1" /></label>
        </div>
        <p className="text-xs font-bold text-[#5b7088] mb-2">Weekly holidays</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {DAYS.map((d) => (
            <button type="button" key={d} onClick={() => toggleDay(d)}
              className={`text-xs font-bold rounded-lg px-3 py-1.5 ${form.weekly_holidays.includes(d) ? 'bg-rose-500 text-white' : 'bg-white/60 text-[#33475b]'}`}>
              {d}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[#0f2340]">
          <input type="checkbox" checked={form.is_open} onChange={(e) => setForm((f) => ({ ...f, is_open: e.target.checked }))} /> Store is currently open for orders
        </label>
      </div>

      {error && <p className="text-rose-500 text-xs font-semibold">{error}</p>}
      {success && <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><FiCheckCircle /> {success}</p>}

      <button disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
        <FiSave /> {busy ? 'Saving...' : 'Save Store Profile'}
      </button>
    </form>
  );
}
