import type { Database } from './database.types';

export type DoctorRow = Database['public']['Tables']['doctors']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type DoctorAvailabilityRow = Database['public']['Tables']['doctor_availability']['Row'];

/** doctors.* joined with profile:profiles(name) — the fields BookAppointment's doctor list selects. */
export interface DoctorListing extends Pick<DoctorRow, 'doctor_id' | 'specialization' | 'qualification' | 'experience_years' | 'consultation_fee' | 'rating'> {
  profile: Pick<ProfileRow, 'name'> | null;
}

/** Every doctor-portal sub-page (Availability, DoctorProfile, ...) receives the loaded doctor row as a prop. */
export interface DoctorPageProps {
  doctor: DoctorRow;
}
