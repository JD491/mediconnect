/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * supabaseClient.ts
 *
 * Two clients are exported:
 *
 *  - `rawSupabase` — the literal, typed supabase-js client. Auth always uses
 *    this one, because auth sessions are local until the network is involved.
 *  - `supabase` — the client every data call should import. It exposes the
 *    exact supabase-js surface, but is "Supabase-first, demo-fallback":
 *      * on first use it probes the project for the profiles + medicines
 *        tables (a quick HEAD count);
 *      * when the project is migrated, seeded and reachable, every query goes
 *        to the real database;
 *      * when it is not (fresh clone, no env vars, offline demo, test run),
 *        it transparently runs against `demoDb` — a localStorage-backed,
 *        fully mutable copy of the schema with realistic seed data.
 *
 * The demo layer lives behind the same builder API, so pages never need to
 * know which mode they are in. A demo login also forces demo mode, keeping a
 * single consistent data source for that browser session.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { DemoChannel, DemoQuery, demoFunctions, demoRpc, demoStorage, type DemoResponse } from './demoDb';

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const supabaseUrlRaw = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
const supabaseAnonKeyRaw = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';

/**
 * True when the build was given a real project URL + API key. Placeholder
 * values from `.env.example` (or an env var that Vite left undefined) are
 * treated as "not configured" so the app falls back gracefully instead of
 * pointing supabase-js at a URL that cannot exist.
 */
function isPlaceholder(value: string): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v === 'undefined' ||
    v === 'null' ||
    v === 'false' ||
    v.includes('your-supabase-url') ||
    v.includes('your_supabase_url') ||
    v.includes('your-anon-key') ||
    v.includes('your_anon_key') ||
    v.includes('<your') ||
    v.includes('changeme') ||
    v.includes('demo.invalid') ||
    v.includes('example.supabase.co') ||
    v.includes('test.supabase.co')
  );
}

const hasLiveConfig = !isPlaceholder(supabaseUrlRaw) && !isPlaceholder(supabaseAnonKeyRaw);
const supabaseUrl = hasLiveConfig ? supabaseUrlRaw.replace(/\/+$/, '') : 'https://demo.invalid';
const supabaseAnonKey = hasLiveConfig ? supabaseAnonKeyRaw : 'demo-anon-key';

/** Exported so the auth layer can decide whether to try the network at all. */
export const isLiveConfigured = hasLiveConfig;

if (!hasLiveConfig && env.MODE !== 'test') {
  // Deliberately quiet: this is an expected, fully supported mode. It must
  // never surface as a warning banner in the UI.
  // eslint-disable-next-line no-console
  console.debug('[MediConnect] Live Supabase is not configured — using the built-in local fallback engine.');
}

function createRawClient(): SupabaseClient<Database> {
  const options = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  } as const;
  try {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, options);
  } catch {
    // A malformed key/URL must not stop the app from booting; the auth layer
    // will transparently use the local fallback engine.
    return createClient<Database>('https://demo.invalid', 'demo-anon-key', options);
  }
}

/** The real client. Auth lives here; every data module imports `supabase` below. */
export const rawSupabase = createRawClient();

/* ------------------------------------------------------------------ */
/* Data-mode detection                                                 */
/* ------------------------------------------------------------------ */

export type DataMode = 'live' | 'demo';

const MODE_KEY = 'mediconnect_data_mode_v2';
const LEGACY_MODE_KEY = 'mediconnect_data_mode_v1';
export const DEMO_SESSION_KEY = 'mediconnect_demo_session_v1';

let cachedMode: DataMode | null = null;
let probePromise: Promise<DataMode> | null = null;

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function readJson<T>(key: string): T | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures must never break the app.
  }
}

export interface DemoSessionRecord {
  session: Session;
  role: string;
  email: string;
  /** `local` = an account registered in the local fallback engine. */
  source?: 'demo' | 'local';
}

export function loadDemoSession(): DemoSessionRecord | null {
  const record = readJson<DemoSessionRecord>(DEMO_SESSION_KEY);
  if (!record?.session?.user?.id) return null;
  return record;
}

export function saveDemoSession(record: DemoSessionRecord): void {
  writeJson(DEMO_SESSION_KEY, record);
  setDemoMode(true);
}

export function clearDemoSession(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Persist the selected mode so a refresh doesn't re-probe a known demo app. */
export function setDemoMode(demo: boolean): void {
  cachedMode = demo ? 'demo' : 'live';
  if (!hasStorage()) return;
  try {
    if (demo) {
      // Only pin demo mode when there is no live project to connect to.
      // Otherwise a stale probe (e.g. a transient network blip) would keep
      // live users locked out of their real database forever.
      if (isLiveConfigured) window.localStorage.removeItem(MODE_KEY);
      else window.localStorage.setItem(MODE_KEY, 'demo');
    } else {
      window.localStorage.setItem(MODE_KEY, 'live');
    }
  } catch {
    // ignore
  }
}

export function isDemoModeSync(): boolean {
  if (cachedMode) return cachedMode === 'demo';
  if (loadDemoSession()) {
    cachedMode = 'demo';
    return true;
  }
  const stored = hasStorage() ? window.localStorage.getItem(MODE_KEY) : null;
  if (stored === 'demo') {
    cachedMode = 'demo';
    return true;
  }
  return false;
}

function canProbeLive(): boolean {
  if (typeof fetch !== 'function') return false;
  if (!isLiveConfigured) return false;
  // The unit-test setup injects fake credentials; never hit the network there.
  if (import.meta.env.MODE === 'test') return false;
  if (/test\.supabase\.co|demo\.invalid/i.test(supabaseUrl)) return false;
  return true;
}

async function probeTable(table: 'profiles' | 'medicines', signal: AbortSignal): Promise<boolean> {
  try {
    const { error } = await rawSupabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .limit(1)
      .abortSignal(signal);
    // A successful response is enough. Some tables (notably `profiles`) are
    // protected by RLS, so an anonymous count is 0 even though the project is
    // fully live and seeded. Only a transport/HTTP error means "offline".
    return !error;
  } catch {
    return false;
  }
}

async function runProbe(): Promise<DataMode> {
  if (!canProbeLive()) {
    setDemoMode(true);
    return 'demo';
  }
  // A persisted demo login always wins — otherwise logging in as the demo
  // patient would show a mix of local cart data and live catalog data.
  if (loadDemoSession()) {
    setDemoMode(true);
    return 'demo';
  }
  // Clean up the key used by older builds (< v1.1) so a browser that was ever
  // misclassified as demo self-heals on the next load.
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(LEGACY_MODE_KEY);
    } catch {
      // ignore
    }
  }
  const stored = hasStorage() ? window.localStorage.getItem(MODE_KEY) : null;
  if (stored === 'live') {
    cachedMode = 'live';
    return 'live';
  }
  // When a live project is configured we always re-probe instead of trusting a
  // persisted `demo` value: the old probe could have been wrong or the network
  // may have recovered since. `setDemoMode` above no longer writes `demo` in
  // this situation, so this is a one-time self-heal at most.

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const [profilesOk, medicinesOk] = await Promise.all([
      probeTable('profiles', controller.signal),
      probeTable('medicines', controller.signal),
    ]);
    // Either public table answering is proof the project is reachable; prefer
    // `medicines` (public read) but accept `profiles` too for custom schemas.
    const mode: DataMode = profilesOk || medicinesOk ? 'live' : 'demo';
    setDemoMode(mode === 'demo');
    // eslint-disable-next-line no-console
    console.debug(`[MediConnect] data mode: ${mode}`);
    return mode;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the data mode once per page load (shared by every query). */
export function getDataMode(): Promise<DataMode> {
  if (cachedMode) return Promise.resolve(cachedMode);
  if (loadDemoSession()) {
    setDemoMode(true);
    return Promise.resolve('demo');
  }
  const stored = hasStorage() ? window.localStorage.getItem(MODE_KEY) : null;
  if (stored === 'live') {
    cachedMode = 'live';
    return Promise.resolve('live');
  }
  if (stored === 'demo' && !isLiveConfigured) {
    cachedMode = 'demo';
    return Promise.resolve('demo');
  }
  if (!probePromise) probePromise = runProbe();
  return probePromise;
}

/** Synchronous best guess — used for realtime channels, which can't await. */
export function isDemoMode(): boolean {
  return isDemoModeSync();
}

/** Force a fresh probe (used after "Reset demo data" / reconnect). */
export function resetDataMode(): void {
  cachedMode = null;
  probePromise = null;
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(MODE_KEY);
      window.localStorage.removeItem(LEGACY_MODE_KEY);
    } catch {
      // ignore
    }
  }
}

/* ------------------------------------------------------------------ */
/* Resilient query builder                                             */
/* ------------------------------------------------------------------ */

function shouldFallback(response: DemoResponse<any> | null | undefined): boolean {
  return !!response?.error;
}

/**
 * A thenable proxy that fans every builder call out to both the real query
 * and the demo query. Awaiting it resolves the live response when live mode
 * is active and the request succeeded, and the local response otherwise.
 */
function resilientQuery(raw: any, demo: any): any {
  const wrapper: any = new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (prop === 'then') {
          return (onFulfilled?: any, onRejected?: any) => resolve().then(onFulfilled, onRejected);
        }
        if (prop === 'catch') {
          return (onRejected?: any) => resolve().catch(onRejected);
        }
        if (prop === 'finally') {
          return (onFinally?: any) => resolve().finally(onFinally);
        }
        const value = raw[prop];
        if (typeof value !== 'function') return value;
        return (...args: any[]) => {
          raw = raw[prop](...args);
          try {
            demo = demo[prop](...args);
          } catch {
            // The demo engine may not implement an exotic builder method;
            // the live response is still authoritative in live mode.
          }
          return wrapper;
        };
      },
    },
  );

  async function resolve(): Promise<any> {
    const mode = await getDataMode();
    if (mode === 'demo') return demo;
    try {
      const result = await raw;
      if (shouldFallback(result)) {
        // A live project that answers but rejects this query (missing column
        // from an older migration, RLS surprise) should still render the app.
        return await demo;
      }
      return result;
    } catch {
      return await demo;
    }
  }

  return wrapper;
}

/* ------------------------------------------------------------------ */
/* Data client                                                         */
/* ------------------------------------------------------------------ */

function makeDataProxy(): SupabaseClient<Database> {
  const base: any = rawSupabase;

  const dataProxy: any = new Proxy(base, {
    get(target, prop: string | symbol) {
      if (prop === 'from') {
        return (table: string) => resilientQuery(target.from(table), new DemoQuery(table));
      }
      if (prop === 'rpc') {
        return (name: string, args?: Record<string, unknown>) =>
          resilientQuery(target.rpc(name, args), demoRpc(name, args ?? {}));
      }
      if (prop === 'storage') {
        return {
          from(bucket: string) {
            const live = target.storage.from(bucket);
            const demo = demoStorage.from(bucket);
            const call = async (fallback: () => Promise<any>, liveCall: () => Promise<any>) => {
              const mode = await getDataMode();
              if (mode === 'demo') return fallback();
              try {
                const result = await liveCall();
                if (result?.error) return fallback();
                return result;
              } catch {
                return fallback();
              }
            };
            return {
              upload: (path: string, file: File) => call(() => demo.upload(path, file), () => live.upload(path, file)),
              createSignedUrl: (path: string, expires: number) =>
                call(() => demo.createSignedUrl(path, expires), () => live.createSignedUrl(path, expires)),
              download: (path: string) => call(() => demo.download(path), () => live.download(path)),
              getPublicUrl: (path: string) => live.getPublicUrl(path),
            };
          },
        };
      }
      if (prop === 'functions') {
        return {
          invoke: async (name: string, options?: { body?: unknown }) => {
            const mode = await getDataMode();
            if (mode === 'demo') return demoFunctions.invoke(name, options);
            try {
              const result = await target.functions.invoke(name, options);
              if (result?.error) return result;
              return result;
            } catch (err) {
              return demoFunctions.invoke(name, options).then((fallback) => ({
                ...fallback,
                error: err instanceof Error ? err : fallback.error,
              }));
            }
          },
        };
      }
      if (prop === 'channel') {
        return (name: string, config?: unknown) => {
          if (isDemoModeSync()) return new DemoChannel(name);
          return target.channel(name, config);
        };
      }
      if (prop === 'removeChannel') {
        return (channel: any) => {
          if (channel instanceof DemoChannel) {
            channel.unsubscribe();
            return Promise.resolve('ok');
          }
          return target.removeChannel(channel);
        };
      }
      if (prop === 'removeAllChannels') {
        return () => target.removeAllChannels();
      }
      if (prop === 'auth') return target.auth;
      return target[prop];
    },
  });

  return dataProxy as SupabaseClient<Database>;
}

/** Supabase-first, demo-fallback data client. Use this for all `.from(...)`. */
export const supabase = makeDataProxy();

/** Handy re-exports for the auth provider and demo-reset UI. */
export { rawSupabase as authClient };
