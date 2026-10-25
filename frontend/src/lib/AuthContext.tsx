import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
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

interface AuthContextValue {
  session: Session | null;
  user: Session['user'] | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => ReturnType<typeof supabase.auth.signInWithPassword>;
  signUp: (params: SignUpParams) => ReturnType<typeof supabase.auth.signUp>;
  signOut: () => ReturnType<typeof supabase.auth.signOut>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Single source of truth for "who is logged in and what role are they".
 * `profile` mirrors the `profiles` table row (name, role, phone, address...).
 * Every dashboard route reads `role` from here instead of localStorage,
 * so RLS on the server and routing on the client always agree.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) return setProfile(null);
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error) setProfile(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      await loadProfile(session?.user?.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      await loadProfile(session?.user?.id);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = (email: string, password: string) => supabase.auth.signInWithPassword({ email, password });

  const signUp = ({ email, password, name, role, phone, address }: SignUpParams) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role, phone, address } },
    });

  const signOut = () => supabase.auth.signOut();

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role: (profile?.role as UserRole) ?? null,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
