import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle, FiCalendar, FiChevronRight, FiMessageCircle, FiRefreshCw, FiSend,
  FiShield, FiX, FiActivity,
} from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';
import {
  AI_LANGUAGES, URGENCY_STYLE, copyFor, getChatReply, specialistLabel, specialistQuery,
  type AiHealthAnswer, type AiLanguage, type ChatTurn,
} from '../lib/aiHealth';

interface Bubble extends ChatTurn {
  id: number;
  answer?: AiHealthAnswer;
}

const HIDDEN_PREFIXES = ['/login', '/signup'];

export default function AIHealthChatbot() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<AiLanguage>('en');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const copy = copyFor(language);

  const visible = useMemo(() => {
    if (HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p))) return false;
    if (user) return true;
    return location.pathname === '/' || location.pathname === '/emergency';
  }, [location.pathname, user]);

  // Reset the conversation when the language changes so the greeting matches.
  useEffect(() => {
    setBubbles([{ id: nextId.current++, role: 'assistant', content: copyFor(language).greeting }]);
    setError('');
  }, [language]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, busy, open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setError('');
    setInput('');
    const history: ChatTurn[] = bubbles.map((b) => ({ role: b.role, content: b.content }));
    setBubbles((list) => [...list, { id: nextId.current++, role: 'user', content: message }]);
    setBusy(true);
    try {
      const answer = await getChatReply(message, history, language);
      setBubbles((list) => [
        ...list,
        { id: nextId.current++, role: 'assistant', content: answer.reply, answer },
      ]);
    } catch {
      setError(language === 'en' ? 'The assistant is unavailable right now. Please try again.'
        : language === 'hi' ? 'सहायक अभी उपलब्ध नहीं है। कृपया फिर कोशिश करें।'
          : 'सहाय्यक आता उपलब्ध नाही. कृपया पुन्हा प्रयत्न करा.');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const reset = () => {
    setBubbles([{ id: nextId.current++, role: 'assistant', content: copy.greeting }]);
    setError('');
    setInput('');
  };

  const openSpecialist = (answer: AiHealthAnswer) => {
    if (!user) {
      navigate('/login');
      return;
    }
    const specialization = specialistQuery(answer.specialist || 'General Physician');
    const reason = [answer.headline, ...answer.conditions].filter(Boolean).join(' — ').slice(0, 180);
    setOpen(false);
    navigate(`/app/store/appointments?specialist=${encodeURIComponent(specialization)}&reason=${encodeURIComponent(reason)}`);
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50 print:hidden">
        <AnimatePresence>
          {!open && (
            <motion.button
              key="launcher"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => setOpen(true)}
              aria-label={copy.open}
              className="relative h-14 w-14 rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/30 flex items-center justify-center hover:bg-brand-700 transition-colors"
            >
              <FiMessageCircle size={24} />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 border-2 border-white" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:w-[390px] max-h-[min(640px,calc(100vh-2rem))] glass !bg-white/95 flex flex-col overflow-hidden print:hidden"
            role="dialog"
            aria-label={copy.title}
          >
            <div className="flex items-start justify-between gap-2 p-3 border-b border-brand-100/70 bg-gradient-to-r from-brand-50/80 to-white">
              <div className="flex items-start gap-2">
                <span className="h-9 w-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0"><FiActivity /></span>
                <div>
                  <p className="font-extrabold text-[#0f2340] text-sm">{copy.title}</p>
                  <p className="text-[10px] text-[#5b7088]">{copy.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={reset} title={copy.reset} aria-label={copy.reset} className="p-1.5 rounded-lg text-[#5b7088] hover:bg-white"><FiRefreshCw size={14} /></button>
                <button type="button" onClick={() => setOpen(false)} title={copy.close} aria-label={copy.close} className="p-1.5 rounded-lg text-[#5b7088] hover:bg-white"><FiX size={16} /></button>
              </div>
            </div>

            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-brand-100/50 bg-white/70">
              {AI_LANGUAGES.map((l) => (
                <button key={l.id} type="button" onClick={() => setLanguage(l.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${language === l.id ? 'bg-brand-600 text-white' : 'text-[#5b7088] hover:bg-brand-50'}`}>
                  {l.native}
                </button>
              ))}
              <span className="ml-auto text-[9px] font-bold text-[#8a9bb0] flex items-center gap-1"><FiShield size={9} /> {copy.notMedicalAdvice}</span>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[220px]">
              {bubbles.map((bubble) => (
                <div key={bubble.id} className={`flex ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-line ${
                    bubble.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white border border-brand-100/70 text-[#33475b] rounded-bl-md'
                  }`}>
                    {bubble.answer && bubble.answer.urgency !== 'self_care' && (
                      <span className={`inline-block mb-1.5 badge border text-[9px] ${URGENCY_STYLE[bubble.answer.urgency]}`}>
                        {copy.labels[bubble.answer.urgency]}
                      </span>
                    )}
                    {bubble.content}

                    {bubble.answer && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {bubble.answer.urgency === 'emergency' ? (
                          <button type="button" onClick={() => { setOpen(false); navigate('/emergency'); }}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 text-white px-2.5 py-1.5 text-[10px] font-bold">
                            <FiAlertTriangle size={11} /> {copy.emergencyCta}
                          </button>
                        ) : (
                          <>
                            {bubble.answer.specialist && (
                              <button type="button" onClick={() => openSpecialist(bubble.answer!)}
                                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 text-white px-2.5 py-1.5 text-[10px] font-bold">
                                <FiCalendar size={11} /> {copy.book} · {specialistLabel(bubble.answer.specialist, language)}
                              </button>
                            )}
                            {user && (
                              <button type="button" onClick={() => { setOpen(false); navigate('/app/store/symptom-checker'); }}
                                className="inline-flex items-center gap-1 rounded-lg bg-brand-50 text-brand-700 px-2.5 py-1.5 text-[10px] font-bold">
                                <FiActivity size={11} /> {copy.symptomChecker}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {bubble.answer && bubble.answer.source === 'gemini' && (
                      <p className="mt-1.5 text-[9px] text-[#8a9bb0]">{copy.sourceAi}</p>
                    )}
                  </div>
                </div>
              ))}

              {bubbles.length === 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {copy.quick.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)}
                      className="rounded-full bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-1.5 text-[10.5px] font-bold hover:bg-brand-100">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {busy && (
                <div className="flex justify-start">
                  <div className="bg-white border border-brand-100/70 rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-1.5">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                    <span className="text-[10px] text-[#8a9bb0] font-bold ml-1">{copy.thinking}</span>
                  </div>
                </div>
              )}

              {error && <p className="text-[11px] text-rose-600 font-semibold" role="alert">{error}</p>}
            </div>

            <form onSubmit={onSubmit} className="p-2.5 border-t border-brand-100/70 bg-white/80">
              <div className="flex items-end gap-1.5">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, 600))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  placeholder={copy.placeholder}
                  aria-label={copy.placeholder}
                  className="flex-1 resize-none rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs text-[#0f2340] focus:outline-none focus:ring-2 focus:ring-brand-300 max-h-24"
                />
                <button type="submit" disabled={!input.trim() || busy} aria-label={copy.send}
                  className="h-9 w-9 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:opacity-40 shrink-0">
                  <FiSend size={15} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <p className="text-[9px] text-[#8a9bb0]">{copy.disclaimer}</p>
                {user && (
                  <button type="button" onClick={() => { setOpen(false); navigate('/emergency'); }}
                    className="text-[9px] font-bold text-rose-500 flex items-center gap-0.5 shrink-0">
                    Emergency <FiChevronRight size={9} />
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
