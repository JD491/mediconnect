/**
 * symptomEngine.ts — ported 1:1 from MediMart's backend
 * (backend/src/modules/symptomChecker/{symptom.rules.js, symptom.controller.js}).
 *
 * Runs client-side now (no server round trip needed); the final result is
 * still persisted to `symptom_checks` via Supabase for the user's history
 * and so admins/doctors can audit usage.
 *
 * IMPORTANT: demo-grade educational tool, NOT a diagnostic system.
 */

export type Severity = 'mild' | 'moderate' | 'severe';

export interface SymptomOption {
  id: string;
  label: string;
}

interface SymptomRule {
  condition: string;
  symptoms: string[];
  severity: Severity;
  action: string;
}

export interface ScoredResult extends SymptomRule {
  score: number;
  matchedSymptoms: string[];
}

export interface SymptomAnalysis {
  results: ScoredResult[];
  overallSeverity: Severity;
  disclaimer: string;
}

export const SYMPTOM_LIST: SymptomOption[] = [
  { id: 'fever', label: 'Fever' },
  { id: 'cough', label: 'Cough' },
  { id: 'sore_throat', label: 'Sore Throat' },
  { id: 'headache', label: 'Headache' },
  { id: 'body_ache', label: 'Body Ache' },
  { id: 'fatigue', label: 'Fatigue / Weakness' },
  { id: 'runny_nose', label: 'Runny / Blocked Nose' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'vomiting', label: 'Vomiting' },
  { id: 'diarrhea', label: 'Diarrhea' },
  { id: 'abdominal_pain', label: 'Abdominal Pain' },
  { id: 'chest_pain', label: 'Chest Pain' },
  { id: 'shortness_of_breath', label: 'Shortness of Breath' },
  { id: 'dizziness', label: 'Dizziness' },
  { id: 'rash', label: 'Skin Rash' },
  { id: 'joint_pain', label: 'Joint Pain' },
  { id: 'loss_of_taste_smell', label: 'Loss of Taste/Smell' },
  { id: 'eye_redness', label: 'Eye Redness/Irritation' },
  { id: 'severe_bleeding', label: 'Severe Bleeding' },
  { id: 'loss_of_consciousness', label: 'Loss of Consciousness / Fainting' },
];

const RULES: SymptomRule[] = [
  { condition: 'Common Cold', symptoms: ['runny_nose', 'sore_throat', 'cough', 'headache'], severity: 'mild',
    action: 'Likely a common cold. Rest, stay hydrated, and consider OTC cold relief medicine. See a doctor if symptoms last beyond 7 days.' },
  { condition: 'Influenza (Flu)', symptoms: ['fever', 'body_ache', 'fatigue', 'cough', 'headache'], severity: 'moderate',
    action: 'Symptoms are consistent with flu. Rest, fluids, and paracetamol for fever. Consult a doctor if fever exceeds 102°F or persists more than 3 days.' },
  { condition: 'COVID-19 (possible)', symptoms: ['fever', 'cough', 'fatigue', 'loss_of_taste_smell', 'sore_throat'], severity: 'moderate',
    action: 'Symptoms overlap with COVID-19. Consider isolating, taking a rapid test, and consulting a doctor, especially with loss of taste/smell.' },
  { condition: 'Gastroenteritis (Stomach Flu)', symptoms: ['nausea', 'vomiting', 'diarrhea', 'abdominal_pain', 'fever'], severity: 'moderate',
    action: 'Likely a stomach infection. Stay hydrated with ORS, eat light food, and consult a doctor if vomiting/diarrhea persists beyond 2 days or shows blood.' },
  { condition: 'Migraine / Tension Headache', symptoms: ['headache', 'dizziness', 'nausea'], severity: 'mild',
    action: 'Possible migraine or tension headache. Rest in a dark, quiet room, stay hydrated. See a doctor if headache is sudden, severe, or recurring frequently.' },
  { condition: 'Allergic Reaction', symptoms: ['rash', 'eye_redness', 'runny_nose'], severity: 'mild',
    action: 'Possible mild allergic reaction. An antihistamine may help. Seek urgent care if swelling of face/throat or breathing difficulty occurs.' },
  { condition: 'Viral Arthralgia / Joint Infection', symptoms: ['joint_pain', 'fever', 'fatigue'], severity: 'moderate',
    action: 'Possible viral illness affecting joints. Rest and hydration recommended; consult a doctor if swelling or severe pain develops.' },
  { condition: 'Possible Cardiac or Respiratory Emergency', symptoms: ['chest_pain', 'shortness_of_breath'], severity: 'severe',
    action: 'These symptoms can indicate a serious cardiac or respiratory condition. Seek EMERGENCY medical care immediately — do not wait.' },
  { condition: 'Severe Trauma / Medical Emergency', symptoms: ['severe_bleeding', 'loss_of_consciousness'], severity: 'severe',
    action: 'This is a medical emergency. Call an ambulance immediately and apply first aid if trained to do so.' },
];

const CRITICAL_SYMPTOMS = ['chest_pain', 'shortness_of_breath', 'severe_bleeding', 'loss_of_consciousness'];
const THRESHOLD = 0.34;
const SEVERITY_RANK: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 };

export function analyzeSymptoms(symptoms: string[]): SymptomAnalysis {
  const scored: ScoredResult[] = RULES
    .map((rule) => {
      const overlap = rule.symptoms.filter((s) => symptoms.includes(s));
      return { ...rule, score: overlap.length / rule.symptoms.length, matchedSymptoms: overlap };
    })
    .filter((r) => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const hasCritical = symptoms.some((s) => CRITICAL_SYMPTOMS.includes(s));
  let results: ScoredResult[] = scored;
  let overallSeverity: Severity = 'mild';

  if (hasCritical) {
    overallSeverity = 'severe';
    results = RULES.filter((r) => r.severity === 'severe').map((r) => ({
      ...r, score: 1, matchedSymptoms: r.symptoms.filter((s) => symptoms.includes(s)),
    }));
  } else if (scored.length > 0) {
    overallSeverity = scored.reduce<Severity>(
      (worst, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[worst] ? r.severity : worst),
      'mild',
    );
  }

  if (results.length === 0) {
    results = [{
      condition: 'No specific match found', severity: 'mild', score: 0, matchedSymptoms: [], symptoms: [],
      action: 'Your symptoms did not closely match common patterns in our knowledge base. Monitor your condition, and consult a doctor if symptoms worsen or persist.',
    }];
  }

  return {
    results,
    overallSeverity,
    disclaimer: 'This tool provides general guidance only and is NOT a medical diagnosis. Always consult a licensed physician for medical concerns. If this is an emergency, seek immediate medical attention.',
  };
}
