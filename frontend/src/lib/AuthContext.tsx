import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  rawSupabase, supabase, loadDemoSession, saveDemoSession, clearDemoSession,
  getDataMode, resetDataMode, DEMO_SESSION_KEY,
} from './supabaseClient';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoTable, slugId } from './demoData';
import type { Database, UserRole } from '../types/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

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

function buildDemoSession(userId: string, email: string, role: UserRole): Session {
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
      user_metadata: { name: role, role, demo: true },
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

function findDemoAccount(email: string) {
  return DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
}

/**
 * Single source of truth for "who is logged in and what role are they".
 *
 * Auth is Supabase-first: a real session always wins when it exists. When the
 * Supabase project is unreachable/unmigrated — or the visitor used one of the
 * 1-click demo logins — a persisted local demo session takes over so every
 * portal, guard and profile lookup keeps working end-to-end.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!error && data) {
      setProfile(data as Profile);
      return;
    }
    // Last-resort local lookup: covers a demo session whose data was reset
    // while the tab was open.
    const local = demoTable('profiles').find((p) => p.id === userId) as Profile | undefined;
    setProfile(local ?? null);
  }, []);

  const applyDemoSession = useCallback(async (record: NonNullable<ReturnType<typeof loadDemoSession>>) => {
    setSession(record.session);
    setIsDemo(true);
    await loadProfile(record.session.user.id);
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const demoRecord = loadDemoSession();
      if (demoRecord) {
        await applyDemoSession(demoRecord);
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: { session: liveSession } } = await rawSupabase.auth.getSession();
      if (cancelled) return;
      setSession(liveSession);
      setIsDemo(false);
      await loadProfile(liveSession?.user?.id);
      if (!cancelled) setLoading(false);
    };

    void boot();

    const { data: sub } = rawSupabase.auth.onAuthStateChange(async (event, nextSession) => {
      // A demo session owns the tab: ignore the real client's INITIAL_SESSION
      // (always null here) and any token refresh noise.
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
      await loadProfile(nextSession?.user?.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [applyDemoSession, loadProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const demoAccount = findDemoAccount(email);
    const mode = await getDataMode();

    // In demo mode we don't attempt a doomed network login. Match the seeded
    // demo credentials, or accept the shared demo password for any seeded
    // account so the buttons and manual entry behave identically.
    if (mode === 'demo') {
      if (demoAccount && (password === demoAccount.password || password === DEMO_PASSWORD)) {
        const record = {
          session: buildDemoSession(demoAccount.userId, demoAccount.email, demoAccount.role),
          role: demoAccount.role,
          email: demoAccount.email,
        };
        saveDemoSession(record);
        setSession(record.session);
        setIsDemo(true);
        await loadProfile(demoAccount.userId);
        return toAuthResult(record.session, record.session.user);
      }
      return authError('No live database is configured, so only the demo accounts can sign in right now. Use a 1-click demo login below.');
    }

    const result = await rawSupabase.auth.signInWithPassword({ email, password });
    if (!result.error) {
      clearDemoSession();
      setIsDemo(false);
      setSession(result.data.session);
      await loadProfile(result.data.session?.user?.id);
      return result;
    }

    // Live auth rejected the credentials. If they happen to be a demo
    // account, fall back gracefully so the demo buttons keep working even
    // when a real project is connected.
    if (demoAccount && (password === demoAccount.password || password === DEMO_PASSWORD)) {
      const record = {
        session: buildDemoSession(demoAccount.userId, demoAccount.email, demoAccount.role),
        role: demoAccount.role,
        email: demoAccount.email,
      };
      saveDemoSession(record);
      setSession(record.session);
      setIsDemo(true);
      await loadProfile(demoAccount.userId);
      return toAuthResult(record.session, record.session.user);
    }
    return result;
  }, [loadProfile]);

  const signInDemo = useCallback(async (role: UserRole): Promise<{ error: Error | null }> => {
    const account = DEMO_ACCOUNTS.find((a) => a.role === role) ?? DEMO_ACCOUNTS[0];
    if (!account) return { error: new Error('Demo account unavailable.') };
    const record = {
      session: buildDemoSession(account.userId, account.email, account.role),
      role: account.role,
      email: account.email,
    };
    saveDemoSession(record);
    setSession(record.session);
    setIsDemo(true);
    await loadProfile(account.userId);
    return { error: null };
  }, [loadProfile]);

  const signUp = useCallback(async ({ email, password, name, role, phone, address }: SignUpParams): Promise<SignUpResult> => {
    const mode = await getDataMode();
    if (mode === 'demo') {
      const userId = slugId();
      const profiles = demoTable('profiles');
      profiles.push({
        id: userId,
        name,
        email,
        phone: phone ?? null,
        role,
        status: 'active',
        address: address ?? null,
        created_at: new Date().toISOString(),
        avatar_url: null,
        date_of_birth: null,
        gender: null,
        blood_group: null,
        allergies: [],
      });
      // Persist through the same store the query engine reads.
      const { saveDemoDb, getDemoDb } = await import('./demoData');
      saveDemoDb(getDemoDb());
      const record = {
        session: buildDemoSession(userId, email, role),
        role,
        email,
      };
      saveDemoSession(record);
      setSession(record.session);
      setIsDemo(true);
      setProfile(profiles.find((p) => p.id === userId) as Profile);
      return toAuthResult(record.session, record.session.user) as unknown as SignUpResult;
    }

    const result = await rawSupabase.auth.signUp({
      email,
      password,
      options: { data: { name, role, phone, address } },
    });
    if (!result.error) {
      setSession(result.data.session);
      setIsDemo(false);
      await loadProfile(result.data.session?.user?.id);
    }
    return result;
  }, [loadProfile]);

  const signOut = useCallback(async (): Promise<{ error: Error | null }> => {
    clearDemoSession();
    const { error } = await rawSupabase.auth.signOut().catch(() => ({ error: null }));
    setSession(null);
    setProfile(null);
    setIsDemo(false);
    resetDataMode();
    return { error: error as Error | null };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role: (profile?.role as UserRole) ?? null,
    loading,
    isDemo,
    signIn,
    signInDemo,
    signUp,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
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
