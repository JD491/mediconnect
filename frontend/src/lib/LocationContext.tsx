import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  DEFAULT_HUB, DELIVERY_HUBS, geocodePincode, getCurrentPosition, haversineKm,
  hubById, isValidPincode, nearestHub, reverseGeocode,
  type DeliveryHub, type GeoPoint,
} from './geolocation';

export type LocationSource = 'gps' | 'manual' | 'hub' | 'saved';

export interface UserLocation extends GeoPoint {
  label: string;
  city: string;
  state: string;
  pincode: string;
  source: LocationSource;
  updatedAt: string;
}

export type AddressTag = 'Home' | 'Work' | 'Other';

export interface SavedAddress {
  id: string;
  tag: AddressTag;
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  notes?: string;
  lat?: number;
  lng?: number;
}

interface PersistedLocation {
  location: UserLocation;
  savedAddresses: SavedAddress[];
}

interface LocationContextValue {
  location: UserLocation;
  hub: DeliveryHub;
  savedAddresses: SavedAddress[];
  status: 'idle' | 'locating' | 'ready' | 'error';
  error: string;
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  detectGps: () => Promise<boolean>;
  locateByPincode: (pincode: string) => Promise<boolean>;
  selectHub: (hubId: string) => void;
  setLocation: (patch: Partial<UserLocation> & GeoPoint) => void;
  saveAddress: (address: Omit<SavedAddress, 'id'> & { id?: string }) => SavedAddress;
  removeAddress: (id: string) => void;
  useSavedAddress: (address: SavedAddress) => void;
  distanceTo: (point: { lat?: number | null; lng?: number | null; latitude?: number | null; longitude?: number | null } | null | undefined) => number | null;
  distanceKm: number | null;
}

const STORAGE_KEY = 'mediconnect_location_v1';

const DEFAULT_LOCATION: UserLocation = {
  lat: DEFAULT_HUB.lat,
  lng: DEFAULT_HUB.lng,
  label: DEFAULT_HUB.label,
  city: DEFAULT_HUB.city,
  state: DEFAULT_HUB.state,
  pincode: DEFAULT_HUB.pincode,
  source: 'hub',
  updatedAt: new Date(0).toISOString(),
};

function readPersisted(): PersistedLocation {
  if (typeof window === 'undefined') return { location: DEFAULT_LOCATION, savedAddresses: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { location: DEFAULT_LOCATION, savedAddresses: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedLocation>;
    const location = parsed.location && typeof parsed.location.lat === 'number'
      ? { ...DEFAULT_LOCATION, ...parsed.location }
      : DEFAULT_LOCATION;
    return { location, savedAddresses: Array.isArray(parsed.savedAddresses) ? parsed.savedAddresses : [] };
  } catch {
    return { location: DEFAULT_LOCATION, savedAddresses: [] };
  }
}

function persist(location: UserLocation, savedAddresses: SavedAddress[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ location, savedAddresses }));
  } catch {
    // Private mode/quota — the in-memory context still works.
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `addr-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const LocationContext = createContext<LocationContextValue | null>(null);

/**
 * Global "where are we delivering?" state.
 *
 * Supabase-backed data remains the source of truth for stores and stock; this
 * context only supplies the customer's coordinates so the marketplace can
 * sort by distance, hide out-of-radius stores, quote a real delivery fee and
 * show the live tracking map. The choice persists in localStorage.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(readPersisted, []);
  const [location, setLocationState] = useState<UserLocation>(initial.location);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(initial.savedAddresses);
  const [status, setStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('ready');
  const [error, setError] = useState('');
  const [isPickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    persist(location, savedAddresses);
  }, [location, savedAddresses]);

  const commit = useCallback((next: UserLocation) => {
    setLocationState(next);
    setStatus('ready');
    setError('');
  }, []);

  const detectGps = useCallback(async (): Promise<boolean> => {
    setStatus('locating');
    setError('');
    try {
      const point = await getCurrentPosition();
      const hub = nearestHub(point);
      let label = `${hub.label} (near you)`;
      let city = hub.city;
      let state = hub.state;
      let pincode = hub.pincode;
      const resolved = await reverseGeocode(point);
      if (resolved) {
        label = resolved.label;
        city = resolved.city;
        state = resolved.state || hub.state;
        pincode = resolved.pincode || hub.pincode;
      }
      commit({ ...point, label, city, state, pincode, source: 'gps', updatedAt: new Date().toISOString() });
      return true;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not detect your location.');
      return false;
    }
  }, [commit]);

  const locateByPincode = useCallback(async (pincode: string): Promise<boolean> => {
    if (!isValidPincode(pincode)) {
      setStatus('error');
      setError('Enter a valid 6-digit Indian PIN code.');
      return false;
    }
    setStatus('locating');
    setError('');
    const resolved = await geocodePincode(pincode);
    if (!resolved) {
      setStatus('error');
      setError('We could not find that PIN code. Pick a delivery hub instead.');
      return false;
    }
    commit({
      lat: resolved.lat, lng: resolved.lng, label: `${resolved.city} ${resolved.pincode}`,
      city: resolved.city, state: resolved.state, pincode: resolved.pincode,
      source: 'manual', updatedAt: new Date().toISOString(),
    });
    return true;
  }, [commit]);

  const selectHub = useCallback((hubId: string) => {
    const hub = hubById(hubId) ?? DEFAULT_HUB;
    commit({
      lat: hub.lat, lng: hub.lng, label: hub.label, city: hub.city, state: hub.state,
      pincode: hub.pincode, source: 'hub', updatedAt: new Date().toISOString(),
    });
  }, [commit]);

  const setLocation = useCallback((patch: Partial<UserLocation> & GeoPoint) => {
    setLocationState((current) => ({
      ...current, ...patch, updatedAt: new Date().toISOString(), source: patch.source ?? current.source,
    }));
    setStatus('ready');
  }, []);

  const saveAddress = useCallback((address: Omit<SavedAddress, 'id'> & { id?: string }): SavedAddress => {
    const saved: SavedAddress = { ...address, id: address.id ?? makeId() };
    setSavedAddresses((list) => {
      const without = list.filter((a) => a.id !== saved.id);
      return [saved, ...without].slice(0, 8);
    });
    return saved;
  }, []);

  const removeAddress = useCallback((id: string) => {
    setSavedAddresses((list) => list.filter((a) => a.id !== id));
  }, []);

  const useSavedAddress = useCallback((address: SavedAddress) => {
    if (typeof address.lat !== 'number' || typeof address.lng !== 'number') {
      setLocationState((current) => ({
        ...current,
        city: address.city,
        pincode: address.pincode,
        label: `${address.tag} · ${address.city} ${address.pincode}`,
        source: 'saved',
        updatedAt: new Date().toISOString(),
      }));
      return;
    }
    setLocationState({
      lat: address.lat,
      lng: address.lng,
      city: address.city,
      state: '',
      pincode: address.pincode,
      label: `${address.tag} · ${address.city}`,
      source: 'saved',
      updatedAt: new Date().toISOString(),
    });
    setStatus('ready');
    setError('');
  }, []);

  const distanceTo = useCallback((point: { lat?: number | null; lng?: number | null; latitude?: number | null; longitude?: number | null } | null | undefined): number | null => {
    const lat = typeof point?.lat === 'number' ? point.lat : point?.latitude;
    const lng = typeof point?.lng === 'number' ? point.lng : point?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return haversineKm(location, { lat, lng });
  }, [location]);

  const hub = useMemo(() => hubById(location.pincode) ?? nearestHub(location), [location]);
  const distanceKm = useMemo(() => haversineKm(location, hub), [location, hub]);

  const value: LocationContextValue = {
    location,
    hub,
    savedAddresses,
    status,
    error,
    isPickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    detectGps,
    locateByPincode,
    selectHub,
    setLocation,
    saveAddress,
    removeAddress,
    useSavedAddress,
    distanceTo,
    distanceKm,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
}

/** Convenience for code that wants hubs without touching context. */
export { DELIVERY_HUBS };
export type { DeliveryHub, GeoPoint };
