import { useState, type ChangeEvent } from 'react';
import { FiMapPin, FiCrosshair, FiCheck, FiHome, FiBriefcase, FiMoreHorizontal, FiSave } from 'react-icons/fi';
import type { CheckoutAddressForm } from '../../../../types/cart';
import { useLocation, type AddressTag, type SavedAddress } from '../../../../lib/LocationContext';

interface AddressStepProps {
  form: CheckoutAddressForm;
  onChange: (patch: Partial<CheckoutAddressForm>) => void;
  selfPickup: boolean;
  onSelfPickupChange: (value: boolean) => void;
}

const TAGS: { value: AddressTag; icon: typeof FiHome }[] = [
  { value: 'Home', icon: FiHome },
  { value: 'Work', icon: FiBriefcase },
  { value: 'Other', icon: FiMoreHorizontal },
];

function tagIcon(tag: AddressTag) {
  const found = TAGS.find((t) => t.value === tag);
  const Icon = found?.icon ?? FiMoreHorizontal;
  return <Icon />;
}

export default function AddressStep({ form, onChange, selfPickup, onSelfPickupChange }: AddressStepProps) {
  const { location, savedAddresses, saveAddress, detectGps, status } = useLocation();
  const [tag, setTag] = useState<AddressTag>('Home');
  const [notes, setNotes] = useState(form.delivery_notes ?? '');
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const onField = (key: keyof CheckoutAddressForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ [key]: e.target.value } as Partial<CheckoutAddressForm>);

  const applyLocation = (address: string, city: string, pincode: string) => {
    onChange({ address, city, pincode });
  };

  const handleGps = async () => {
    setGpsError('');
    const ok = await detectGps();
    if (!ok) {
      setGpsError('Could not get GPS. You can still type your address or pick a saved one.');
      return;
    }
    applyLocation(location.label, location.city, location.pincode);
  };

  const applySavedAddress = (address: SavedAddress) => {
    onChange({ name: address.name || form.name, phone: address.phone || form.phone, address: address.address, city: address.city, pincode: address.pincode });
    setNotes(address.notes ?? '');
  };

  const rememberAddress = () => {
    saveAddress({
      tag,
      name: form.name,
      phone: form.phone,
      address: form.address,
      city: form.city,
      pincode: form.pincode,
      notes,
      lat: location.lat,
      lng: location.lng,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="glass-card max-w-xl mx-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-extrabold text-[#0f2340]">Delivery Address</h3>
          <p className="text-xs text-[#5b7088]">Prices and delivery fees are calculated from this address.</p>
        </div>
        <button type="button" onClick={handleGps} disabled={status === 'locating'}
          className="btn-ghost !py-1.5 !text-xs flex items-center gap-1.5 shrink-0">
          <FiCrosshair className={status === 'locating' ? 'animate-spin' : ''} />
          {status === 'locating' ? 'Locating…' : 'Use GPS'}
        </button>
      </div>

      {savedAddresses.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {savedAddresses.map((address) => (
            <button key={address.id} type="button" onClick={() => applySavedAddress(address)}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-brand-300">
              <span className="flex items-center gap-1 text-[11px] font-extrabold text-[#0f2340]">{tagIcon(address.tag)} {address.tag}</span>
              <span className="block text-[10px] text-[#5b7088] max-w-[150px] truncate">{address.address}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <label className="sr-only" htmlFor="ck-name">Full name</label>
        <input id="ck-name" placeholder="Full name" value={form.name} onChange={onField('name')} className="input-field" />
        <label className="sr-only" htmlFor="ck-phone">Phone</label>
        <input id="ck-phone" placeholder="Phone" value={form.phone} onChange={onField('phone')} className="input-field" />
        <label className="sr-only" htmlFor="ck-address">Address</label>
        <textarea id="ck-address" placeholder="House / flat, street, area" value={form.address} onChange={onField('address')} className="input-field" rows={2} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="City" aria-label="City" value={form.city} onChange={onField('city')} className="input-field" />
          <input placeholder="PIN code" aria-label="PIN code" inputMode="numeric" value={form.pincode}
            onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="input-field" />
        </div>
        <label className="sr-only" htmlFor="ck-notes">Delivery notes</label>
        <input id="ck-notes" placeholder="Delivery notes (e.g. ring bell, leave with guard)" value={notes}
          onChange={(e) => { setNotes(e.target.value); onChange({ delivery_notes: e.target.value }); }} className="input-field" />
      </div>

      {gpsError && <p className="text-xs font-semibold text-rose-500 mt-2">{gpsError}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a9bb0]">Save as</span>
        {TAGS.map(({ value, icon: Icon }) => (
          <button key={value} type="button" onClick={() => setTag(value)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold border ${
              tag === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-[#5b7088]'
            }`}>
            <Icon /> {value}
          </button>
        ))}
        <button type="button" onClick={rememberAddress} disabled={!form.address.trim()}
          className="ml-auto btn-ghost !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-50">
          {saved ? <FiCheck className="text-emerald-500" /> : <FiSave />} {saved ? 'Saved' : remember ? 'Save address' : 'Save'}
        </button>
        <label className="flex items-center gap-1 text-[10px] font-semibold text-[#5b7088]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> remember
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5 cursor-pointer">
        <input type="checkbox" checked={selfPickup} onChange={(e) => onSelfPickupChange(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="flex items-center gap-1 text-xs font-extrabold text-brand-700"><FiMapPin /> Self-pickup at the store</span>
          <span className="block text-[10px] text-brand-700/80">Waives the delivery fee. You&apos;ll get an <b>MC-XXXX</b> pickup token.</span>
        </span>
      </label>
    </div>
  );
}
