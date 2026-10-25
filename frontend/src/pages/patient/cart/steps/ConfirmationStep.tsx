import { motion } from 'framer-motion';
import { FiCheck } from 'react-icons/fi';

interface ConfirmationStepProps {
  placedOrderIds: number[];
  onContinueShopping: () => void;
  onTrackOrders: () => void;
}

export default function ConfirmationStep({ placedOrderIds, onContinueShopping, onTrackOrders }: ConfirmationStepProps) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card max-w-md mx-auto text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
        className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
        <FiCheck size={24} />
      </motion.div>
      <h3 className="font-extrabold text-[#0f2340] text-lg mb-1">Order{placedOrderIds.length > 1 ? 's' : ''} Confirmed!</h3>
      <p className="text-sm text-[#5b7088] mb-4">
        {placedOrderIds.length > 1 ? `Orders #${placedOrderIds.join(', #')} have` : `Order #${placedOrderIds[0]} has`} been placed successfully.
      </p>
      <div className="flex gap-2">
        <button onClick={onContinueShopping} className="btn-ghost flex-1">Continue Shopping</button>
        <button onClick={onTrackOrders} className="btn-primary flex-1">Track Orders</button>
      </div>
    </motion.div>
  );
}
