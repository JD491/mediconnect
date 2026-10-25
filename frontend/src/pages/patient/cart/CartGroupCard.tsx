import { FiShoppingBag, FiClock, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import type { CartGroup, CartItem, CouponResult } from '../../../types/cart';

interface CartGroupCardProps {
  group: CartGroup;
  coupon: CouponResult | undefined;
  couponInputValue: string;
  onUpdateQty: (row: CartItem, quantity: number) => void;
  onSaveForLater: (cartItemId: number) => void;
  onRemove: (cartItemId: number) => void;
  onCouponInputChange: (storeId: number, value: string) => void;
  onApplyCoupon: (storeId: number, subtotal: number) => void;
  onRemoveCoupon: (storeId: number) => void;
}

export default function CartGroupCard({
  group: g, coupon, couponInputValue, onUpdateQty, onSaveForLater, onRemove, onCouponInputChange, onApplyCoupon, onRemoveCoupon,
}: CartGroupCardProps) {
  return (
    <div className="glass-card">
      <div className="flex items-center gap-2 mb-3">
        <FiShoppingBag className="text-brand-500" />
        <h3 className="font-extrabold text-[#0f2340] text-sm">{g.store.store_name}</h3>
      </div>
      <div className="space-y-2 mb-3">
        {g.items.map((i) => (
          <div key={i.cart_item_id} className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[#0f2340] text-sm">{i.stock?.medicine?.name}</p>
              <p className="text-xs text-[#5b7088]">₹{i.stock?.price} each{i.quantity > i.stock.quantity ? ` · only ${i.stock.quantity} left` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button onClick={() => onUpdateQty(i, i.quantity - 1)} aria-label="Decrease quantity" className="btn-ghost !w-7 !h-7 !p-0 flex items-center justify-center">-</button>
                <input type="number" min={1} max={i.stock.quantity} value={i.quantity} aria-label="Quantity" onChange={(e) => onUpdateQty(i, Number(e.target.value))}
                  className="input-field !w-14 !py-1.5 text-center" />
                <button onClick={() => onUpdateQty(i, i.quantity + 1)} aria-label="Increase quantity" className="btn-ghost !w-7 !h-7 !p-0 flex items-center justify-center">+</button>
              </div>
              <button onClick={() => onSaveForLater(i.cart_item_id)} className="text-[#8a9bb0] hover:text-brand-600" title="Save for later" aria-label="Save for later"><FiClock /></button>
              <button onClick={() => onRemove(i.cart_item_id)} className="text-rose-400 hover:text-rose-600" aria-label="Remove item"><FiTrash2 /></button>
            </div>
          </div>
        ))}
      </div>

      {g.belowMinOrder && (
        <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 mb-2">
          <FiAlertTriangle /> Minimum order for this store is ₹{g.store.min_order_amount}. Add ₹{(g.store.min_order_amount - g.subtotal).toFixed(0)} more.
        </p>
      )}
      {g.outOfStock.length > 0 && (
        <p className="text-[11px] text-rose-500 font-semibold flex items-center gap-1 mb-2">
          <FiAlertTriangle /> Some items exceed available stock — quantities were capped automatically.
        </p>
      )}

      <div className="mt-2 p-2.5 rounded-xl bg-brand-50 border border-brand-200">
        {coupon?.success ? (
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-brand-700">
              Coupon &ldquo;{coupon.code}&rdquo; applied — ₹{coupon.discount_amount.toFixed(2)} off
            </p>
            <button type="button" onClick={() => onRemoveCoupon(g.store.store_id)} className="text-[11px] font-bold text-rose-500">Remove</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`coupon-${g.store.store_id}`}>Coupon code</label>
            <input id={`coupon-${g.store.store_id}`} placeholder="Coupon code" value={couponInputValue}
              onChange={(e) => onCouponInputChange(g.store.store_id, e.target.value)}
              className="input-field !py-1.5 !text-xs flex-1" />
            <button type="button" onClick={() => onApplyCoupon(g.store.store_id, g.subtotal)} className="btn-ghost !py-1.5 !text-xs">Apply</button>
          </div>
        )}
        {coupon?.success === false && (
          <p className="text-[11px] text-rose-500 font-semibold mt-1">{coupon.message}</p>
        )}
      </div>

      <div className="flex justify-between text-xs text-[#5b7088] mt-3 pt-2 border-t border-white/40">
        <span>Subtotal</span><span>₹{g.subtotal.toFixed(2)}</span>
      </div>
      {g.discount > 0 && (
        <div className="flex justify-between text-xs text-emerald-600 font-semibold">
          <span>Coupon discount</span><span>-₹{g.discount.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-xs text-[#5b7088]">
        <span>Delivery</span><span>{g.deliveryFee === 0 ? 'Free' : `₹${g.deliveryFee}`}</span>
      </div>
      <div className="flex justify-between text-sm font-extrabold text-[#0f2340] mt-1">
        <span>Store total</span><span>₹{g.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
