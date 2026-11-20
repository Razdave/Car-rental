import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RotateCcw, Star } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { backend, managementStatusOf } from '../../lib/backend';
import { addDays } from '../../lib/dates';
import { LoyaltyCard } from './LoyaltyCard';

/**
 * Repeat-business prompts on Home: rate the last trip, rebook it in one tap, and loyalty progress.
 */
export const HomeCxCards: React.FC = () => {
  const { bookings, profile, getCar, setTrip, trip } = useAppState();
  const completed = bookings
    .filter((b) => managementStatusOf(b) === 'completed')
    .sort((a, b) => b.returnDate.localeCompare(a.returnDate));
  const last = completed[0];
  const [unreviewed, setUnreviewed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const candidates = completed.slice(0, 3);
    Promise.all(candidates.map((b) => backend.listReviews(b.carId).then((r) => (r.some((x) => x.bookingId === b.id) ? null : b.id)).catch(() => null)))
      .then((ids) => active && setUnreviewed(ids.find(Boolean) ?? null));
    return () => {
      active = false;
    };
  }, [completed.map((b) => b.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || completed.length === 0) return null;
  const toReview = completed.find((b) => b.id === unreviewed);
  const rebookCar = last ? getCar(last.carId) : undefined;
  const nights = Math.max(1, Math.round((Date.parse(trip.returnDate) - Date.parse(trip.pickupDate)) / 86400000));

  return (
    <section className="mt-5 grid gap-3 lg:grid-cols-3" aria-label="For you">
      {toReview && (
        <Link to={`/bookings/${toReview.id}#review`} className="flex items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 transition-shadow hover:shadow-lift">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500">
            <Star className="size-6 fill-amber-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">How was the {toReview.car.name}?</span>
            <span className="block text-sm text-amber-900/80">Rate your trip — it takes 30 seconds</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-amber-700" />
        </Link>
      )}
      {rebookCar && (
        <Link
          to={`/cars/${rebookCar.id}/book`}
          onClick={() => setTrip({ pickupDate: trip.pickupDate, returnDate: addDays(trip.pickupDate, nights) })}
          className="flex items-center gap-4 rounded-3xl border border-line bg-white p-3 pr-4 shadow-card transition-shadow hover:shadow-lift"
        >
          <img src={rebookCar.imageUrl} alt="" className="h-14 w-20 shrink-0 rounded-2xl object-cover" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
              <RotateCcw className="size-3.5" /> Book again
            </span>
            <span className="block truncate font-bold">{rebookCar.name}</span>
            <span className="block truncate text-sm text-ink-soft">Your details are saved — book in a minute</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-faint" />
        </Link>
      )}
      <Link to="/profile#loyalty" className="block">
        <LoyaltyCard compact />
      </Link>
    </section>
  );
};
