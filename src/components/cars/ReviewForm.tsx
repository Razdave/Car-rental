import React, { useEffect, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Booking } from '../../types/car';
import { backend } from '../../lib/backend';
import { useAppState } from '../../state/AppState';
import { Button, cn } from '../ui/Button';
import { Card } from '../ui/Layout';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export const ReviewForm: React.FC<{ booking: Booking }> = ({ booking }) => {
  const { showToast } = useAppState();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedRating, setSubmittedRating] = useState(0);

  useEffect(() => {
    backend.listReviews(booking.carId).then((r) => setDone(r.some((x) => x.bookingId === booking.id))).catch(() => setDone(false));
  }, [booking.carId, booking.id]);

  if (done === null) return null;
  if (done) {
    return submittedRating > 0 && submittedRating <= 3 ? (
      <Card className="mt-4 p-5 text-sm">
        <p className="font-bold">We’re sorry this trip let you down.</p>
        <p className="mt-1 text-ink-muted">
          Your review is published as written. A manager will contact you within one working day to put things right — you’ll find our message in{' '}
          <Link to="/messages" className="font-bold text-brand hover:underline">Messages</Link>.
        </p>
      </Card>
    ) : (
      <Card className="mt-4 flex items-center gap-3 p-5 text-sm font-bold text-emerald-800">
        <CheckCircle2 className="size-5" /> Thanks for reviewing your trip — see you next time.
      </Card>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setBusy(true);
    try {
      await backend.submitReview(booking.id, rating, comment);
      setSubmittedRating(rating);
      setDone(true);
      showToast('Review published — thank you!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post your review', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || rating;
  return (
    <Card id="review" className="mt-4 scroll-mt-24 p-5">
      <form onSubmit={submit}>
        <p className="font-extrabold">How was the {booking.car.name}?</p>
        <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="flex size-11 items-center justify-center rounded-full hover:bg-amber-50"
            >
              <Star className={cn('size-7 transition-colors', n <= shown ? 'fill-amber-400 text-amber-400' : 'text-line')} />
            </button>
          ))}
          <span className="ml-2 text-sm font-bold text-ink-muted">{LABELS[shown]}</span>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Your review</span>
          <textarea className="field min-h-24" placeholder={rating > 0 && rating <= 3 ? 'What went wrong? A manager reads every low rating and will follow up personally.' : 'Tell other drivers about the car and the service (optional)'} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <Button type="submit" className="mt-3" disabled={!rating || busy}>Post review</Button>
      </form>
    </Card>
  );
};
