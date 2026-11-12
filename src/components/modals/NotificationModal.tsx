import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, CalendarClock, ChevronRight, Gift, Hourglass, KeyRound } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { formatDate } from '../../lib/dates';
import { cn } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  icon: React.ElementType;
  tint: string;
  to: string;
}

/** Notifications are derived from real booking state rather than a hard-coded list. */
export function useNotifications(): AppNotification[] {
  const { bookings } = useAppState();
  return useMemo(() => {
    const items: AppNotification[] = [];
    for (const b of bookings) {
      if (b.status === 'active') {
        items.push({
          id: `${b.id}-active`,
          title: `${b.car.name} is ready`,
          message: `Your digital key is live. Return by ${formatDate(b.returnDate)}, ${b.returnTime}.`,
          icon: KeyRound,
          tint: 'bg-brand-soft text-brand',
          to: '/bookings?tab=active'
        });
      } else if (b.status === 'upcoming' && b.managementStatus === 'pending') {
        items.push({
          id: `${b.id}-pending`,
          title: 'Booking received',
          message: `We're confirming your ${b.car.name} for ${formatDate(b.pickupDate)}.`,
          icon: Hourglass,
          tint: 'bg-amber-50 text-amber-600',
          to: `/bookings/${b.id}`
        });
      } else if (b.status === 'upcoming') {
        items.push({
          id: `${b.id}-upcoming`,
          title: 'Upcoming pick-up',
          message: `${b.car.name} · ${formatDate(b.pickupDate)} at ${b.pickupTime}, ${b.pickupLocation}.`,
          icon: CalendarClock,
          tint: 'bg-emerald-50 text-emerald-600',
          to: `/bookings/${b.id}`
        });
      }
    }
    items.push({
      id: 'promo-drive20',
      title: 'Weekend offer',
      message: 'Use code DRIVE20 at checkout for 20% off any rental.',
      icon: Gift,
      tint: 'bg-amber-50 text-amber-600',
      to: '/explore'
    });
    return items;
  }, [bookings]);
}

export const NotificationModal: React.FC<{ notifications: AppNotification[] }> = ({ notifications }) => {
  const { notificationsOpen, setNotificationsOpen } = useAppState();
  const navigate = useNavigate();
  const close = () => setNotificationsOpen(false);

  return (
    <Sheet open={notificationsOpen} onClose={close} title="Notifications">
      {notifications.length === 0 ? (
        <div className="py-10 text-center text-ink-soft">
          <BellOff className="mx-auto mb-2 size-8" />
          <p className="text-sm">You're all caught up.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = n.icon;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    navigate(n.to);
                  }}
                  className="flex w-full items-start gap-3 rounded-2xl border border-line p-3.5 text-left transition-colors hover:bg-surface"
                >
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', n.tint)}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{n.title}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-ink-muted">{n.message}</span>
                  </span>
                  <ChevronRight className="mt-3 size-4 shrink-0 text-ink-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
};
