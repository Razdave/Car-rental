import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import type { Car, Review } from '../../types/car';
import { backend } from '../../lib/backend';
import { cn } from '../ui/Button';

export const Stars: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
  <span className={cn('flex', className)} aria-label={`${value} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={cn('size-4', i < Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-line')} />
    ))}
  </span>
);

/** Published reviews for a car, newest first (live). */
export const ReviewsSection: React.FC<{ car: Car }> = ({ car }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => backend.listReviews(car.id).then((r) => active && setReviews(r)).catch(() => {});
    void load();
    const off = backend.onFleetChange(load);
    return () => {
      active = false;
      off();
    };
  }, [car.id]);

  const shown = showAll ? reviews : reviews.slice(0, 3);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <p className="text-3xl font-extrabold">{car.rating.toFixed(1)}</p>
        <div>
          <Stars value={car.rating} />
          <p className="text-sm text-ink-soft">{car.reviewCount} reviews</p>
        </div>
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm text-ink-soft">No written reviews yet.</p>
      ) : (
        <ul className="space-y-4">
          {shown.map((r) => (
            <li key={r.id} className="border-t border-line pt-4 first:border-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{r.authorName}</p>
                <p className="text-xs text-ink-soft">{new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p>
              </div>
              <Stars value={r.rating} className="mt-1" />
              {r.comment && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{r.comment}</p>}
              {r.staffReply && (
                <div className="mt-2 rounded-2xl bg-surface p-3 text-sm">
                  <p className="font-bold">Response from Aurevon</p>
                  <p className="mt-0.5 text-ink-muted">{r.staffReply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {reviews.length > 3 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 min-h-11 text-sm font-bold text-brand hover:underline">
          {showAll ? 'Show fewer' : `Show all ${reviews.length} reviews`}
        </button>
      )}
    </div>
  );
};
