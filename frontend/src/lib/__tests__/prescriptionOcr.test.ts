import { describe, expect, it } from 'vitest';
import {
  dataUrlToFile, matchPrescriptionToCatalog, parsePrescriptionText,
  type CatalogMedicine,
} from '../prescriptionOcr';

const CATALOG: CatalogMedicine[] = [
  {
    medicine_id: 1,
    name: 'Paracetamol 500mg',
    generic_name: 'Paracetamol',
    salt: 'Paracetamol 500mg',
    manufacturer: 'Cipla Ltd',
    prescription_required: false,
    form: 'tablet',
    stock: [{ stock_id: 11, price: 22, mrp: 25, quantity: 40, store_id: 1, store: { store_id: 1, store_name: 'Sharma Medical Store' } }],
  },
  {
    medicine_id: 4,
    name: 'Cetirizine 10mg',
    generic_name: 'Cetirizine',
    salt: 'Cetirizine Hydrochloride 10mg',
    manufacturer: 'Dr Reddy’s',
    prescription_required: false,
    form: 'tablet',
    stock: [
      { stock_id: 20, price: 35, mrp: 40, quantity: 0, store_id: 2, store: { store_id: 2, store_name: 'Wellness Forever' } },
      { stock_id: 21, price: 30, mrp: 40, quantity: 12, store_id: 2, store: { store_id: 2, store_name: 'Wellness Forever' } },
    ],
  },
  {
    medicine_id: 7,
    name: 'Amoxicillin 500mg',
    generic_name: 'Amoxicillin',
    salt: 'Amoxicillin 500mg',
    manufacturer: 'Sun Pharma',
    prescription_required: true,
    form: 'capsule',
    stock: [{ stock_id: 30, price: 88, mrp: 99, quantity: 15, store_id: 1, store: { store_id: 1, store_name: 'Sharma Medical Store' } }],
  },
];

describe('parsePrescriptionText', () => {
  it('extracts medicine, schedule, duration and instruction from a typical Rx line', () => {
    const parsed = parsePrescriptionText(
      'Dr. Priya Nair\nPatient: Rohan\n1. Tab Paracetamol 500mg 1-0-1 x 3 days after food\n2. Cap Amoxicillin 500mg 1-1-1 for 5 days',
    );
    expect(parsed.length).toBe(2);
    expect(parsed[0]?.name).toContain('Paracetamol');
    expect(parsed[0]?.dosage).toBe('1-0-1');
    expect(parsed[0]?.duration).toBe('3 days');
    expect(parsed[0]?.instructions).toBe('after food');
    expect(parsed[1]?.name).toContain('Amoxicillin');
    expect(parsed[1]?.dosage).toBe('1-1-1');
  });

  it('understands OD/BD shorthand and ignores letterheads', () => {
    const parsed = parsePrescriptionText('City Clinic\nReg. No 1234\nCetirizine 10mg OD for 5 days');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toMatch(/Cetirizine/i);
    expect(parsed[0]?.duration).toBe('5 days');
  });

  it('returns no medicine lines for non-prescription prose', () => {
    expect(parsePrescriptionText('Patient is advised rest and lots of fluids. Review after one week.')).toHaveLength(0);
  });
});

describe('matchPrescriptionToCatalog', () => {
  it('matches by brand name and chooses the cheapest in-stock offer', () => {
    const extracted = parsePrescriptionText('Tab Cetirizine 10mg 0-0-1 for 5 days');
    const [match] = matchPrescriptionToCatalog(extracted, CATALOG);
    expect(match?.medicine.medicine_id).toBe(4);
    expect(match?.offer.stock_id).toBe(21);
    expect(match?.offer.price).toBe(30);
  });

  it('matches a generic/salt name to the right product', () => {
    const matches = matchPrescriptionToCatalog(
      [{ name: 'Amoxicillin 500mg', dosage: '1-1-1', duration: '5 days', confidence: 0.7 }],
      CATALOG,
    );
    expect(matches[0]?.medicine.medicine_id).toBe(7);
    expect(matches[0]?.medicine.prescription_required).toBe(true);
  });

  it('skips out-of-stock products rather than adding an unavailable medicine', () => {
    const matches = matchPrescriptionToCatalog(
      [{ name: 'Cetirizine 10mg', confidence: 0.8 }],
      [{ ...CATALOG[1]!, stock: [{ stock_id: 99, price: 30, mrp: 40, quantity: 0 }] }],
    );
    expect(matches).toHaveLength(0);
  });

  it('does not match unrelated medicines', () => {
    const matches = matchPrescriptionToCatalog(
      [{ name: 'Insulin Glargine', confidence: 0.6 }],
      CATALOG,
    );
    expect(matches).toHaveLength(0);
  });

  it('never matches the same catalogue item twice', () => {
    const matches = matchPrescriptionToCatalog(
      [
        { name: 'Paracetamol 500mg', confidence: 0.9 },
        { name: 'Paracetamol', confidence: 0.8 },
      ],
      CATALOG,
    );
    expect(matches.filter((m) => m.medicine.medicine_id === 1)).toHaveLength(1);
  });
});

describe('prescription attachment round-trip', () => {
  it('rebuilds a File from a stored data URL', () => {
    const dataUrl = `data:image/png;base64,${btoa('mediconnect-rx')}`;
    const file = dataUrlToFile({ name: 'rx.png', type: 'image/png', dataUrl, createdAt: new Date().toISOString() });
    expect(file).not.toBeNull();
    expect(file?.name).toBe('rx.png');
    expect(file?.type).toBe('image/png');
    expect(file?.size).toBe('mediconnect-rx'.length);
  });

  it('returns null for a malformed data URL', () => {
    expect(dataUrlToFile({ name: 'rx.png', type: 'image/png', dataUrl: 'not-a-data-url', createdAt: '' })).toBeNull();
  });
});
