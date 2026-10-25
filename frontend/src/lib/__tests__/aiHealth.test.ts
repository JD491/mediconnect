import { describe, expect, it } from 'vitest';
import {
  extractSymptoms, followUpChoices, getTriage, localChat, localTriage, redFlagOptions,
  specialistLabel, specialistQuery,
} from '../aiHealth';

describe('aiHealth local triage', () => {
  it('always escalates red-flag symptoms to emergency without waiting for a network call', async () => {
    const result = await getTriage({ symptoms: ['chest_pain', 'shortness_of_breath'] }, 'en');
    expect(result.source).toBe('local');
    expect(result.urgency).toBe('emergency');
    expect(result.specialist).toBe('Cardiologist');
    expect(result.reply.length).toBeGreaterThan(20);
  });

  it('escalates any reported red-flag answer to emergency', () => {
    const result = localTriage({ symptoms: ['fever'], redFlags: ['Difficulty breathing'] }, 'en');
    expect(result.urgency).toBe('emergency');
    expect(result.redFlags.length).toBeGreaterThan(0);
  });

  it('maps a flu-like cluster to influenza guidance and a General Physician', () => {
    const result = localTriage({
      symptoms: ['fever', 'cough', 'fatigue', 'body_ache'],
      duration: 'days',
      severity: 'moderate',
    }, 'en');
    expect(result.conditions.join(' ')).toMatch(/Influenza/i);
    expect(result.specialist).toBe('General Physician');
    expect(result.urgency).toBe('routine');
    expect(result.selfCare.length).toBeGreaterThan(0);
  });

  it('returns Hindi and Marathi guidance when requested', () => {
    const hindi = localTriage({ symptoms: ['fever', 'cough', 'fatigue', 'body_ache'] }, 'hi');
    const marathi = localTriage({ symptoms: ['fever', 'cough', 'fatigue', 'body_ache'] }, 'mr');
    expect(hindi.conditions.join(' ')).toMatch(/इन्फ्लुएंजा/);
    expect(marathi.conditions.join(' ')).toMatch(/इन्फ्लुएंजा/);
    expect(hindi.disclaimer).toMatch(/निदान/);
    expect(marathi.disclaimer).toMatch(/निदान/);
  });

  it('treats long-lasting mild symptoms as a routine doctor visit', () => {
    const result = localTriage({ symptoms: ['headache'], duration: 'longer' }, 'en');
    expect(result.urgency).toBe('routine');
  });

  it('escalates moderate symptoms in a child', () => {
    const result = localTriage({ symptoms: ['fever', 'cough', 'fatigue', 'body_ache'], ageGroup: 'child' }, 'en');
    expect(['urgent', 'emergency']).toContain(result.urgency);
  });
});

describe('aiHealth language helpers', () => {
  it('extracts symptoms from free English, Hindi and Marathi text', () => {
    expect(extractSymptoms('fever and sore throat since yesterday')).toEqual(expect.arrayContaining(['fever', 'sore_throat']));
    expect(extractSymptoms('बुखार और सिरदर्द')).toEqual(expect.arrayContaining(['fever', 'headache']));
    expect(extractSymptoms('ताप आणि घसादुखी')).toEqual(expect.arrayContaining(['fever', 'sore_throat']));
  });

  it('falls back to the emergency intent for urgent wording', () => {
    const answer = localChat('I have chest pain and cannot breathe', [], 'en');
    expect(answer.urgency).toBe('emergency');
    expect(answer.actions.join(' ')).toMatch(/emergency/i);
  });

  it('answers a medicine question without prescribing a dose', () => {
    const answer = localChat('Can I take an antibiotic for my cold?', [], 'en');
    expect(answer.reply.toLowerCase()).toContain('doctor');
    expect(answer.urgency).not.toBe('emergency');
  });

  it('provides localized follow-up choices and red-flag options', () => {
    const choices = followUpChoices('hi');
    expect(choices.durations.length).toBe(4);
    expect(choices.severities.map((s) => s.id)).toEqual(['mild', 'moderate', 'severe']);
    expect(redFlagOptions('mr').length).toBe(4);
  });

  it('localizes specialist labels and maps unsupported specialists safely', () => {
    expect(specialistLabel('Cardiologist', 'hi')).toMatch(/हृदय/);
    expect(specialistQuery('Pulmonologist')).toBe('General Physician');
    expect(specialistQuery('Dermatologist')).toBe('Dermatologist');
  });
});
