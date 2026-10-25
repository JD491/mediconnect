import type { Database } from './database.types';

type MedicineRow = Database['public']['Tables']['medicines']['Row'];
type StockRow = Database['public']['Tables']['stock']['Row'];
type StoreRow = Database['public']['Tables']['stores']['Row'];
type ReviewRow = Database['public']['Tables']['reviews']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** stock.* joined with store:stores(...) — the shape used by MedicineStore/MedicineDetail offer lists. */
export interface StockOffer extends StockRow {
  store: (Pick<StoreRow, 'store_id' | 'store_name' | 'rating' | 'approval_status' | 'city'> & Partial<Pick<StoreRow, 'latitude' | 'longitude' | 'delivery_radius_km'>>) | null;
}

/** stock joined with medicine + store, as fetched by MedicineStore's catalog query. */
export interface StockWithMedicineAndStore extends StockRow {
  medicine: Pick<MedicineRow, 'medicine_id' | 'name' | 'generic_name' | 'brand' | 'category' | 'prescription_required' | 'description' | 'is_active' | 'manufacturer' | 'form' | 'pack_size' | 'salt_composition' | 'gst_rate' | 'image_url'> | null;
  store: (Pick<StoreRow, 'store_id' | 'store_name' | 'rating' | 'approval_status'> & Partial<Pick<StoreRow, 'city' | 'latitude' | 'longitude' | 'delivery_radius_km'>>) | null;
}

export interface MedicineCatalogGroup {
  medicine: NonNullable<StockWithMedicineAndStore['medicine']>;
  offers: StockWithMedicineAndStore[];
}

/** medicines.* + nested stock:stock(...) — used for "alternatives" (same generic_name). */
export interface MedicineWithStock extends MedicineRow {
  stock: (Pick<StockRow, 'price' | 'mrp' | 'quantity' | 'is_active'> & {
    store: Pick<StoreRow, 'store_name' | 'approval_status'> | null;
  })[];
}

export interface MedicineAlternative extends Pick<MedicineRow, 'medicine_id' | 'name'> {
  best: Pick<StockRow, 'price' | 'mrp' | 'quantity' | 'is_active'> & { store: Pick<StoreRow, 'store_name' | 'approval_status'> | null };
}

export interface ReviewWithReviewer extends ReviewRow {
  reviewer: Pick<ProfileRow, 'name'> | null;
}
