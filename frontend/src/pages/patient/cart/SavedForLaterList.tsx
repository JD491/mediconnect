import { FiClock, FiTrash2 } from 'react-icons/fi';
import { EmptyState } from '../../../components/UIStates';
import type { CartItem } from '../../../types/cart';

interface SavedForLaterListProps {
  saved: CartItem[];
  onMoveToCart: (cartItemId: number) => void;
  onRemove: (cartItemId: number) => void;
}

export default function SavedForLaterList({ saved, onMoveToCart, onRemove }: SavedForLaterListProps) {
  if (saved.length === 0) {
    return <EmptyState icon={FiClock} title="Nothing saved for later" />;
  }

  return (
    <div className="space-y-3">
      {saved.map((i) => (
        <div key={i.cart_item_id} className="glass-card flex items-center justify-between">
          <div>
            <p className="font-bold text-[#0f2340] text-sm">{i.stock?.medicine?.name}</p>
            <p className="text-xs text-[#5b7088]">{i.stock?.store?.store_name} · ₹{i.stock?.price} each</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onMoveToCart(i.cart_item_id)} className="btn-ghost !py-1.5 !text-xs">Move to cart</button>
            <button onClick={() => onRemove(i.cart_item_id)} className="text-rose-400 hover:text-rose-600" aria-label="Remove"><FiTrash2 /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
