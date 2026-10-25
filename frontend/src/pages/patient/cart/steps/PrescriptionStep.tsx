import type { ChangeEvent } from 'react';
import { FiShield, FiUpload, FiCheck, FiX } from 'react-icons/fi';
import type { CartGroup, RxFilesByStore } from '../../../../types/cart';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface PrescriptionStepProps {
  groups: CartGroup[];
  rxFiles: RxFilesByStore;
  onFileSelected: (storeId: number, file: File) => void;
  onFileRemoved?: (storeId: number) => void;
  onError: (message: string) => void;
}

export default function PrescriptionStep({ groups, rxFiles, onFileSelected, onFileRemoved, onError }: PrescriptionStepProps) {
  const needsRxGroups = groups.filter((g) => g.needsRx);

  const handleFile = (storeId: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError('Only PDF, JPG, PNG or WebP files are accepted.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      onError('File too large — max 5MB.');
      return;
    }
    onError('');
    onFileSelected(storeId, file);
  };

  return (
    <div className="glass-card max-w-md mx-auto">
      <h3 className="font-extrabold text-[#0f2340] mb-3">Prescription Verification</h3>
      {needsRxGroups.length > 0 ? (
        <div className="space-y-3">
          {needsRxGroups.map((g) => (
            <div key={g.store.store_id} className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-2"><FiShield /> {g.store.store_name} requires a prescription</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="btn-ghost !py-1.5 !text-xs inline-flex items-center gap-1.5 cursor-pointer max-w-full">
                  <FiUpload /> <span className="truncate">{rxFiles[g.store.store_id]?.name || 'Upload prescription (image or PDF, max 5MB)'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                    onChange={handleFile(g.store.store_id)} />
                </label>
                {rxFiles[g.store.store_id] && onFileRemoved && (
                  <button type="button" onClick={() => onFileRemoved(g.store.store_id)}
                    className="btn-ghost !py-1.5 !px-2 !text-xs !text-rose-600 flex items-center gap-1">
                    <FiX /> Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#5b7088] flex items-center gap-2"><FiCheck className="text-emerald-500" /> No prescription required for this order.</p>
      )}
    </div>
  );
}
