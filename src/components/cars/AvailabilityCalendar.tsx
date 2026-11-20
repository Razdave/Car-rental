import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { backend } from '../../lib/backend';
import { toISODate, todayISO } from '../../lib/dates';
import { cn } from '../ui/Button';

interface Props {
  carId: string;
  /** Highlight the customer's searched range. */
  selection?: { from: string; to: string };
  onPick?: (date: string) => void;
}

const MAX_MONTHS_AHEAD = 6;

/** Month view of a car's availability; updates live when bookings or blocks change. */
export const AvailabilityCalendar: React.FC<Props> = ({ carId, selection, onPick }) => {
  const now = new Date();
  const [offset, setOffset] = useState(0);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const from = toISODate(first);
  const to = toISODate(last);
  const today = todayISO();

  useEffect(() => {
    let active = true;
    const load = () => backend.bookedDays(carId, from, to).then((d) => active && setBooked(new Set(d))).catch(() => {});
    void load();
    const off = backend.onFleetChange(load);
    return () => {
      active = false;
      off();
    };
  }, [carId, from, to]);

  // Monday-first grid
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: last.getDate() }, (_, i) => toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1)))
  ];

  return (
    <div className="max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
          <ChevronLeft className="size-5" />
        </button>
        <p className="font-extrabold" aria-live="polite">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
        <button type="button" aria-label="Next month" disabled={offset >= MAX_MONTHS_AHEAD} onClick={() => setOffset((o) => o + 1)} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-soft">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const past = d < today;
          const isBooked = booked.has(d);
          const inSelection = selection && d >= selection.from && d <= selection.to;
          return (
            <button
              key={d}
              type="button"
              disabled={past || isBooked || !onPick}
              onClick={() => onPick?.(d)}
              aria-label={`${d}: ${past ? 'past' : isBooked ? 'booked' : 'available'}`}
              className={cn(
                'flex h-11 items-center justify-center rounded-xl text-sm font-bold transition-colors',
                past && 'text-ink-faint',
                !past && isBooked && 'bg-surface-2 text-ink-faint line-through',
                !past && !isBooked && 'bg-emerald-50 text-emerald-800',
                !past && !isBooked && onPick && 'hover:bg-emerald-100',
                inSelection && !isBooked && 'bg-ink text-white hover:bg-ink',
                inSelection && isBooked && 'bg-brand-soft text-brand',
                d === today && 'ring-2 ring-brand'
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-100" />Available</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-surface-2" />Booked</span>
        {selection && <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-ink" />Your dates</span>}
      </div>
    </div>
  );
};
