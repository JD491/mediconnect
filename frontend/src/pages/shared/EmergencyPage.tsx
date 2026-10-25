import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiPhoneCall, FiArrowLeft, FiMapPin, FiNavigation, FiCrosshair, FiAlertTriangle,
  FiClock, FiChevronDown, FiChevronUp, FiTruck, FiHeart,
} from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { useLocation } from '../../lib/LocationContext';
import { formatDistance } from '../../lib/geolocation';
import type { Database, EmergencyContactType } from '../../types/database.types';

type EmergencyContact = Database['public']['Tables']['emergency_contacts']['Row'];

const TYPE_LABEL: Record<EmergencyContactType, string> = {
  ambulance: 'Ambulance',
  hospital: 'Hospital',
  police: 'Police',
  blood_bank: 'Blood Bank',
};

const TYPE_ICON: Record<EmergencyContactType, typeof FiPhoneCall> = {
  ambulance: FiTruck,
  hospital: FiHeart,
  police: FiAlertTriangle,
  blood_bank: FiHeart,
};

const TYPE_TONE: Record<EmergencyContactType, string> = {
  ambulance: 'bg-rose-100 text-rose-700',
  hospital: 'bg-brand-100 text-brand-700',
  police: 'bg-amber-100 text-amber-700',
  blood_bank: 'bg-emerald-100 text-emerald-700',
};

const NATIONAL_LINES = [
  { label: 'All emergencies', number: '112', tone: 'bg-rose-600' },
  { label: 'Ambulance', number: '108', tone: 'bg-brand-600' },
  { label: 'Police', number: '100', tone: 'bg-slate-700' },
  { label: 'Fire', number: '101', tone: 'bg-orange-600' },
];

function travelMinutes(km: number | null): string {
  if (km === null) return '—';
  const minutes = Math.max(3, Math.round((km / 28) * 60));
  return `${minutes} min`;
}

interface RankedContact extends EmergencyContact {
  distanceKm: number | null;
}

export default function EmergencyPage() {
  const { location, detectGps, openPicker, status, distanceTo } = useLocation();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [typeFilter, setTypeFilter] = useState<EmergencyContactType | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    supabase.from('emergency_contacts').select('*').then(({ data }) => setContacts(data ?? []));
  }, []);

  const ranked = useMemo<RankedContact[]>(() => {
    return contacts
      .map((c) => ({ ...c, distanceKm: distanceTo(c) }))
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [contacts, distanceTo]);

  const filtered = useMemo(
    () => ranked.filter((c) => typeFilter === 'all' || c.type === typeFilter),
    [ranked, typeFilter],
  );
  const visible = showAll ? filtered : filtered.slice(0, 6);
  const nearest = filtered[0];

  const mapUrl = (c: EmergencyContact) => {
    if (typeof c.latitude === 'number' && typeof c.longitude === 'number') {
      return `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${c.address ?? ''}`)}`;
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <Link to="/" className="text-sm text-[#5b7088] font-bold flex items-center gap-1 mb-5"><FiArrowLeft /> Back home</Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0f2340]">Emergency Services</h1>
          <p className="text-sm text-[#5b7088]">Nearest help first. If this is life-threatening, call 112 or 108 now.</p>
        </div>
        <button type="button" onClick={openPicker}
          className="glass-card !py-2 !px-3 flex items-center gap-2 text-left card-hover">
          <FiCrosshair className="text-brand-600 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold text-[#8a9bb0] uppercase tracking-wide">Your location</span>
            <span className="block text-xs font-bold text-[#0f2340] truncate max-w-[190px]">{location.label}</span>
          </span>
          <FiChevronDown className="text-[#8a9bb0] shrink-0" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {NATIONAL_LINES.map((line) => (
          <a key={line.number} href={`tel:${line.number}`}
            className={`${line.tone} text-white rounded-2xl p-3 flex flex-col items-start gap-1 shadow-lg shadow-black/5 card-hover`}>
            <FiPhoneCall size={16} />
            <span className="text-lg font-extrabold leading-none">{line.number}</span>
            <span className="text-[10px] font-bold opacity-90">{line.label}</span>
          </a>
        ))}
      </div>

      <div className="glass-card mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2">
          <FiMapPin className="text-brand-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-[#0f2340]">Near {location.city}{location.pincode ? ` ${location.pincode}` : ''}</p>
            <p className="text-[11px] text-[#5b7088]">
              Sorted by driving distance from your saved location.
              {nearest?.distanceKm != null && ` Closest: ${nearest.name} · ${formatDistance(nearest.distanceKm)}.`}
            </p>
          </div>
        </div>
        <button type="button" onClick={detectGps} disabled={status === 'locating'}
          className="btn-ghost !py-2 !px-3 !text-xs flex items-center gap-1.5 disabled:opacity-50">
          <FiNavigation /> {status === 'locating' ? 'Detecting…' : 'Use my GPS'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(['all', 'ambulance', 'hospital', 'blood_bank', 'police'] as const).map((t) => (
          <button key={t} type="button" onClick={() => { setTypeFilter(t); setShowAll(false); }}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${typeFilter === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#5b7088]'}`}>
            {t === 'all' ? 'All services' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {visible.map((c, index) => {
          const Icon = TYPE_ICON[c.type] ?? FiPhoneCall;
          return (
            <div key={c.contact_id} className={`glass-card ${index === 0 && c.distanceKm != null ? 'ring-2 ring-rose-200' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={`badge ${TYPE_TONE[c.type] || 'bg-slate-100 text-slate-600'} inline-flex items-center gap-1`}>
                      <Icon size={10} /> {TYPE_LABEL[c.type] || c.type}
                    </span>
                    {index === 0 && c.distanceKm != null && (
                      <span className="badge bg-rose-600 text-white">Nearest</span>
                    )}
                    {c.is_24_7 && <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><FiClock size={9} /> 24×7</span>}
                    {c.distanceKm != null && (
                      <span className="badge bg-white/80 text-[#5b7088]">{formatDistance(c.distanceKm)} · ~{travelMinutes(c.distanceKm)}</span>
                    )}
                  </div>
                  <p className="font-extrabold text-[#0f2340] truncate">{c.name}</p>
                  {(c.address || c.city) && (
                    <p className="text-xs text-[#5b7088] flex items-start gap-1 mt-0.5">
                      <FiMapPin size={11} className="mt-0.5 shrink-0" /> {[c.address, c.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <a href={`tel:${c.phone}`} className="btn-primary !py-2 !px-3 !text-xs flex items-center gap-1.5">
                    <FiPhoneCall /> {c.phone}
                  </a>
                  <a href={mapUrl(c)} target="_blank" rel="noreferrer" className="btn-ghost !py-2 !px-3 !text-xs flex items-center gap-1.5">
                    <FiNavigation /> Directions
                  </a>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="glass-card">
            <p className="text-sm text-[#5b7088] mb-2">No {typeFilter === 'all' ? '' : TYPE_LABEL[typeFilter].toLowerCase()} contacts configured for this area.</p>
            <a href="tel:112" className="btn-primary !py-2 !px-4 !text-sm inline-flex items-center gap-1.5"><FiPhoneCall /> Call 112</a>
          </div>
        )}
      </div>

      {filtered.length > 6 && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full text-xs font-bold text-brand-600 flex items-center justify-center gap-1 py-2">
          {showAll ? <>Show fewer <FiChevronUp /></> : <>Show all {filtered.length} services <FiChevronDown /></>}
        </button>
      )}

      <div className="glass-card mt-4 !bg-amber-50/70 border-amber-200">
        <div className="flex items-start gap-2">
          <FiAlertTriangle className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-800">While you wait for help</p>
            <ul className="text-[11px] text-amber-800 mt-1 space-y-0.5 list-disc list-inside">
              <li>Stay with the person and keep them still; do not give food or drink.</li>
              <li>For severe bleeding, apply firm continuous pressure with a clean cloth.</li>
              <li>If unconscious and not breathing normally, start CPR if trained and ask someone to fetch an AED.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
