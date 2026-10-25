import type { Database } from './database.types';
import type { CartMathTotals } from '../lib/cartMath';

type StockRow = Database['public']['Tables']['stock']['Row'];
type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type StoreRow = Database['public']['Tables']['stores']['Row'];
type CartItemRow = Database['public']['Tables']['cart_items']['Row'];

/** The nested shape returned by the cart_items select in useCart's load(). */
export interface CartStock extends Pick<StockRow, 'stock_id' | 'price' | 'mrp' | 'quantity' | 'store_id' | 'medicine_id'> {
  medicine: Pick<MedicineRow, 'name' | 'prescription_required'> | null;
  store: Pick<StoreRow, 'store_id' | 'store_name' | 'min_order_amount'> | null;
}

export interface CartItem extends Pick<CartItemRow, 'cart_item_id' | 'quantity' | 'saved_for_later'> {
  stock: CartStock;
}

/** Cart items grouped by store, with computed totals/flags used by the checkout wizard. */
export interface CartGroup extends CartMathTotals {
  store: NonNullable<CartStock['store']>;
  items: CartItem[];
  needsRx: boolean;
  belowMinOrder: boolean;
  outOfStock: CartItem[];
}

export interface CouponResult {
  success: boolean;
  message: string;
  discount_amount: number;
  code?: string;
}

export type CouponsByStore = Record<number, CouponResult>;
export type RxFilesByStore = Record<number, File>;

export interface CheckoutAddressForm {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  payment_method: 'cod' | 'online';
}

export type CheckoutStep = 1 | 2 | 3 | 4 | 5;
