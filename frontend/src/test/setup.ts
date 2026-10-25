// Vitest global setup — extends `expect` with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom/vitest';

// Stub Supabase env vars for the test environment. `supabaseClient.ts` calls
// `createClient` at import time, so any test that transitively imports
// AuthContext/supabaseClient (directly or via a component under test) will
// throw "supabaseUrl is required" during collection unless these are set.
// Values are fake and never used for real network calls — tests that need
// specific Supabase responses should mock `src/lib/supabaseClient`.
import.meta.env.VITE_SUPABASE_URL ??= 'https://test.supabase.co';
import.meta.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key';
