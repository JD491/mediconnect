import { FiMapPin, FiChevronDown, FiZap } from 'react-icons/fi';
import { useLocation } from '../lib/LocationContext';
import LocationModal from './LocationModal';

interface DeliveryBarProps {
  /** `light` suits the public landing navbar; `default` matches dashboard cards. */
  variant?: 'default' | 'light';
  className?: string;
}

/**
 * Persistent "Deliver to:" bar. Mounted once per shell (dashboard + landing)
 * and owns the single location picker modal for that tree.
 */
export default function DeliveryBar({ variant = 'default', className = '' }: DeliveryBarProps) {
  const { location, isPickerOpen, openPicker, closePicker } = useLocation();
  const isGps = location.source === 'gps';

  if (variant === 'light') {
    return (
      <>
        <button
          onClick={openPicker}
          className={`flex items-center gap-2 text-left rounded-xl px-3 py-1.5 hover:bg-white/70 transition-colors ${className}`}
          aria-label={`Deliver to ${location.label}. Change location`}
        >
          <FiMapPin className="text-brand-600 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[9px] uppercase tracking-wide font-extrabold text-[#8a9bb0]">
              Deliver to{isGps ? ' · GPS' : ''}
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-[#0f2340] max-w-[150px] truncate">
              {location.label} <FiChevronDown className="shrink-0" />
            </span>
          </span>
        </button>
        <LocationModal open={isPickerOpen} onClose={closePicker} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={openPicker}
        className={`flex items-center gap-2 rounded-xl bg-white/70 border border-white/70 hover:border-brand-300 px-3 py-1.5 transition-colors max-w-full ${className}`}
        aria-label={`Deliver to ${location.label}. Change location`}
      >
        <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><FiMapPin /></span>
        <span className="min-w-0 text-left">
          <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide font-extrabold text-[#8a9bb0]">
            Deliver to {isGps && <FiZap className="text-emerald-500" size={10} />}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-[#0f2340] truncate">
            <span className="truncate max-w-[170px]">{location.label}</span> <FiChevronDown className="shrink-0" />
          </span>
        </span>
      </button>
      <LocationModal open={isPickerOpen} onClose={closePicker} />
    </>
  );
}
