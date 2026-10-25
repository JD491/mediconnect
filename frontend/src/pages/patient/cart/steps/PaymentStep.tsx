import type { ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { PAYMENT_METHODS, type PaymentMethod } from '../../../../lib/payments';
import { LoadingSpinner } from '../../../../components/UIStates';

interface PaymentStepProps {
  paymentMethod: PaymentMethod;
  onChangeMethod: (method: PaymentMethod) => void;
  grandTotal: number;
  error: string;
  placing: boolean;
  orderCount: number;
  onPlaceOrders: () => void;
}

export default function PaymentStep({ paymentMethod, onChangeMethod, grandTotal, error, placing, orderCount, onPlaceOrders }: PaymentStepProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChangeMethod(e.target.value as PaymentMethod);

  return (
    <div className="glass-card max-w-md mx-auto">
      <h3 className="font-extrabold text-[#0f2340] mb-3">Payment Method</h3>
      <div className="space-y-2 mb-4">
        {PAYMENT_METHODS.map((m) => (
          <label key={m.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === m.value ? 'border-brand-400 bg-brand-50' : 'border-white/50 bg-white/50'}`}>
            <input type="radio" name="payment_method" value={m.value} checked={paymentMethod === m.value}
              onChange={handleChange} disabled={!m.available} />
            <span className="text-sm font-semibold text-[#0f2340]">{m.label}</span>
          </label>
        ))}
      </div>
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
        {placing ? 'Processing...' : `Place Order${orderCount > 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
