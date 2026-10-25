// FIX: (1) process.exit(1) on error caused a native libuv crash on Windows when
// undici/fetch sockets were still closing — replaced with process.exitCode.
// (2) store/doctor/availability/patients creation is now idempotent (checks for
// an existing row before inserting) so re-running the seed after a partial
// failure — e.g. tables not yet created — no longer throws on duplicate keys.
/**
 * MediConnect demo data seeder.
 *
 * Creates one Supabase Auth user per role (the `handle_new_user` trigger
 * auto-creates the matching `profiles` row), then inserts the role-specific
 * demo records (stores, doctors, patients, vitals, tasks, notes, stock,
 * appointments) using those real user ids.
 *
 * Requires the SERVICE ROLE key (never expose this in the frontend).
 *
 * Usage:
 *   cd scripts && npm install && node seed.js
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// .trim() guards against a common Windows/.env gotcha: trailing spaces, a
// stray CR, or wrapping quotes left in the value cause the Supabase client
// to build a malformed request URL, which surfaces later as the cryptic
// undici error "Invalid path specified in request URL" instead of a clear
// "bad config" message. Strip surrounding quotes too, just in case.
const clean = (v) => v?.trim().replace(/^['"]|['"]$/g, '');

const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_ROLE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scripts/.env');
  console.error('  -> copy scripts/.env.example to scripts/.env and fill in your project values');
  process.exit(1);
}

if (SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
  console.error('SUPABASE_URL in scripts/.env is still the placeholder from .env.example.');
  console.error('  -> replace it with your real project URL from Supabase Settings > API');
  process.exit(1);
}

try {
  // eslint-disable-next-line no-new
  new URL(SUPABASE_URL);
} catch {
  console.error(`SUPABASE_URL in scripts/.env is not a valid URL: "${SUPABASE_URL}"`);
  console.error('  -> it should look like: https://YOUR_PROJECT_REF.supabase.co (no quotes, no trailing slash)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = 'MediConnect@123';

const DEMO_USERS = [
  { email: 'admin@mediconnect.app',   name: 'Admin User',      role: 'admin',       phone: '9999999999', address: 'MediConnect HQ' },
  { email: 'owner@mediconnect.app',   name: 'Rajesh Sharma',   role: 'store_owner', phone: '9876543210', address: 'Shop 12, Andheri West, Mumbai' },
  { email: 'doctor@mediconnect.app',  name: 'Dr. Priya Nair',  role: 'doctor',      phone: '9123456780', address: 'Clinic 4, Bandra, Mumbai' },
  { email: 'nurse@mediconnect.app',   name: 'Anjali Desai',    role: 'nurse',       phone: '9812345670', address: 'Ward 3, City Hospital' },
  { email: 'customer@mediconnect.app',name: 'Aman Verma',      role: 'customer',    phone: '9988776655', address: '221B, Powai, Mumbai' },
];

async function createUser(u) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role, phone: u.phone, address: u.address },
  });
  if (error) {
    // If it already exists, look it up instead of failing the whole run.
    // Supabase/GoTrue returns "already been registered" (with "been"); match
    // both wordings so a re-run reuses the existing user instead of crashing.
    if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list.users.find((x) => x.email === u.email);
      console.log(`↺  ${u.email} already exists, reusing id`);
      return existing.id;
    }
    if (error.message?.toLowerCase().includes('not allowed')) {
      console.error('\nSupabase rejected this as an admin action ("User not allowed").');
      console.error('This almost always means SUPABASE_SERVICE_ROLE_KEY in scripts/.env is');
      console.error('actually the anon/public key, not the service_role (secret) key.');
      console.error('Check Supabase dashboard > Settings > API and re-copy the service_role key.\n');
    }
    throw error;
  }
  console.log(`✓ created ${u.role.padEnd(11)} ${u.email}`);
  return data.user.id;
}

/** Returns the first row matching `match` in `table`, or null. Used to make re-runs idempotent. */
async function findOne(table, match) {
  let query = supabase.from(table).select('*');
  for (const [col, val] of Object.entries(match)) query = query.eq(col, val);
  const { data } = await query.limit(1);
  return data && data.length > 0 ? data[0] : null;
}

async function main() {
  console.log('Seeding MediConnect demo data...\n');

  const ids = {};
  for (const u of DEMO_USERS) {
    ids[u.role] = await createUser(u);
  }

  // ---------- Store + inventory (MediMart) ----------
  let store = await findOne('stores', { owner_id: ids.store_owner });
  if (store) {
    console.log(`↺  store already exists for owner, reusing (${store.store_name})`);
  } else {
    const { data, error: storeErr } = await supabase.from('stores').insert({
      owner_id: ids.store_owner,
      store_name: 'Sharma Medical Store',
      license_number: 'LIC-2024-001',
      address: 'Shop 12, Andheri West, Mumbai',
      latitude: 19.136, longitude: 72.827,
      approval_status: 'approved',
      rating: 4.5,
    }).select().single();
    if (storeErr) throw storeErr;
    store = data;
    console.log(`✓ created store ${store.store_name}`);
  }

  const { data: medicines } = await supabase.from('medicines').select('medicine_id, name');
  const priceFor = (name) => (name.includes('Amoxicillin') || name.includes('Azithromycin') ? 120 : 25);

  const { data: existingStock } = await supabase.from('stock').select('stock_id').eq('store_id', store.store_id);
  if (existingStock && existingStock.length > 0) {
    console.log(`↺  stock already seeded for this store (${existingStock.length} rows), skipping`);
  } else if (medicines && medicines.length > 0) {
    const stockRows = medicines.map((m) => ({
      store_id: store.store_id,
      medicine_id: m.medicine_id,
      price: priceFor(m.name),
      mrp: priceFor(m.name) + 5,
      quantity: 100,
      expiry_date: '2027-06-01',
    }));
    const { error: stockErr } = await supabase.from('stock').insert(stockRows);
    if (stockErr) throw stockErr;
    console.log(`✓ stocked ${stockRows.length} medicines at ${store.store_name}`);
  } else {
    console.log('⚠  no medicines found — run supabase/seed/seed_catalog.sql first');
  }

  // ---------- Doctor + availability (MediMart) ----------
  let doctor = await findOne('doctors', { user_id: ids.doctor });
  if (doctor) {
    console.log(`↺  doctor row already exists, reusing (${doctor.specialization})`);
  } else {
    const { data, error: docErr } = await supabase.from('doctors').insert({
      user_id: ids.doctor,
      specialization: 'General Physician',
      qualification: 'MBBS, MD',
      registration_number: 'MCI-2015-4521',
      experience_years: 9,
      consultation_fee: 500,
      approval_status: 'approved',
      rating: 4.7,
    }).select().single();
    if (docErr) throw docErr;
    doctor = data;
    console.log('✓ created doctor row');
  }

  const { data: existingAvailability } = await supabase.from('doctor_availability').select('slot_id').eq('doctor_id', doctor.doctor_id);
  if (existingAvailability && existingAvailability.length > 0) {
    console.log('↺  doctor availability already exists, skipping');
  } else {
    await supabase.from('doctor_availability').insert([
      { doctor_id: doctor.doctor_id, day_of_week: 'Mon', start_time: '10:00', end_time: '13:00', slot_duration_minutes: 15 },
      { doctor_id: doctor.doctor_id, day_of_week: 'Wed', start_time: '10:00', end_time: '13:00', slot_duration_minutes: 15 },
      { doctor_id: doctor.doctor_id, day_of_week: 'Fri', start_time: '16:00', end_time: '19:00', slot_duration_minutes: 15 },
    ]);
    console.log('✓ doctor availability created');
  }

  // ---------- Patients + vitals + tasks + notes (VitalSync) ----------
  const { data: existingPatients } = await supabase.from('patients').select('*').eq('primary_nurse_id', ids.nurse);
  let patients = existingPatients;
  if (existingPatients && existingPatients.length > 0) {
    console.log(`↺  ${existingPatients.length} patients already exist for this nurse, skipping patient/vitals/task/note seeding`);
  } else {
    const { data, error: patErr } = await supabase.from('patients').insert([
      { name: 'Ramesh Iyer', age: 67, gender: 'Male', room_number: '204-A', status: 'monitoring', primary_doctor_id: doctor.doctor_id, primary_nurse_id: ids.nurse },
      { name: 'Sunita Rao', age: 45, gender: 'Female', room_number: '210-B', status: 'stable', primary_doctor_id: doctor.doctor_id, primary_nurse_id: ids.nurse },
      { name: 'Vikram Shah', age: 58, gender: 'Male', room_number: '112-A', status: 'critical', primary_doctor_id: doctor.doctor_id, primary_nurse_id: ids.nurse },
    ]).select();
    if (patErr) throw patErr;
    patients = data;
    console.log(`✓ ${patients.length} patients admitted`);

    const now = Date.now();
    const vitalsRows = patients.flatMap((p, i) => (
      Array.from({ length: 4 }).map((_, j) => ({
        patient_id: p.patient_id,
        heart_rate: 70 + i * 6 + j * 2,
        bp_systolic: 118 + i * 5,
        bp_diastolic: 76 + i * 2,
        temperature: 98.2 + i * 0.4,
        spo2: 97 - i,
        respiratory_rate: 16 + i,
        recorded_by: ids.nurse,
        recorded_at: new Date(now - (4 - j) * 3600 * 1000).toISOString(),
      }))
    ));
    await supabase.from('vitals').insert(vitalsRows);
    console.log(`✓ ${vitalsRows.length} vitals readings logged`);

    await supabase.from('tasks').insert([
      { patient_id: patients[0].patient_id, assigned_to: ids.nurse, created_by: ids.doctor, title: 'Administer morning medication', priority: 'high', status: 'pending' },
      { patient_id: patients[1].patient_id, assigned_to: ids.nurse, created_by: ids.doctor, title: 'Check vitals every 2 hours', priority: 'medium', status: 'in_progress' },
      { patient_id: patients[2].patient_id, assigned_to: ids.nurse, created_by: ids.doctor, title: 'Urgent: notify doctor of BP spike', priority: 'urgent', status: 'pending' },
    ]);
    console.log('✓ nurse tasks assigned');

    await supabase.from('notes').insert([
      { patient_id: patients[0].patient_id, created_by: ids.nurse, content: 'Patient resting comfortably, appetite improving.' },
      { patient_id: patients[2].patient_id, created_by: ids.nurse, content: 'BP trending up, doctor notified, awaiting orders.' },
    ]);
    console.log('✓ nurse notes added');
  }

  console.log('\nDone! Demo login (password for all): ' + DEMO_PASSWORD);
  DEMO_USERS.forEach((u) => console.log(`  ${u.role.padEnd(11)} ${u.email}`));
}

main().catch((e) => {
  console.error('Seed failed:', e.message || e);
  process.exitCode = 1; // avoid process.exit() here — it crashes on Windows if undici sockets are still closing
});
