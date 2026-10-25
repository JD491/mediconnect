import { useState, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { FiSearch, FiPlusCircle, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import type { StorePageProps } from '../../types/store';
import type { Database, MedicineForm } from '../../types/database.types';

type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type Mode = 'search' | 'create';

const FORMS: MedicineForm[] = ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'other'];

interface NewMedicineForm {
  name: string; generic_name: string; brand: string; category: string; manufacturer: string; description: string;
  dosage: string; form: MedicineForm; pack_size: string; image_url: string; prescription_required: boolean;
}

interface StockForm {
  price: string; mrp: string; quantity: string; discount_percent: string; min_stock_level: string;
  batch_number: string; manufacturing_date: string; expiry_date: string; sku: string; barcode: string;
}

const EMPTY_NEW_MEDICINE: NewMedicineForm = {
  name: '', generic_name: '', brand: '', category: '', manufacturer: '', description: '',
  dosage: '', form: 'tablet', pack_size: '', image_url: '', prescription_required: false,
};
const EMPTY_STOCK: StockForm = {
  price: '', mrp: '', quantity: '', discount_percent: '0', min_stock_level: '10',
  batch_number: '', manufacturing_date: '', expiry_date: '', sku: '', barcode: '',
};

export default function AddMedicine({ store }: StorePageProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MedicineRow[]>([]);
  const [selected, setSelected] = useState<MedicineRow | null>(null);
  const [newMed, setNewMed] = useState<NewMedicineForm>(EMPTY_NEW_MEDICINE);
  const [stockForm, setStockForm] = useState<StockForm>(EMPTY_STOCK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) return setResults([]);
    const { data } = await supabase
      .from('medicines')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${q}%,generic_name.ilike.%${q}%,brand.ilike.%${q}%`)
      .limit(15);
    setResults(data ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const setN = (k: keyof NewMedicineForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setNewMed((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const setS = (k: keyof StockForm) => (e: ChangeEvent<HTMLInputElement>) => setStockForm((f) => ({ ...f, [k]: e.target.value }));

  const validateStock = (): string => {
    if (stockForm.price === '' || stockForm.mrp === '' || stockForm.quantity === '') {
      return 'MRP, selling price and quantity are required.';
    }
    if (Number(stockForm.price) < 0 || Number(stockForm.mrp) < 0) return 'Prices cannot be negative.';
    if (Number(stockForm.price) > Number(stockForm.mrp)) return 'Selling price cannot exceed MRP.';
    if (Number(stockForm.quantity) < 0) return 'Quantity cannot be negative.';
    if (stockForm.manufacturing_date && stockForm.expiry_date && stockForm.expiry_date < stockForm.manufacturing_date) {
      return 'Expiry date cannot be before manufacturing date.';
    }
    return '';
  };

  const resetAll = () => {
    setSelected(null);
    setNewMed(EMPTY_NEW_MEDICINE);
    setStockForm(EMPTY_STOCK);
    setQuery('');
    setResults([]);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!user) return;
    const stockErr = validateStock();
    if (stockErr) return setError(stockErr);
    if (mode === 'search' && !selected) return setError('Select a medicine from the catalog, or switch to "Create new medicine".');
    if (mode === 'create' && !newMed.name.trim()) return setError('Medicine name is required.');

    setBusy(true);
    try {
      let medicineId = selected?.medicine_id;
      if (mode === 'create') {
        const { data, error: medErr } = await supabase
          .from('medicines')
          .insert({ ...newMed, created_by: user.id })
          .select()
          .single();
        if (medErr) throw medErr;
        medicineId = data.medicine_id;
      }
      if (medicineId === undefined) throw new Error('No medicine selected.');

      const { error: stockInsertErr } = await supabase.from('stock').insert({
        store_id: store.store_id,
        medicine_id: medicineId,
        price: Number(stockForm.price),
        mrp: Number(stockForm.mrp),
        quantity: Number(stockForm.quantity),
        discount_percent: Number(stockForm.discount_percent || 0),
        min_stock_level: Number(stockForm.min_stock_level || 10),
        batch_number: stockForm.batch_number || null,
        manufacturing_date: stockForm.manufacturing_date || null,
        expiry_date: stockForm.expiry_date || null,
        sku: stockForm.sku || null,
        barcode: stockForm.barcode || null,
      });
      if (stockInsertErr) {
        if (stockInsertErr.code === '23505') {
          throw new Error('This medicine is already in your inventory — edit it from the Inventory page instead.');
        }
        throw stockInsertErr;
      }

      setSuccess('Medicine added to your store inventory.');
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add medicine. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="glass-card">
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setMode('search')}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${mode === 'search' ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>
            Choose from catalog
          </button>
          <button type="button" onClick={() => setMode('create')}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${mode === 'create' ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>
            Create new medicine
          </button>
        </div>

        {mode === 'search' ? (
          <div>
            <div className="relative mb-3">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search by name, generic name or brand..." className="input-field !pl-9" />
            </div>
            {selected ? (
              <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#0f2340]">{selected.name}</p>
                  <p className="text-[11px] text-[#5b7088]">{selected.generic_name || '—'} · {selected.category || 'Uncategorized'}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-xs font-bold text-brand-600">Change</button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {results.map((m) => (
                  <button type="button" key={m.medicine_id} onClick={() => setSelected(m)}
                    className="w-full text-left p-2.5 rounded-xl bg-white/50 hover:bg-white/80 border border-white/40">
                    <p className="text-sm font-bold text-[#0f2340]">{m.name}</p>
                    <p className="text-[11px] text-[#5b7088]">
                      {m.generic_name || 'No generic name'} · {m.category || 'Uncategorized'}{m.prescription_required ? ' · Rx' : ''}
                    </p>
                  </button>
                ))}
                {query.length >= 2 && results.length === 0 && (
                  <p className="text-xs text-[#5b7088]">No matches — try &ldquo;Create new medicine&rdquo; instead.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Medicine name *" value={newMed.name} onChange={setN('name')} className="input-field col-span-2" />
            <input placeholder="Generic name" value={newMed.generic_name} onChange={setN('generic_name')} className="input-field" />
            <input placeholder="Brand" value={newMed.brand} onChange={setN('brand')} className="input-field" />
            <input placeholder="Category" value={newMed.category} onChange={setN('category')} className="input-field" />
            <input placeholder="Manufacturer" value={newMed.manufacturer} onChange={setN('manufacturer')} className="input-field" />
            <input placeholder="Dosage (e.g. 500mg)" value={newMed.dosage} onChange={setN('dosage')} className="input-field" />
            <select value={newMed.form} onChange={setN('form')} className="input-field">
              {FORMS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
            <input placeholder="Pack size (e.g. 10 tablets)" value={newMed.pack_size} onChange={setN('pack_size')} className="input-field" />
            <input placeholder="Image URL" value={newMed.image_url} onChange={setN('image_url')} className="input-field col-span-2" />
            <textarea placeholder="Description" value={newMed.description} onChange={setN('description')} className="input-field col-span-2" rows={2} />
            <label className="col-span-2 flex items-center gap-2 text-xs font-bold text-[#33475b]">
              <input type="checkbox" checked={newMed.prescription_required} onChange={setN('prescription_required')} /> Prescription required
            </label>
          </div>
        )}
      </div>

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Store Price, Stock & Batch</h3>
        <div className="grid grid-cols-2 gap-3">
          <input required type="number" step="0.01" placeholder="MRP *" value={stockForm.mrp} onChange={setS('mrp')} className="input-field" />
          <input required type="number" step="0.01" placeholder="Selling price *" value={stockForm.price} onChange={setS('price')} className="input-field" />
          <input type="number" step="0.01" placeholder="Discount %" value={stockForm.discount_percent} onChange={setS('discount_percent')} className="input-field" />
          <input required type="number" placeholder="Quantity *" value={stockForm.quantity} onChange={setS('quantity')} className="input-field" />
          <input type="number" placeholder="Minimum stock level" value={stockForm.min_stock_level} onChange={setS('min_stock_level')} className="input-field" />
          <input placeholder="Batch number" value={stockForm.batch_number} onChange={setS('batch_number')} className="input-field" />
          <label className="text-xs font-bold text-[#5b7088]">Manufacturing date<input type="date" value={stockForm.manufacturing_date} onChange={setS('manufacturing_date')} className="input-field mt-1" /></label>
          <label className="text-xs font-bold text-[#5b7088]">Expiry date<input type="date" value={stockForm.expiry_date} onChange={setS('expiry_date')} className="input-field mt-1" /></label>
          <input placeholder="SKU / product code" value={stockForm.sku} onChange={setS('sku')} className="input-field" />
          <input placeholder="Barcode" value={stockForm.barcode} onChange={setS('barcode')} className="input-field" />
        </div>
      </div>

      {error && <p className="text-rose-500 text-xs font-semibold">{error}</p>}
      {success && <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><FiCheckCircle /> {success}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={() => { resetAll(); setError(''); setSuccess(''); }} className="btn-ghost flex-1">Cancel</button>
        <button disabled={busy} className="btn-primary flex-1 flex items-center justify-center gap-2">
          <FiPlusCircle /> {busy ? 'Adding...' : 'Add Medicine'}
        </button>
      </div>
    </form>
  );
}
