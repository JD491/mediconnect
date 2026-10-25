import { useEffect, useState, useCallback, useMemo, type ChangeEvent, type FormEvent } from 'react';
import { FiSearch, FiEdit2, FiEyeOff, FiEye } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import MedicineImage from '../../components/MedicineImage';
import type { Database, MedicineForm } from '../../types/database.types';

type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type MedicineUpdate = Database['public']['Tables']['medicines']['Update'];

export default function MedicineCatalog() {
  const [rows, setRows] = useState<MedicineRow[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MedicineRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('medicines').select('*').order('name', { ascending: true });
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => `${r.name} ${r.generic_name || ''} ${r.brand || ''} ${r.category || ''}`.toLowerCase().includes(q));
  }, [rows, search]);

  const toggleActive = async (row: MedicineRow) => {
    await supabase.from('medicines').update({ is_active: !row.is_active }).eq('medicine_id', row.medicine_id);
    load();
  };

  const save = async (values: MedicineUpdate) => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from('medicines').update(values).eq('medicine_id', editing.medicine_id);
    setSaving(false);
    if (!error) {
      setEditing(null);
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card relative">
        <FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search master catalog..." className="input-field !pl-9" />
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-[11px] text-[#5b7088] font-bold uppercase border-b border-white/50">
              <th className="py-2 pr-3">Medicine</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Form</th>
              <th className="py-2 pr-3">Rx</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.medicine_id} className="border-b border-white/30 last:border-0">
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2.5">
                    <MedicineImage name={r.name} form={r.form} src={r.image_url}
                      className="h-10 w-10 shrink-0 rounded-lg border border-white/60" />
                    <div>
                      <p className="font-bold text-[#0f2340]">{r.name}</p>
                      <p className="text-[11px] text-[#5b7088]">{r.generic_name || '—'}{r.brand ? ` · ${r.brand}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-[#33475b]">{r.category || '—'}</td>
                <td className="py-2.5 pr-3 text-[#33475b] capitalize">{r.form || '—'}</td>
                <td className="py-2.5 pr-3">{r.prescription_required ? <span className="badge bg-amber-100 text-amber-700">Rx</span> : <span className="badge bg-slate-100 text-slate-600">OTC</span>}</td>
                <td className="py-2.5 pr-3"><span className={`badge ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{r.is_active ? 'Active' : 'Disabled'}</span></td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`} className="btn-ghost !py-1.5 !px-2.5 !text-[11px]"><FiEdit2 /></button>
                    <button onClick={() => toggleActive(r)} aria-label={r.is_active ? `Disable ${r.name}` : `Enable ${r.name}`} className="btn-ghost !py-1.5 !px-2.5 !text-[11px]">{r.is_active ? <FiEyeOff /> : <FiEye />}</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-[#5b7088]">No medicines match.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <EditModal row={editing} saving={saving} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

interface EditForm {
  name: string; generic_name: string; brand: string; category: string; manufacturer: string;
  dosage: string; pack_size: string; description: string; prescription_required: boolean;
  form: MedicineForm; gst_rate: string; salt_composition: string; image_url: string;
}

interface EditModalProps {
  row: MedicineRow;
  saving: boolean;
  onClose: () => void;
  onSave: (values: MedicineUpdate) => void;
}

function EditModal({ row, saving, onClose, onSave }: EditModalProps) {
  const [form, setForm] = useState<EditForm>({
    name: row.name, generic_name: row.generic_name || '', brand: row.brand || '', category: row.category || '',
    manufacturer: row.manufacturer || '', dosage: row.dosage || '', pack_size: row.pack_size || '',
    description: row.description || '', prescription_required: row.prescription_required,
    form: row.form || 'tablet', gst_rate: String(row.gst_rate ?? 5),
    salt_composition: row.salt_composition || '', image_url: row.image_url || '',
  });
  const set = (k: keyof EditForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave({ ...form, gst_rate: Number(form.gst_rate) || 0 });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <MedicineImage name={form.name || row.name} form={form.form} src={form.image_url}
            className="h-14 w-14 shrink-0 rounded-xl border border-white/60" />
          <h3 className="font-extrabold text-[#0f2340]">Edit Medicine</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input required value={form.name} onChange={set('name')} placeholder="Name" className="input-field col-span-2" />
          <input value={form.generic_name} onChange={set('generic_name')} placeholder="Generic name" className="input-field" />
          <input value={form.brand} onChange={set('brand')} placeholder="Brand" className="input-field" />
          <input value={form.category} onChange={set('category')} placeholder="Category" className="input-field" />
          <input value={form.manufacturer} onChange={set('manufacturer')} placeholder="Manufacturer" className="input-field" />
          <input value={form.dosage} onChange={set('dosage')} placeholder="Dosage" className="input-field" />
          <select value={form.form} onChange={(e) => setForm((f) => ({ ...f, form: e.target.value as MedicineForm }))} className="input-field">
            {(['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'gel', 'device', 'strips', 'powder', 'other'] as MedicineForm[]).map((f) => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
          <input value={form.pack_size} onChange={set('pack_size')} placeholder="Pack size" className="input-field" />
          <select value={form.gst_rate} onChange={(e) => setForm((f) => ({ ...f, gst_rate: e.target.value }))} className="input-field">
            <option value="5">GST 5%</option>
            <option value="12">GST 12%</option>
            <option value="18">GST 18%</option>
          </select>
          <input value={form.salt_composition} onChange={set('salt_composition')} placeholder="Salt composition" className="input-field col-span-2" />
          <input value={form.image_url} onChange={set('image_url')} placeholder="Image URL (optional — bundled art is used when blank)" className="input-field col-span-2" />
          <textarea value={form.description} onChange={set('description')} placeholder="Description" className="input-field col-span-2" rows={2} />
          <label className="col-span-2 flex items-center gap-2 text-xs font-bold text-[#33475b]">
            <input type="checkbox" checked={form.prescription_required} onChange={set('prescription_required')} /> Prescription required
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
}
