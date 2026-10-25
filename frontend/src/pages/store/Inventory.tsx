import { useEffect, useState, useCallback, useMemo, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch, FiEdit2, FiEyeOff, FiEye, FiPackage } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { LoadingSpinner, EmptyState } from '../../components/UIStates';
import type { StorePageProps, StockWithMedicine } from '../../types/store';
import type { Database } from '../../types/database.types';

type StockUpdate = Database['public']['Tables']['stock']['Update'];

interface StatusInfo {
  label: string;
  tone: string;
}

function computeStatus(row: StockWithMedicine): StatusInfo {
  if (!row.is_active) return { label: 'Disabled', tone: 'bg-slate-200 text-slate-600' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (row.expiry_date) {
    const exp = new Date(row.expiry_date);
    if (exp < today) return { label: 'Expired', tone: 'bg-rose-100 text-rose-600' };
  }
  if (row.quantity === 0) return { label: 'Out of Stock', tone: 'bg-rose-100 text-rose-600' };
  if (row.quantity <= row.min_stock_level) return { label: 'Low Stock', tone: 'bg-amber-100 text-amber-700' };
  if (row.expiry_date) {
    const exp = new Date(row.expiry_date);
    const in90 = new Date();
    in90.setDate(in90.getDate() + 90);
    if (exp <= in90) return { label: 'Expiring Soon', tone: 'bg-amber-100 text-amber-700' };
  }
  return { label: 'Available', tone: 'bg-emerald-100 text-emerald-700' };
}

type StatusFilterKey = 'all' | 'available' | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired' | 'disabled';

const FILTER_LABELS: Partial<Record<StatusFilterKey, string>> = {
  available: 'Available', low_stock: 'Low Stock', out_of_stock: 'Out of Stock',
  expiring_soon: 'Expiring Soon', expired: 'Expired', disabled: 'Disabled',
};

export default function Inventory({ store }: StorePageProps) {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<StockWithMedicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>((params.get('filter') as StatusFilterKey) || 'all');
  const [editing, setEditing] = useState<StockWithMedicine | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stock')
      .select('*, medicine:medicines(medicine_id, name, category, image_url, prescription_required)')
      .eq('store_id', store.store_id)
      .order('updated_at', { ascending: false });
    setRows((data ?? []) as unknown as StockWithMedicine[]);
    setLoading(false);
  }, [store.store_id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const status = computeStatus(r);
      if (statusFilter !== 'all' && status.label !== FILTER_LABELS[statusFilter]) return false;
      if (search && !r.medicine?.name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const toggleActive = async (row: StockWithMedicine) => {
    await supabase.from('stock').update({ is_active: !row.is_active }).eq('stock_id', row.stock_id);
    load();
  };

  const saveEdit = async (values: StockUpdate) => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from('stock').update(values).eq('stock_id', editing.stock_id);
    setSaving(false);
    if (!error) {
      setEditing(null);
      load();
    }
  };

  const onFilterChange = (v: StatusFilterKey) => {
    setStatusFilter(v);
    setParams(v === 'all' ? {} : { filter: v });
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines..." className="input-field !pl-9" />
        </div>
        <select value={statusFilter} onChange={(e) => onFilterChange(e.target.value as StatusFilterKey)} className="input-field sm:!w-52">
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      <div className="glass-card overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10"><LoadingSpinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FiPackage} title="No medicines match this view" />
        ) : (
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] text-[#5b7088] font-bold uppercase border-b border-white/50">
                <th className="py-2 pr-3">Medicine</th>
                <th className="py-2 pr-3">Batch</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">MRP / Price</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const status = computeStatus(r);
                return (
                  <tr key={r.stock_id} className="border-b border-white/30 last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-[#0f2340]">{r.medicine?.name}</p>
                      <p className="text-[11px] text-[#5b7088]">
                        {r.medicine?.category || '—'}{r.medicine?.prescription_required ? ' · Rx required' : ''}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-[#33475b]">{r.batch_number || '—'}</td>
                    <td className="py-2.5 pr-3 text-[#33475b]">
                      {r.quantity} <span className="text-[11px] text-[#8a9bb0]">(min {r.min_stock_level})</span>
                    </td>
                    <td className="py-2.5 pr-3 text-[#33475b]">
                      ₹{r.mrp} / ₹{r.price}{r.discount_percent > 0 ? ` (-${r.discount_percent}%)` : ''}
                    </td>
                    <td className="py-2.5 pr-3 text-[#33475b]">{r.expiry_date || '—'}</td>
                    <td className="py-2.5 pr-3"><span className={`badge ${status.tone}`}>{status.label}</span></td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditing(r)} className="btn-ghost !py-1.5 !px-2.5 !text-[11px]" aria-label={`Edit stock for ${r.medicine?.name ?? 'item'}`}>
                          <FiEdit2 />
                        </button>
                        <button onClick={() => toggleActive(r)} className="btn-ghost !py-1.5 !px-2.5 !text-[11px]" aria-label={r.is_active ? `Disable ${r.medicine?.name ?? 'item'}` : `Enable ${r.medicine?.name ?? 'item'}`}>
                          {r.is_active ? <FiEyeOff /> : <FiEye />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && <EditStockModal row={editing} saving={saving} onClose={() => setEditing(null)} onSave={saveEdit} />}
    </div>
  );
}

interface EditStockForm {
  price: string; mrp: string; quantity: string; discount_percent: string; min_stock_level: string;
  batch_number: string; manufacturing_date: string; expiry_date: string; sku: string; barcode: string;
}

interface EditStockModalProps {
  row: StockWithMedicine;
  saving: boolean;
  onClose: () => void;
  onSave: (values: StockUpdate) => void;
}

function EditStockModal({ row, saving, onClose, onSave }: EditStockModalProps) {
  const [form, setForm] = useState<EditStockForm>({
    price: String(row.price), mrp: String(row.mrp), quantity: String(row.quantity), discount_percent: String(row.discount_percent),
    min_stock_level: String(row.min_stock_level), batch_number: row.batch_number || '',
    manufacturing_date: row.manufacturing_date || '', expiry_date: row.expiry_date || '',
    sku: row.sku || '', barcode: row.barcode || '',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof EditStockForm) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.manufacturing_date && form.expiry_date && form.expiry_date < form.manufacturing_date) {
      return setErr('Expiry date cannot be before manufacturing date.');
    }
    if (Number(form.price) < 0 || Number(form.mrp) < 0) return setErr('Prices cannot be negative.');
    if (Number(form.price) > Number(form.mrp)) return setErr('Selling price cannot exceed MRP.');
    if (Number(form.quantity) < 0) return setErr('Stock cannot be negative.');
    setErr('');
    onSave({
      price: Number(form.price), mrp: Number(form.mrp), quantity: Number(form.quantity),
      discount_percent: Number(form.discount_percent), min_stock_level: Number(form.min_stock_level),
      batch_number: form.batch_number || null, manufacturing_date: form.manufacturing_date || null,
      expiry_date: form.expiry_date || null, sku: form.sku || null, barcode: form.barcode || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="font-extrabold text-[#0f2340] mb-4">{row.medicine?.name} — Update Stock</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-[#5b7088]">MRP<input type="number" step="0.01" value={form.mrp} onChange={set('mrp')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Selling Price<input type="number" step="0.01" value={form.price} onChange={set('price')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Discount %<input type="number" step="0.01" value={form.discount_percent} onChange={set('discount_percent')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Quantity<input type="number" value={form.quantity} onChange={set('quantity')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Min Stock Level<input type="number" value={form.min_stock_level} onChange={set('min_stock_level')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Batch Number<input value={form.batch_number} onChange={set('batch_number')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Manufacturing Date<input type="date" value={form.manufacturing_date} onChange={set('manufacturing_date')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Expiry Date<input type="date" value={form.expiry_date} onChange={set('expiry_date')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">SKU<input value={form.sku} onChange={set('sku')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Barcode<input value={form.barcode} onChange={set('barcode')} className="input-field mt-1" /></label>
        </div>
        {err && <p className="text-rose-500 text-xs font-semibold mt-3">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
}
