import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPhoneCall, FiArrowLeft, FiMapPin } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { Database, EmergencyContactType } from '../../types/database.types';

type EmergencyContact = Database['public']['Tables']['emergency_contacts']['Row'];

const TYPE_LABEL: Record<EmergencyContactType, string> = {
  ambulance: 'Ambulance',
  hospital: 'Hospital',
  police: 'Police',
  blood_bank: 'Blood Bank',
};

export default function EmergencyPage() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  useEffect(() => {
    supabase.from('emergency_contacts').select('*').then(({ data }) => setContacts(data ?? []));
  }, []);

  return (
    <div className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-[#5b7088] font-bold flex items-center gap-1 mb-6"><FiArrowLeft /> Back home</Link>
      <h1 className="text-3xl font-extrabold text-[#0f2340] mb-1">Emergency Services</h1>
      <p className="text-sm text-[#5b7088] mb-6">Tap to call. If this is life-threatening, dial your local emergency number immediately.</p>

      <div className="space-y-3">
        {contacts.map((c) => (
          <a key={c.contact_id} href={`tel:${c.phone}`} className="glass-card flex items-center justify-between card-hover">
            <div>
              <span className="badge bg-rose-100 text-rose-700 mb-1 inline-block">{TYPE_LABEL[c.type] || c.type}</span>
              <p className="font-extrabold text-[#0f2340]">{c.name}</p>
              {c.address && (
                <p className="text-xs text-[#5b7088] flex items-center gap-1"><FiMapPin size={11} /> {c.address}</p>
              )}
            </div>
            <div className="btn-primary !py-2 !px-4 flex items-center gap-2 !text-sm"><FiPhoneCall /> {c.phone}</div>
          </a>
        ))}
        {contacts.length === 0 && <p className="text-sm text-[#5b7088]">No emergency contacts configured yet.</p>}
      </div>
    </div>
  );
}
