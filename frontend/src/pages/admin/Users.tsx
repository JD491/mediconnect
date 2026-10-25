import { useEffect, useState, useMemo } from 'react';
import { FiSearch, FiUserX, FiUserCheck } from 'react-icons/fi';
import { supabase } from '../../lib/supabaseClient';
import { SkeletonTable } from '../../components/UIStates';
import type { Database, UserRole } from '../../types/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type RoleFilter = UserRole | 'all';

const ROLES: RoleFilter[] = ['all', 'customer', 'store_owner', 'doctor', 'nurse', 'admin'];

export default function Users() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (role !== 'all' && r.role !== role) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${r.name} ${r.email}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, role]);

  const toggleStatus = async (row: ProfileRow) => {
    const next = row.status === 'active' ? 'suspended' : 'active';
    await supabase.from('profiles').update({ status: next }).eq('id', row.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9bb0]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="input-field !pl-9" />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} className="input-field sm:!w-52">
          {ROLES.map((r) => <option key={r} value={r}>{r === 'all' ? 'All roles' : r.replaceAll('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] text-[#5b7088] font-bold uppercase border-b border-white/50">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/30 last:border-0">
                  <td className="py-2.5 pr-3 font-bold text-[#0f2340]">{r.name}</td>
                  <td className="py-2.5 pr-3 text-[#33475b]">{r.email}</td>
                  <td className="py-2.5 pr-3 text-[#33475b] capitalize">{r.role.replaceAll('_', ' ')}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`badge ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>{r.status}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-[#5b7088]">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="py-2.5 pr-3">
                    <button onClick={() => toggleStatus(r)} className="btn-ghost !py-1.5 !px-2.5 !text-[11px] flex items-center gap-1">
                      {r.status === 'active' ? <><FiUserX /> Suspend</> : <><FiUserCheck /> Activate</>}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-[#5b7088]">No users match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
