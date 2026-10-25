/**
 * prescriptionOcr.ts — prescription scanning + catalogue matching.
 *
 * Two extraction engines, tried in order:
 *   1. Gemini vision via the `gemini-health` Edge Function (best for handwriting).
 *   2. Tesseract.js in the browser (works with no server key, needs network for
 *      the first language-model download; cached by the browser afterwards).
 *
 * If neither can read the image the user can correct the text manually — the
 * matching step is pure and runs on whatever text they provide.
 */
import { supabase } from './supabaseClient';
import type { AiLanguage } from './aiHealth';

export interface ExtractedMedicine {
  name: string;
  strength?: string | null;
  form?: string | null;
  dosage?: string | null;
  duration?: string | null;
  instructions?: string | null;
  confidence: number;
}

export interface PrescriptionScanResult {
  source: 'gemini' | 'tesseract';
  rawText: string;
  medicines: ExtractedMedicine[];
  patientName?: string | null;
  doctorName?: string | null;
  clinic?: string | null;
  date?: string | null;
  notes?: string | null;
  legibility: 'high' | 'medium' | 'low';
}

export interface CatalogOffer {
  stock_id: number;
  price: number;
  mrp: number;
  quantity: number;
  store_id?: number;
  store?: { store_id?: number; store_name?: string | null; latitude?: number | null; longitude?: number | null } | null;
}

export interface CatalogMedicine {
  medicine_id: number;
  name: string;
  generic_name?: string | null;
  salt?: string | null;
  manufacturer?: string | null;
  prescription_required?: boolean;
  form?: string | null;
  stock?: CatalogOffer[] | null;
}

export interface MatchedMedicine {
  extracted: ExtractedMedicine;
  medicine: CatalogMedicine;
  offer: CatalogOffer;
  confidence: number;
}

const RX_ATTACHMENT_KEY = 'mediconnect_rx_attachment_v1';
const MAX_ATTACHMENT_BYTES = 3.5 * 1024 * 1024;

export interface StoredRxAttachment {
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(attachment: StoredRxAttachment): File | null {
  try {
    const comma = attachment.dataUrl.indexOf(',');
    if (comma < 0) return null;
    const base64 = attachment.dataUrl.slice(comma + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], attachment.name, { type: attachment.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

/** Remember the scanned prescription so checkout can attach it automatically. */
export function saveRxAttachment(attachment: StoredRxAttachment): boolean {
  if (typeof window === 'undefined') return false;
  if (attachment.dataUrl.length > MAX_ATTACHMENT_BYTES) return false;
  try {
    window.localStorage.setItem(RX_ATTACHMENT_KEY, JSON.stringify(attachment));
    return true;
  } catch {
    return false;
  }
}

export function loadRxAttachment(): StoredRxAttachment | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RX_ATTACHMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRxAttachment>;
    if (!parsed.dataUrl || !parsed.name || !parsed.type) return null;
    return {
      name: parsed.name,
      type: parsed.type,
      dataUrl: parsed.dataUrl,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearRxAttachment(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RX_ATTACHMENT_KEY);
  } catch {
    // ignore
  }
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(tab|tablet|cap|capsule|syp|syrup|inj|injection|oint|ointment|drops?|gel|cream|sachet|susp|suspension)\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|ml|g|iu|%|w\/v)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normaliseName(value).split(' ').filter((t) => t.length > 2);
}

/**
 * Pure heuristic parser for OCR text. It keeps medicine-looking lines, pulls
 * out the dose schedule/duration when present, and strips noise so the
 * catalogue matcher has the cleanest possible name to work with.
 */
export function parsePrescriptionText(rawText: string): ExtractedMedicine[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const dosagePattern = /\b([0-2])\s*[-–]\s*([0-2])\s*[-–]\s*([0-2])\b|\b(od|bd|tds|qid|hs|sos|prn|stat)\b|\b(1|2|3)\s*(?:x|times)\s*(?:a\s*)?(?:day|daily)\b/i;
  const durationPattern = /\b(\d+)\s*(day|days|week|weeks|month|months)\b/i;
  const strengthPattern = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|iu)\b/i;
  const formPattern = /\b(tab|tablet|cap|capsule|syp|syrup|inj|injection|ointment|drops?|gel|cream|sachet|susp|suspension)\b/i;
  const instructionPattern = /\b(after food|before food|with food|at bedtime|empty stomach|twice daily|once daily|thrice daily|as needed|khana ke baad|khali pet)\b/i;
  const headerPattern = /^(dr\.?|clinic|hospital|address|phone|patient|name|age|sex|date|rx|prescription|reg\.? no|signature)\b/i;

  const out: ExtractedMedicine[] = [];
  for (const line of lines) {
    if (headerPattern.test(line)) continue;
    if (line.length < 3 || line.length > 180) continue;
    const hasDose = dosagePattern.test(line);
    const hasForm = formPattern.test(line);
    const hasStrength = strengthPattern.test(line);
    if (!hasDose && !hasForm && !hasStrength) continue;

    const dosage = line.match(dosagePattern)?.[0] ?? null;
    const duration = line.match(durationPattern)?.[0] ?? null;
    const strength = line.match(strengthPattern)?.[0]?.replace(/\s+/g, '') ?? null;
    const form = line.match(formPattern)?.[0] ?? null;
    const instructions = line.match(instructionPattern)?.[0] ?? null;

    let name = line
      .replace(/^\s*\d+[).:-]?\s*/, '')
      .replace(new RegExp(`\\b${(dosage ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), ' ')
      .replace(durationPattern, ' ')
      .replace(instructionPattern, ' ')
      .replace(/\b(x|for|days?|weeks?|months?|use|take|apply|sos|stat)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    name = name.replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');
    if (!name || name.length < 3) continue;
    if (out.some((m) => normaliseName(m.name) === normaliseName(name))) continue;

    out.push({
      name,
      strength,
      form,
      dosage: dosage ? dosage.toUpperCase() : null,
      duration,
      instructions,
      confidence: 0.55,
    });
  }

  return out.slice(0, 25);
}

const CONFIDENCE_THRESHOLD = 0.42;

/**
 * Match extracted prescription lines to the live catalogue. Pure so it is easy
 * to test and so the UI can re-run it instantly when the user edits the OCR
 * text.
 */
export function matchPrescriptionToCatalog(
  extracted: ExtractedMedicine[],
  catalog: CatalogMedicine[],
): MatchedMedicine[] {
  const used = new Set<number>();
  const matches: MatchedMedicine[] = [];

  for (const item of extracted) {
    const itemNorm = normaliseName(item.name);
    const itemTokens = tokens(item.name);
    if (!itemNorm) continue;

    let best: { medicine: CatalogMedicine; score: number } | null = null;
    for (const medicine of catalog) {
      if (used.has(medicine.medicine_id)) continue;
      const candidates = [medicine.name, medicine.generic_name, medicine.salt]
        .filter((v): v is string => !!v)
        .map(normaliseName);
      const combined = candidates.join(' ');
      let score = 0;

      if (candidates.some((c) => c === itemNorm)) score = 1;
      else if (combined.includes(itemNorm) || itemNorm.includes(normaliseName(medicine.name))) score = 0.9;
      else {
        const catalogTokens = new Set(tokens(`${medicine.name} ${medicine.generic_name ?? ''} ${medicine.salt ?? ''}`));
        const overlap = itemTokens.filter((t) => [...catalogTokens].some((c) => c.includes(t) || t.includes(c)));
        if (itemTokens.length > 0) score = (overlap.length / itemTokens.length) * 0.78;
        const generic = medicine.generic_name;
        if (score < 0.5 && generic && itemNorm.includes(normaliseName(generic))) score = 0.8;
      }

      if (score > (best?.score ?? 0)) best = { medicine, score };
    }

    if (!best || best.score < CONFIDENCE_THRESHOLD) continue;
    const offers = (best.medicine.stock ?? [])
      .filter((s) => s.quantity > 0 && Number(s.price) > 0)
      .sort((a, b) => a.price - b.price);
    const offer = offers[0];
    if (!offer) continue;

    used.add(best.medicine.medicine_id);
    matches.push({
      extracted: { ...item, confidence: Math.max(item.confidence, best.score) },
      medicine: best.medicine,
      offer,
      confidence: best.score,
    });
  }

  return matches;
}

interface GeminiOcrPayload {
  raw_text?: unknown;
  patient_name?: unknown;
  doctor_name?: unknown;
  clinic?: unknown;
  date?: unknown;
  notes?: unknown;
  legibility?: unknown;
  medicines?: unknown;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function geminiScan(file: File, language: AiLanguage): Promise<PrescriptionScanResult | null> {
  try {
    const dataUrl = await fileToDataUrl(file);
    const { data, error } = await supabase.functions.invoke('gemini-health', {
      body: { mode: 'ocr', image: dataUrl, mimeType: file.type || 'image/jpeg', language },
    });
    if (error) return null;
    const payload = (data as { data?: GeminiOcrPayload } | null)?.data;
    if (!payload || typeof payload !== 'object') return null;

    const rawText = asOptionalString(payload.raw_text) ?? '';
    const meds = Array.isArray(payload.medicines)
      ? (payload.medicines as Record<string, unknown>[]).map((m) => ({
        name: String(m.name ?? '').trim(),
        strength: asOptionalString(m.strength),
        form: asOptionalString(m.form),
        dosage: asOptionalString(m.dosage),
        duration: asOptionalString(m.duration),
        instructions: asOptionalString(m.instructions),
        confidence: Math.max(0, Math.min(1, Number(m.confidence ?? 0.7))),
      })).filter((m) => m.name)
      : [];

    if (!rawText && meds.length === 0) return null;
    return {
      source: 'gemini',
      rawText,
      medicines: meds,
      patientName: asOptionalString(payload.patient_name),
      doctorName: asOptionalString(payload.doctor_name),
      clinic: asOptionalString(payload.clinic),
      date: asOptionalString(payload.date),
      notes: asOptionalString(payload.notes),
      legibility: payload.legibility === 'high' || payload.legibility === 'low' ? payload.legibility : 'medium',
    };
  } catch {
    return null;
  }
}

async function tesseractScan(file: File, onProgress?: (percent: number) => void): Promise<PrescriptionScanResult | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      logger: (message: { status: string; progress: number }) => {
        if (message.status === 'recognizing text') onProgress?.(Math.round(message.progress * 100));
      },
    });
    try {
      const { data } = await worker.recognize(file);
      const rawText = data.text?.trim() ?? '';
      if (!rawText) return null;
      const medicines = parsePrescriptionText(rawText);
      return {
        source: 'tesseract',
        rawText,
        medicines,
        legibility: data.confidence > 78 ? 'high' : data.confidence > 55 ? 'medium' : 'low',
      };
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

export class PrescriptionScanError extends Error {
  code: 'UNSUPPORTED' | 'UNREADABLE' | 'TOO_LARGE' | 'OFFLINE';

  constructor(message: string, code: 'UNSUPPORTED' | 'UNREADABLE' | 'TOO_LARGE' | 'OFFLINE') {
    super(message);
    this.name = 'PrescriptionScanError';
    this.code = code;
  }
}

/**
 * Scan a prescription image/PDF. Always returns an editable raw text so the
 * user can fix an imperfect reading before matching.
 */
export async function scanPrescription(
  file: File,
  language: AiLanguage,
  onProgress?: (percent: number) => void,
): Promise<PrescriptionScanResult> {
  if (file.size > 8 * 1024 * 1024) {
    throw new PrescriptionScanError('File is too large. Please upload an image or PDF under 8MB.', 'TOO_LARGE');
  }
  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) {
    throw new PrescriptionScanError('Upload a JPG, PNG, WebP or PDF prescription.', 'UNSUPPORTED');
  }

  onProgress?.(8);
  const gemini = await geminiScan(file, language);
  if (gemini) {
    onProgress?.(100);
    return gemini;
  }

  onProgress?.(20);
  const tesseract = await tesseractScan(file, onProgress);
  if (tesseract) {
    onProgress?.(100);
    return tesseract;
  }

  if (isPdf) {
    throw new PrescriptionScanError(
      'We could not read this PDF automatically. Try a clear photo of the prescription, or type the medicines below.',
      'UNREADABLE',
    );
  }
  throw new PrescriptionScanError(
    'We could not read this prescription. Try brighter light and a straight, close-up photo — or type the medicines below.',
    'UNREADABLE',
  );
}
