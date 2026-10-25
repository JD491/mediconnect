import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCalendar, FiStar, FiVideo, FiMapPin, FiCreditCard, FiPrinter, FiCheckCircle, FiClock, FiFilter } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { processPayment, isPaymentCancellation, generatePaymentRef, printGstInvoice } from '../../lib/payments';
import type { ConsultationMode } from '../../types/database.types';
import type { DoctorListing, DoctorAvailabilityRow } from '../../types/doctor';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CONSULT_GST_RATE = 18;

function slotsForDate(availability: DoctorAvailabilityRow[], dateStr: string): string[] {
  const dow = DAY_NAMES[new Date(dateStr).getDay()];
  const daySlots = availability.filter((a) => a.day_of_week === dow);
  const out: string[] = [];
  for (const slot of daySlots) {
    const [startH, startM] = slot.start_time.split(':');
    const [endHRaw, endMRaw] = slot.end_time.split(':');
    let h = Number(startH);
    let m = Number(startM);
    const endH = Number(endHRaw);
    const endM = Number(endMRaw);
    while (h < endH || (h === endH && m < endM)) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += slot.slot_duration_minutes;
      while (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
  }
  return out;
}

interface AppointmentRow {
  appointment_id: number;
  appointment_date: string;
  appointment_time: string;
  consultation_mode: ConsultationMode;
  payment_method: string;
  payment_status: string;
  payment_ref: string | null;
  meeting_link: string | null;
  status: string;
}

export default function BookAppointment() {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const wantedSpecialist = searchParams.get('specialist') ?? '';
  const [doctors, setDoctors] = useState<DoctorListing[]>([]);
  const [selected, setSelected] = useState<DoctorListing | null>(null);
  const [availability, setAvailability] = useState<DoctorAvailabilityRow[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [booked, setBooked] = useState<string[]>([]);
  const [reason, setReason] = useState(() => searchParams.get('reason') ?? '');
  const [specialistFilter, setSpecialistFilter] = useState(wantedSpecialist);
  const [mode, setMode] = useState<ConsultationMode>('in_person');
  const [payMode, setPayMode] = useState<'online' | 'clinic_counter'>('online');
  const [slot, setSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastBooking, setLastBooking] = useState<AppointmentRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('doctor_id, specialization, qualification, experience_years, consultation_fee, rating, profile:profiles(name)')
        .eq('approval_status', 'approved');
      const rows = (data ?? []) as unknown as DoctorListing[];
      setDoctors(rows);
      if (wantedSpecialist) {
        const preferred = rows.find((d) => d.specialization.toLowerCase() === wantedSpecialist.toLowerCase());
        if (preferred) setSelected(preferred);
      }
    })();
  }, [wantedSpecialist]);

  useEffect(() => {
    if (!selected) return;
    setSlot(null);
    (async () => {
      const { data: av } = await supabase.from('doctor_availability').select('*').eq('doctor_id', selected.doctor_id);
      setAvailability(av ?? []);
      const { data: appts } = await supabase.from('appointments').select('appointment_time')
        .eq('doctor_id', selected.doctor_id).eq('appointment_date', date).neq('status', 'cancelled');
      setBooked((appts ?? []).map((a) => a.appointment_time.slice(0, 5)));
    })();
  }, [selected, date]);

  const visibleDoctors = useMemo(() => {
    if (!specialistFilter) return doctors;
    const matching = doctors.filter((d) => d.specialization.toLowerCase() === specialistFilter.toLowerCase());
    return matching.length > 0 ? matching : doctors;
  }, [doctors, specialistFilter]);

  const fee = Number(selected?.consultation_fee || 0);
  const totals = useMemo(() => {
    // Consultation fee is GST-inclusive in the catalogue.
    const taxable = fee / (1 + CONSULT_GST_RATE / 100);
    return { taxable, gst: fee - taxable };
  }, [fee]);

  const resetAfterBooking = () => {
    setSlot(null);
    setReason('');
    setMessage('');
    setError('');
  };

  const book = async () => {
    if (!selected || !user || !slot) return;
    setBooking(true);
    setError('');
    setMessage('');
    setLastBooking(null);

    const online = payMode === 'online';
    const { data, error: insertError } = await supabase.from('appointments').insert({
      patient_id: user.id,
      doctor_id: selected.doctor_id,
      appointment_date: date,
      appointment_time: slot,
      reason: reason || null,
      status: 'pending',
      consultation_mode: mode,
      payment_method: online ? 'online' : 'clinic_counter',
      payment_status: online ? 'pending' : 'cod_pending',
      payment_ref: null,
      meeting_link: mode === 'online' ? `https://meet.jit.si/MediConnect-${Date.now().toString(36)}` : null,
    }).select().maybeSingle();

    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not create the appointment.');
      setBooking(false);
      return;
    }

    const appointment = data as unknown as AppointmentRow;

    if (online) {
      try {
        const payment = await processPayment({
          method: 'online',
          kind: 'appointment',
          orderId: appointment.appointment_id,
          amount: fee,
          name: profile?.name ?? undefined,
          email: user?.email ?? undefined,
          contact: profile?.phone ?? undefined,
        });
        const reference = payment.reference ?? generatePaymentRef('online');
        await supabase.from('appointments').update({
          payment_status: 'paid',
          payment_ref: reference,
        }).eq('appointment_id', appointment.appointment_id);
        setLastBooking({ ...appointment, payment_status: 'paid', payment_ref: reference });
        setMessage(`Appointment booked for ${date} at ${slot} · paid ₹${fee.toFixed(0)}`);
      } catch (err) {
        const cancelled = isPaymentCancellation(err);
        const reasonText = err instanceof Error ? err.message : 'Payment could not be completed.';
        await supabase.from('appointments').update({
          payment_status: cancelled ? 'pending' : 'failed',
          payment_ref: null,
        }).eq('appointment_id', appointment.appointment_id);
        setLastBooking({ ...appointment, payment_status: cancelled ? 'pending' : 'failed', payment_ref: null });
        setError(cancelled
          ? 'Payment cancelled. Your slot is held as pending — retry with Pay Now or pay at the clinic counter.'
          : `${reasonText} Your slot is held — retry payment or switch to clinic-counter payment.`);
      }
    } else {
      setLastBooking(appointment);
      setMessage(`Appointment booked for ${date} at ${slot} · pay ₹${fee.toFixed(0)} at the clinic counter.`);
    }

    setBooked((b) => [...b, slot]);
    setBooking(false);
  };

  const retryPayment = async () => {
    if (!lastBooking || !selected) return;
    setBooking(true);
    setError('');
    try {
      const payment = await processPayment({
        method: 'online',
        kind: 'appointment',
        orderId: lastBooking.appointment_id,
        amount: fee,
        name: profile?.name ?? undefined,
        email: user?.email ?? undefined,
        contact: profile?.phone ?? undefined,
      });
      const reference = payment.reference ?? generatePaymentRef('online');
      await supabase.from('appointments').update({
        payment_method: 'online',
        payment_status: 'paid',
        payment_ref: reference,
      }).eq('appointment_id', lastBooking.appointment_id);
      setLastBooking({ ...lastBooking, payment_method: 'online', payment_status: 'paid', payment_ref: reference });
      setMessage(`Payment received · ${reference}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment could not be completed.');
    } finally {
      setBooking(false);
    }
  };

  const switchToCounter = async () => {
    if (!lastBooking) return;
    await supabase.from('appointments').update({
      payment_method: 'clinic_counter',
      payment_status: 'cod_pending',
      payment_ref: null,
    }).eq('appointment_id', lastBooking.appointment_id);
    setLastBooking({ ...lastBooking, payment_method: 'clinic_counter', payment_status: 'cod_pending', payment_ref: null });
    setError('');
    setMessage('Switched to pay at the clinic counter.');
  };

  const printInvoice = () => {
    if (!lastBooking || !selected) return;
    printGstInvoice({
      orderId: lastBooking.appointment_id,
      storeName: mode === 'online' ? 'MediConnect Teleclinic' : 'MediConnect Clinic',
      customerName: profile?.name ?? 'Patient',
      address: mode === 'online' ? 'Online video consultation' : 'In-person consultation · MediConnect partner clinic',
      createdAt: new Date().toISOString(),
      items: [{
        name: `Consultation — Dr. ${selected.profile?.name ?? ''} (${selected.specialization})`,
        quantity: 1,
        price: fee,
        gstRate: CONSULT_GST_RATE,
      }],
      deliveryFee: 0,
      discount: 0,
      total: fee,
      paymentMethod: lastBooking.payment_method,
      paymentStatus: lastBooking.payment_status,
      paymentRef: lastBooking.payment_ref,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-3">
        {specialistFilter && (
          <div className="glass-card !py-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-[#33475b] flex items-center gap-1.5"><FiFilter className="text-brand-600" /> {specialistFilter}</p>
            <button type="button" onClick={() => setSpecialistFilter('')} className="text-[11px] font-bold text-brand-600">Show all</button>
          </div>
        )}
        {visibleDoctors.map((d) => (
          <button key={d.doctor_id} onClick={() => { setSelected(d); setLastBooking(null); resetAfterBooking(); }}
            className={`glass-card w-full text-left transition-all ${selected?.doctor_id === d.doctor_id ? 'ring-2 ring-brand-500' : ''}`}>
            <p className="font-extrabold text-[#0f2340]">Dr. {d.profile?.name}</p>
            <p className="text-xs text-[#5b7088]">{d.specialization} · {d.experience_years} yrs exp</p>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="flex items-center gap-1 text-amber-500 font-bold"><FiStar size={12} /> {d.rating}</span>
              <span className="font-bold text-[#0f2340]">₹{d.consultation_fee}</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              <span className="badge bg-brand-100 text-brand-700"><FiVideo size={10} /> Video</span>
              <span className="badge bg-emerald-100 text-emerald-700"><FiMapPin size={10} /> In-person</span>
            </div>
          </button>
        ))}
        {visibleDoctors.length === 0 && <p className="text-sm text-[#5b7088]">No approved doctors yet.</p>}
      </div>

      <div className="lg:col-span-2">
        {selected ? (
          <div className="glass-card">
            <h3 className="font-extrabold text-[#0f2340] mb-3 flex items-center gap-2"><FiCalendar /> Book Dr. {selected.profile?.name}</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <input type="date" value={date} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setDate(e.target.value); setSlot(null); }} className="input-field" />
              <input placeholder="Reason for visit (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" />
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setMode('in_person')}
                className={`flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 border ${mode === 'in_person' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#33475b]'}`}>
                <FiMapPin /> In-person visit
              </button>
              <button onClick={() => setMode('online')}
                className={`flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 border ${mode === 'online' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white/60 border-white/50 text-[#33475b]'}`}>
                <FiVideo /> Online video
              </button>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wide text-[#5b7088] mb-2">Available slots</p>
            <div className="flex flex-wrap gap-2">
              {slotsForDate(availability, date).map((t) => (
                <button key={t} disabled={booked.includes(t)} onClick={() => { setSlot(t); setError(''); setMessage(''); setLastBooking(null); }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    booked.includes(t)
                      ? 'bg-rose-50 text-rose-300 border-rose-100 cursor-not-allowed'
                      : slot === t
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white/60 border-white/50 hover:bg-brand-600 hover:text-white'
                  }`}>
                  {t}
                </button>
              ))}
              {slotsForDate(availability, date).length === 0 && <p className="text-xs text-[#5b7088]">No slots on this day.</p>}
            </div>

            {slot && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 rounded-xl bg-brand-50 border border-brand-200">
                <p className="text-xs font-bold text-brand-700 mb-2">
                  {mode === 'online' ? 'Online video' : 'In-person'} · {date} at {slot}
                </p>
                <div className="space-y-1 text-xs text-[#33475b] mb-3">
                  <div className="flex justify-between"><span>Consultation fee</span><span className="font-bold">₹{fee.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[11px] text-[#5b7088]"><span>Taxable value</span><span>₹{totals.taxable.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[11px] text-[#5b7088]"><span>GST @ {CONSULT_GST_RATE}%</span><span>₹{totals.gst.toFixed(2)}</span></div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button onClick={() => setPayMode('online')}
                    className={`flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-2 ${payMode === 'online' ? 'bg-brand-600 text-white' : 'bg-white text-[#33475b]'}`}>
                    <FiCreditCard /> Pay now (UPI/card)
                  </button>
                  <button onClick={() => setPayMode('clinic_counter')}
                    className={`flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-2 ${payMode === 'clinic_counter' ? 'bg-brand-600 text-white' : 'bg-white text-[#33475b]'}`}>
                    <FiClock /> Pay at clinic counter
                  </button>
                </div>
                <button onClick={book} disabled={booking} className="btn-primary w-full">
                  {booking ? 'Processing…' : payMode === 'online' ? `Pay ₹${fee.toFixed(0)} & Book` : 'Confirm Booking'}
                </button>
              </motion.div>
            )}

            {message && <p className="text-xs font-semibold text-emerald-600 mt-4 flex items-center gap-1.5"><FiCheckCircle /> {message}</p>}
            {error && <p className="text-xs font-semibold text-rose-500 mt-4">{error}</p>}

            {lastBooking && (
              <div className="mt-3 p-3 rounded-xl bg-white/70 border border-white/60">
                <p className="text-xs font-bold text-[#0f2340] mb-1">
                  Appointment #APT-{lastBooking.appointment_id} · {lastBooking.status}
                </p>
                <p className="text-[11px] text-[#5b7088] mb-2">
                  {lastBooking.consultation_mode === 'online' ? 'Online video' : 'In-person'}
                  {' · '}Payment: {lastBooking.payment_method.replaceAll('_', ' ')} ({lastBooking.payment_status.replaceAll('_', ' ')})
                  {lastBooking.payment_ref ? ` · ${lastBooking.payment_ref}` : ''}
                </p>
                {lastBooking.consultation_mode === 'online' && lastBooking.meeting_link && (
                  <a href={lastBooking.meeting_link} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-brand-600 underline block mb-2">
                    Join video consultation room
                  </a>
                )}
                <div className="flex flex-wrap gap-2">
                  {(lastBooking.payment_status === 'pending' || lastBooking.payment_status === 'failed') && (
                    <>
                      <button onClick={retryPayment} disabled={booking} className="btn-primary !py-1.5 !text-xs flex-1">Retry Payment</button>
                      <button onClick={switchToCounter} className="btn-ghost !py-1.5 !text-xs flex-1">Pay at Counter</button>
                    </>
                  )}
                  <button onClick={printInvoice} className="btn-ghost !py-1.5 !text-xs flex items-center gap-1.5">
                    <FiPrinter /> GST Invoice
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card text-sm text-[#5b7088]">Select a doctor to see available slots.</div>
        )}
      </div>
    </div>
  );
}
