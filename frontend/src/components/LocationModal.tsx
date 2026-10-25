import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiMapPin, FiCrosshair, FiCheck, FiHome, FiBriefcase, FiMoreHorizontal, FiNavigation } from 'react-icons/fi';
import { useLocation } from '../lib/LocationContext';
import { DELIVERY_HUBS, isValidPincode } from '../lib/geolocation';
import type { SavedAddress } from '../lib/LocationContext';

interface LocationModalProps {
  open: boolean;
  onClose: () => void;
}

function tagIcon(tag: SavedAddress['tag']) {
  if (tag === 'Home') return <FiHome />;
  if (tag === 'Work') return <FiBriefcase />;
  return <FiMoreHorizontal />;
}

export default function LocationModal({ open, onClose }: LocationModalProps) {
  const {
    location, savedAddresses, status, error, detectGps, locateByPincode, selectHub, useSavedAddress: applySavedAddress,
  } = useLocation();
  const [pincode, setPincode] = useState(location.pincode);
  const [localError, setLocalError] = useState('');

  const busy = status === 'locating';

  const submitPincode = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!isValidPincode(pincode)) {
      setLocalError('Enter a valid 6-digit PIN code.');
      return;
    }
    const ok = await locateByPincode(pincode);
    if (ok) onClose();
  };

  const handleGps = async () => {
    setLocalError('');
    const ok = await detectGps();
    if (ok) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose delivery location"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-[#0f2340] flex items-center gap-2"><FiMapPin className="text-brand-600" /> Choose delivery location</h2>
                <p className="text-xs text-[#5b7088] mt-0.5">Prices, delivery time and store availability update instantly.</p>
              </div>
              <button onClick={onClose} aria-label="Close location picker" className="text-[#8a9bb0] hover:text-[#0f2340] text-xl p-1">
                <FiX />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <button
                onClick={handleGps}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 font-bold text-sm py-3 hover:bg-brand-100 disabled:opacity-60"
              >
                <FiCrosshair className={busy ? 'animate-spin' : ''} />
                {busy ? 'Locating…' : 'Use my current location (GPS)'}
              </button>

              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#5b7088] mb-2">Or enter your PIN code</p>
                <form onSubmit={submitPincode} className="flex gap-2">
                  <input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="e.g. 421301"
                    className="input-field flex-1"
                    aria-label="6-digit PIN code"
                  />
                  <button disabled={busy} className="btn-primary !px-5">Check</button>
                </form>
                {(localError || error) && <p className="text-xs font-semibold text-rose-500 mt-2">{localError || error}</p>}
              </div>

              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-[#5b7088] mb-2">Popular delivery hubs</p>
                <div className="grid grid-cols-2 gap-2">
                  {DELIVERY_HUBS.map((hub) => {
                    const active = location.pincode === hub.pincode && location.source !== 'gps';
                    return (
                      <button
                        key={hub.id}
                        onClick={() => { selectHub(hub.id); onClose(); }}
                        className={`text-left rounded-xl border px-3 py-2.5 text-sm transition-all ${
                          active
                            ? 'border-brand-500 bg-brand-50 text-brand-700 font-bold'
                            : 'border-slate-200 bg-white text-[#33475b] hover:border-brand-300'
                        }`}
                      >
                        <span className="flex items-center justify-between font-bold">
                          {hub.city}
                          {active ? <FiCheck className="text-brand-600" /> : <FiNavigation className="text-[#b8c9db]" />}
                        </span>
                        <span className="text-[10px] text-[#8a9bb0] font-semibold">{hub.pincode} · {hub.state}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {savedAddresses.length > 0 && (
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#5b7088] mb-2">Saved addresses</p>
                  <div className="space-y-2">
                    {savedAddresses.map((address) => (
                      <button
                        key={address.id}
                        onClick={() => { applySavedAddress(address); onClose(); }}
                        className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 hover:border-brand-300"
                      >
                        <span className="flex items-center gap-2 text-sm font-bold text-[#0f2340]">
                          {tagIcon(address.tag)} {address.tag}
                        </span>
                        <span className="block text-xs text-[#5b7088] mt-0.5 truncate">{address.address}, {address.city} {address.pincode}</span>
                        {address.notes && <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">Note: {address.notes}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-[#8a9bb0] leading-relaxed">
                We use your location only to find nearby pharmacies and estimate delivery. GPS lookups use
                OpenStreetMap Nominatim; nothing is stored on a server.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
