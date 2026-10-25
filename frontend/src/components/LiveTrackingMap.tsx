import { FiHome, FiTruck, FiMapPin } from 'react-icons/fi';
import { projectToBox, type GeoPoint } from '../lib/geolocation';

interface LiveTrackingMapProps {
  customer: GeoPoint;
  store: GeoPoint;
  partner?: GeoPoint | null;
  storeName?: string;
  statusLabel?: string;
  partnerName?: string;
  orderId: number | string;
}

/**
 * Dependency-free live map (inline SVG) showing store → delivery partner →
 * customer. Avoids a paid maps SDK/API key while still giving a real spatial
 * view of the delivery, with the three pins projected from actual coordinates.
 */
export default function LiveTrackingMap({
  customer, store, partner, storeName, statusLabel, partnerName, orderId,
}: LiveTrackingMapProps) {
  const points = [customer, store, ...(partner ? [partner] : [])];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
  const width = 640;
  const height = 240;
  const storePos = projectToBox(store, bounds, width, height);
  const customerPos = projectToBox(customer, bounds, width, height);
  const partnerPos = partner ? projectToBox(partner, bounds, width, height) : null;
  const path = partnerPos
    ? `M ${storePos.x} ${storePos.y} L ${partnerPos.x} ${partnerPos.y} L ${customerPos.x} ${customerPos.y}`
    : `M ${storePos.x} ${storePos.y} L ${customerPos.x} ${customerPos.y}`;

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-extrabold text-[#0f2340] flex items-center gap-2"><FiMapPin className="text-brand-600" /> Live delivery map</h3>
          <p className="text-[11px] text-[#5b7088]">
            Order #{orderId}{storeName ? ` · from ${storeName}` : ''}{statusLabel ? ` · ${statusLabel}` : ''}
          </p>
        </div>
        {partnerName && (
          <span className="badge bg-brand-100 text-brand-700 flex items-center gap-1"><FiTruck size={11} /> {partnerName}</span>
        )}
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-[#eef4fb]">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Delivery route map" className="w-full h-[200px]">
          <defs>
            <pattern id={`grid-${orderId}`} width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dbe7f5" strokeWidth="1" />
            </pattern>
            <linearGradient id={`route-${orderId}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1e4fb8" />
              <stop offset="100%" stopColor="#12a594" />
            </linearGradient>
          </defs>
          <rect width={width} height={height} fill={`url(#grid-${orderId})`} />
          {/* A few decorative "roads" so the map reads as a map at a glance. */}
          <path d={`M 0 ${height * 0.7} Q ${width * 0.35} ${height * 0.55} ${width} ${height * 0.62}`} fill="none" stroke="#e2ebf7" strokeWidth="12" />
          <path d={`M ${width * 0.25} 0 L ${width * 0.35} ${height}`} fill="none" stroke="#e2ebf7" strokeWidth="9" />
          <path d={path} fill="none" stroke={`url(#route-${orderId})`} strokeWidth="4" strokeDasharray="8 6" strokeLinecap="round" />
          {/* Store */}
          <g transform={`translate(${storePos.x}, ${storePos.y})`}>
            <circle r="13" fill="#ffffff" stroke="#1e4fb8" strokeWidth="3" />
            <circle r="5" fill="#1e4fb8" />
            <text y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#33475b">Store</text>
          </g>
          {/* Delivery partner */}
          {partnerPos && (
            <g transform={`translate(${partnerPos.x}, ${partnerPos.y})`}>
              <circle r="13" fill="#ffffff" stroke="#f59e0b" strokeWidth="3" />
              <circle r="5" fill="#f59e0b" />
              <text y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#b45309">Partner</text>
            </g>
          )}
          {/* Customer */}
          <g transform={`translate(${customerPos.x}, ${customerPos.y})`}>
            <circle r="13" fill="#ffffff" stroke="#12a594" strokeWidth="3" />
            <circle r="5" fill="#12a594" />
            <text y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f766e">You</text>
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] font-bold text-[#5b7088]">
        <span className="flex items-center gap-1"><FiHome className="text-brand-600" /> Store</span>
        {partnerPos && <span className="flex items-center gap-1"><FiTruck className="text-amber-500" /> Delivery partner</span>}
        <span className="flex items-center gap-1"><FiMapPin className="text-emerald-600" /> Your address</span>
        <span className="ml-auto text-[#8a9bb0]">Route is indicative; positions update with the order.</span>
      </div>
    </div>
  );
}
