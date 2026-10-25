import { useEffect, useMemo, useState } from 'react';

/**
 * Local, always-available illustrations. Remote `image_url`s are great when they
 * work, but pharmacy catalogues are full of dead links — so every medicine gets a
 * crisp bundled SVG keyed by its dosage form as a guaranteed fallback.
 */
const FORM_IMAGE_MAP: Record<string, string> = {
  tablet: 'tablet',
  capsules: 'capsule',
  capsule: 'capsule',
  syrup: 'syrup',
  suspension: 'syrup',
  liquid: 'syrup',
  inhalation: 'inhaler',
  inhaler: 'inhaler',
  gel: 'gel',
  ointment: 'gel',
  cream: 'cream',
  lotion: 'cream',
  device: 'device',
  thermometer: 'device',
  strips: 'strips',
  strip: 'strips',
  powder: 'powder',
  sachet: 'powder',
  injection: 'injection',
  vial: 'injection',
  syringe: 'injection',
  drops: 'drops',
  drop: 'drops',
  other: 'other',
};

const KNOWN_FORMS = new Set(Object.values(FORM_IMAGE_MAP));

/** Map a free-text medicine form onto a bundled illustration slug. */
export function medicineImageSlug(form?: string | null): string {
  const key = (form ?? '').trim().toLowerCase();
  const mapped = FORM_IMAGE_MAP[key];
  if (mapped) return mapped;
  if (KNOWN_FORMS.has(key)) return key;
  return 'other';
}

/** Absolute URL of the bundled fallback illustration for a medicine form. */
export function medicineFallbackSrc(form?: string | null): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}medicines/${medicineImageSlug(form)}.svg`;
}

interface MedicineImageProps {
  /** Used for alt text and empty-src fallbacks. */
  name: string;
  form?: string | null;
  /** Optional remote/local image URL from the catalogue. Falls back on error. */
  src?: string | null;
  /** Wrapper classes (sizing, rounding, borders). */
  className?: string;
  /** Classes applied directly to the <img>. */
  imgClassName?: string;
  /** Load immediately instead of lazily (e.g. above-the-fold detail page). */
  eager?: boolean;
}

/**
 * Medicine thumbnail with a graceful, offline-safe SVG fallback.
 * Never renders a broken image icon: failed remote URLs swap to the bundled art.
 */
export default function MedicineImage({
  name, form, src, className = '', imgClassName = '', eager = false,
}: MedicineImageProps) {
  const trimmedSrc = src?.trim() || '';
  const fallback = useMemo(() => medicineFallbackSrc(form), [form]);
  const [failed, setFailed] = useState(false);

  // A new URL deserves a fresh attempt even if the last one failed.
  useEffect(() => {
    setFailed(false);
  }, [trimmedSrc, fallback]);

  const resolved = !failed && trimmedSrc ? trimmedSrc : fallback;

  return (
    <div className={`overflow-hidden bg-gradient-to-br from-sky-50 to-sky-100 ${className}`}>
      <img
        src={resolved}
        alt={`${name}${form ? ` (${form})` : ''}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
        className={`h-full w-full object-contain ${imgClassName}`}
      />
    </div>
  );
}
