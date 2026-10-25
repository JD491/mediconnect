import { describe, it, expect } from 'vitest';
import { validateAddress, missingRxStore } from '../useCheckout';
import type { CheckoutAddressForm, CartGroup, RxFilesByStore } from '../../types/cart';

function makeForm(overrides: Partial<CheckoutAddressForm> = {}): CheckoutAddressForm {
  return {
    name: 'Asha Patil', phone: '9876543210', address: '12 MG Road',
    city: 'Pune', pincode: '411001', payment_method: 'cod',
    ...overrides,
  };
}

function makeGroup(overrides: Partial<CartGroup> = {}): CartGroup {
  return {
    store: { store_id: 1, store_name: 'Apollo Pharmacy', min_order_amount: 0 },
    items: [], needsRx: false, belowMinOrder: false, outOfStock: [],
    subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
    ...overrides,
  };
}

describe('validateAddress', () => {
  it('accepts a fully filled-in, valid form', () => {
    expect(validateAddress(makeForm())).toBe('');
  });

  it.each(['name', 'phone', 'address', 'city', 'pincode'] as const)('rejects a blank %s field', (field) => {
    const result = validateAddress(makeForm({ [field]: '   ' }));
    expect(result).toMatch(/fill in/i);
  });

  it('rejects a pincode with letters', () => {
    expect(validateAddress(makeForm({ pincode: '4110AB' }))).toMatch(/valid pin code/i);
  });

  it('rejects a pincode that is too short', () => {
    expect(validateAddress(makeForm({ pincode: '12' }))).toMatch(/valid pin code/i);
  });

  it('rejects a phone number with letters', () => {
    expect(validateAddress(makeForm({ phone: '98765abc10' }))).toMatch(/valid phone number/i);
  });

  it('accepts a phone number with a country code and spaces', () => {
    expect(validateAddress(makeForm({ phone: '+91 98765 43210' }))).toBe('');
  });

  it('rejects a phone number that is too short', () => {
    expect(validateAddress(makeForm({ phone: '12345' }))).toMatch(/valid phone number/i);
  });
});

describe('missingRxStore', () => {
  it('returns undefined when no group needs a prescription', () => {
    const groups = [makeGroup({ needsRx: false })];
    expect(missingRxStore(groups, {})).toBeUndefined();
  });

  it('returns undefined when the required prescription file was already provided', () => {
    const groups = [makeGroup({ needsRx: true, store: { store_id: 5, store_name: 'MedPlus', min_order_amount: 0 } })];
    const rxFiles: RxFilesByStore = { 5: new File(['x'], 'rx.pdf') };
    expect(missingRxStore(groups, rxFiles)).toBeUndefined();
  });

  it('returns the group that needs a prescription but has none uploaded', () => {
    const needsRxGroup = makeGroup({ needsRx: true, store: { store_id: 7, store_name: 'Wellness Forever', min_order_amount: 0 } });
    const groups = [makeGroup({ needsRx: false }), needsRxGroup];
    expect(missingRxStore(groups, {})).toBe(needsRxGroup);
  });

  it('does not get confused by a file uploaded for a different store', () => {
    const needsRxGroup = makeGroup({ needsRx: true, store: { store_id: 7, store_name: 'Wellness Forever', min_order_amount: 0 } });
    const rxFiles: RxFilesByStore = { 999: new File(['x'], 'rx.pdf') };
    expect(missingRxStore([needsRxGroup], rxFiles)).toBe(needsRxGroup);
  });
});
