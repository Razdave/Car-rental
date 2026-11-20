import React from 'react';
import { Eye, EyeOff, Star } from 'lucide-react';
import type { Car, Review } from '../../types/car';
import { backend } from '../../lib/backend';
import { Button, cn } from '../ui/Button';
import { Card } from '../ui/Layout';

interface Props {
  reviews: Review[];
  cars: Car[];
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

export const ReviewsPanel: React.FC<Props> = ({ reviews, cars, run }) => (
  <>
  <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
    Hide a review only if it breaks the content policy — abuse, personal details, spam or a review of the wrong trip. Never hide a review because it’s negative: reply to it and follow up instead (Experience tab). Selectively hiding bad reviews misleads customers and breaks consumer-protection and platform rules.
  </p>
  <Card className="divide-y divide-line overflow-hidden">
    {reviews.length === 0 && <p className="p-5 text-sm text-ink-soft">No reviews yet. Customers can review a car once their trip is completed.</p>}
    {reviews.map((r) => (
      <div key={r.id} className={cn('flex flex-wrap items-start gap-3 p-4', r.hidden && 'opacity-60')}>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex" aria-label={`${r.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={cn('size-4', i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-line')} />
              ))}
            </span>
            <span className="font-bold">{r.authorName}</span>
            <span className="text-ink-soft">· {cars.find((c) => c.id === r.carId)?.name ?? r.carId} · {r.bookingId}</span>
          </p>
          <p className="mt-1 text-[15px] text-ink-muted">{r.comment || <em>No comment</em>}</p>
          {r.staffReply && <p className="mt-1.5 rounded-xl bg-surface p-2 text-sm"><strong>Our reply:</strong> {r.staffReply}</p>}
          {r.followUp === 'open' && <p className="mt-1 text-sm font-bold text-brand">Follow-up open — see the Experience tab</p>}
          {r.followUp === 'resolved' && <p className="mt-1 text-sm text-emerald-700">Followed up{r.followUpNote ? `: ${r.followUpNote}` : ''}</p>}
        </div>
        <Button size="sm" variant="secondary" onClick={() => void run(() => backend.admin.setReviewHidden(r.id, !r.hidden), r.hidden ? 'Review published' : 'Review hidden')}>
          {r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {r.hidden ? 'Publish' : 'Hide'}
        </Button>
      </div>
    ))}
  </Card>
  </>
);
