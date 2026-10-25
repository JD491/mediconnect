import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check your .env file.');
}

/** Typed Supabase client — every `.from('table')` call is now checked against {@link Database}. */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
