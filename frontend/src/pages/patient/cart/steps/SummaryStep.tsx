import CartGroupCard from '../CartGroupCard';
import type { CartGroup, CartItem, CheckoutAddressForm, CouponsByStore } from '../../../../types/cart';

interface SummaryStepProps {
  groups: CartGroup[];
  coupons: CouponsByStore;
  couponInput: Record<number, string>;
  grandTotal: number;
  form: CheckoutAddressForm;
  onUpdateQty: (row: CartItem, quantity: number) => void;
  onSaveForLater: (cartItemId: number) => void;
  onRemove: (cartItemId: number) => void;
  onCouponInputChange: (storeId: number, value: string) => void;
  onApplyCoupon: (storeId: number, subtotal: number) => void;
  onRemoveCoupon: (storeId: number) => void;
}

export default function SummaryStep({
  groups, coupons, couponInput, grandTotal, form,
  onUpdateQty, onSaveForLater, onRemove, onCouponInputChange, onApplyCoupon, onRemoveCoupon,
}: SummaryStepProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {groups.map((g) => (
          <CartGroupCard
            key={g.store.store_id}
            group={g}
            coupon={coupons[g.store.store_id]}
            couponInputValue={couponInput[g.store.store_id] ?? ''}
            onUpdateQty={onUpdateQty}
            onSaveForLater={onSaveForLater}
            onRemove={onRemove}
            onCouponInputChange={onCouponInputChange}
            onApplyCoupon={onApplyCoupon}
            onRemoveCoupon={onRemoveCoupon}
          />
        ))}
      </div>
      <div className="glass-card h-fit">
        <h3 className="font-extrabold text-[#0f2340] mb-3">Order Total</h3>
        <div className="flex justify-between text-sm font-extrabold text-[#0f2340]">
          <span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span>
        </div>
        <p className="text-[11px] text-[#8a9bb0] mt-2">Delivering to {form.city} - {form.pincode}</p>
      </div>
    </div>
  );
}
