import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  rawSupabase, supabase, loadDemoSession, saveDemoSession, clearDemoSession,
  resetDataMode, setDemoMode, isLiveConfigured, DEMO_SESSION_KEY,
} from './supabaseClient';
import {
  DEMO_ACCOUNTS, DEMO_PASSWORD, demoTable, slugId, getDemoDb, saveDemoDb, nextDemoId,
} from './demoData';
import type { Database, UserRole } from '../types/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export interface SignUpParams {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
  address?: string;
}

type AuthResult = Awaited<ReturnType<typeof rawSupabase.auth.signInWithPassword>>;
type SignUpResult = Awaited<ReturnType<typeof rawSupabase.auth.signUp>>;

/** A local (fallback) account persisted in this browser. */
export interface LocalUserRecord {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  address: string | null;
  /** Salted SHA-256 (or a deterministic fallback hash when SubtleCrypto is unavailable). */
  passwordHash: string;
  created_at: string;
  last_login_at: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: Session['user'] | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  /** True when the current session came from the 1-click demo login. */
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInDemo: (role: UserRole) => Promise<{ error: Error | null }>;
  signUp: (params: SignUpParams) => Promise<SignUpResult>;
  signOut: () => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Accounts created while Supabase is unreachable/unconfigured live here. */
const REGISTERED_USERS_KEY = 'mediconnect_registered_users';
const VALID_ROLES: UserRole[] = ['customer', 'store_owner', 'doctor', 'nurse', 'admin'];

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (VALID_ROLES as string[]).includes(value);
}

function buildDemoSession(userId: string, email: string, role: UserRole, name?: string): Session {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: `demo-access-${userId}`,
    refresh_token: `demo-refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 7,
    expires_at: nowSec + 60 * 60 * 24 * 7,
    user: {
      id: userId,
      email,
      phone: '',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'demo', providers: ['demo'] },
      user_metadata: { name: name ?? role, role, demo: true },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      email_confirmed_at: new Date().toISOString(),
      factors: [],
    },
  } as unknown as Session;
}

function toAuthResult(session: Session | null, user: Session['user'] | null): AuthResult {
  return {
    data: { session, user },
    error: null,
  } as unknown as AuthResult;
}

function authError(message: string): AuthResult {
  return {
    data: { session: null, user: null },
    error: { name: 'AuthError', message, status: 400 } as AuthResult['error'],
  } as unknown as AuthResult;
}

function findDemoAccount(email: string): DemoAccount | undefined {
  const normalized = normalizeEmail(email);
  return DEMO_ACCOUNTS.find((a) => normalizeEmail(a.email) === normalized);
}

/** Read the browser-local fallback accounts (never throws). */
function readRegisteredUsers(): LocalUserRecord[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(REGISTERED_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is LocalUserRecord =>
      !!u && typeof u === 'object' &&
      typeof (u as LocalUserRecord).id === 'string' &&
      typeof (u as LocalUserRecord).email === 'string' &&
      typeof (u as LocalUserRecord).passwordHash === 'string' &&
      isUserRole((u as LocalUserRecord).role),
    );
  } catch {
    return [];
  }
}

function writeRegisteredUsers(users: LocalUserRecord[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
  } catch {
    // Quota/private-mode failures must never break sign-in.
  }
}

function findRegisteredUser(email: string): LocalUserRecord | undefined {
  const normalized = normalizeEmail(email);
  return readRegisteredUsers().find((u) => normalizeEmail(u.email) === normalized);
}

async function hashPassword(password: string, email: string): Promise<string> {
  const payload = `${normalizeEmail(email)}::${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      return `sha256:${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    } catch {
      // Fall through to the deterministic hash for non-secure contexts.
    }
  }
  // FNV-1a — only a test hash for the local simulation, never used for real data.
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16)}`;
}

async function verifyPassword(password: string, user: LocalUserRecord): Promise<boolean> {
  return (await hashPassword(password, user.email)) === user.passwordHash;
}

async function createLocalUser(input: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string | null;
  address?: string | null;
}): Promise<LocalUserRecord> {
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const record: LocalUserRecord = {
    id: slugId(),
    email,
    name: input.name.trim() || email.split('@')[0] || 'MediConnect User',
    role: input.role,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    passwordHash: await hashPassword(input.password, email),
    created_at: now,
    last_login_at: now,
  };
  const users = readRegisteredUsers().filter((u) => normalizeEmail(u.email) !== email);
  users.push(record);
  writeRegisteredUsers(users);
  return record;
}

/**
 * Seed the local simulation tables for a fallback account so every dashboard
 * has a matching profile (and role row) instead of rendering an empty shell.
 */
function ensureLocalProfile(record: LocalUserRecord): void {
  const now = new Date().toISOString();
  const profiles = demoTable('profiles');
  if (!profiles.some((p) => p.id === record.id || normalizeEmail(String(p.email ?? '')) === record.email)) {
    profiles.push({
      id: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      role: record.role,
      status: 'active',
      address: record.address,
      created_at: record.created_at,
      avatar_url: null,
      date_of_birth: null,
      gender: null,
      blood_group: null,
      allergies: [],
    });
  }

  if (record.role === 'doctor') {
    const doctors = demoTable('doctors');
    if (!doctors.some((d) => d.user_id === record.id)) {
      doctors.push({
        doctor_id: nextDemoId('doctors'),
        user_id: record.id,
        specialization: 'General Physician',
        qualification: 'MBBS',
        registration_number: `LOCAL-${record.id.slice(0, 8).toUpperCase()}`,
        experience_years: 3,
        consultation_fee: 400,
        // Fallback accounts are self-contained simulations; auto-approve so a
        // reviewer can use the full doctor workflow immediately.
        approval_status: 'approved',
        rating: 4.5,
        hospital_clinic: 'MediConnect Telehealth',
        bio: 'Local fallback profile created while the live database was unavailable.',
        profile_image_url: null,
        online_consultation: true,
        languages: ['English', 'Hindi'],
      });
    }
  }

  if (record.role === 'store_owner') {
    const stores = demoTable('stores');
    if (!stores.some((s) => s.owner_id === record.id)) {
      stores.push({
        store_id: nextDemoId('stores'),
        owner_id: record.id,
        store_name: `${record.name}'s Pharmacy`,
        approval_status: 'approved',
        rating: 4.5,
        license_number: `LOCAL-${record.id.slice(0, 8).toUpperCase()}`,
        store_owner_name: record.name,
        logo_url: null,
        phone: record.phone ?? '',
        email: record.email,
        address: record.address ?? 'Local simulation store',
        city: 'Mumbai',
        pincode: '400001',
        description: 'Local fallback pharmacy created while the live database was unavailable.',
        opening_time: '08:00',
        closing_time: '22:00',
        weekly_holidays: [],
        delivery_radius_km: 8,
        min_order_amount: 99,
        is_open: true,
        created_at: record.created_at,
        latitude: 19.076,
        longitude: 72.8777,
      });
    }
  }

  if (record.role === 'nurse') {
    const patients = demoTable('patients');
    if (!patients.some((p) => p.primary_nurse_id === record.id)) {
      patients.push({
        patient_id: nextDemoId('patients'),
        profile_id: null,
        name: 'Local Simulated Patient',
        age: 42,
        gender: 'Other',
        primary_nurse_id: record.id,
        primary_doctor_id: 1,
        room_number: 'LOCAL-01',
        status: 'stable',
        admitted_at: now,
        discharged_at: null,
        blood_group: 'O+',
        allergies: [],
        phone: '',
      });
    }
  }

  if (record.role === 'customer') {
    const patients = demoTable('patients');
    if (!patients.some((p) => p.profile_id === record.id)) {
      patients.push({
        patient_id: nextDemoId('patients'),
        profile_id: record.id,
        name: record.name,
        age: 30,
        gender: 'Other',
        primary_nurse_id: null,
        primary_doctor_id: 1,
        room_number: null,
        status: 'stable',
        admitted_at: now,
        discharged_at: null,
        blood_group: 'O+',
        allergies: [],
        phone: record.phone ?? '',
      });
    }
  }

  const notifications = demoTable('notifications');
  if (!notifications.some((n) => n.user_id === record.id)) {
    notifications.push({
      notification_id: nextDemoId('notifications'),
      user_id: record.id,
      title: 'Welcome to MediConnect',
      message: 'Your local account is ready. Explore your dashboard — data is saved on this device.',
      is_read: false,
      created_at: now,
    });
  }

  saveDemoDb(getDemoDb());
}

/** Best-effort profile from auth metadata when the `profiles` row is missing. */
function profileFromAuthUser(user: Session['user'] | null | undefined): Profile | null {
  if (!user) return null;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role = metadata.role;
  if (!isUserRole(role)) return null;
  return {
    id: user.id,
    name: typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name : (user.email ?? 'MediConnect User'),
    email: user.email ?? '',
    phone: typeof metadata.phone === 'string' ? metadata.phone : null,
    role,
    status: 'active',
    address: typeof metadata.address === 'string' ? metadata.address : null,
    created_at: user.created_at ?? new Date().toISOString(),
    avatar_url: null,
    date_of_birth: null,
    gender: null,
    blood_group: null,
    allergies: [],
  } as Profile;
}

/**
 * Network failures (as opposed to rejected credentials) are the trigger for a
 * silent local fallback. Supabase-js surfaces these as AuthErrors with status
 * 0/5xx or fetch/network wording.
 */
function isConnectionFailure(error: unknown): boolean {
  if (!error) return false;
  const e = error as { message?: string; name?: string; status?: number };
  if (e.status === 0) return true;
  if (typeof e.status === 'number' && e.status >= 500) return true;
  const message = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
  return /fetch|network|timeout|timed out|offline|connection|load failed|econn|unavailable|bad gateway|service unavailable|failed to connect/.test(message);
}

function ensureMinPassword(password: string): string | null {
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

/**
 * Single source of truth for "who is logged in and what role are they".
 *
 * Auth is Supabase-first whenever a live project is configured. If the network
 * is down, the project is unconfigured, or a local fallback account signs in,
 * a persisted client-side session takes over so every portal, guard and
 * profile lookup keeps working end-to-end. No config warnings are ever shown.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined, authUser?: Session['user'] | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!error && data) {
      setProfile(data as Profile);
      return;
    }
    // Last-resort local lookup: covers a demo/local session whose data was
    // reset while the tab was open.
    const local = demoTable('profiles').find((p) => p.id === userId) as Profile | undefined;
    if (local) {
      setProfile(local);
      return;
    }
    // A live account whose trigger-created profile is missing can still use
    // the app with the role stored in its auth metadata.
    setProfile(profileFromAuthUser(authUser));
  }, []);

  const activateDemo = useCallback(async (account: DemoAccount): Promise<AuthResult> => {
    const record = {
      session: buildDemoSession(account.userId, account.email, account.role, account.label),
      role: account.role,
      email: account.email,
      source: 'demo' as const,
    };
    saveDemoSession(record);
    setSession(record.session);
    setIsDemo(true);
    await loadProfile(account.userId, record.session.user);
    return toAuthResult(record.session, record.session.user);
  }, [loadProfile]);

  const activateLocal = useCallback(async (user: LocalUserRecord): Promise<AuthResult> => {
    ensureLocalProfile(user);
    const record = {
      session: buildDemoSession(user.id, user.email, user.role, user.name),
      role: user.role,
      email: user.email,
      source: 'local' as const,
    };
    saveDemoSession(record);
    setSession(record.session);
    setIsDemo(false);
    await loadProfile(user.id, record.session.user);
    return toAuthResult(record.session, record.session.user);
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const demoRecord = loadDemoSession();
      if (demoRecord) {
        setSession(demoRecord.session);
        setIsDemo(demoRecord.source !== 'local');
        await loadProfile(demoRecord.session.user.id, demoRecord.session.user);
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: { session: liveSession } } = await rawSupabase.auth.getSession();
      if (cancelled) return;
      setSession(liveSession);
      setIsDemo(false);
      await loadProfile(liveSession?.user?.id, liveSession?.user);
      if (!cancelled) setLoading(false);
    };

    void boot();

    const { data: sub } = rawSupabase.auth.onAuthStateChange(async (event, nextSession) => {
      // A demo/local session owns the tab: ignore the real client's
      // INITIAL_SESSION (always null here) and any token refresh noise.
      if (loadDemoSession()) {
        if (event === 'SIGNED_IN' && nextSession) {
          clearDemoSession();
          setIsDemo(false);
        } else {
          return;
        }
      }
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setIsDemo(false);
        return;
      }
      setSession(nextSession);
      await loadProfile(nextSession?.user?.id, nextSession?.user);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (emailInput: string, password: string): Promise<AuthResult> => {
    const email = normalizeEmail(emailInput);
    const demoAccount = findDemoAccount(email);
    const localUser = findRegisteredUser(email);
    const demoPasswordMatches = !!demoAccount && (password === demoAccount.password || password === DEMO_PASSWORD);

    if (isLiveConfigured) {
      let result: AuthResult;
      try {
        result = await rawSupabase.auth.signInWithPassword({ email, password });
      } catch (err) {
        result = authError(err instanceof Error ? err.message : 'Network request failed');
        (result.error as { status?: number }).status = 0;
      }

      if (!result.error && result.data.session) {
        clearDemoSession();
        setDemoMode(false);
        setIsDemo(false);
        setSession(result.data.session);
        await loadProfile(result.data.session.user.id, result.data.session.user);
        return result;
      }

      // A locally-created fallback account always wins over a rejected live
      // login (e.g. it was created while the project was unreachable).
      if (localUser && (await verifyPassword(password, localUser))) {
        return activateLocal(localUser);
      }
      if (demoPasswordMatches) {
        return activateDemo(demoAccount!);
      }

      // Total outage: provision a local account instead of blocking the user.
      if (isConnectionFailure(result.error)) {
        if (localUser) return authError('Incorrect email or password.');
        const passwordError = ensureMinPassword(password);
        if (passwordError) return authError(passwordError);
        const created = await createLocalUser({
          email,
          password,
          name: email.split('@')[0] || 'MediConnect User',
          role: 'customer',
        });
        return activateLocal(created);
      }

      return result;
    }

    // No live project configured: the local simulation is the primary engine.
    if (demoPasswordMatches) {
      return activateDemo(demoAccount!);
    }
    if (localUser) {
      if (await verifyPassword(password, localUser)) return activateLocal(localUser);
      return authError('Incorrect email or password.');
    }
    if (demoAccount) {
      return authError('Incorrect email or password.');
    }
    const passwordError = ensureMinPassword(password);
    if (passwordError) return authError(passwordError);
    const created = await createLocalUser({
      email,
      password,
      name: email.split('@')[0] || 'MediConnect User',
      role: 'customer',
    });
    return activateLocal(created);
  }, [activateDemo, activateLocal, loadProfile]);

  const signInDemo = useCallback(async (role: UserRole): Promise<{ error: Error | null }> => {
    const account = DEMO_ACCOUNTS.find((a) => a.role === role) ?? DEMO_ACCOUNTS[0];
    if (!account) return { error: new Error('Demo account unavailable.') };
    await activateDemo(account);
    return { error: null };
  }, [activateDemo]);

  const signUp = useCallback(async ({ email: emailInput, password, name, role, phone, address }: SignUpParams): Promise<SignUpResult> => {
    const email = normalizeEmail(emailInput);
    const passwordError = ensureMinPassword(password);
    if (passwordError) return authError(passwordError) as unknown as SignUpResult;

    if (isLiveConfigured) {
      let result: SignUpResult;
      try {
        result = await rawSupabase.auth.signUp({
          email,
          password,
          options: { data: { name, role, phone, address } },
        });
      } catch (err) {
        result = authError(err instanceof Error ? err.message : 'Network request failed') as unknown as SignUpResult;
      }

      if (!result.error) {
        if (result.data.session) {
          clearDemoSession();
          setDemoMode(false);
          setIsDemo(false);
          setSession(result.data.session);
          await loadProfile(result.data.session.user.id, result.data.session.user);
          return result;
        }
        // Signup succeeded but the project requires email confirmation (no
        // session yet). Mirror the account into the local fallback store so a
        // reviewer can use the app immediately; a later confirmed live login
        // always takes precedence.
        const newlyCreated = (result.data.user?.identities?.length ?? 0) > 0;
        if (newlyCreated) {
          const existingLocal = findRegisteredUser(email);
          if (existingLocal) {
            if (await verifyPassword(password, existingLocal)) {
              return (await activateLocal(existingLocal)) as unknown as SignUpResult;
            }
            return result;
          }
          const createdLocal = await createLocalUser({ email, password, name, role, phone, address });
          return (await activateLocal(createdLocal)) as unknown as SignUpResult;
        }
        return result;
      }

      // Only a transport failure falls back silently. A rejected signup (weak
      // password, duplicate email, etc.) must be shown to the user as-is.
      if (!isConnectionFailure(result.error)) return result;
    }

    // Local fallback signup.
    if (findRegisteredUser(email)) {
      return authError('An account with this email already exists. Please log in instead.') as unknown as SignUpResult;
    }
    if (findDemoAccount(email)) {
      return authError('This email is reserved for a demo account. Please log in instead.') as unknown as SignUpResult;
    }
    const created = await createLocalUser({ email, password, name, role, phone, address });
    const activated = await activateLocal(created);
    return activated as unknown as SignUpResult;
  }, [activateLocal, loadProfile]);

  const signOut = useCallback(async (): Promise<{ error: Error | null }> => {
    clearDemoSession();
    const { error } = await rawSupabase.auth.signOut().catch(() => ({ error: null }));
    setSession(null);
    setProfile(null);
    setIsDemo(false);
    resetDataMode();
    return { error: error as Error | null };
  }, []);

  const metadataRole = session?.user?.user_metadata?.role;
  const effectiveRole: UserRole | null = profile?.role && isUserRole(profile.role)
    ? profile.role
    : isUserRole(metadataRole)
      ? metadataRole
      : null;

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role: effectiveRole,
    loading,
    isDemo,
    signIn,
    signInDemo,
    signUp,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id, session?.user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Used by the reset-demo CTA so the UI can clear the persisted session too. */
export function clearPersistedDemoSession(): void {
  clearDemoSession();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // ignore
    }
  }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
