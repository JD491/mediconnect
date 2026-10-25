-- FIX: rewritten to be idempotent — re-running this file no longer creates duplicate
-- medicines/emergency contacts. No schema/migration changes; the guard is done in the
-- INSERT itself (`where not exists`) since medicines/emergency_contacts intentionally
-- have no unique constraint on name.
-- ============================================================================
-- MediConnect — Catalog seed (no auth dependency, safe to run any time)
-- Users/stores/doctors/patients are seeded separately via scripts/seed.js
-- because they require Supabase Auth accounts (see README "Seeding data").
-- ============================================================================

insert into public.medicines (name, generic_name, category, manufacturer, prescription_required, description)
select v.name, v.generic_name, v.category, v.manufacturer, v.prescription_required, v.description
from (values
  ('Paracetamol 500mg',    'Paracetamol',            'Pain Relief',  'Cipla',        false, 'Used for fever and mild to moderate pain relief.'),
  ('Crocin Advance',       'Paracetamol',            'Pain Relief',  'GSK',          false, 'Fast-acting fever and pain relief tablet.'),
  ('Azithromycin 500mg',   'Azithromycin',           'Antibiotic',   'Sun Pharma',   true,  'Antibiotic used to treat bacterial infections.'),
  ('Cetirizine 10mg',      'Cetirizine',             'Allergy',      'Dr. Reddy''s', false, 'Antihistamine for allergy relief, runny nose, and itching.'),
  ('Pantoprazole 40mg',    'Pantoprazole',           'Gastro',       'Sun Pharma',   false, 'Reduces stomach acid; used for acidity and ulcers.'),
  ('ORS Electrolyte Powder','Oral Rehydration Salts','Gastro',       'FDC Ltd',      false, 'Rehydration solution for diarrhea and dehydration.'),
  ('Vitamin C 500mg',      'Ascorbic Acid',          'Supplements',  'HealthKart',   false, 'Immunity-boosting daily supplement.'),
  ('Amoxicillin 500mg',    'Amoxicillin',            'Antibiotic',   'Cipla',        true,  'Broad-spectrum antibiotic for bacterial infections.')
) as v(name, generic_name, category, manufacturer, prescription_required, description)
where not exists (select 1 from public.medicines m where m.name = v.name);

insert into public.emergency_contacts (name, type, phone, address, latitude, longitude)
select v.name, v.type, v.phone, v.address, v.latitude, v.longitude
from (values
  ('MediConnect Ambulance Service', 'ambulance',  '108',        'Mumbai City-wide',            19.076, 72.877),
  ('Lilavati Hospital',           'hospital',   '022-26568000','Bandra West, Mumbai',        19.050, 72.830),
  ('Kokilaben Dhirubhai Hospital','hospital',   '022-42696969','Andheri West, Mumbai',       19.130, 72.826),
  ('Mumbai Police Control Room',  'police',     '100',        'Mumbai City-wide',            19.076, 72.877),
  ('Red Cross Blood Bank',        'blood_bank', '022-24193000','Worli, Mumbai',               19.011, 72.817)
) as v(name, type, phone, address, latitude, longitude)
where not exists (select 1 from public.emergency_contacts e where e.name = v.name);
