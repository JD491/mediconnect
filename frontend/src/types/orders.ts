import type { Database } from './database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type StoreRow = Database['public']['Tables']['stores']['Row'];
type OrderItemRow = Database['public']['Tables']['order_items']['Row'];
type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type PrescriptionRow = Database['public']['Tables']['prescriptions']['Row'];

/** orders.* joined with store:stores(store_name) — used by MyOrders / store Orders list. */
export interface OrderWithStoreName extends OrderRow {
  store: Pick<StoreRow, 'store_name'> | null;
}

export interface OrderItemWithMedicine extends OrderItemRow {
  medicine: Pick<MedicineRow, 'name' | 'image_url' | 'form' | 'gst_rate'> | null;
}

/** Full detail row used by OrderTracking: order + items + store contact info. */
export interface OrderDetail extends OrderRow {
  store: Pick<StoreRow, 'store_name' | 'phone' | 'address'> | null;
  order_items: OrderItemWithMedicine[];
}

/** orders.* joined with store:stores(...) for the order-tracking header/contact card. */
export interface OrderTrackingOrder extends OrderRow {
  store: (Pick<StoreRow, 'store_id' | 'store_name' | 'phone' | 'email' | 'address'> & Partial<Pick<StoreRow, 'latitude' | 'longitude' | 'city'>>) | null;
}

export type PrescriptionWithOrder = PrescriptionRow & {
  order: Pick<OrderRow, 'order_id' | 'store_id'> | null;
};

export type PrescriptionWithStoreAndOrder = PrescriptionRow & {
  store: Pick<StoreRow, 'store_name'> | null;
  order: Pick<OrderRow, 'order_id'> | null;
};
