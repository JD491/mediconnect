import type { ChangeEvent } from 'react';
import type { CheckoutAddressForm } from '../../../../types/cart';

interface AddressStepProps {
  form: CheckoutAddressForm;
  onChange: (patch: Partial<CheckoutAddressForm>) => void;
}

export default function AddressStep({ form, onChange }: AddressStepProps) {
  const onField = (key: keyof CheckoutAddressForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ [key]: e.target.value } as Partial<CheckoutAddressForm>);

  return (
    <div className="glass-card max-w-md mx-auto">
      <h3 className="font-extrabold text-[#0f2340] mb-3">Delivery Address</h3>
      <div className="space-y-2">
        <label className="sr-only" htmlFor="ck-name">Full name</label>
        <input id="ck-name" placeholder="Full name" value={form.name} onChange={onField('name')} className="input-field" />
        <label className="sr-only" htmlFor="ck-phone">Phone</label>
        <input id="ck-phone" placeholder="Phone" value={form.phone} onChange={onField('phone')} className="input-field" />
        <label className="sr-only" htmlFor="ck-address">Address</label>
        <textarea id="ck-address" placeholder="Address" value={form.address} onChange={onField('address')} className="input-field" rows={2} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="City" aria-label="City" value={form.city} onChange={onField('city')} className="input-field" />
          <input placeholder="PIN code" aria-label="PIN code" value={form.pincode} onChange={onField('pincode')} className="input-field" />
        </div>
      </div>
    </div>
  );
}
