/**
 * geolocation.ts — GPS, Indian delivery hubs, reverse geocoding and the
 * distance/ETA/fee rules used across the marketplace.
 *
 * Pure helpers (haversine, fee maths, formatting) are exported separately so
 * they can be unit-tested without a browser or network.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryHub extends GeoPoint {
  id: string;
  city: string;
  state: string;
  pincode: string;
  label: string;
}

/** The seven serviceable metro hubs. Distances are measured from here when
 * GPS is unavailable, and the hub picker lets a visitor switch instantly. */
export const DELIVERY_HUBS: DeliveryHub[] = [
  { id: 'kalyan', city: 'Kalyan', state: 'Maharashtra', pincode: '421301', label: 'Kalyan, Thane', lat: 19.2437, lng: 73.1355 },
  { id: 'thane', city: 'Thane', state: 'Maharashtra', pincode: '400601', label: 'Thane West', lat: 19.2183, lng: 72.9781 },
  { id: 'mumbai', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', label: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { id: 'pune', city: 'Pune', state: 'Maharashtra', pincode: '411001', label: 'Pune', lat: 18.5204, lng: 73.8567 },
  { id: 'delhi', city: 'New Delhi', state: 'Delhi', pincode: '110001', label: 'New Delhi', lat: 28.6139, lng: 77.209 },
  { id: 'bengaluru', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', label: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { id: 'hyderabad', city: 'Hyderabad', state: 'Telangana', pincode: '500001', label: 'Hyderabad', lat: 17.385, lng: 78.4867 },
];

export const DEFAULT_HUB = DELIVERY_HUBS[0]!;

export const FREE_DELIVERY_MIN_SUBTOTAL = 499;
export const LOCAL_DELIVERY_FEE = 25;
export const EXTENDED_DELIVERY_FEE = 45;
export const EXPRESS_RADIUS_KM = 5;
export const SAME_DAY_RADIUS_KM = 15;

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres, rounded to one decimal. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function nearestHub(point: GeoPoint): DeliveryHub {
  let best = DEFAULT_HUB;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hub of DELIVERY_HUBS) {
    const d = haversineKm(point, hub);
    if (d < bestDistance) {
      best = hub;
      bestDistance = d;
    }
  }
  return best;
}

export function hubById(id: string): DeliveryHub | undefined {
  return DELIVERY_HUBS.find((h) => h.id === id);
}

export function hubByPincode(pincode: string): DeliveryHub | undefined {
  const clean = pincode.replace(/\D/g, '').slice(0, 6);
  return DELIVERY_HUBS.find((h) => h.pincode === clean);
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return '—';
  if (km < 1) return `${Math.max(100, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

export function deliverySpeed(km: number | null | undefined): 'express' | 'same_day' | 'scheduled' {
  if (km === null || km === undefined) return 'scheduled';
  if (km < EXPRESS_RADIUS_KM) return 'express';
  if (km < SAME_DAY_RADIUS_KM) return 'same_day';
  return 'scheduled';
}

export function etaLabel(km: number | null | undefined): string {
  const speed = deliverySpeed(km);
  if (speed === 'express') return 'Express · 30–45 min';
  if (speed === 'same_day') return 'Same day · 2–4 hrs';
  return 'Scheduled · next day';
}

export function speedLabel(km: number | null | undefined): string {
  const speed = deliverySpeed(km);
  if (speed === 'express') return 'Express';
  if (speed === 'same_day') return 'Same day';
  return 'Scheduled';
}

/** Distance-aware fee. Free above the threshold or when the customer self-picks. */
export function deliveryFeeFor(
  subtotal: number,
  distanceKm: number | null | undefined,
  selfPickup = false,
): number {
  if (selfPickup || subtotal <= 0 || subtotal >= FREE_DELIVERY_MIN_SUBTOTAL) return 0;
  if (distanceKm === null || distanceKm === undefined) return EXTENDED_DELIVERY_FEE;
  return distanceKm <= 3 ? LOCAL_DELIVERY_FEE : EXTENDED_DELIVERY_FEE;
}

export function isServiceable(distanceKm: number | null | undefined, radiusKm: number | null | undefined): boolean {
  if (distanceKm === null || distanceKm === undefined) return true;
  if (radiusKm === null || radiusKm === undefined || radiusKm <= 0) return true;
  return distanceKm <= radiusKm;
}

export function isValidPincode(value: string): boolean {
  return /^[1-9]\d{5}$/.test(value.trim());
}

export interface GeocodeResult extends GeoPoint {
  label: string;
  city: string;
  state: string;
  pincode: string;
}

interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface NominatimResponse {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

async function nominatim(path: string, signal?: AbortSignal): Promise<NominatimResponse | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as NominatimResponse;
  } catch {
    return null;
  }
}

/** Reverse-geocode coordinates into a human "Suburb, City" label. */
export async function reverseGeocode(point: GeoPoint, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const data = await nominatim(
    `reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${point.lat}&lon=${point.lng}`,
    signal,
  );
  if (!data || data.error) return null;
  const address = data.address ?? {};
  const city = address.city ?? address.town ?? address.village ?? address.state_district ?? address.state ?? 'India';
  const area = address.suburb ?? address.neighbourhood ?? address.road ?? '';
  return {
    lat: Number(data.lat ?? point.lat),
    lng: Number(data.lon ?? point.lng),
    label: area ? `${area}, ${city}` : (data.display_name?.split(',').slice(0, 2).join(', ') ?? city),
    city,
    state: address.state ?? '',
    pincode: (address.postcode ?? '').replace(/\D/g, '').slice(0, 6),
  };
}

/** Look up an Indian PIN code (falls back to the built-in hub list offline). */
export async function geocodePincode(pincode: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const clean = pincode.replace(/\D/g, '').slice(0, 6);
  if (!isValidPincode(clean)) return null;

  const hub = hubByPincode(clean);
  const data = await nominatim(
    `search?format=jsonv2&addressdetails=1&countrycodes=in&limit=1&accept-language=en&postalcode=${clean}`,
    signal,
  );
  if (data && !data.error && data.lat && data.lon) {
    const address = data.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? address.state_district ?? hub?.city ?? 'India';
    return {
      lat: Number(data.lat),
      lng: Number(data.lon),
      label: `${city} ${clean}`,
      city,
      state: address.state ?? hub?.state ?? '',
      pincode: clean,
    };
  }
  if (hub) return { lat: hub.lat, lng: hub.lng, label: hub.label, city: hub.city, state: hub.state, pincode: clean };
  return null;
}

/** Browser GPS wrapper with a friendly timeout. */
export function getCurrentPosition(timeoutMs = 9000): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location services are not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const message = err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Pick a hub or enter your PIN code instead.'
          : err.code === err.TIMEOUT
            ? 'GPS timed out. Pick a hub or enter your PIN code instead.'
            : 'Could not get your location. Pick a hub or enter your PIN code instead.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Approximate map projection for the inline tracking map (SVG, no API key). */
export function projectToBox(
  point: GeoPoint,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  width: number,
  height: number,
  pad = 18,
): { x: number; y: number } {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.01);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.01);
  const x = pad + ((point.lng - bounds.minLng) / lngSpan) * (width - pad * 2);
  const y = height - pad - ((point.lat - bounds.minLat) / latSpan) * (height - pad * 2);
  return { x, y };
}
