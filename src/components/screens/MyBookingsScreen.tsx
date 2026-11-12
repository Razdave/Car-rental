import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, CarFront, ChevronRight, KeyRound, MapPin } from 'lucide-react';
import type { Booking } from '../../types/car';
import { useAppState } from '../../state/AppState';
import { formatDateRange } from '../../lib/dates';
import { bookingDurationLabel } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { CancelBookingSheet, ExtendBookingSheet } from '../booking/BookingSheets';
import { DigitalKeyModal } from '../modals/DigitalKeyModal';
import { Button, cn, LinkButton } from '../ui/Button';
import { Container, EmptyState, PageTitle } from '../ui/Layout';

type Tab = Booking['status'];
const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' }
];

const StatusBadge: React.FC<{ booking: Booking }> = ({ booking }) => {
  const pending = booking.status === 'upcoming' && booking.managementStatus === 'pending';
  const map = {
    active: ['bg-emerald-50 text-emerald-700', 'In progress'],
    upcoming: pending ? ['bg-amber-50 text-amber-800', 'Awaiting confirmation'] : ['bg-sky-50 text-sky-700', 'Confirmed'],
    completed: ['bg-surface-2 text-ink-muted', 'Completed'],
    cancelled: ['bg-brand-soft text-brand', 'Cancelled']
  } as const;
  const [cls, label] = map[booking.status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', cls)}>
      {booking.status === 'active' && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {label}
    </span>
  );
};

export const MyBookingsScreen: React.FC = () => {
  const { bookings } = useAppState();
  const [params, setParams] = useSearchParams();
  const [keyFor, setKeyFor] = useState<Booking | null>(null);
  const [cancelFor, setCancelFor] = useState<Booking | null>(null);
  const [extendFor, setExtendFor] = useState<Booking | null>(null);

  const counts = Object.fromEntries(TABS.map((t) => [t.id, bookings.filter((b) => b.status === t.id).length])) as Record<Tab, number>;
  const requested = params.get('tab') as Tab | null;
  const tab: Tab =
    requested && TABS.some((t) => t.id === requested)
      ? requested
      : (TABS.find((t) => counts[t.id] > 0)?.id ?? 'upcoming');

  const list = bookings
    .filter((b) => b.status === tab)
    .sort((a, b) => (tab === 'completed' || tab === 'cancelled' ? b.pickupDate.localeCompare(a.pickupDate) : a.pickupDate.localeCompare(b.pickupDate)));

  return (
    <Container className="max-w-4xl">
      <PageTitle title="My trips" subtitle="Manage bookings, keys and extensions" />

      <div role="tablist" aria-label="Booking status" className="-mx-4 flex gap-1 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:rounded-2xl sm:bg-surface-2 sm:p-1">
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setParams({ tab: t.id }, { replace: true })}
              className={cn(
                'min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition-colors sm:flex-1',
                selected ? 'bg-ink text-white sm:bg-white sm:text-ink sm:shadow-sm' : 'bg-white text-ink-muted hover:text-ink sm:bg-transparent'
              )}
            >
              {t.label}
              {counts[t.id] > 0 && <span className={cn('ml-1.5', selected ? 'opacity-70' : 'text-ink-soft')}>{counts[t.id]}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-5 space-y-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<CarFront className="size-7" />}
            title={`No ${TABS.find((t) => t.id === tab)!.label.toLowerCase()} trips`}
            description={tab === 'upcoming' || tab === 'active' ? 'Find a car and book your next drive in a couple of minutes.' : 'Nothing here yet.'}
            action={<LinkButton to="/explore" variant="dark">Explore the fleet</LinkButton>}
          />
        ) : (
          list.map((b) => (
            <article key={b.id} className="overflow-hidden rounded-[28px] border border-line/80 bg-white shadow-card">
              <Link to={`/bookings/${b.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-surface sm:p-5">
                <img src={b.car.imageUrl} alt="" className="h-20 w-28 shrink-0 rounded-2xl object-cover sm:w-32" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge booking={b} />
                    <span className="font-mono text-xs text-ink-soft">{b.id}</span>
                  </div>
                  <h2 className="mt-1 truncate text-base font-bold sm:text-lg">{b.car.name}</h2>
                  <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                    <CalendarDays className="size-4 shrink-0 text-ink-soft" />
                    <span className="truncate">
                      {formatDateRange(b.pickupDate, b.returnDate)} · {bookingDurationLabel(b)}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                    <MapPin className="size-4 shrink-0 text-brand" />
                    <span className="truncate">{b.pickupLocation}</span>
                  </p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="font-extrabold">{formatNaira(b.totalAmount)}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-faint" />
              </Link>

              {(b.status === 'active' || b.status === 'upcoming' || b.status === 'completed') && (
                <div className="flex flex-wrap gap-2 border-t border-line bg-surface/60 p-3 sm:px-5">
                  {b.status === 'active' && (
                    <>
                      <Button size="sm" onClick={() => setKeyFor(b)} className="flex-1 sm:flex-none">
                        <KeyRound className="size-4" /> Digital key
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setExtendFor(b)} className="flex-1 sm:flex-none">
                        Extend trip
                      </Button>
                    </>
                  )}
                  {b.status === 'upcoming' && (
                    <>
                      <LinkButton to={`/bookings/${b.id}`} size="sm" variant="dark" className="flex-1 sm:flex-none">
                        View details
                      </LinkButton>
                      <Button size="sm" variant="danger" onClick={() => setCancelFor(b)} className="flex-1 sm:flex-none">
                        Cancel
                      </Button>
                    </>
                  )}
                  {b.status === 'completed' && (
                    <LinkButton to={`/cars/${b.car.id}`} size="sm" variant="dark" className="flex-1 sm:flex-none">
                      Book again
                    </LinkButton>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <DigitalKeyModal booking={keyFor} onClose={() => setKeyFor(null)} />
      <CancelBookingSheet booking={cancelFor} onClose={() => setCancelFor(null)} />
      <ExtendBookingSheet booking={extendFor} onClose={() => setExtendFor(null)} />
    </Container>
  );
};
