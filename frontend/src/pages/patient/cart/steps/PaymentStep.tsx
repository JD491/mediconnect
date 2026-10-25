import type { ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { FiShield, FiSmartphone, FiCreditCard, FiTruck, FiShoppingBag } from 'react-icons/fi';
import { checkoutPaymentMethods, type PaymentMethod } from '../../../../lib/payments';
import { LoadingSpinner } from '../../../../components/UIStates';

interface PaymentStepProps {
  paymentMethod: PaymentMethod;
  onChangeMethod: (method: PaymentMethod) => void;
  grandTotal: number;
  error: string;
  placing: boolean;
  orderCount: number;
  selfPickup: boolean;
  onPlaceOrders: () => void;
}

const METHOD_ICON: Record<PaymentMethod, JSX.Element> = {
  online: <FiCreditCard />,
  cod: <FiTruck />,
  upi_offline: <FiSmartphone />,
  self_pickup: <FiShoppingBag />,
  clinic_counter: <FiShield />,
};

export default function PaymentStep({
  paymentMethod, onChangeMethod, grandTotal, error, placing, orderCount, selfPickup, onPlaceOrders,
}: PaymentStepProps) {
  const methods = checkoutPaymentMethods(selfPickup);
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChangeMethod(e.target.value as PaymentMethod);

  return (
    <div className="glass-card max-w-md mx-auto">
      <h3 className="font-extrabold text-[#0f2340] mb-1">Payment Method</h3>
      <p className="text-[11px] text-[#5b7088] mb-3">
        {selfPickup ? 'Self-pickup selected — delivery fee is waived.' : 'Choose how you want to pay.'}
      </p>
      <div className="space-y-2 mb-4">
        {methods.map((m) => (
          <label key={m.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === m.value ? 'border-brand-400 bg-brand-50' : 'border-white/50 bg-white/50'}`}>
            <input type="radio" name="payment_method" value={m.value} checked={paymentMethod === m.value}
              onChange={handleChange} disabled={!m.available} className="mt-1" />
            <span className="text-brand-600 mt-0.5">{METHOD_ICON[m.value]}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#0f2340]">{m.label}</span>
              <span className="block text-[11px] text-[#5b7088]">{m.description}</span>
            </span>
          </label>
        ))}
      </div>

      {paymentMethod === 'online' || paymentMethod === 'self_pickup' ? (
        <p className="text-[10px] text-[#5b7088] mb-3 flex items-center gap-1.5">
          <FiShield className="text-emerald-500" /> UPI · Card · Netbanking · Wallet. Razorpay when configured, otherwise a demo gateway opens.
        </p>
      ) : paymentMethod === 'upi_offline' ? (
        <p className="text-[10px] text-[#5b7088] mb-3 flex items-center gap-1.5">
          <FiShield className="text-amber-500" /> Pay by UPI at {selfPickup ? 'the store counter' : 'your doorstep'}. The store verifies the reference before closing the order.
        </p>
      ) : (
        <p className="text-[10px] text-[#5b7088] mb-3 flex items-center gap-1.5">
          <FiShield className="text-amber-500" /> Keep exact change ready. The store marks cash collected after handover.
        </p>
      )}

      <div className="flex justify-between text-sm font-extrabold text-[#0f2340] mb-4 pt-3 border-t border-white/50">
        <span>Amount payable</span><span>₹{grandTotal.toFixed(2)}</span>
      </div>
      {error && (
        <motion.p initial={{ x: 0 }} animate={{ x: [0, -6, 6, -4, 4, 0] }} transition={{ duration: 0.35 }} className="text-rose-500 text-xs font-semibold mb-3" role="alert">
          {error}
        </motion.p>
      )}
      <button disabled={placing} onClick={onPlaceOrders} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
        {placing && <LoadingSpinner size={16} className="!border-white/40 !border-t-white" />}
        {placing ? 'Processing payment...' : `Place Order${orderCount > 1 ? 's' : ''}`}
      </button>
      <p className="text-[10px] text-center text-[#8a9bb0] mt-2">
        A failed payment never cancels your order — retry online or switch to COD from Orders.
      </p>
    </div>
  );
}
