import { useEffect, useState, useCallback, useRef } from 'react';
import { FiBell } from 'react-icons/fi';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import type { Database } from '../types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems(data ?? []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel('my-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  const markRead = async (id: number) => {
    await supabase.from('notifications').update({ is_read: true }).eq('notification_id', id);
    load();
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    load();
  };

  // Rendered inside authenticated layouts only; if there's no user yet
  // (e.g. brief moment during session hydration), render nothing rather
  // than a bell that can never load data.
  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'} aria-expanded={open}
        className="relative w-10 h-10 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center text-[#33475b] transition-colors">
        <FiBell />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto glass-card !p-0 z-50 shadow-2xl">
          <div className="flex items-center justify-between p-3 border-b border-white/40">
            <p className="font-extrabold text-sm text-[#0f2340]">Notifications</p>
            {unread > 0 && <button onClick={markAllRead} className="text-[11px] font-bold text-brand-600">Mark all read</button>}
          </div>
          <div>
            {items.length === 0 && <p className="text-xs text-[#5b7088] p-4">No notifications yet.</p>}
            {items.map((n) => (
              <button key={n.notification_id} onClick={() => markRead(n.notification_id)}
                className={`w-full text-left p-3 border-b border-white/30 last:border-0 hover:bg-white/50 ${!n.is_read ? 'bg-brand-50/60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-[#0f2340]">{n.title}</p>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1" />}
                </div>
                {n.message && <p className="text-[11px] text-[#5b7088] mt-0.5">{n.message}</p>}
                <p className="text-[10px] text-[#8a9bb0] mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
