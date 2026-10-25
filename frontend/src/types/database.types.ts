/**
 * Supabase database types for MediConnect.
 *
 * IMPORTANT: this file is hand-authored to mirror `supabase/migrations/*.sql`
 * (0001 through 0011) as closely as possible, because generating it for real
 * requires the Supabase CLI pointed at a live, migrated project — which
 * isn't available in this environment. Once you've run the migrations
 * against your Supabase project, regenerate the authoritative version with:
 *
 *   supabase gen types typescript --project-id <your-project-ref> > src/types/database.types.ts
 *
 * Treat this file as a solid, reviewed starting point for editor
 * autocomplete/type-checking, not as ground truth — re-run the command above
 * after any schema change and diff against this file.
 */

export type OrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready_for_dispatch'
  | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refund_requested' | 'refunded';

export type PaymentStatus =
  | 'pending' | 'processing' | 'paid' | 'failed' | 'refunded' | 'cod_pending' | 'cod_collected';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'under_review' | 'expired';

export type MedicineForm = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'other';

export type UserRole = 'customer' | 'store_owner' | 'doctor' | 'nurse' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type PatientStatus = 'stable' | 'monitoring' | 'critical' | 'discharged';
export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Not a DB constraint (the column is plain text), but this is the enumerated
// set actually used across seed data, migrations comments, and the UI.
export type EmergencyContactType = 'ambulance' | 'hospital' | 'police' | 'blood_bank';

/**
 * Shape of each element in symptom_checks.result (jsonb array — see
 * migration 0001). Structurally compatible with lib/symptomEngine.ts's
 * `ScoredResult`, which is what's actually written here.
 */
export interface SymptomCheckResultItem {
  condition: string;
  severity: 'mild' | 'moderate' | 'severe';
  action: string;
  score: number;
  matchedSymptoms: string[];
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; name: string; email: string; phone: string | null;
          role: UserRole; status: UserStatus; address: string | null; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; name: string; email: string; role: UserRole };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      stores: {
        Row: {
          store_id: number; owner_id: string; store_name: string; address: string | null;
          approval_status: ApprovalStatus; rating: number | null; license_number: string | null;
          store_owner_name: string | null; logo_url: string | null; phone: string | null;
          email: string | null; city: string | null; pincode: string | null; description: string | null;
          opening_time: string | null; closing_time: string | null; weekly_holidays: string[];
          delivery_radius_km: number | null; min_order_amount: number; is_open: boolean; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['stores']['Row']> & { owner_id: string; store_name: string };
        Update: Partial<Database['public']['Tables']['stores']['Row']>;
        Relationships: [];
      };
      medicines: {
        Row: {
          medicine_id: number; name: string; generic_name: string | null; brand: string | null;
          category: string | null; manufacturer: string | null; description: string | null;
          image_url: string | null; prescription_required: boolean; dosage: string | null;
          form: MedicineForm | null; pack_size: string | null; created_by: string | null;
          is_active: boolean; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['medicines']['Row']> & { name: string };
        Update: Partial<Database['public']['Tables']['medicines']['Row']>;
        Relationships: [];
      };
      stock: {
        Row: {
          stock_id: number; store_id: number; medicine_id: number; price: number; mrp: number;
          quantity: number; discount_percent: number; min_stock_level: number; batch_number: string | null;
          manufacturing_date: string | null; expiry_date: string | null; sku: string | null;
          barcode: string | null; is_active: boolean; updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['stock']['Row']> & { store_id: number; medicine_id: number; price: number; mrp: number; quantity: number };
        Update: Partial<Database['public']['Tables']['stock']['Row']>;
        Relationships: [];
      };
      cart_items: {
        Row: { cart_item_id: number; user_id: string; stock_id: number; quantity: number; saved_for_later: boolean };
        Insert: Partial<Database['public']['Tables']['cart_items']['Row']> & { user_id: string; stock_id: number };
        Update: Partial<Database['public']['Tables']['cart_items']['Row']>;
        Relationships: [];
      };
      orders: {
        Row: {
          order_id: number; user_id: string; store_id: number; delivery_address: string;
          payment_method: 'cod' | 'online'; payment_status: PaymentStatus; delivery_fee: number;
          discount_amount: number; coupon_code: string | null; total_amount: number; status: OrderStatus;
          customer_name: string | null; customer_phone: string | null; cancellation_reason: string | null;
          razorpay_order_id: string | null; razorpay_payment_id: string | null; payment_verified: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['orders']['Row']> & { user_id: string; store_id: number; delivery_address: string; total_amount: number };
        Update: Partial<Database['public']['Tables']['orders']['Row']>;
        Relationships: [];
      };
      order_items: {
        Row: { order_item_id: number; order_id: number; medicine_id: number; stock_id: number; quantity: number; price: number };
        Insert: Partial<Database['public']['Tables']['order_items']['Row']> & { order_id: number; medicine_id: number; stock_id: number; quantity: number; price: number };
        Update: Partial<Database['public']['Tables']['order_items']['Row']>;
        Relationships: [];
      };
      prescriptions: {
        Row: {
          prescription_id: number; order_id: number; customer_id: string; store_id: number;
          file_path: string; status: ApprovalStatus; rejection_reason: string | null;
          reviewed_by: string | null; reviewed_at: string | null; superseded: boolean; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['prescriptions']['Row']> & { order_id: number; customer_id: string; store_id: number; file_path: string };
        Update: Partial<Database['public']['Tables']['prescriptions']['Row']>;
        Relationships: [];
      };
      coupons: {
        Row: {
          coupon_id: number; store_id: number; code: string; discount_type: 'percentage' | 'fixed';
          discount_value: number; min_order_amount: number; max_discount: number | null;
          start_date: string | null; end_date: string | null; usage_limit: number | null;
          used_count: number; is_active: boolean; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['coupons']['Row']> & { store_id: number; code: string; discount_type: 'percentage' | 'fixed'; discount_value: number };
        Update: Partial<Database['public']['Tables']['coupons']['Row']>;
        Relationships: [];
      };
      wishlists: {
        Row: { wishlist_id: number; user_id: string; medicine_id: number; created_at: string };
        Insert: { user_id: string; medicine_id: number };
        Update: Partial<Database['public']['Tables']['wishlists']['Row']>;
        Relationships: [];
      };
      reviews: {
        Row: {
          review_id: number; user_id: string; target_type: 'store' | 'doctor' | 'medicine';
          target_id: string; rating: number; comment: string | null; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['reviews']['Row']> & { user_id: string; target_type: 'store' | 'doctor' | 'medicine'; target_id: string; rating: number };
        Update: Partial<Database['public']['Tables']['reviews']['Row']>;
        Relationships: [];
      };
      notifications: {
        Row: { notification_id: number; user_id: string; title: string; message: string | null; is_read: boolean; created_at: string };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & { user_id: string; title: string };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
        Relationships: [];
      };
      doctors: {
        Row: {
          doctor_id: number; user_id: string; specialization: string; qualification: string | null;
          registration_number: string | null; experience_years: number; consultation_fee: number;
          approval_status: ApprovalStatus; rating: number | null; hospital_clinic: string | null;
          bio: string | null; profile_image_url: string | null;
        };
        Insert: Partial<Database['public']['Tables']['doctors']['Row']> & { user_id: string; specialization: string };
        Update: Partial<Database['public']['Tables']['doctors']['Row']>;
        Relationships: [];
      };
      doctor_availability: {
        Row: { slot_id: number; doctor_id: number; day_of_week: string; start_time: string; end_time: string; slot_duration_minutes: number };
        Insert: Partial<Database['public']['Tables']['doctor_availability']['Row']> & { doctor_id: number; day_of_week: string; start_time: string; end_time: string };
        Update: Partial<Database['public']['Tables']['doctor_availability']['Row']>;
        Relationships: [];
      };
      appointments: {
        Row: {
          appointment_id: number; doctor_id: number; patient_id: string; appointment_date: string;
          appointment_time: string; status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'; reason: string | null;
        };
        Insert: Partial<Database['public']['Tables']['appointments']['Row']> & { doctor_id: number; patient_id: string; appointment_date: string; appointment_time: string };
        Update: Partial<Database['public']['Tables']['appointments']['Row']>;
        Relationships: [];
      };
      patients: {
        Row: {
          patient_id: number; profile_id: string | null; name: string; age: number | null; gender: string | null;
          primary_nurse_id: string | null; primary_doctor_id: number | null; room_number: string | null;
          status: PatientStatus; admitted_at: string; discharged_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['patients']['Row']> & { name: string };
        Update: Partial<Database['public']['Tables']['patients']['Row']>;
        Relationships: [];
      };
      vitals: {
        Row: {
          vital_id: number; patient_id: number; recorded_by: string | null; temperature: number | null;
          bp_systolic: number | null; bp_diastolic: number | null; heart_rate: number | null;
          spo2: number | null; respiratory_rate: number | null; recorded_at: string;
        };
        Insert: Partial<Database['public']['Tables']['vitals']['Row']> & { patient_id: number };
        Update: Partial<Database['public']['Tables']['vitals']['Row']>;
        Relationships: [];
      };
      tasks: {
        Row: {
          task_id: number; patient_id: number | null; assigned_to: string | null; created_by: string | null;
          title: string; description: string | null; status: TaskStatus; priority: TaskPriority;
          due_at: string | null; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['tasks']['Row']> & { title: string };
        Update: Partial<Database['public']['Tables']['tasks']['Row']>;
        Relationships: [];
      };
      notes: {
        Row: { note_id: number; patient_id: number | null; created_by: string | null; content: string; created_at: string };
        Insert: Partial<Database['public']['Tables']['notes']['Row']> & { content: string };
        Update: Partial<Database['public']['Tables']['notes']['Row']>;
        Relationships: [];
      };
      symptom_checks: {
        Row: { check_id: number; user_id: string; symptoms: string[]; result: SymptomCheckResultItem[]; created_at: string };
        Insert: Partial<Database['public']['Tables']['symptom_checks']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['symptom_checks']['Row']>;
        Relationships: [];
      };
      emergency_contacts: {
        Row: {
          contact_id: number; name: string; type: EmergencyContactType; phone: string;
          address: string | null; latitude: number | null; longitude: number | null;
        };
        Insert: Partial<Database['public']['Tables']['emergency_contacts']['Row']> & { name: string; phone: string; type: string };
        Update: Partial<Database['public']['Tables']['emergency_contacts']['Row']>;
        Relationships: [];
      };
      audit_logs: {
        Row: { log_id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string; details: Record<string, unknown> | null; created_at: string };
        Insert: never; // written only by SECURITY DEFINER triggers, never directly
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      preview_coupon: {
        Args: { p_store_id: number; p_code: string; p_order_amount: number };
        Returns: { success: boolean; message: string; discount_amount: number }[];
      };
      redeem_coupon: {
        Args: { p_store_id: number; p_code: string; p_order_amount: number };
        Returns: { success: boolean; message: string; discount_amount: number }[];
      };
      expire_stale_prescriptions: { Args: Record<string, never>; Returns: void };
    };
  };
}
