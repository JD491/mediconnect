import { useEffect, useState, useCallback } from 'react';
import { FiClipboard } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';

type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface AuditLogWithActor extends AuditLogRow {
  actor: Pick<ProfileRow, 'name' | 'email'> | null;
}

const ENTITY_TYPES = ['all', 'store', 'doctor', 'profile', 'medicine'];

export default function AuditLogs() {
  const [rows, setRows] = useState<AuditLogWithActor[]>([]);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    let q = supabase.from('audit_logs').select('*, actor:profiles(name, email)').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('entity_type', filter);
    const { data } = await q;
    setRows((data ?? []) as unknown as AuditLogWithActor[]);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap gap-2">
        {ENTITY_TYPES.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-bold rounded-xl px-3 py-2 capitalize ${filter === f ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>{f}</button>
        ))}
      </div>

      <div className="glass-card space-y-2">
        {rows.map((r) => (
          <div key={r.log_id} className="p-3 rounded-xl bg-white/50 border border-white/40">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-[#0f2340] flex items-center gap-2">
                <FiClipboard className="text-brand-500" /> {r.action.replaceAll('_', ' ')}
              </p>
              <span className="text-[11px] text-[#5b7088]">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-[#5b7088] capitalize">{r.entity_type} #{r.entity_id} · by {r.actor?.name || 'system'}</p>
            {r.details && (
              <pre className="text-[10px] text-[#8a9bb0] mt-1.5 whitespace-pre-wrap font-mono">{JSON.stringify(r.details, null, 0)}</pre>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-[#5b7088]">No audit events yet.</p>}
      </div>
    </div>
  );
}
