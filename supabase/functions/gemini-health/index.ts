// Supabase Edge Function: gemini-health
//
// One small, audited gateway to Google Gemini for the three AI features in
// MediConnect:
//   mode: 'chat'   — conversational health guidance (floating assistant)
//   mode: 'triage' — structured symptom assessment with urgency + specialist
//   mode: 'ocr'    — prescription image/PDF text + medicine extraction
//
// Required secret (set via `supabase secrets set GEMINI_API_KEY=...`):
//   GEMINI_API_KEY
// Optional secret:
//   GEMINI_MODEL   (defaults to gemini-2.0-flash)
//
// The function NEVER diagnoses. It returns educational guidance, forces
// emergency escalation when red-flag symptoms are present, and tells the user
// to consult a licensed clinician. If the key is missing it returns 503 so the
// frontend can transparently use its local evidence-based fallback engine.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  mr: 'Marathi (Devanagari script)',
};

const SAFETY_RULES = `
You are MediConnect's health information assistant, not a doctor.
Rules you must always follow:
- Never claim to diagnose, prescribe, or guarantee an outcome.
- Give general, evidence-aligned guidance and clearly suggest a licensed clinician.
- If any red-flag symptom is present (chest pain, difficulty breathing, fainting,
  severe bleeding, stroke signs, suicidal thoughts, seizure, severe dehydration,
  high fever in an infant, pregnancy emergencies), set urgency to "emergency"
  and tell the user to seek immediate in-person or ambulance care.
- Never recommend prescription-only medicines by name as a self-treatment.
- Be concise, warm and practical. Use the requested language.
`;

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Model did not return JSON');
  }
}

function normaliseUrgency(value: unknown): string {
  const v = String(value ?? '').toLowerCase();
  if (['emergency', 'urgent', 'routine', 'self_care'].includes(v)) return v;
  if (v.includes('emerg')) return 'emergency';
  if (v.includes('urgent')) return 'urgent';
  if (v.includes('routine')) return 'routine';
  return 'self_care';
}

function asStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

const RED_FLAG_WORDS = [
  'chest pain', 'shortness of breath', 'cannot breathe', 'can\'t breathe', 'unconscious',
  'fainting', 'severe bleeding', 'stroke', 'slurred speech', 'seizure', 'suicidal',
];

function mentionsRedFlag(text: string): boolean {
  const lower = text.toLowerCase();
  return RED_FLAG_WORDS.some((word) => lower.includes(word));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!GEMINI_API_KEY) {
    return json({ error: 'AI assistant is not configured', code: 'GEMINI_NOT_CONFIGURED' }, 503);
  }

  try {
    const body = await req.json().catch(() => null) as {
      mode?: string;
      message?: string;
      symptoms?: string[];
      language?: string;
      history?: { role?: string; content?: string }[];
      image?: string;
      mimeType?: string;
    } | null;
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const mode = body.mode === 'ocr' ? 'ocr' : body.mode === 'triage' ? 'triage' : 'chat';
    const language = body.language === 'hi' || body.language === 'mr' ? body.language : 'en';
    const languageName = LANGUAGE_NAME[language] ?? 'English';

    if (mode === 'ocr') {
      if (!body.image || typeof body.image !== 'string') {
        return json({ error: 'image (base64 data) is required for OCR' }, 400);
      }
      const base64 = body.image.replace(/^data:[^;]+;base64,/, '');
      if (base64.length > 8_000_000) return json({ error: 'Image is too large (max ~6MB)' }, 413);
      const mimeType = body.mimeType || 'image/jpeg';

      const geminiRes = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${SAFETY_RULES}\nYou are now doing OCR only. Read the prescription image faithfully. Do not invent medicines that are not visible. If handwriting is unclear, mark confidence low.` }] },
          contents: [{
            role: 'user',
            parts: [
              { text: `Extract this prescription. Return JSON with exactly these keys:
{"raw_text": string, "patient_name": string|null, "doctor_name": string|null, "clinic": string|null, "date": string|null,
 "medicines": [{"name": string, "strength": string|null, "form": string|null, "dosage": string|null, "duration": string|null, "instructions": string|null, "confidence": number}],
 "notes": string|null, "legibility": "high"|"medium"|"low"}
Use confidence 0..1. Include every legible medicine line. Respond in ${languageName} only where free text is needed; keep medicine names as written.` },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!geminiRes.ok) {
        const detail = await geminiRes.text();
        return json({ error: 'Prescription OCR failed', detail: detail.slice(0, 500) }, 502);
      }
      const payload = await geminiRes.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      let parsed: Record<string, unknown>;
      try {
        parsed = extractJson(text) as Record<string, unknown>;
      } catch {
        return json({ error: 'Could not read the prescription. Try a clearer photo.', code: 'UNREADABLE' }, 422);
      }
      const medicines = Array.isArray(parsed.medicines)
        ? (parsed.medicines as Record<string, unknown>[]).slice(0, 25).map((m) => ({
          name: String(m.name ?? '').trim(),
          strength: m.strength ? String(m.strength) : null,
          form: m.form ? String(m.form) : null,
          dosage: m.dosage ? String(m.dosage) : null,
          duration: m.duration ? String(m.duration) : null,
          instructions: m.instructions ? String(m.instructions) : null,
          confidence: Math.max(0, Math.min(1, Number(m.confidence ?? 0.5))),
        })).filter((m) => m.name)
        : [];

      return json({
        data: {
          source: 'gemini',
          mode,
          language,
          raw_text: String(parsed.raw_text ?? ''),
          patient_name: parsed.patient_name ? String(parsed.patient_name) : null,
          doctor_name: parsed.doctor_name ? String(parsed.doctor_name) : null,
          clinic: parsed.clinic ? String(parsed.clinic) : null,
          date: parsed.date ? String(parsed.date) : null,
          notes: parsed.notes ? String(parsed.notes) : null,
          legibility: ['high', 'medium', 'low'].includes(String(parsed.legibility)) ? parsed.legibility : 'medium',
          medicines,
        },
      });
    }

    const symptoms = asStringArray(body.symptoms, 20);
    const message = typeof body.message === 'string' ? body.message.slice(0, 2000).trim() : '';
    if (!message && symptoms.length === 0) {
      return json({ error: 'message or symptoms are required' }, 400);
    }

    const history = Array.isArray(body.history)
      ? body.history
        .filter((h) => typeof h?.content === 'string')
        .slice(-8)
        .map((h) => `${h.role === 'assistant' ? 'Assistant' : 'User'}: ${String(h.content).slice(0, 800)}`)
        .join('\n')
      : '';

    const prompt = mode === 'triage'
      ? `Assess these symptoms for a general audience: ${symptoms.join(', ') || message}.
${message ? `Additional details: ${message}` : ''}
Return JSON with exactly these keys:
{"reply": string, "urgency": "self_care"|"routine"|"urgent"|"emergency", "headline": string,
 "likely_conditions": [string], "red_flags": [string], "specialist": string,
 "follow_up_questions": [string], "self_care": [string], "disclaimer": string}
"follow_up_questions" must have 2-4 short questions a clinician would ask next.`
      : `Conversation so far:
${history || '(new conversation)'}

User: ${message || symptoms.join(', ')}
Return JSON with exactly these keys:
{"reply": string, "urgency": "self_care"|"routine"|"urgent"|"emergency",
 "specialist": string|null, "follow_up_questions": [string], "suggested_actions": [string],
 "disclaimer": string}
Keep reply under 140 words unless the user asks for more detail.`;

    const geminiRes = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SAFETY_RULES}\nRespond in ${languageName}. Return valid JSON only.` }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      return json({ error: 'AI assistant is temporarily unavailable', detail: detail.slice(0, 500) }, 502);
    }

    const payload = await geminiRes.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(text) as Record<string, unknown>;
    } catch {
      return json({ error: 'AI returned an unreadable response', code: 'UNREADABLE' }, 422);
    }

    const urgency = mentionsRedFlag(`${message} ${symptoms.join(' ')}`)
      ? 'emergency'
      : normaliseUrgency(parsed.urgency);

    const data = {
      source: 'gemini',
      mode,
      language,
      reply: String(parsed.reply ?? '').trim() || 'I could not generate guidance just now. Please try again or consult a doctor.',
      headline: parsed.headline ? String(parsed.headline) : undefined,
      urgency,
      likely_conditions: asStringArray(parsed.likely_conditions, 4),
      red_flags: asStringArray(parsed.red_flags, 6),
      specialist: parsed.specialist ? String(parsed.specialist) : null,
      follow_up_questions: asStringArray(parsed.follow_up_questions, 4),
      self_care: asStringArray(parsed.self_care, 6),
      suggested_actions: asStringArray(parsed.suggested_actions, 5),
      disclaimer: parsed.disclaimer
        ? String(parsed.disclaimer)
        : 'General guidance only — not a diagnosis. Consult a licensed doctor for medical advice.',
    };

    return json({ data });
  } catch (err) {
    return json({ error: 'Unexpected AI error', detail: String(err).slice(0, 500) }, 500);
  }
});
