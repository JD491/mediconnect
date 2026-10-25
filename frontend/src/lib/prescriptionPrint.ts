import type { EPrescriptionItem } from '../types/database.types';

export interface PrescriptionPrintInput {
  id: number;
  date: string;
  doctorName: string;
  qualification: string | null;
  registrationNumber: string | null;
  clinic: string | null;
  patientName: string;
  patientAge: string | number | null;
  patientGender: string | null;
  patientPhone: string | null;
  diagnosis: string;
  advice: string | null;
  followUpDate: string | null;
  vitals: Record<string, string | number | null> | null;
  items: EPrescriptionItem[];
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

const VITAL_LABELS: Record<string, string> = {
  temperature: 'Temp (°F)', bp_systolic: 'BP systolic', bp_diastolic: 'BP diastolic',
  heart_rate: 'Heart rate', spo2: 'SpO₂', glucose: 'Glucose', weight_kg: 'Weight (kg)',
  respiratory_rate: 'Resp. rate', pain_score: 'Pain score',
};

/** Opens a print-ready A4 e-prescription in a new window. */
export function printPrescription(input: PrescriptionPrintInput): boolean {
  const vitalRows = input.vitals
    ? Object.entries(input.vitals)
      .filter(([, v]) => v !== null && v !== '' && v !== undefined)
      .map(([k, v]) => `<span><strong>${esc(VITAL_LABELS[k] ?? k)}:</strong> ${esc(String(v))}</span>`)
      .join(' ')
    : '';

  const medicationRows = input.items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(item.medicine_name)}</strong>${item.instructions ? `<div class="muted">${esc(item.instructions)}</div>` : ''}</td>
      <td class="num">${esc(item.dosage)}</td>
      <td class="num">${esc(item.duration)}</td>
    </tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Prescription #${input.id}</title>
  <style>
    *{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f2340;margin:0;padding:36px;max-width:820px;margin:0 auto}
    .head{display:flex;justify-content:space-between;border-bottom:3px solid #1e4fb8;padding-bottom:14px;margin-bottom:18px}
    .brand{font-size:24px;font-weight:800;color:#1e4fb8}.muted{color:#5b7088;font-size:11px}
    h1{font-size:17px;margin:0 0 4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;font-size:13px}
    .vitals{background:#eef4ff;border-radius:10px;padding:10px 12px;font-size:12px;display:flex;flex-wrap:wrap;gap:6px 18px;margin-bottom:18px}
    .section{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#1e4fb8;margin:18px 0 6px}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#eef4ff;text-align:left;padding:8px;border-bottom:1px solid #cbd5e1}
    td{padding:9px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.num{text-align:right;white-space:nowrap}
    .rx{font-size:28px;font-weight:800;font-family:Georgia,serif;color:#173e93;margin-bottom:4px}
    .sign{margin-top:44px;display:flex;justify-content:flex-end}.sign div{border-top:1px solid #0f2340;padding-top:6px;font-size:12px;min-width:220px;text-align:center}
    .foot{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#5b7088}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="head">
    <div><div class="brand">MediConnect</div><div class="muted">${esc(input.clinic ?? 'MediConnect Partner Clinic')}</div></div>
    <div style="text-align:right"><h1>E-PRESCRIPTION</h1><div class="muted">Rx #MC-RX-${input.id}</div><div class="muted">${esc(new Date(input.date).toLocaleString())}</div></div>
  </div>
  <div class="grid">
    <div>
      <strong>${esc(input.doctorName)}</strong><br>
      <span class="muted">${esc(input.qualification ?? '')}${input.qualification ? '<br>' : ''}Reg. ${esc(input.registrationNumber ?? '—')}</span>
    </div>
    <div>
      <strong>Patient: ${esc(input.patientName)}</strong><br>
      <span class="muted">${[input.patientAge ? `${input.patientAge} yrs` : '', input.patientGender ?? '', input.patientPhone ?? ''].filter(Boolean).map(esc).join(' · ')}</span>
    </div>
  </div>
  ${vitalRows ? `<div class="vitals">${vitalRows}</div>` : ''}
  <div class="section">Diagnosis</div>
  <div style="font-size:13px">${esc(input.diagnosis)}</div>
  <div class="section">Medication</div>
  <div class="rx">℞</div>
  <table><thead><tr><th>#</th><th>Medicine</th><th class="num">Dosage</th><th class="num">Duration</th></tr></thead><tbody>${medicationRows}</tbody></table>
  ${input.advice ? `<div class="section">Advice</div><div style="font-size:13px;white-space:pre-wrap">${esc(input.advice)}</div>` : ''}
  ${input.followUpDate ? `<div class="section">Follow-up</div><div style="font-size:13px">${esc(input.followUpDate)}</div>` : ''}
  <div class="sign"><div>${esc(input.doctorName)}<br><span class="muted">Digital signature</span></div></div>
  <div class="foot">This is a digitally generated prescription. Valid for 6 months from the date of issue. Medicines marked Rx must be dispensed only against this prescription. Verify allergies before dispensing.</div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=760');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
