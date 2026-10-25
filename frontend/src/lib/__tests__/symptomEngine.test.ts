import { describe, it, expect } from 'vitest';
import { analyzeSymptoms } from '../symptomEngine';

describe('analyzeSymptoms', () => {
  it('falls back to a generic message when no symptoms are given', () => {
    const result = analyzeSymptoms([]);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.condition).toBe('No specific match found');
    expect(result.overallSeverity).toBe('mild');
  });

  it('falls back to a generic message when symptoms match no rule above threshold', () => {
    // A single, isolated symptom won't clear the 0.34 overlap threshold for any rule.
    const result = analyzeSymptoms(['dizziness']);
    expect(result.results[0]?.condition).toBe('No specific match found');
  });

  it('matches Common Cold from its characteristic symptoms', () => {
    const result = analyzeSymptoms(['runny_nose', 'sore_throat', 'cough']);
    const conditions = result.results.map((r) => r.condition);
    expect(conditions).toContain('Common Cold');
    // These symptoms also clear the threshold for COVID-19 (possible) at a
    // lower match score (0.4 vs. Common Cold's 0.75). overallSeverity is
    // deliberately the WORST severity among all qualifying matches, not just
    // the top-scored one — so this correctly reports 'moderate', not 'mild'.
    expect(conditions).toContain('COVID-19 (possible)');
    expect(result.overallSeverity).toBe('moderate');
  });

  it('reports matchedSymptoms as the intersection of input and rule symptoms', () => {
    const result = analyzeSymptoms(['runny_nose', 'sore_throat', 'cough']);
    const cold = result.results.find((r) => r.condition === 'Common Cold');
    expect(cold?.matchedSymptoms.sort()).toEqual(['cough', 'runny_nose', 'sore_throat'].sort());
  });

  it('escalates overallSeverity to the worst matched non-critical rule', () => {
    // Flu (moderate) symptoms alongside cold (mild) symptoms — overall should be "moderate", not "mild".
    const result = analyzeSymptoms(['fever', 'body_ache', 'fatigue', 'cough', 'headache']);
    expect(result.overallSeverity).toBe('moderate');
  });

  it('overrides everything to severe when a critical symptom is present, regardless of other matches', () => {
    // chest_pain is a critical symptom; even paired with mild cold symptoms, this must be flagged severe.
    const result = analyzeSymptoms(['chest_pain', 'runny_nose', 'sore_throat']);
    expect(result.overallSeverity).toBe('severe');
    expect(result.results.every((r) => r.severity === 'severe')).toBe(true);
  });

  it('surfaces all severe rules when multiple critical symptoms are present', () => {
    const result = analyzeSymptoms(['chest_pain', 'severe_bleeding']);
    const conditions = result.results.map((r) => r.condition);
    expect(conditions).toContain('Possible Cardiac or Respiratory Emergency');
    expect(conditions).toContain('Severe Trauma / Medical Emergency');
  });

  it('caps results at 3 matches even when more rules clear the threshold', () => {
    // fever/fatigue overlap with flu, covid, and gastroenteritis, and joint infection.
    const result = analyzeSymptoms(['fever', 'fatigue', 'cough', 'body_ache', 'loss_of_taste_smell', 'nausea', 'vomiting', 'diarrhea', 'abdominal_pain', 'joint_pain']);
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('always includes the non-diagnostic disclaimer', () => {
    const result = analyzeSymptoms(['fever']);
    expect(result.disclaimer).toMatch(/not a medical diagnosis/i);
  });
});
