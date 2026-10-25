import { useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { SYMPTOM_LIST, analyzeSymptoms, type SymptomAnalysis, type Severity } from '../../lib/symptomEngine';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';

const SEVERITY_STYLE: Record<Severity, string> = {
  mild: 'bg-emerald-100 text-emerald-700',
  moderate: 'bg-amber-100 text-amber-700',
  severe: 'bg-rose-100 text-rose-700',
};

export default function SymptomChecker() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SymptomAnalysis | null>(null);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const analyze = async () => {
    if (selected.length === 0 || !user) return;
    const r = analyzeSymptoms(selected);
    setResult(r);
    await supabase.from('symptom_checks').insert({ user_id: user.id, symptoms: selected, result: r.results });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="glass-card">
        <h3 className="font-extrabold text-[#0f2340] mb-1">Select your symptoms</h3>
        <p className="text-xs text-[#5b7088] mb-4">Pick everything that applies. This is guidance only, not a diagnosis.</p>
        <div className="flex flex-wrap gap-2">
          {SYMPTOM_LIST.map((s) => (
            <button key={s.id} onClick={() => toggle(s.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                selected.includes(s.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#0f2340]'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={analyze} disabled={selected.length === 0} className="btn-primary w-full mt-5">
          Analyze symptoms
        </button>
      </div>

      <div className="space-y-3">
        {result?.overallSeverity === 'severe' && (
          <div className="glass-card !bg-rose-50/70 border-rose-200 flex items-start gap-3">
            <FiAlertTriangle className="text-rose-600 mt-0.5 shrink-0" />
            <p className="text-sm font-bold text-rose-700">
              Your symptoms may indicate an emergency. Please call an ambulance or visit the ER immediately.
            </p>
          </div>
        )}
        {result?.results.map((r) => (
          <div key={r.condition} className="glass-card">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-extrabold text-[#0f2340]">{r.condition}</h4>
              <span className={`badge ${SEVERITY_STYLE[r.severity]}`}>{r.severity}</span>
            </div>
            <p className="text-sm text-[#5b7088]">{r.action}</p>
          </div>
        ))}
        {result && <p className="text-[11px] text-[#8a9bb0] px-1">{result.disclaimer}</p>}
      </div>
    </div>
  );
}
