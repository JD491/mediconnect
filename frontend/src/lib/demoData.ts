/**
 * demoData.ts — the localStorage-backed data store that keeps MediConnect
 * fully usable when the Supabase project has not been migrated/seeded (or is
 * unreachable). It mirrors the public schema closely enough that every page
 * can keep its existing Supabase query code unchanged.
 *
 * The data is real, mutable demo data: carts, orders, prescriptions, vitals,
 * medication tasks and payments all persist between reloads. Reset with
 * `resetDemoDb()` (used by the "Reset demo data" action in the UI).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DemoRow = Record<string, any>;
export type DemoTable = DemoRow[];

export interface DemoDb {
  version: number;
  tables: Record<string, DemoTable>;
  seq: Record<string, number>;
}

export const DEMO_DB_VERSION = 3;
export const DEMO_DB_KEY = 'mediconnect_demo_db_v3';

export const DEMO_PASSWORD = 'MediConnect@123';

export const DEMO_USER_IDS = {
  customer: '11111111-1111-4111-8111-111111111111',
  store_owner: '22222222-2222-4222-8222-222222222222',
  doctor: '33333333-3333-4333-8333-333333333333',
  nurse: '44444444-4444-4444-8444-444444444444',
  admin: '55555555-5555-4555-8555-555555555555',
  customer2: '66666666-6666-4666-8666-666666666666',
  doctor2: '77777777-7777-4777-8777-777777777777',
  doctor3: '88888888-8888-4888-8888-888888888888',
} as const;

export interface DemoAccount {
  email: string;
  password: string;
  role: 'customer' | 'store_owner' | 'doctor' | 'nurse' | 'admin';
  label: string;
  description: string;
  userId: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'customer@mediconnect.app', password: DEMO_PASSWORD, role: 'customer', label: 'Patient', description: 'Order medicines, book doctors, track vitals', userId: DEMO_USER_IDS.customer },
  { email: 'doctor@mediconnect.app', password: DEMO_PASSWORD, role: 'doctor', label: 'Doctor', description: 'Consultations, e-prescriptions, patient EHR', userId: DEMO_USER_IDS.doctor },
  { email: 'owner@mediconnect.app', password: DEMO_PASSWORD, role: 'store_owner', label: 'Pharmacy Owner', description: 'Inventory, orders, offline payments', userId: DEMO_USER_IDS.store_owner },
  { email: 'nurse@mediconnect.app', password: DEMO_PASSWORD, role: 'nurse', label: 'Nurse', description: 'Vitals triage, medication rounds', userId: DEMO_USER_IDS.nurse },
  { email: 'admin@mediconnect.app', password: DEMO_PASSWORD, role: 'admin', label: 'Admin', description: 'Users, approvals, revenue reconciliation', userId: DEMO_USER_IDS.admin },
];

const now = Date.now();
const iso = (hoursAgo = 0) => new Date(now - hoursAgo * 3600_000).toISOString();
const dateOnly = (daysFromNow = 0) => {
  const d = new Date(now + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const future = (days = 7) => new Date(now + days * 86_400_000).toISOString().slice(0, 10);

const demoProfiles: DemoRow[] = [
  {
    id: DEMO_USER_IDS.customer, name: 'Aman Verma', email: 'customer@mediconnect.app', phone: '9988776655',
    role: 'customer', status: 'active', address: '221B, Hiranandani Gardens, Powai, Mumbai', created_at: iso(24 * 40),
    avatar_url: null, date_of_birth: '1993-04-18', gender: 'Male', blood_group: 'B+', allergies: ['Penicillin'],
  },
  {
    id: DEMO_USER_IDS.store_owner, name: 'Rajesh Sharma', email: 'owner@mediconnect.app', phone: '9876543210',
    role: 'store_owner', status: 'active', address: 'Shop 4, Shivaji Chowk, Kalyan West, Thane', created_at: iso(24 * 80),
    avatar_url: null, date_of_birth: '1980-09-02', gender: 'Male', blood_group: 'O+', allergies: [],
  },
  {
    id: DEMO_USER_IDS.doctor, name: 'Dr. Priya Nair', email: 'doctor@mediconnect.app', phone: '9123456780',
    role: 'doctor', status: 'active', address: 'Clinic 4, Sector 12, Thane West', created_at: iso(24 * 70),
    avatar_url: null, date_of_birth: '1984-01-25', gender: 'Female', blood_group: 'A+', allergies: [],
  },
  {
    id: DEMO_USER_IDS.nurse, name: 'Anjali Desai', email: 'nurse@mediconnect.app', phone: '9812345670',
    role: 'nurse', status: 'active', address: 'Ward 3, MediConnect City Hospital, Thane', created_at: iso(24 * 60),
    avatar_url: null, date_of_birth: '1990-11-11', gender: 'Female', blood_group: 'AB+', allergies: [],
  },
  {
    id: DEMO_USER_IDS.admin, name: 'Admin User', email: 'admin@mediconnect.app', phone: '9999999999',
    role: 'admin', status: 'active', address: 'MediConnect HQ, Mumbai', created_at: iso(24 * 90),
    avatar_url: null, date_of_birth: '1986-06-06', gender: 'Other', blood_group: 'B-', allergies: [],
  },
  {
    id: DEMO_USER_IDS.customer2, name: 'Priya Menon', email: 'priya@example.com', phone: '9765432109',
    role: 'customer', status: 'active', address: '12 Lake Road, Thane West', created_at: iso(24 * 20),
    avatar_url: null, date_of_birth: '1997-02-14', gender: 'Female', blood_group: 'O-', allergies: ['Sulfa drugs'],
  },
  {
    id: DEMO_USER_IDS.doctor2, name: 'Dr. Arjun Mehta', email: 'arjun.mehta@mediconnect.app', phone: '9000011122',
    role: 'doctor', status: 'active', address: 'Cardiology OPD, Thane', created_at: iso(24 * 50),
    avatar_url: null, date_of_birth: '1978-08-19', gender: 'Male', blood_group: 'A-', allergies: [],
  },
  {
    id: DEMO_USER_IDS.doctor3, name: 'Dr. Sneha Kulkarni', email: 'sneha.kulkarni@mediconnect.app', phone: '9000033344',
    role: 'doctor', status: 'active', address: 'Skin & Care Clinic, Mumbai', created_at: iso(24 * 45),
    avatar_url: null, date_of_birth: '1989-12-03', gender: 'Female', blood_group: 'B+', allergies: [],
  },
];

const demoStores: DemoRow[] = [
  {
    store_id: 1, owner_id: DEMO_USER_IDS.store_owner, store_name: 'Sharma Medical Store', approval_status: 'approved', rating: 4.6,
    license_number: 'MH-THN-2024-001', store_owner_name: 'Rajesh Sharma', logo_url: null, phone: '9876543210',
    email: 'owner@mediconnect.app', address: 'Shop 4, Shivaji Chowk, Kalyan West', city: 'Kalyan', pincode: '421301',
    description: 'Family-run pharmacy serving Kalyan since 1998. Cold-chain storage and 24x7 emergency counter.',
    opening_time: '08:00', closing_time: '23:00', weekly_holidays: [], delivery_radius_km: 8, min_order_amount: 99,
    is_open: true, created_at: iso(24 * 80), latitude: 19.2437, longitude: 73.1355,
  },
  {
    store_id: 2, owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', store_name: 'Wellness Forever', approval_status: 'approved', rating: 4.4,
    license_number: 'MH-THN-2023-118', store_owner_name: 'Neha Kapoor', logo_url: null, phone: '9820011223',
    email: 'thane@wellnessforever.example', address: 'Ground Floor, Viviana Mall, Thane West', city: 'Thane', pincode: '400601',
    description: 'Large-format wellness pharmacy with express 90-minute delivery across Thane.',
    opening_time: '09:00', closing_time: '22:30', weekly_holidays: [], delivery_radius_km: 10, min_order_amount: 149,
    is_open: true, created_at: iso(24 * 65), latitude: 19.2183, longitude: 72.9781,
  },
  {
    store_id: 3, owner_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', store_name: 'MedPlus Pharmacy', approval_status: 'approved', rating: 4.3,
    license_number: 'MH-MUM-2022-540', store_owner_name: 'Imran Shaikh', logo_url: null, phone: '9820334455',
    email: 'mumbai@medplus.example', address: '14, Linking Road, Bandra West', city: 'Mumbai', pincode: '400050',
    description: 'Neighbourhood pharmacy with genuine-stock guarantee and same-day Mumbai delivery.',
    opening_time: '08:30', closing_time: '23:30', weekly_holidays: [], delivery_radius_km: 12, min_order_amount: 199,
    is_open: true, created_at: iso(24 * 55), latitude: 19.0760, longitude: 72.8777,
  },
  {
    store_id: 4, owner_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', store_name: 'Apollo Pharmacy — Baner', approval_status: 'approved', rating: 4.7,
    license_number: 'MH-PUN-2021-771', store_owner_name: 'Sandeep Patil', logo_url: null, phone: '9822007788',
    email: 'pune@apollo.example', address: 'Baner Road, Near Balewadi Stadium', city: 'Pune', pincode: '411045',
    description: 'Apollo Pharmacy outlet with 24x7 pharmacist helpline and home delivery.',
    opening_time: '00:00', closing_time: '23:59', weekly_holidays: [], delivery_radius_km: 7, min_order_amount: 0,
    is_open: true, created_at: iso(24 * 40), latitude: 18.5204, longitude: 73.8567,
  },
];

interface MedicineSeed {
  name: string;
  generic: string;
  brand: string;
  category: string;
  manufacturer: string;
  form: string;
  dosage: string;
  pack: string;
  rx: boolean;
  salt: string;
  gst: number;
  price: number;
  mrp: number;
  stores: number[];
  description: string;
}

const MEDICINE_SEEDS: MedicineSeed[] = [
  { name: 'Paracetamol 500mg', generic: 'Paracetamol', brand: 'Cipla', category: 'Pain Relief', manufacturer: 'Cipla Ltd', form: 'tablet', dosage: '500mg', pack: '15 tablets', rx: false, salt: 'Paracetamol 500mg', gst: 5, price: 22, mrp: 25, stores: [1, 2, 3, 4], description: 'Fever and mild-to-moderate pain relief. Gentle on the stomach at recommended doses.' },
  { name: 'Crocin Advance 500mg', generic: 'Paracetamol', brand: 'GSK', category: 'Cold & Fever', manufacturer: 'GlaxoSmithKline', form: 'tablet', dosage: '500mg', pack: '15 tablets', rx: false, salt: 'Paracetamol 500mg', gst: 5, price: 27, mrp: 30, stores: [1, 2, 4], description: 'Fast-acting paracetamol tablet for headache, body ache and fever.' },
  { name: 'Azithromycin 500mg', generic: 'Azithromycin', brand: 'Azithral', category: 'Antibiotic', manufacturer: 'Alembic Pharma', form: 'tablet', dosage: '500mg', pack: '3 tablets', rx: true, salt: 'Azithromycin 500mg', gst: 12, price: 105, mrp: 120, stores: [1, 3, 4], description: 'Macrolide antibiotic for respiratory and skin bacterial infections. Complete the full course.' },
  { name: 'Cetirizine 10mg', generic: 'Cetirizine', brand: 'Cetzine', category: 'Allergy', manufacturer: "Dr. Reddy's Labs", form: 'tablet', dosage: '10mg', pack: '10 tablets', rx: false, salt: 'Cetirizine Hydrochloride 10mg', gst: 5, price: 30, mrp: 35, stores: [1, 2, 3, 4], description: 'Antihistamine for sneezing, runny nose, itching and allergic rhinitis.' },
  { name: 'Pantoprazole 40mg', generic: 'Pantoprazole', brand: 'Pan 40', category: 'Gastro', manufacturer: 'Alkem Labs', form: 'tablet', dosage: '40mg', pack: '15 tablets', rx: false, salt: 'Pantoprazole Sodium 40mg', gst: 12, price: 84, mrp: 95, stores: [1, 2, 3], description: 'Proton-pump inhibitor for acidity, reflux and gastric ulcers.' },
  { name: 'ORS Electrolyte Powder', generic: 'Oral Rehydration Salts', brand: 'Electral', category: 'Gastro', manufacturer: 'FDC Ltd', form: 'powder', dosage: '21.8g', pack: '1 sachet', rx: false, salt: 'Sodium chloride, potassium chloride, sodium citrate, dextrose', gst: 5, price: 20, mrp: 22, stores: [1, 2, 3, 4], description: 'WHO-formula rehydration solution for dehydration caused by diarrhoea or vomiting.' },
  { name: 'Vitamin C 500mg', generic: 'Ascorbic Acid', brand: 'Limcee', category: 'Vitamins', manufacturer: 'Abbott India', form: 'tablet', dosage: '500mg', pack: '60 tablets', rx: false, salt: 'Ascorbic Acid 500mg', gst: 12, price: 155, mrp: 180, stores: [1, 2, 4], description: 'Chewable vitamin C for immunity, skin health and iron absorption.' },
  { name: 'Amoxicillin 500mg', generic: 'Amoxicillin', brand: 'Mox', category: 'Antibiotic', manufacturer: 'Cipla Ltd', form: 'capsule', dosage: '500mg', pack: '10 capsules', rx: true, salt: 'Amoxicillin Trihydrate 500mg', gst: 12, price: 76, mrp: 85, stores: [1, 3], description: 'Broad-spectrum penicillin antibiotic. Not suitable for penicillin-allergic patients.' },
  { name: 'Metformin 500mg', generic: 'Metformin', brand: 'Glycomet', category: 'Diabetes Care', manufacturer: 'USV Pvt Ltd', form: 'tablet', dosage: '500mg', pack: '20 tablets', rx: true, salt: 'Metformin Hydrochloride 500mg', gst: 5, price: 40, mrp: 45, stores: [1, 2, 4], description: 'First-line oral anti-diabetic that improves insulin sensitivity and lowers blood sugar.' },
  { name: 'Atorvastatin 10mg', generic: 'Atorvastatin', brand: 'Atorva', category: 'Heart Care', manufacturer: 'Zydus Cadila', form: 'tablet', dosage: '10mg', pack: '15 tablets', rx: true, salt: 'Atorvastatin Calcium 10mg', gst: 12, price: 96, mrp: 110, stores: [2, 3, 4], description: 'Statin for cholesterol management and cardiovascular risk reduction.' },
  { name: 'Telmisartan 40mg', generic: 'Telmisartan', brand: 'Telma', category: 'Heart Care', manufacturer: 'Glenmark', form: 'tablet', dosage: '40mg', pack: '15 tablets', rx: true, salt: 'Telmisartan 40mg', gst: 12, price: 80, mrp: 90, stores: [1, 3, 4], description: 'Angiotensin receptor blocker for hypertension. Take at the same time each day.' },
  { name: 'Montelukast 10mg', generic: 'Montelukast', brand: 'Montair', category: 'Respiratory', manufacturer: 'Cipla Ltd', form: 'tablet', dosage: '10mg', pack: '10 tablets', rx: true, salt: 'Montelukast Sodium 10mg', gst: 12, price: 132, mrp: 150, stores: [2, 3], description: 'Leukotriene modifier for asthma maintenance and allergic rhinitis.' },
  { name: 'Levothyroxine 50mcg', generic: 'Levothyroxine', brand: 'Thyronorm', category: 'Hormone', manufacturer: 'Abbott India', form: 'tablet', dosage: '50mcg', pack: '30 tablets', rx: true, salt: 'Levothyroxine Sodium 50mcg', gst: 5, price: 112, mrp: 125, stores: [1, 2, 3, 4], description: 'Thyroid hormone replacement for hypothyroidism. Take on an empty stomach.' },
  { name: 'Omeprazole 20mg', generic: 'Omeprazole', brand: 'Omez', category: 'Gastro', manufacturer: "Dr. Reddy's Labs", form: 'capsule', dosage: '20mg', pack: '15 capsules', rx: false, salt: 'Omeprazole 20mg', gst: 12, price: 62, mrp: 70, stores: [1, 2, 4], description: 'Acid-suppressant capsule for heartburn, reflux and gastritis.' },
  { name: 'Ibuprofen 400mg', generic: 'Ibuprofen', brand: 'Brufen', category: 'Pain Relief', manufacturer: 'Abbott India', form: 'tablet', dosage: '400mg', pack: '15 tablets', rx: false, salt: 'Ibuprofen 400mg', gst: 12, price: 35, mrp: 40, stores: [1, 2, 3, 4], description: 'NSAID for pain, inflammation and fever. Take after food.' },
  { name: 'Cetirizine Syrup 60ml', generic: 'Cetirizine', brand: 'Cetzine', category: 'Allergy', manufacturer: "Dr. Reddy's Labs", form: 'syrup', dosage: '5mg/5ml', pack: '60 ml', rx: false, salt: 'Cetirizine Hydrochloride 5mg/5ml', gst: 12, price: 75, mrp: 85, stores: [1, 2, 3], description: 'Kid-friendly antihistamine syrup for allergic rhinitis and hives.' },
  { name: 'Cough Relief Syrup 100ml', generic: 'Dextromethorphan', brand: 'Cofsils', category: 'Cold & Fever', manufacturer: 'Mankind Pharma', form: 'syrup', dosage: '10mg/5ml', pack: '100 ml', rx: false, salt: 'Dextromethorphan Hydrobromide 10mg/5ml', gst: 12, price: 98, mrp: 110, stores: [1, 2, 4], description: 'Non-drowsy dry-cough suppressant with a soothing honey base.' },
  { name: 'Salbutamol Inhaler 100mcg', generic: 'Salbutamol', brand: 'Asthalin', category: 'Respiratory', manufacturer: 'Cipla Ltd', form: 'inhaler', dosage: '100mcg/dose', pack: '200 doses', rx: true, salt: 'Salbutamol Sulphate 100mcg', gst: 12, price: 160, mrp: 180, stores: [2, 3, 4], description: 'Rescue inhaler for asthma and COPD. Two puffs as directed during wheeze.' },
  { name: 'Diclofenac Gel 30g', generic: 'Diclofenac', brand: 'Volini', category: 'Pain Relief', manufacturer: 'Sun Pharma', form: 'gel', dosage: '1% w/w', pack: '30 g', rx: false, salt: 'Diclofenac Diethylamine 1% w/w', gst: 12, price: 124, mrp: 140, stores: [1, 2, 3], description: 'Topical anti-inflammatory gel for joint, muscle and back pain.' },
  { name: 'Betadine Ointment 20g', generic: 'Povidone Iodine', brand: 'Betadine', category: 'First Aid', manufacturer: 'Win-Medicare', form: 'cream', dosage: '5% w/w', pack: '20 g', rx: false, salt: 'Povidone Iodine 5% w/w', gst: 12, price: 85, mrp: 95, stores: [1, 3, 4], description: 'Antiseptic ointment for minor cuts, grazes and wound infection prevention.' },
  { name: 'Digital Thermometer', generic: 'Digital Thermometer', brand: 'Omron', category: 'Devices', manufacturer: 'Omron Healthcare', form: 'device', dosage: '—', pack: '1 unit', rx: false, salt: '—', gst: 12, price: 299, mrp: 350, stores: [1, 2, 4], description: 'Fast-read flexible-tip digital thermometer with fever alarm and memory recall.' },
  { name: 'Glucose Test Strips (25)', generic: 'Blood Glucose Strips', brand: 'Accu-Chek', category: 'Diabetes Care', manufacturer: 'Roche Diabetes Care', form: 'strips', dosage: '—', pack: '25 strips', rx: false, salt: '—', gst: 12, price: 749, mrp: 850, stores: [2, 3, 4], description: 'Accu-Chek Active compatible glucose strips for home blood-sugar monitoring.' },
  { name: 'Multivitamin Tablets', generic: 'Multivitamin', brand: 'Revital H', category: 'Vitamins', manufacturer: 'Sun Pharma', form: 'tablet', dosage: '—', pack: '30 tablets', rx: false, salt: 'Vitamins A, B-complex, C, D, E + minerals', gst: 12, price: 279, mrp: 320, stores: [1, 2, 3, 4], description: 'Daily multivitamin with ginseng and minerals for energy and immunity.' },
  { name: 'Iron + Folic Acid', generic: 'Ferrous Fumarate', brand: 'Autrin', category: 'Vitamins', manufacturer: 'FDC Ltd', form: 'tablet', dosage: '100mg', pack: '30 tablets', rx: false, salt: 'Ferrous Fumarate 100mg + Folic Acid 1.5mg', gst: 5, price: 58, mrp: 65, stores: [1, 2, 3, 4], description: 'Iron and folic-acid supplement for anaemia prevention in pregnancy.' },
];

function buildCatalog() {
  const medicines: DemoRow[] = [];
  const stock: DemoRow[] = [];
  let stockId = 1;
  MEDICINE_SEEDS.forEach((m, idx) => {
    const medicineId = idx + 1;
    medicines.push({
      medicine_id: medicineId, name: m.name, generic_name: m.generic, brand: m.brand, category: m.category,
      manufacturer: m.manufacturer, description: m.description, image_url: null, prescription_required: m.rx,
      dosage: m.dosage, form: m.form, pack_size: m.pack, created_by: DEMO_USER_IDS.admin, is_active: true,
      created_at: iso(24 * 30), salt_composition: m.salt, gst_rate: m.gst,
    });
    m.stores.forEach((storeId, i) => {
      const variance = [0, 2, -1, 3][i % 4] ?? 0;
      const price = Math.max(1, m.price + variance);
      stock.push({
        stock_id: stockId++, store_id: storeId, medicine_id: medicineId, price, mrp: m.mrp,
        quantity: [42, 18, 76, 9, 0, 25][(medicineId + storeId) % 6] ?? 30,
        discount_percent: Math.max(0, Math.round(((m.mrp - price) / m.mrp) * 100)),
        min_stock_level: 10, batch_number: `B${medicineId}${storeId}${String(new Date().getFullYear()).slice(2)}`,
        manufacturing_date: dateOnly(-300), expiry_date: dateOnly(420 + idx * 5), sku: `SKU-${1000 + medicineId}-${storeId}`,
        barcode: `890${String(medicineId).padStart(6, '0')}${storeId}`, is_active: true, updated_at: iso(6),
      });
    });
  });
  return { medicines, stock };
}

const catalog = buildCatalog();

const demoDoctors: DemoRow[] = [
  {
    doctor_id: 1, user_id: DEMO_USER_IDS.doctor, specialization: 'General Physician', qualification: 'MBBS, MD (Internal Medicine)',
    registration_number: 'MCI-2015-4521', experience_years: 9, consultation_fee: 500, approval_status: 'approved', rating: 4.7,
    hospital_clinic: 'MediConnect City Hospital, Thane', bio: 'Internal-medicine specialist focused on diabetes, hypertension and preventive care. Consults in English, Hindi and Marathi.',
    profile_image_url: null, online_consultation: true, languages: ['English', 'Hindi', 'Marathi'],
  },
  {
    doctor_id: 2, user_id: DEMO_USER_IDS.doctor2, specialization: 'Cardiologist', qualification: 'MBBS, DM (Cardiology)',
    registration_number: 'MCI-2008-1190', experience_years: 16, consultation_fee: 900, approval_status: 'approved', rating: 4.8,
    hospital_clinic: 'MediConnect Heart Centre, Mumbai', bio: 'Interventional cardiologist. Special interest in heart-failure management and preventive cardiology.',
    profile_image_url: null, online_consultation: true, languages: ['English', 'Hindi', 'Gujarati'],
  },
  {
    doctor_id: 3, user_id: DEMO_USER_IDS.doctor3, specialization: 'Dermatologist', qualification: 'MBBS, MD (Dermatology)',
    registration_number: 'MCI-2013-7781', experience_years: 11, consultation_fee: 650, approval_status: 'approved', rating: 4.6,
    hospital_clinic: 'Skin & Care Clinic, Bandra', bio: 'Treats acne, eczema, hair loss and pigmentation with evidence-based dermatology.',
    profile_image_url: null, online_consultation: false, languages: ['English', 'Hindi', 'Marathi'],
  },
];

const demoAvailability: DemoRow[] = [];
let slotId = 1;
for (const doctorId of [1, 2, 3]) {
  const days = doctorId === 1 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Wed', 'Fri'];
  for (const d of days) {
    demoAvailability.push({
      slot_id: slotId++, doctor_id: doctorId, day_of_week: d,
      start_time: doctorId === 2 ? '15:00' : '10:00', end_time: doctorId === 2 ? '18:00' : '13:00',
      slot_duration_minutes: 15,
    });
  }
}

const demoPatients: DemoRow[] = [
  {
    patient_id: 1, profile_id: null, name: 'Ramesh Iyer', age: 67, gender: 'Male', primary_nurse_id: DEMO_USER_IDS.nurse,
    primary_doctor_id: 1, room_number: '204-A', status: 'monitoring', admitted_at: iso(72), discharged_at: null,
    blood_group: 'B+', allergies: ['Penicillin', 'Dust'], phone: '9930011223',
  },
  {
    patient_id: 2, profile_id: null, name: 'Sunita Rao', age: 54, gender: 'Female', primary_nurse_id: DEMO_USER_IDS.nurse,
    primary_doctor_id: 1, room_number: '210-B', status: 'stable', admitted_at: iso(48), discharged_at: null,
    blood_group: 'O+', allergies: ['Iodine'], phone: '9930044556',
  },
  {
    patient_id: 3, profile_id: null, name: 'Vikram Shah', age: 45, gender: 'Male', primary_nurse_id: DEMO_USER_IDS.nurse,
    primary_doctor_id: 1, room_number: '112-A', status: 'critical', admitted_at: iso(20), discharged_at: null,
    blood_group: 'A-', allergies: [], phone: '9930077889',
  },
  {
    patient_id: 4, profile_id: DEMO_USER_IDS.customer2, name: 'Priya Menon', age: 29, gender: 'Female', primary_nurse_id: null,
    primary_doctor_id: 1, room_number: null, status: 'stable', admitted_at: iso(6), discharged_at: null,
    blood_group: 'O-', allergies: ['Sulfa drugs'], phone: '9765432109',
  },
];

const demoVitals: DemoRow[] = [];
let vitalId = 1;
const vitalProfiles = [
  { pid: 1, hr: 88, sys: 148, dia: 94, temp: 99.1, spo2: 95, rr: 20, glucose: 164, weight: 78 },
  { pid: 2, hr: 74, sys: 122, dia: 80, temp: 98.4, spo2: 98, rr: 16, glucose: 104, weight: 64 },
  { pid: 3, hr: 112, sys: 162, dia: 102, temp: 101.4, spo2: 91, rr: 24, glucose: 188, weight: 84 },
];
for (const p of vitalProfiles) {
  for (let i = 5; i >= 0; i--) {
    demoVitals.push({
      vital_id: vitalId++, patient_id: p.pid, recorded_by: DEMO_USER_IDS.nurse,
      temperature: Number((p.temp + (i % 3) * 0.2).toFixed(1)),
      bp_systolic: p.sys + (i % 3) * 2, bp_diastolic: p.dia + (i % 2) * 2,
      heart_rate: p.hr + (i % 4) * 3, spo2: Math.min(100, p.spo2 + (i % 2)),
      respiratory_rate: p.rr, glucose: p.glucose + i, weight_kg: p.weight,
      pain_score: p.pid === 3 ? 7 : 2,
      recorded_at: iso(i * 6),
    });
  }
}

const demoTasks: DemoRow[] = [
  {
    task_id: 1, patient_id: 1, assigned_to: DEMO_USER_IDS.nurse, created_by: DEMO_USER_IDS.doctor,
    title: 'Administer morning medication', description: 'Metformin 500mg with breakfast', status: 'pending',
    priority: 'high', due_at: iso(-1), created_at: iso(8), task_type: 'medication', medication_name: 'Metformin 500mg',
    dosage: '1 tablet', scheduled_at: iso(-1), administered_at: null, escalated_reason: null,
    fee_amount: null, fee_verified: true, fee_ref: null,
  },
  {
    task_id: 2, patient_id: 1, assigned_to: DEMO_USER_IDS.nurse, created_by: DEMO_USER_IDS.doctor,
    title: 'Evening BP check', description: 'Record BP and notify if systolic > 150', status: 'pending',
    priority: 'medium', due_at: iso(-3), created_at: iso(10), task_type: 'observation', medication_name: null,
    dosage: null, scheduled_at: iso(-3), administered_at: null, escalated_reason: null,
    fee_amount: null, fee_verified: true, fee_ref: null,
  },
  {
    task_id: 3, patient_id: 3, assigned_to: DEMO_USER_IDS.nurse, created_by: DEMO_USER_IDS.doctor,
    title: 'Urgent: notify doctor of BP spike', description: 'Systolic 162, SpO2 91% — escalate immediately', status: 'pending',
    priority: 'urgent', due_at: iso(0), created_at: iso(3), task_type: 'observation', medication_name: null,
    dosage: null, scheduled_at: iso(0), administered_at: null, escalated_reason: null,
    fee_amount: null, fee_verified: true, fee_ref: null,
  },
  {
    task_id: 4, patient_id: 2, assigned_to: DEMO_USER_IDS.nurse, created_by: DEMO_USER_IDS.doctor,
    title: 'Administer IV antibiotic', description: 'Ceftriaxone 1g IV over 30 minutes', status: 'done',
    priority: 'high', due_at: iso(6), created_at: iso(14), task_type: 'medication', medication_name: 'Ceftriaxone 1g',
    dosage: '1 vial IV', scheduled_at: iso(6), administered_at: iso(5), escalated_reason: null,
    fee_amount: null, fee_verified: true, fee_ref: null,
  },
  {
    task_id: 5, patient_id: 4, assigned_to: DEMO_USER_IDS.nurse, created_by: DEMO_USER_IDS.doctor,
    title: 'Walk-in dressing change', description: 'Post-op wound dressing, verify ₹250 offline fee', status: 'in_progress',
    priority: 'medium', due_at: iso(-2), created_at: iso(4), task_type: 'walk_in', medication_name: 'Betadine + sterile gauze',
    dosage: 'Topical', scheduled_at: iso(-2), administered_at: null, escalated_reason: null,
    fee_amount: 250, fee_verified: false, fee_ref: null,
  },
  {
    task_id: 6, patient_id: 1, assigned_to: DEMO_USER_IDS.nurse, created_by: DEMO_USER_IDS.doctor,
    title: 'Escalated: fall risk reassessment', description: 'Patient reported dizziness after evening dose', status: 'pending',
    priority: 'urgent', due_at: iso(-1), created_at: iso(2), task_type: 'observation', medication_name: null,
    dosage: null, scheduled_at: iso(-1), administered_at: null, escalated_reason: 'Dizziness and one near-fall — doctor informed.',
    fee_amount: null, fee_verified: true, fee_ref: null,
  },
];

const demoNotes: DemoRow[] = [
  { note_id: 1, patient_id: 1, created_by: DEMO_USER_IDS.nurse, content: 'Patient resting comfortably, appetite improving. Morning sugars 164 mg/dL.', created_at: iso(5) },
  { note_id: 2, patient_id: 3, created_by: DEMO_USER_IDS.nurse, content: 'BP trending up (162/102), SpO2 91%. Doctor notified, oxygen started at 2L/min.', created_at: iso(3) },
  { note_id: 3, patient_id: 2, created_by: DEMO_USER_IDS.doctor, content: 'IV antibiotic day 2. Continue current regimen; review CBC tomorrow.', created_at: iso(7) },
  { note_id: 4, patient_id: 4, created_by: DEMO_USER_IDS.nurse, content: 'Walk-in dressing changed. No signs of infection. Fee pending verification.', created_at: iso(4) },
];

const demoOrders: DemoRow[] = [
  {
    order_id: 1001, user_id: DEMO_USER_IDS.customer, store_id: 1, delivery_address: '221B, Hiranandani Gardens, Powai, Mumbai - 400076',
    payment_method: 'online', payment_status: 'paid', delivery_fee: 25, discount_amount: 30, coupon_code: 'FIRST10',
    total_amount: 289, status: 'delivered', customer_name: 'Aman Verma', customer_phone: '9988776655',
    cancellation_reason: null, razorpay_order_id: 'order_demo_1001', razorpay_payment_id: 'pay_demo_1001',
    payment_verified: true, created_at: iso(30), pickup_token: null, offline_collection_ref: null,
    payment_ref: 'pay_MC_9F2A1001', payment_failure_reason: null, delivery_distance_km: 2.4,
    delivery_partner_name: 'Ravi Kumar', delivery_partner_phone: '9001122334', delivery_partner_lat: 19.2412,
    delivery_partner_lng: 73.1321, self_pickup: false,
  },
  {
    order_id: 1002, user_id: DEMO_USER_IDS.customer, store_id: 2, delivery_address: '221B, Hiranandani Gardens, Powai, Mumbai - 400076',
    payment_method: 'cod', payment_status: 'cod_collected', delivery_fee: 45, discount_amount: 0, coupon_code: null,
    total_amount: 297, status: 'delivered', customer_name: 'Aman Verma', customer_phone: '9988776655',
    cancellation_reason: null, razorpay_order_id: null, razorpay_payment_id: null,
    payment_verified: false, created_at: iso(96), pickup_token: null, offline_collection_ref: 'CASH-2211',
    payment_ref: null, payment_failure_reason: null, delivery_distance_km: 8.6,
    delivery_partner_name: 'Suresh Patil', delivery_partner_phone: '9005566778', delivery_partner_lat: 19.2201,
    delivery_partner_lng: 72.9801, self_pickup: false,
  },
  {
    order_id: 1003, user_id: DEMO_USER_IDS.customer, store_id: 1, delivery_address: '221B, Hiranandani Gardens, Powai, Mumbai - 400076',
    payment_method: 'self_pickup', payment_status: 'paid', delivery_fee: 0, discount_amount: 0, coupon_code: null,
    total_amount: 112, status: 'ready_for_dispatch', customer_name: 'Aman Verma', customer_phone: '9988776655',
    cancellation_reason: null, razorpay_order_id: null, razorpay_payment_id: null,
    payment_verified: true, created_at: iso(5), pickup_token: 'MC-4821', offline_collection_ref: null,
    payment_ref: 'pay_MC_PICK4821', payment_failure_reason: null, delivery_distance_km: null,
    delivery_partner_name: null, delivery_partner_phone: null, delivery_partner_lat: null,
    delivery_partner_lng: null, self_pickup: true,
  },
  {
    order_id: 1004, user_id: DEMO_USER_IDS.customer2, store_id: 3, delivery_address: '12 Lake Road, Thane West - 400601',
    payment_method: 'online', payment_status: 'paid', delivery_fee: 0, discount_amount: 0, coupon_code: null,
    total_amount: 749, status: 'out_for_delivery', customer_name: 'Priya Menon', customer_phone: '9765432109',
    cancellation_reason: null, razorpay_order_id: 'order_demo_1004', razorpay_payment_id: 'pay_demo_1004',
    payment_verified: true, created_at: iso(2), pickup_token: null, offline_collection_ref: null,
    payment_ref: 'pay_MC_7C1D1004', payment_failure_reason: null, delivery_distance_km: 6.2,
    delivery_partner_name: 'Imran Qureshi', delivery_partner_phone: '9007788990', delivery_partner_lat: 19.1205,
    delivery_partner_lng: 72.8902, self_pickup: false,
  },
  {
    order_id: 1005, user_id: DEMO_USER_IDS.customer, store_id: 1, delivery_address: '221B, Hiranandani Gardens, Powai, Mumbai - 400076',
    payment_method: 'online', payment_status: 'failed', delivery_fee: 25, discount_amount: 0, coupon_code: null,
    total_amount: 139, status: 'pending', customer_name: 'Aman Verma', customer_phone: '9988776655',
    cancellation_reason: null, razorpay_order_id: 'order_demo_1005', razorpay_payment_id: null,
    payment_verified: false, created_at: iso(1), pickup_token: null, offline_collection_ref: null,
    payment_ref: null, payment_failure_reason: 'UPI collect request timed out at the bank.',
    delivery_distance_km: 2.4, delivery_partner_name: null, delivery_partner_phone: null,
    delivery_partner_lat: null, delivery_partner_lng: null, self_pickup: false,
  },
];

const demoOrderItems: DemoRow[] = [
  { order_item_id: 1, order_id: 1001, medicine_id: 1, stock_id: 1, quantity: 2, price: 22 },
  { order_item_id: 2, order_id: 1001, medicine_id: 4, stock_id: 4, quantity: 1, price: 30 },
  { order_item_id: 3, order_id: 1001, medicine_id: 5, stock_id: 5, quantity: 1, price: 84 },
  { order_item_id: 4, order_id: 1002, medicine_id: 6, stock_id: 7, quantity: 2, price: 20 },
  { order_item_id: 5, order_id: 1002, medicine_id: 7, stock_id: 9, quantity: 1, price: 155 },
  { order_item_id: 6, order_id: 1002, medicine_id: 15, stock_id: 31, quantity: 2, price: 35 },
  { order_item_id: 7, order_id: 1003, medicine_id: 13, stock_id: 25, quantity: 1, price: 112 },
  { order_item_id: 8, order_id: 1004, medicine_id: 22, stock_id: 51, quantity: 1, price: 749 },
  { order_item_id: 9, order_id: 1005, medicine_id: 12, stock_id: 23, quantity: 1, price: 132 },
];

const demoPrescriptions: DemoRow[] = [
  {
    prescription_id: 1, order_id: 1001, customer_id: DEMO_USER_IDS.customer, store_id: 1,
    file_path: 'demo/rx-aman-1001.pdf', status: 'approved', rejection_reason: null,
    reviewed_by: DEMO_USER_IDS.doctor, reviewed_at: iso(29), superseded: false, created_at: iso(30),
    diagnosis: 'Acute viral pharyngitis with mild fever', notes: 'Warm saline gargles, hydration, rest for 3 days.',
    prescribed_by: DEMO_USER_IDS.doctor, follow_up_date: future(7), items: [
      { medicine: 'Paracetamol 500mg', dosage: '1-0-1', duration: '3 days', instructions: 'After food' },
      { medicine: 'Cetirizine 10mg', dosage: '0-0-1', duration: '5 days', instructions: 'At bedtime' },
    ],
  },
  {
    prescription_id: 2, order_id: null, customer_id: DEMO_USER_IDS.customer2, store_id: 3,
    file_path: 'demo/rx-priya-consult.pdf', status: 'pending', rejection_reason: null,
    reviewed_by: null, reviewed_at: null, superseded: false, created_at: iso(4),
    diagnosis: 'Type 2 diabetes — medication review', notes: 'Continue metformin, repeat HbA1c in 3 months.',
    prescribed_by: DEMO_USER_IDS.doctor, follow_up_date: future(21), items: [
      { medicine: 'Metformin 500mg', dosage: '1-0-1', duration: '30 days', instructions: 'After meals' },
    ],
  },
];

const demoCoupons: DemoRow[] = [
  { coupon_id: 1, store_id: 1, code: 'FIRST10', discount_type: 'percentage', discount_value: 10, min_order_amount: 199, max_discount: 75, start_date: dateOnly(-30), end_date: dateOnly(60), usage_limit: 500, used_count: 42, is_active: true, created_at: iso(24 * 20) },
  { coupon_id: 2, store_id: 1, code: 'HEALTH50', discount_type: 'fixed', discount_value: 50, min_order_amount: 499, max_discount: null, start_date: dateOnly(-10), end_date: dateOnly(40), usage_limit: 200, used_count: 13, is_active: true, created_at: iso(24 * 9) },
  { coupon_id: 3, store_id: 2, code: 'WELLNESS15', discount_type: 'percentage', discount_value: 15, min_order_amount: 299, max_discount: 100, start_date: dateOnly(-5), end_date: dateOnly(25), usage_limit: null, used_count: 7, is_active: true, created_at: iso(24 * 4) },
  { coupon_id: 4, store_id: 3, code: 'MUMBAI100', discount_type: 'fixed', discount_value: 100, min_order_amount: 899, max_discount: null, start_date: dateOnly(-20), end_date: dateOnly(10), usage_limit: 100, used_count: 91, is_active: true, created_at: iso(24 * 18) },
  { coupon_id: 5, store_id: 4, code: 'PUNE20', discount_type: 'percentage', discount_value: 20, min_order_amount: 249, max_discount: 150, start_date: dateOnly(-2), end_date: dateOnly(30), usage_limit: 300, used_count: 4, is_active: true, created_at: iso(24 * 1) },
];

const demoWishlists: DemoRow[] = [
  { wishlist_id: 1, user_id: DEMO_USER_IDS.customer, medicine_id: 12, created_at: iso(30) },
  { wishlist_id: 2, user_id: DEMO_USER_IDS.customer, medicine_id: 22, created_at: iso(12) },
];

const demoReviews: DemoRow[] = [
  { review_id: 1, user_id: DEMO_USER_IDS.customer, target_type: 'medicine', target_id: '1', rating: 5, comment: 'Genuine Cipla strips, delivered in 40 minutes.', created_at: iso(20) },
  { review_id: 2, user_id: DEMO_USER_IDS.customer2, target_type: 'medicine', target_id: '1', rating: 4, comment: 'Good price. Packaging was intact.', created_at: iso(35) },
  { review_id: 3, user_id: DEMO_USER_IDS.customer, target_type: 'medicine', target_id: '16', rating: 4, comment: 'Works well for my son’s allergies, not too drowsy.', created_at: iso(18) },
  { review_id: 4, user_id: DEMO_USER_IDS.customer2, target_type: 'medicine', target_id: '22', rating: 5, comment: 'Accu-Chek strips at a better price than my local chemist.', created_at: iso(10) },
  { review_id: 5, user_id: DEMO_USER_IDS.customer, target_type: 'store', target_id: '1', rating: 5, comment: 'Sharma Medical Store is reliable and calls before substituting.', created_at: iso(26) },
  { review_id: 6, user_id: DEMO_USER_IDS.customer2, target_type: 'doctor', target_id: '1', rating: 5, comment: 'Dr. Nair explained everything clearly on the video call.', created_at: iso(14) },
];

const demoNotifications: DemoRow[] = [
  { notification_id: 1, user_id: DEMO_USER_IDS.customer, title: 'Order #1004 is out for delivery', message: 'Your glucose strips will arrive in about 25 minutes.', is_read: false, created_at: iso(1) },
  { notification_id: 2, user_id: DEMO_USER_IDS.customer, title: 'Refill reminder: Metformin', message: 'You have 4 days of stock left. Reorder in one tap.', is_read: false, created_at: iso(8) },
  { notification_id: 3, user_id: DEMO_USER_IDS.customer, title: 'Appointment confirmed', message: 'Dr. Priya Nair confirmed your video consultation.', is_read: true, created_at: iso(22) },
  { notification_id: 4, user_id: DEMO_USER_IDS.store_owner, title: 'New COD order', message: 'Order #1002 was marked collected.', is_read: true, created_at: iso(90) },
  { notification_id: 5, user_id: DEMO_USER_IDS.doctor, title: 'New appointment request', message: 'A patient requested a consultation tomorrow at 11:00.', is_read: false, created_at: iso(3) },
];

const demoAppointments: DemoRow[] = [
  {
    appointment_id: 1, doctor_id: 1, patient_id: DEMO_USER_IDS.customer, appointment_date: dateOnly(1), appointment_time: '11:00',
    status: 'confirmed', reason: 'Recurring acidity and fatigue', payment_method: 'online', payment_status: 'paid',
    payment_ref: 'pay_MC_APT1001', consultation_mode: 'online', meeting_link: 'https://meet.jit.si/mediconnect-consult-1001',
    notes: 'Patient to keep BP log ready.', triage: 'Routine — stable vitals reported.',
  },
  {
    appointment_id: 2, doctor_id: 1, patient_id: DEMO_USER_IDS.customer2, appointment_date: dateOnly(0), appointment_time: '15:30',
    status: 'pending', reason: 'Diabetes medication review', payment_method: 'clinic_counter', payment_status: 'pending',
    payment_ref: null, consultation_mode: 'in_person', meeting_link: null, notes: null, triage: 'Routine — fasting sugar 138.',
  },
  {
    appointment_id: 3, doctor_id: 1, patient_id: DEMO_USER_IDS.customer, appointment_date: dateOnly(-12), appointment_time: '10:15',
    status: 'completed', reason: 'Viral fever', payment_method: 'online', payment_status: 'paid',
    payment_ref: 'pay_MC_APT0993', consultation_mode: 'online', meeting_link: null, notes: 'Prescribed rest and paracetamol.',
    triage: 'Routine.',
  },
  {
    appointment_id: 4, doctor_id: 2, patient_id: DEMO_USER_IDS.customer, appointment_date: dateOnly(3), appointment_time: '16:00',
    status: 'confirmed', reason: 'Palpitations evaluation', payment_method: 'online', payment_status: 'paid',
    payment_ref: 'pay_MC_APT1004', consultation_mode: 'online', meeting_link: 'https://meet.jit.si/mediconnect-consult-1004',
    notes: 'Bring recent ECG.', triage: 'Priority — intermittent palpitations.',
  },
  {
    appointment_id: 5, doctor_id: 3, patient_id: DEMO_USER_IDS.customer2, appointment_date: dateOnly(-4), appointment_time: '12:00',
    status: 'completed', reason: 'Acne review', payment_method: 'self_pickup', payment_status: 'paid',
    payment_ref: 'pay_MC_APT0995', consultation_mode: 'in_person', meeting_link: null, notes: 'Continue adapalene gel at night.',
    triage: 'Routine.',
  },
];

const demoEPrescriptions: DemoRow[] = [
  {
    e_prescription_id: 1, doctor_id: 1, appointment_id: 3, patient_profile_id: DEMO_USER_IDS.customer,
    patient_id: 4, diagnosis: 'Acute viral pharyngitis', advice: 'Warm saline gargles, 3 L fluids/day, rest for 3 days.',
    follow_up_date: future(7), items: [
      { medicine_id: 1, medicine_name: 'Paracetamol 500mg', dosage: '1-0-1', duration: '3 days', instructions: 'After food' },
      { medicine_id: 15, medicine_name: 'Cetirizine 10mg', dosage: '0-0-1', duration: '5 days', instructions: 'At bedtime' },
    ],
    vitals: { temperature: 100.2, bp_systolic: 126, bp_diastolic: 82, heart_rate: 92, spo2: 97, weight_kg: 71 },
    created_at: iso(12 * 24),
  },
  {
    e_prescription_id: 2, doctor_id: 1, appointment_id: 2, patient_profile_id: DEMO_USER_IDS.customer2,
    patient_id: 4, diagnosis: 'Type 2 diabetes — medication review', advice: 'Continue metformin; repeat HbA1c in 3 months.',
    follow_up_date: future(21), items: [
      { medicine_id: 11, medicine_name: 'Metformin 500mg', dosage: '1-0-1', duration: '30 days', instructions: 'After meals' },
    ],
    vitals: { glucose: 138, bp_systolic: 118, bp_diastolic: 76, heart_rate: 78, temperature: 98.4, spo2: 99, weight_kg: 62 },
    created_at: iso(4 * 24),
  },
];

const demoEmergencyContacts: DemoRow[] = [
  { contact_id: 1, name: 'MediConnect Ambulance', type: 'ambulance', phone: '108', address: 'City-wide emergency ambulance', latitude: 19.2400, longitude: 73.1300, city: 'Kalyan', is_24_7: true },
  { contact_id: 2, name: 'MediConnect City Hospital — ER', type: 'hospital', phone: '0251-2200110', address: 'Station Road, Kalyan West', latitude: 19.2430, longitude: 73.1290, city: 'Kalyan', is_24_7: true },
  { contact_id: 3, name: 'Jupiter Hospital, Thane', type: 'hospital', phone: '022-21725555', address: 'Eastern Express Highway, Thane West', latitude: 19.2183, longitude: 72.9781, city: 'Thane', is_24_7: true },
  { contact_id: 4, name: 'Lilavati Hospital', type: 'hospital', phone: '022-26568000', address: 'Bandra West, Mumbai', latitude: 19.0500, longitude: 72.8300, city: 'Mumbai', is_24_7: true },
  { contact_id: 5, name: 'Mumbai Police Control Room', type: 'police', phone: '100', address: 'City-wide police helpline', latitude: 19.0760, longitude: 72.8777, city: 'Mumbai', is_24_7: true },
  { contact_id: 6, name: 'Red Cross Blood Bank', type: 'blood_bank', phone: '022-24193000', address: 'Worli, Mumbai', latitude: 19.0110, longitude: 72.8170, city: 'Mumbai', is_24_7: false },
  { contact_id: 7, name: 'Pune Emergency Ambulance', type: 'ambulance', phone: '108', address: 'City-wide emergency ambulance', latitude: 18.5204, longitude: 73.8567, city: 'Pune', is_24_7: true },
];

const demoAuditLogs: DemoRow[] = [
  { log_id: 1, actor_id: DEMO_USER_IDS.admin, action: 'STORE_APPROVED', entity_type: 'stores', entity_id: '1', details: { store: 'Sharma Medical Store' }, created_at: iso(24 * 79) },
  { log_id: 2, actor_id: DEMO_USER_IDS.store_owner, action: 'STOCK_UPDATED', entity_type: 'stock', entity_id: '1', details: { medicine: 'Paracetamol 500mg', quantity: 42 }, created_at: iso(7) },
  { log_id: 3, actor_id: DEMO_USER_IDS.doctor, action: 'PRESCRIPTION_ISSUED', entity_type: 'prescriptions', entity_id: '1', details: { diagnosis: 'Acute viral pharyngitis' }, created_at: iso(29) },
  { log_id: 4, actor_id: DEMO_USER_IDS.nurse, action: 'VITALS_RECORDED', entity_type: 'vitals', entity_id: '1', details: { patient_id: 1 }, created_at: iso(6) },
  { log_id: 5, actor_id: DEMO_USER_IDS.customer, action: 'ORDER_PLACED', entity_type: 'orders', entity_id: '1003', details: { total: 112, method: 'self_pickup' }, created_at: iso(5) },
  { log_id: 6, actor_id: DEMO_USER_IDS.admin, action: 'DOCTOR_APPROVED', entity_type: 'doctors', entity_id: '1', details: { doctor: 'Dr. Priya Nair' }, created_at: iso(24 * 69) },
];

const demoCartItems: DemoRow[] = [
  { cart_item_id: 1, user_id: DEMO_USER_IDS.customer, stock_id: 1, quantity: 2, saved_for_later: false },
  { cart_item_id: 2, user_id: DEMO_USER_IDS.customer, stock_id: 4, quantity: 1, saved_for_later: false },
  { cart_item_id: 3, user_id: DEMO_USER_IDS.customer, stock_id: 9, quantity: 1, saved_for_later: true },
];

const demoPatientsExtras: DemoRow[] = [];

export function createDemoDb(): DemoDb {
  const tables: Record<string, DemoTable> = {
    profiles: demoProfiles.map((r) => ({ ...r })),
    stores: demoStores.map((r) => ({ ...r })),
    medicines: catalog.medicines.map((r) => ({ ...r })),
    stock: catalog.stock.map((r) => ({ ...r })),
    cart_items: demoCartItems.map((r) => ({ ...r })),
    orders: demoOrders.map((r) => ({ ...r })),
    order_items: demoOrderItems.map((r) => ({ ...r })),
    prescriptions: demoPrescriptions.map((r) => ({ ...r })),
    coupons: demoCoupons.map((r) => ({ ...r })),
    wishlists: demoWishlists.map((r) => ({ ...r })),
    reviews: demoReviews.map((r) => ({ ...r })),
    notifications: demoNotifications.map((r) => ({ ...r })),
    doctors: demoDoctors.map((r) => ({ ...r })),
    doctor_availability: demoAvailability.map((r) => ({ ...r })),
    appointments: demoAppointments.map((r) => ({ ...r })),
    e_prescriptions: demoEPrescriptions.map((r) => ({ ...r })),
    patients: [...demoPatients, ...demoPatientsExtras],
    vitals: demoVitals.map((r) => ({ ...r })),
    tasks: demoTasks.map((r) => ({ ...r })),
    notes: demoNotes.map((r) => ({ ...r })),
    symptom_checks: [],
    emergency_contacts: demoEmergencyContacts.map((r) => ({ ...r })),
    audit_logs: demoAuditLogs.map((r) => ({ ...r })),
  };

  const seq: Record<string, number> = {
    stores: 5, medicines: catalog.medicines.length + 1, stock: catalog.stock.length + 1,
    cart_items: 4, orders: 1006, order_items: 10, prescriptions: 3, coupons: 6, wishlists: 3,
    reviews: 7, notifications: 6, doctors: 4, doctor_availability: demoAvailability.length + 1,
    appointments: 6, patients: 5, vitals: demoVitals.length + 1, tasks: 7, notes: 5,
    e_prescriptions: 3,
    symptom_checks: 1, emergency_contacts: 8, audit_logs: 7,
  };

  return { version: DEMO_DB_VERSION, tables, seq };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** Live in-memory copy used when localStorage is unavailable (SSR/tests). */
let memoryDb: DemoDb | null = null;

export function loadDemoDb(): DemoDb {
  if (!storageAvailable()) {
    if (!memoryDb) memoryDb = createDemoDb();
    return memoryDb;
  }
  try {
    const raw = window.localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      if (parsed?.version === DEMO_DB_VERSION && parsed.tables) return parsed;
    }
  } catch {
    // Corrupt payload — fall through and reseed.
  }
  const fresh = createDemoDb();
  saveDemoDb(fresh);
  return fresh;
}

export function saveDemoDb(db: DemoDb): void {
  if (!storageAvailable()) {
    memoryDb = db;
    return;
  }
  try {
    window.localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  } catch {
    memoryDb = db;
  }
}

let cached: DemoDb | null = null;

export function getDemoDb(): DemoDb {
  if (!cached) cached = loadDemoDb();
  return cached;
}

export function resetDemoDb(): DemoDb {
  const fresh = createDemoDb();
  cached = fresh;
  saveDemoDb(fresh);
  return fresh;
}

/** Replace the cache after a cross-tab change. */
export function reloadDemoDbFromStorage(): void {
  cached = loadDemoDb();
}

export function demoTable(name: string): DemoTable {
  const db = getDemoDb();
  if (!db.tables[name]) db.tables[name] = [];
  return db.tables[name]!;
}

export function nextDemoId(table: string): number {
  const db = getDemoDb();
  const current = db.seq[table] ?? 1;
  db.seq[table] = current + 1;
  return current;
}

export function slugId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export { clone, storageAvailable };
