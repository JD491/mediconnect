import { useEffect, useState, useCallback } from 'react';
import { FiStar, FiTrash2 } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';

type ReviewRow = Database['public']['Tables']['reviews']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type TargetType = ReviewRow['target_type'];
type FilterKey = TargetType | 'all';

interface ReviewWithReviewer extends ReviewRow {
  reviewer: Pick<ProfileRow, 'name' | 'email'> | null;
}

const FILTER_KEYS: FilterKey[] = ['all', 'medicine', 'store', 'doctor'];

export default function Reviews() {
  const [rows, setRows] = useState<ReviewWithReviewer[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    let q = supabase.from('reviews').select('*, reviewer:profiles(name, email)').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('target_type', filter);
    const { data } = await q;
    setRows((data ?? []) as unknown as ReviewWithReviewer[]);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number) => {
    await supabase.from('reviews').delete().eq('review_id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {FILTER_KEYS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-bold rounded-xl px-3 py-2 capitalize ${filter === f ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>{f}</button>
        ))}
      </div>

      <div className="glass-card space-y-2">
        {rows.map((r) => (
          <div key={r.review_id} className="p-3 rounded-xl bg-white/50 border border-white/40 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="badge bg-brand-100 text-brand-700 capitalize">{r.target_type} #{r.target_id}</span>
                <span className="flex items-center gap-0.5 text-amber-400">
                  {[1, 2, 3, 4, 5].map((n) => <FiStar key={n} fill={n <= r.rating ? 'currentColor' : 'none'} size={12} />)}
                </span>
              </div>
              <p className="text-sm text-[#33475b]">{r.comment || <span className="italic text-[#8a9bb0]">No comment</span>}</p>
              <p className="text-[11px] text-[#5b7088] mt-1">{r.reviewer?.name} · {new Date(r.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => remove(r.review_id)} className="text-rose-400 hover:text-rose-600 shrink-0" aria-label="Delete review"><FiTrash2 /></button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-[#5b7088]">No reviews in this view.</p>}
      </div>
    </div>
  );
}
