import type { Database } from './database.types';

export type StoreRow = Database['public']['Tables']['stores']['Row'];
type StockRow = Database['public']['Tables']['stock']['Row'];
type MedicineRow = Database['public']['Tables']['medicines']['Row'];

/** Every store-owner sub-page (Overview, Inventory, Orders, ...) receives the loaded store as a prop. */
export interface StorePageProps {
  store: StoreRow;
}

/** stock.* joined with medicine:medicines(...) — the shape used by the Inventory page listing. */
export interface StockWithMedicine extends StockRow {
  medicine: Pick<MedicineRow, 'medicine_id' | 'name' | 'category' | 'image_url' | 'prescription_required' | 'form'> | null;
}
