import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle, FiArrowRight, FiCalendar, FiCheckCircle, FiChevronRight, FiMic, FiMicOff,
  FiRefreshCw, FiShield, FiShoppingBag, FiZap,
} from 'react-icons/fi';
import { SYMPTOM_LIST, analyzeSymptoms, type SymptomAnalysis } from '../../lib/symptomEngine';
import {
  AI_LANGUAGES, URGENCY_STYLE, copyFor, extractSymptoms, followUpChoices, getTriage,
  redFlagOptions, specialistLabel, specialistQuery, symptomLabel, type AiHealthAnswer, type AiLanguage,
} from '../../lib/aiHealth';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import type { SymptomCheckResultItem } from '../../types/database.types';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

const SPEECH_LANG: Record<AiLanguage, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

export default function SymptomChecker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [language, setLanguage] = useState<AiLanguage>('en');
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState<'today' | 'days' | 'week' | 'longer' | undefined>();
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe' | undefined>();
  const [ageGroup, setAgeGroup] = useState<'child' | 'adult' | 'senior' | undefined>();
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<AiHealthAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const copy = copyFor(language);
  const choices = useMemo(() => followUpChoices(language), [language]);
  const flags = useMemo(() => redFlagOptions(language), [language]);
  const voiceSupported = useMemo(() => !!getRecognition(), []);

  useEffect(() => () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleFlag = (flag: string) => setRedFlags((f) => (f.includes(flag) ? f.filter((x) => x !== flag) : [...f, flag]));

  const startVoice = useCallback(() => {
    setError('');
    const recognition = getRecognition();
    if (!recognition) {
      setError('Voice input is not supported in this browser. You can type your symptoms instead.');
      return;
    }
    recognitionRef.current = recognition;
    recognition.lang = SPEECH_LANG[language];
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length })
        .map((_, i) => event.results[i]?.[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (!transcript) return;
      setNotes((current) => `${current}${current ? ' ' : ''}${transcript}`.slice(0, 600));
      const detected = extractSymptoms(transcript);
      if (detected.length) setSelected((s) => [...new Set([...s, ...detected])]);
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Could not hear that. Check microphone permission and try again.');
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      setError('Could not start voice input. Try again or type instead.');
    }
  }, [language]);

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  };

  const analyze = async () => {
    if (selected.length === 0) {
      setError('Select at least one symptom.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const assessment = await getTriage({
        symptoms: selected,
        duration,
        severity,
        ageGroup,
        redFlags,
        notes: notes.trim() || undefined,
      }, language);
      setResult(assessment);
      if (user) {
        const severityForDb: SymptomCheckResultItem['severity'] = assessment.urgency === 'emergency'
          ? 'severe'
          : assessment.urgency === 'urgent' || assessment.urgency === 'routine' ? 'moderate' : 'mild';
        await supabase.from('symptom_checks').insert({
          user_id: user.id,
          symptoms: selected,
          result: [{
            condition: assessment.headline,
            severity: severityForDb,
            action: assessment.reply,
            score: 1,
            matchedSymptoms: selected,
            urgency: assessment.urgency,
            conditions: assessment.conditions,
            specialist: assessment.specialist,
            source: assessment.source,
            language,
            notes: notes.trim() || null,
            red_flags: assessment.redFlags,
            duration: duration ?? null,
            reported_severity: severity ?? null,
          }] as unknown as SymptomCheckResultItem[],
        });
      }
    } catch {
      // Last-resort client-side assessment if both AI and storage fail.
      const fallback = analyzeSymptoms(selected);
      setResult({
        source: 'local',
        mode: 'triage',
        language,
        urgency: fallback.overallSeverity === 'severe' ? 'emergency' : fallback.overallSeverity === 'moderate' ? 'routine' : 'self_care',
        headline: fallback.results[0]?.condition ?? copy.noMatch,
        reply: fallback.results[0]?.action ?? copy.noMatch,
        conditions: fallback.results.map((r) => r.condition),
        redFlags: [],
        specialist: 'General Physician',
        followUpQuestions: copy.followUps,
        selfCare: [],
        actions: [],
        disclaimer: fallback.disclaimer,
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelected([]);
    setDuration(undefined);
    setSeverity(undefined);
    setAgeGroup(undefined);
    setRedFlags([]);
    setNotes('');
    setResult(null);
    setError('');
  };

  const bookSpecialist = () => {
    if (!result) return;
    const specialization = specialistQuery(result.specialist);
    const reason = [result.headline, ...result.conditions].filter(Boolean).join(' — ').slice(0, 180);
    navigate(`/app/store/appointments?specialist=${encodeURIComponent(specialization)}&reason=${encodeURIComponent(reason)}`);
  };

  const localAnalysis: SymptomAnalysis | null = useMemo(
    () => (selected.length ? analyzeSymptoms(selected) : null),
    [selected],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-4">
      <div className="space-y-4">
        <div className="glass-card">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-extrabold text-[#0f2340] flex items-center gap-2"><FiZap className="text-brand-600" /> {copy.title}</h3>
              <p className="text-xs text-[#5b7088] mt-0.5">{copy.subtitle}</p>
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

          <p className="text-xs font-bold text-[#33475b] mb-2">1. {copy.feelingQuestion}</p>
          <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto pr-1">
            {SYMPTOM_LIST.map((s) => (
              <button key={s.id} type="button" onClick={() => toggle(s.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  selected.includes(s.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#0f2340] hover:border-brand-200'
                }`}>
                {symptomLabel(s.id, language)}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <ChoiceRow label={`2. ${copy.durationQuestion}`} options={choices.durations} value={duration} onChange={setDuration} />
            <ChoiceRow label={`3. ${copy.severityQuestion}`} options={choices.severities} value={severity} onChange={setSeverity} />
            <ChoiceRow label={`4. ${copy.ageQuestion}`} options={choices.ageGroups} value={ageGroup} onChange={setAgeGroup} />
          </div>

          <div className="mt-4 rounded-xl bg-white/50 border border-white/50 p-3">
            <p className="text-xs font-bold text-[#33475b] mb-2 flex items-center gap-1.5"><FiAlertTriangle className="text-amber-500" /> {copy.redFlagQuestion}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {flags.map((f) => (
                <label key={f.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold cursor-pointer border ${redFlags.includes(f.id) ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white/60 border-white/50 text-[#5b7088]'}`}>
                  <input type="checkbox" checked={redFlags.includes(f.id)} onChange={() => toggleFlag(f.id)} className="h-3.5 w-3.5 accent-rose-500" />
                  {f.label}
                </label>
              ))}
              <button type="button" onClick={() => setRedFlags([])}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold border ${redFlags.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white/60 border-white/50 text-[#5b7088]'}`}>
                <FiCheckCircle /> {copy.redFlagNone}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="symptom-notes" className="text-xs font-bold text-[#33475b]">Anything else? (optional)</label>
              <button type="button" onClick={listening ? stopVoice : startVoice} disabled={!voiceSupported}
                className={`text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded-lg ${listening ? 'bg-rose-500 text-white' : 'text-brand-600 hover:bg-brand-50'} disabled:opacity-50`}>
                {listening ? <><FiMicOff /> {copy.listening}</> : <><FiMic /> {copy.voice}</>}
              </button>
            </div>
            <textarea id="symptom-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder={copy.placeholder}
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-[#0f2340] focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>

          {error && <p className="mt-3 text-xs font-semibold text-rose-600 flex items-start gap-1.5" role="alert"><FiAlertTriangle className="mt-0.5 shrink-0" /> {error}</p>}

          <button type="button" onClick={analyze} disabled={selected.length === 0 || loading}
            className="btn-primary w-full mt-4 disabled:opacity-50">
            {loading ? copy.thinking : copy.symptomChecker}
          </button>
          <p className="text-[11px] text-[#8a9bb0] mt-2 flex items-start gap-1"><FiShield className="mt-0.5 shrink-0" /> {copy.disclaimer}</p>
        </div>
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="glass-card flex items-center gap-3 py-8 justify-center">
            <span className="h-5 w-5 rounded-full border-2 border-brand-300 border-t-brand-600 animate-spin" />
            <p className="text-sm font-bold text-[#5b7088]">{copy.thinking}</p>
          </div>
        )}

        {!result && !loading && (
          <div className="glass-card">
            <h4 className="font-extrabold text-[#0f2340] mb-2">{copy.conditions}</h4>
            <p className="text-sm text-[#5b7088] mb-3">{localAnalysis?.results[0]?.action ?? copy.generalReply}</p>
            <div className="rounded-xl bg-sky-50/70 border border-sky-100 p-3">
              <p className="text-xs font-bold text-[#0f2340] mb-1">How this works</p>
              <p className="text-[11px] text-[#5b7088]">
                Gemini AI reads your answers when configured; otherwise a safety-first rules engine built into MediConnect does. Red-flag symptoms always escalate immediately.
              </p>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className={`glass-card border ${result.urgency === 'emergency' ? '!bg-rose-50/80 border-rose-200' : ''}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`badge border ${URGENCY_STYLE[result.urgency]}`}>{copy.labels[result.urgency]}</span>
                <span className="text-[10px] font-bold text-[#8a9bb0]">{result.source === 'gemini' ? copy.sourceAi : copy.sourceLocal}</span>
              </div>
              <h4 className="font-extrabold text-[#0f2340] mb-1">{result.headline}</h4>
              <p className="text-sm text-[#33475b] whitespace-pre-line">{result.reply}</p>

              {result.urgency === 'emergency' ? (
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <Link to="/emergency" className="btn-primary !bg-rose-600 hover:!bg-rose-700 !py-2 !px-4 !text-sm flex items-center justify-center gap-2">
                    <FiAlertTriangle /> {copy.emergencyCta}
                  </Link>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={bookSpecialist} className="btn-primary !py-2 !px-4 !text-sm flex items-center gap-2">
                    <FiCalendar /> {copy.book} · {specialistLabel(result.specialist, language)}
                  </button>
                  <Link to="/app/store/medicines" className="btn-ghost !py-2 !px-4 !text-sm flex items-center gap-2">
                    <FiShoppingBag /> OTC relief
                  </Link>
                </div>
              )}
            </div>

            {result.conditions.length > 0 && (
              <div className="glass-card">
                <h4 className="font-extrabold text-[#0f2340] mb-2 text-sm">{copy.conditions}</h4>
                <ul className="space-y-1">
                  {result.conditions.map((c) => (
                    <li key={c} className="text-sm text-[#33475b] flex items-start gap-2"><FiChevronRight className="mt-0.5 text-brand-500 shrink-0" /> {c}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.selfCare.length > 0 && (
              <div className="glass-card">
                <h4 className="font-extrabold text-[#0f2340] mb-2 text-sm">{copy.selfCare}</h4>
                <ul className="space-y-1.5">
                  {result.selfCare.map((s) => (
                    <li key={s} className="text-sm text-[#33475b] flex items-start gap-2"><FiCheckCircle className="mt-0.5 text-emerald-500 shrink-0" /> {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.redFlags.length > 0 && (
              <div className="glass-card !bg-amber-50/70 border-amber-200">
                <h4 className="font-extrabold text-amber-800 mb-2 text-sm flex items-center gap-1.5"><FiAlertTriangle /> {copy.redFlags}</h4>
                <ul className="space-y-1">
                  {result.redFlags.map((r) => <li key={r} className="text-sm text-amber-800">• {r}</li>)}
                </ul>
              </div>
            )}

            {result.followUpQuestions.length > 0 && (
              <div className="glass-card">
                <h4 className="font-extrabold text-[#0f2340] mb-2 text-sm">Questions a doctor may ask</h4>
                <ul className="space-y-1.5">
                  {result.followUpQuestions.map((q) => (
                    <li key={q} className="text-xs text-[#5b7088] flex items-start gap-2"><FiArrowRight className="mt-0.5 text-brand-400 shrink-0" /> {q}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-1">
              <button type="button" onClick={reset} className="text-xs font-bold text-[#5b7088] flex items-center gap-1.5"><FiRefreshCw /> Start over</button>
              <Link to="/app/store/appointments" className="text-xs font-bold text-brand-600 flex items-center gap-1">All doctors <FiChevronRight /></Link>
            </div>
            <p className="text-[11px] text-[#8a9bb0] px-1">{result.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ChoiceRow<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-[#33475b] mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(value === o.id ? undefined : o.id)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${value === o.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#5b7088]'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
