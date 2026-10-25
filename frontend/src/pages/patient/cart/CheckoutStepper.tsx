import { FiCheck } from 'react-icons/fi';
import type { CheckoutStep } from '../../../types/cart';

const STEP_LABELS = ['Address', 'Prescription', 'Summary', 'Payment', 'Confirmation'];

interface CheckoutStepperProps {
  step: CheckoutStep;
}

export default function CheckoutStepper({ step }: CheckoutStepperProps) {
  return (
    <ol className="glass-card flex items-center justify-between mb-4 !py-3" aria-label="Checkout progress">
      {STEP_LABELS.map((label, idx) => {
        const n = idx + 1;
        const state = n < step ? 'done' : n === step ? 'active' : 'todo';
        return (
          <li key={label} className="flex-1 flex flex-col items-center relative">
            {idx > 0 && <div className={`absolute top-3 right-1/2 w-full h-0.5 ${n <= step ? 'bg-brand-500' : 'bg-slate-200'}`} />}
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold z-10 transition-colors ${
                state === 'done' ? 'bg-brand-600 text-white' : state === 'active' ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-slate-200 text-slate-500'
              }`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              {state === 'done' ? <FiCheck size={12} /> : n}
            </span>
            <span className="text-[9px] sm:text-[10px] text-[#5b7088] font-bold mt-1.5 text-center">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
