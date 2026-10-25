import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertTriangle, FiCamera, FiCheck, FiChevronRight, FiFileText, FiPlus, FiRefreshCw,
  FiSearch, FiShield, FiShoppingCart, FiTrash2, FiUpload, FiZap,
} from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { AI_LANGUAGES, type AiLanguage } from '../../lib/aiHealth';
import {
  clearRxAttachment, loadRxAttachment, matchPrescriptionToCatalog, parsePrescriptionText,
  saveRxAttachment, scanPrescription, PrescriptionScanError, fileToDataUrl,
  type CatalogMedicine, type MatchedMedicine, type PrescriptionScanResult,
} from '../../lib/prescriptionOcr';
import MedicineImage from '../../components/MedicineImage';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

const CATALOG_SELECT =
  'medicine_id, name, generic_name, salt, manufacturer, prescription_required, form, ' +
  'stock(stock_id, price, mrp, quantity, store_id, is_active, store:stores(store_id, store_name, latitude, longitude, approval_status))';

export default function PrescriptionScan() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [language, setLanguage] = useState<AiLanguage>('en');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PrescriptionScanResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [extracted, setExtracted] = useState<PrescriptionScanResult['medicines']>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [catalog, setCatalog] = useState<CatalogMedicine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [attached, setAttached] = useState(false);
  const [busyStock, setBusyStock] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('medicines').select(CATALOG_SELECT).eq('is_active', true);
      const rows = ((data ?? []) as unknown as CatalogMedicine[]).map((m) => ({
        ...m,
        stock: (m.stock ?? []).filter((s) => (s as { is_active?: boolean }).is_active !== false
          && (s.store as { approval_status?: string } | null | undefined)?.approval_status !== 'rejected'),
      }));
      setCatalog(rows);
      setCatalogLoading(false);
    })();
  }, []);

  const matches = useMemo(() => matchPrescriptionToCatalog(extracted, catalog), [extracted, catalog]);

  useEffect(() => {
    const next: Record<number, boolean> = {};
    for (const m of matches) next[m.medicine.medicine_id] = true;
    setSelected(next);
  }, [matches]);

  useEffect(() => {
    setAttached(!!loadRxAttachment());
  }, []);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setRawText('');
    setExtracted([]);
    setError('');
    setProgress(0);
    setAddedCount(0);
  };

  const acceptFile = useCallback(async (nextFile: File) => {
    setError('');
    setResult(null);
    setRawText('');
    setExtracted([]);
    setAddedCount(0);
    if (!ALLOWED_TYPES.includes(nextFile.type)) {
      setError('Upload a JPG, PNG, WebP image or a PDF.');
      return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setError('File is too large — please upload something under 8MB.');
      return;
    }
    setFile(nextFile);
    if (nextFile.type.startsWith('image/')) {
      try {
        setPreview(await fileToDataUrl(nextFile));
      } catch {
        setPreview(null);
      }
    } else {
      setPreview(null);
    }
  }, []);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    if (next) acceptFile(next);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const next = e.dataTransfer.files?.[0];
    if (next) acceptFile(next);
  };

  const runScan = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setProgress(2);
    try {
      // Auto-attach the original file before OCR so checkout can still prove
      // the prescription even when automatic reading fails.
      try {
        const dataUrl = await fileToDataUrl(file);
        const saved = saveRxAttachment({
          name: file.name, type: file.type, dataUrl, createdAt: new Date().toISOString(),
        });
        setAttached(saved);
      } catch {
        setAttached(false);
      }

      const scan = await scanPrescription(file, language, setProgress);
      setResult(scan);
      setRawText(scan.rawText || scan.medicines.map((m) => `${m.name} ${m.dosage ?? ''} ${m.duration ?? ''}`).join('\n'));
      setExtracted(scan.medicines);
    } catch (err) {
      const message = err instanceof PrescriptionScanError
        ? err.message
        : 'Could not scan the prescription. You can type the medicines below instead.';
      setError(message);
    } finally {
      setScanning(false);
      setProgress(100);
    }
  };

  const reparse = () => {
    const parsed = parsePrescriptionText(rawText);
    setExtracted(parsed);
    if (parsed.length === 0) {
      setError('No medicine names found in that text. Add one medicine per line, for example: “Paracetamol 500mg 1-0-1 for 3 days”.');
    } else {
      setError('');
    }
  };

  const addStock = async (stockId: number): Promise<boolean> => {
    if (!user) return false;
    const { error: cartError } = await supabase.from('cart_items').upsert(
      { user_id: user.id, stock_id: stockId, quantity: 1, saved_for_later: false },
      { onConflict: 'user_id,stock_id', ignoreDuplicates: false },
    );
    return !cartError;
  };

  const addSelected = async () => {
    setError('');
    let count = 0;
    for (const match of matches) {
      if (!selected[match.medicine.medicine_id]) continue;
      if (await addStock(match.offer.stock_id)) count += 1;
    }
    if (count === 0) setError('Could not add those medicines to your cart. Please try again.');
    setAddedCount(count);
  };

  const addSingle = async (medicine: CatalogMedicine) => {
    const offer = (medicine.stock ?? []).filter((s) => s.quantity > 0).sort((a, b) => a.price - b.price)[0];
    if (!offer) return;
    setBusyStock(medicine.medicine_id);
    const ok = await addStock(offer.stock_id);
    setBusyStock(null);
    if (ok) setAddedCount((n) => n + 1);
    else setError('Could not add that medicine to your cart.');
  };

  const removeAttachment = () => {
    clearRxAttachment();
    setAttached(false);
  };

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return catalog
      .filter((m) => [m.name, m.generic_name, m.salt].some((v) => v?.toLowerCase().includes(query)))
      .slice(0, 8);
  }, [catalog, search]);

  const selectedCount = matches.filter((m) => selected[m.medicine.medicine_id]).length;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="glass-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-[#0f2340] text-lg flex items-center gap-2"><FiCamera className="text-brand-600" /> Scan a prescription</h2>
            <p className="text-sm text-[#5b7088] mt-1 max-w-2xl">
              Upload a photo or PDF. We read the medicines, match them to genuine stock near you, and attach the prescription to checkout automatically.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/60 border border-white/50 p-1">
            {AI_LANGUAGES.map((l) => (
              <button key={l.id} type="button" onClick={() => setLanguage(l.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${language === l.id ? 'bg-brand-600 text-white' : 'text-[#5b7088]'}`}>
                {l.native}
              </button>
            ))}
          </div>
        </div>

        {!file ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="mt-4 rounded-2xl border-2 border-dashed border-brand-200 bg-white/50 p-8 text-center"
          >
            <FiUpload className="mx-auto text-brand-500 w-8 h-8 mb-2" />
            <p className="font-bold text-[#0f2340]">Drop your prescription here</p>
            <p className="text-xs text-[#5b7088] mt-1">JPG, PNG, WebP or PDF · max 8MB</p>
            <button type="button" className="btn-primary mt-4 !py-2 !px-4 !text-sm" onClick={() => inputRef.current?.click()}>
              Choose file
            </button>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFile} />
            <p className="text-[11px] text-[#8a9bb0] mt-3 flex items-center justify-center gap-1"><FiShield size={11} /> Stored only in your browser until you place the order.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[160px,1fr] gap-4">
            <div className="rounded-xl overflow-hidden border border-white/60 bg-white/60 h-40 flex items-center justify-center">
              {preview ? <img src={preview} alt="Prescription preview" className="w-full h-full object-contain" />
                : <div className="text-center p-3"><FiFileText className="mx-auto text-brand-500 w-8 h-8 mb-1" /><p className="text-[11px] font-bold text-[#5b7088] break-all">{file.name}</p></div>}
            </div>
            <div>
              <p className="text-sm font-bold text-[#0f2340] break-all">{file.name}</p>
              <p className="text-xs text-[#5b7088]">{(file.size / 1024).toFixed(0)} KB · {file.type === 'application/pdf' ? 'PDF' : 'Image'}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" className="btn-primary !py-2 !px-4 !text-sm flex items-center gap-2" onClick={runScan} disabled={scanning}>
                  <FiZap /> {scanning ? `Reading… ${progress}%` : 'Scan prescription'}
                </button>
                <button type="button" className="btn-ghost !py-2 !px-4 !text-sm" onClick={reset} disabled={scanning}>Change file</button>
              </div>
              {scanning && (
                <div className="mt-3 h-2 rounded-full bg-white/70 overflow-hidden">
                  <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.max(5, progress)}%` }} />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
            <FiAlertTriangle className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
      </div>

      {(result || rawText || (file && error)) && (
        <div className="glass-card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-extrabold text-[#0f2340] flex items-center gap-2"><FiFileText className="text-brand-600" /> Read text</h3>
            <div className="flex items-center gap-2 text-[11px] font-bold">
              {result && <span className="badge bg-brand-100 text-brand-700">{result.source === 'gemini' ? 'Gemini vision' : 'Browser OCR'}</span>}
              {result && <span className={`badge ${result.legibility === 'high' ? 'bg-emerald-100 text-emerald-700' : result.legibility === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{result.legibility} legibility</span>}
              {attached && <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><FiCheck /> Attached to checkout</span>}
            </div>
          </div>
          {!result && (
            <p className="text-xs text-[#5b7088] mb-2">Type or paste the medicines from your prescription below, then re-match them to the catalogue.</p>
          )}
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            aria-label="Prescription text"
            className="w-full rounded-xl border border-white/60 bg-white/70 p-3 text-sm font-mono text-[#0f2340] focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder={'One medicine per line, e.g.\nParacetamol 500mg 1-0-1 for 3 days\nCetirizine 10mg 0-0-1 for 5 days'}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className="btn-ghost !py-2 !px-3 !text-xs flex items-center gap-1.5" onClick={reparse}><FiRefreshCw /> Re-match medicines</button>
            {attached && <button type="button" className="btn-ghost !py-2 !px-3 !text-xs flex items-center gap-1.5 !text-rose-600" onClick={removeAttachment}><FiTrash2 /> Remove attached Rx</button>}
            {result && <button type="button" className="btn-ghost !py-2 !px-3 !text-xs" onClick={reset}>Start over</button>}
          </div>
          {result?.medicines.length === 0 && rawText && (
            <p className="text-[11px] text-[#8a9bb0] mt-2">The scanner could not identify medicine lines — edit the text above and press “Re-match medicines”.</p>
          )}
        </div>
      )}

      {extracted.length > 0 && (
        <div className="glass-card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-extrabold text-[#0f2340]">Matched medicines ({matches.length})</h3>
            {matches.length > 0 && (
              <button type="button" className="btn-primary !py-2 !px-4 !text-sm flex items-center gap-2" onClick={addSelected} disabled={selectedCount === 0}>
                <FiShoppingCart /> Add {selectedCount} to cart
              </button>
            )}
          </div>
          {matches.length === 0 ? (
            <p className="text-sm text-[#5b7088]">No catalogue match found. Search for a medicine below to add it manually, or edit the text above.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <MatchRow key={m.medicine.medicine_id} match={m}
                  checked={!!selected[m.medicine.medicine_id]}
                  onToggle={() => setSelected((s) => ({ ...s, [m.medicine.medicine_id]: !s[m.medicine.medicine_id] }))} />
              ))}
            </div>
          )}
          {addedCount > 0 && (
            <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5"><FiCheck /> {addedCount} medicine{addedCount > 1 ? 's' : ''} added to your cart.</p>
              <Link to="/app/store/cart" className="btn-primary !py-2 !px-4 !text-xs flex items-center gap-1.5">Go to cart <FiChevronRight /></Link>
            </div>
          )}
        </div>
      )}

      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-1 flex items-center gap-2"><FiSearch className="text-brand-600" /> Couldn’t find something?</h3>
        <p className="text-xs text-[#5b7088] mb-3">Search the catalogue and add a medicine manually. Rx-only items still need the prescription attached above.</p>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by brand, salt or generic name…"
          className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm text-[#0f2340] focus:outline-none focus:ring-2 focus:ring-brand-300" />
        {catalogLoading && <p className="text-xs text-[#5b7088] mt-2">Loading catalogue…</p>}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((m) => {
              const offer = (m.stock ?? []).filter((s) => s.quantity > 0).sort((a, b) => a.price - b.price)[0];
              return (
                <div key={m.medicine_id} className="flex items-center gap-3 rounded-xl bg-white/60 border border-white/50 p-2.5">
                  <MedicineImage name={m.name} form={m.form} className="w-10 h-10 rounded-lg object-contain bg-white shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#0f2340] truncate">{m.name}</p>
                    <p className="text-[11px] text-[#5b7088] truncate">{m.salt || m.generic_name || m.manufacturer || 'Verified pharmacy stock'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {offer ? <p className="text-sm font-extrabold text-[#0f2340]">₹{offer.price}</p> : <p className="text-[11px] text-rose-500 font-bold">Out of stock</p>}
                    <p className="text-[10px] text-[#8a9bb0]">{offer?.store?.store_name ?? ''}</p>
                  </div>
                  <button type="button" onClick={() => addSingle(m)} disabled={!offer || busyStock === m.medicine_id}
                    className="btn-primary !py-1.5 !px-2.5 !text-xs shrink-0 flex items-center gap-1 disabled:opacity-50">
                    <FiPlus /> Add
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#8a9bb0] px-1 flex items-start gap-1.5">
        <FiAlertTriangle className="mt-0.5 shrink-0" />
        Always check the scanned medicines against your paper prescription. MediConnect pharmacists verify every Rx order before dispensing.
      </p>
    </div>
  );
}

function MatchRow({ match, checked, onToggle }: { match: MatchedMedicine; checked: boolean; onToggle: () => void }) {
  const { extracted, medicine, offer, confidence } = match;
  const off = offer.mrp > offer.price ? Math.round(((offer.mrp - offer.price) / offer.mrp) * 100) : 0;
  return (
    <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${checked ? 'bg-brand-50/70 border-brand-200' : 'bg-white/50 border-white/50'}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 rounded accent-brand-600 shrink-0" />
      <MedicineImage name={medicine.name} form={medicine.form} className="w-11 h-11 rounded-lg object-contain bg-white shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-[#0f2340] truncate">{medicine.name}</p>
        <p className="text-[11px] text-[#5b7088] truncate">
          {extracted.dosage ? `Dose ${extracted.dosage}` : 'Dose as prescribed'}
          {extracted.duration ? ` · ${extracted.duration}` : ''}
          {offer.store?.store_name ? ` · ${offer.store.store_name}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="badge bg-white/80 text-[#5b7088] text-[10px]">Match {Math.round(confidence * 100)}%</span>
          {medicine.prescription_required
            ? <span className="badge bg-rose-100 text-rose-700 text-[10px]">Rx</span>
            : <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">OTC</span>}
          <span className="badge bg-white/80 text-[#5b7088] text-[10px]">Scanned: {extracted.name}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-extrabold text-[#0f2340]">₹{offer.price}</p>
        {off > 0 && <p className="text-[10px] text-[#8a9bb0] line-through">₹{offer.mrp}</p>}
        {off > 0 && <p className="text-[10px] font-bold text-emerald-600">{off}% off</p>}
      </div>
    </label>
  );
}
