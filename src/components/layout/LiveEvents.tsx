import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { backend, managementStatusOf } from '../../lib/backend';
import { notifyDevice } from '../../lib/push';
import { readStored, writeStored } from '../../lib/storage';

const STATUS_TEXT: Record<string, string> = {
  confirmed: 'is confirmed — see you at pick-up',
  active: 'has started — your digital key is live',
  completed: 'is complete — thanks for driving with us',
  cancelled: 'was cancelled'
};

export const markMessagesSeen = () => writeStored('aurevon.msgSeenAt', new Date().toISOString());

/** Turns live booking and message changes into toasts and device notifications. Renders nothing. */
export function LiveEvents() {
  const { bookings, profile, showToast } = useAppState();
  const { pathname } = useLocation();
  const prev = useRef<Map<string, string> | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Booking status / payment changes pushed from staff or Paystack.
  useEffect(() => {
    const snapshot = new Map(bookings.map((b) => [b.id, `${managementStatusOf(b)}|${b.paymentStatus ?? ''}`]));
    if (prev.current) {
      for (const b of bookings) {
        const before = prev.current.get(b.id);
        if (!before) continue;
        const [status, payment] = before.split('|');
        const now = managementStatusOf(b);
        if (now !== status && STATUS_TEXT[now]) {
          const text = `Your ${b.car.name} booking ${STATUS_TEXT[now]}.`;
          showToast(text, now === 'cancelled' ? 'default' : 'success');
          void notifyDevice(`Booking ${b.id}`, text, `/bookings/${b.id}`, `booking-${b.id}`);
        } else if (b.paymentStatus === 'paid' && payment !== 'paid') {
          void notifyDevice('Payment received', `Thanks — ${b.id} is paid.`, `/bookings/${b.id}`, `pay-${b.id}`);
        }
      }
    }
    prev.current = snapshot;
  }, [bookings, showToast]);

  // New replies from the rental team.
  useEffect(() => {
    if (!profile) return;
    const check = async () => {
      const list = await backend.listMessages().catch(() => []);
      const seenAt = readStored<string>('aurevon.msgSeenAt', '');
      const fresh = list.filter((m) => m.sender === 'staff' && m.createdAt > seenAt);
      if (!fresh.length) return;
      if (pathRef.current === '/messages') return markMessagesSeen();
      const last = fresh[fresh.length - 1];
      showToast(`New message from Aurevon: ${last.body.slice(0, 80)}`);
      void notifyDevice('Aurevon concierge', last.body.slice(0, 140), '/messages', 'messages');
      markMessagesSeen();
    };
    if (!readStored('aurevon.msgSeenAt', '')) markMessagesSeen();
    return backend.onMessages(() => void check());
  }, [profile?.id, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
