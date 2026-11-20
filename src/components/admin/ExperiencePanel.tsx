import React, { useState } from 'react';
import { CheckCircle2, MessageSquare, Star } from 'lucide-react';
import type { Review } from '../../types/car';
import { backend, managementStatusOf } from '../../lib/backend';
import { loyaltyFor } from '../../lib/loyalty';
import { Button, cn } from '../ui/Button';
import { Card, SectionLabel } from '../ui/Layout';
import { Pill, Stat } from './AdminParts';
import type { AdminData } from './useAdminData';

interface Props {
  data: AdminData;
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onMessage: (customerId: string, bookingId: string) => void;
}

const DAY = 86400000;

/** Repeat business and review health: what to fix, who to thank, who to follow up with. */
export const ExperiencePanel: React.FC<Props> = ({ data, run, onMessage }) => {
  const now = Date.now();
  const recent = data.reviews.filter((r) => now - Date.parse(r.createdAt) < 90 * DAY);
  const avg = recent.length ? recent.reduce((s, r) => s + r.rating, 0) / recent.length : 0;

  const completed = data.bookings.filter((b) => managementStatusOf(b) === 'completed');
  const reviewedIds = new Set(data.reviews.map((r) => r.bookingId));
  const reviewRate = completed.length ? completed.filter((b) => reviewedIds.has(b.id)).length / completed.length : 0;

  // Repeat customers: more than one completed trip.
  const tripsBy = new Map<string, number>();
  completed.forEach((b) => {
    const key = b.customerId ?? b.driverInfo.email.toLowerCase();
    tripsBy.set(key, (tripsBy.get(key) ?? 0) + 1);
  });
  const customersWithTrips = tripsBy.size;
  const repeat = [...tripsBy.values()].filter((n) => n > 1).length;
  const tierCounts = [...tripsBy.values()].reduce<Record<string, number>>((acc, n) => {
    const t = loyaltyFor(n).tier.name;
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  const followUps = data.reviews.filter((r) => r.followUp === 'open');
  const needsReply = data.reviews.filter((r) => !r.hidden && !r.staffReply && r.followUp !== 'open').slice(0, 10);
  const carName = (id: string) => data.cars.find((c) => c.id === id)?.name ?? id;
  const customerOf = (r: Review) => data.bookings.find((b) => b.id === r.bookingId);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Avg rating (90 days)" value={recent.length ? `★ ${avg.toFixed(2)}` : '—'} hint={`${recent.length} reviews`} tone={avg && avg < 4.3 ? 'text-amber-700' : undefined} />
        <Stat label="Review rate" value={`${Math.round(reviewRate * 100)}%`} hint="Completed trips reviewed" />
        <Stat label="Repeat customers" value={customersWithTrips ? `${Math.round((repeat / customersWithTrips) * 100)}%` : '—'} hint={`${repeat} of ${customersWithTrips}`} />
        <Stat label="Open follow-ups" value={followUps.length} tone={followUps.length ? 'text-brand' : undefined} hint="Ratings of 3★ or less" />
        <Stat label="Loyalty tiers" value={Object.entries(tierCounts).map(([t, n]) => `${n} ${t}`).join(' · ') || '—'} />
      </div>

      <section>
        <SectionLabel>Service recovery — follow up within one working day</SectionLabel>
        {followUps.length === 0 ? (
          <Card className="flex items-center gap-2 p-5 text-sm text-ink-soft"><CheckCircle2 className="size-5 text-emerald-600" /> No open follow-ups.</Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {followUps.map((r) => <FollowUpCard key={r.id} review={r} car={carName(r.carId)} customer={customerOf(r)} run={run} onMessage={onMessage} />)}
          </div>
        )}
      </section>

      <section>
        <SectionLabel>Thank reviewers — public replies build trust</SectionLabel>
        {needsReply.length === 0 ? (
          <Card className="p-5 text-sm text-ink-soft">Every published review has a reply.</Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {needsReply.map((r) => <ReplyCard key={r.id} review={r} car={carName(r.carId)} run={run} />)}
          </div>
        )}
      </section>
    </div>
  );
};

const ReviewHeader: React.FC<{ review: Review; car: string }> = ({ review, car }) => (
  <>
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="flex" aria-label={`${review.rating} out of 5`}>
        {Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn('size-4', i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-line')} />)}
      </span>
      <span className="font-bold">{review.authorName}</span>
      <span className="text-ink-soft">· {car} · {new Date(review.createdAt).toLocaleDateString('en-GB')}</span>
    </p>
    <p className="mt-1 text-[15px] text-ink-muted">{review.comment || <em>No comment</em>}</p>
  </>
);

const ReplyBox: React.FC<{ initial?: string; onSave: (text: string) => void; placeholder: string; cta: string }> = ({ initial = '', onSave, placeholder, cta }) => {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-3">
      <textarea className="field min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={1000} />
      <Button size="sm" variant="dark" className="mt-2" disabled={!text.trim()} onClick={() => onSave(text)}>{cta}</Button>
    </div>
  );
};

const ReplyCard: React.FC<{ review: Review; car: string; run: Props['run'] }> = ({ review, car, run }) => (
  <Card className="p-4">
    <ReviewHeader review={review} car={car} />
    <ReplyBox
      placeholder={`Thanks ${review.authorName.split(' ')[0]}! …`}
      cta="Post public reply"
      onSave={(text) => void run(() => backend.admin.replyToReview(review.id, text), 'Reply published')}
    />
  </Card>
);

const FollowUpCard: React.FC<{ review: Review; car: string; customer?: ReturnType<AdminData['bookings']['find']>; run: Props['run']; onMessage: Props['onMessage'] }> = ({
  review, car, customer, run, onMessage
}) => {
  const [note, setNote] = useState(review.followUpNote ?? '');
  return (
    <Card className="border-brand/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><ReviewHeader review={review} car={car} /></div>
        <Pill className="bg-brand-soft text-brand">Follow up</Pill>
      </div>
      {customer && (
        <p className="mt-2 text-sm text-ink-soft">
          {customer.driverInfo.fullName} · {customer.driverInfo.phone} · {customer.driverInfo.email} · {customer.id}
        </p>
      )}
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">What we did (internal)</span>
        <textarea className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called the customer, refunded the delivery fee, retrained the team…" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {customer && (
          <Button size="sm" variant="secondary" onClick={() => onMessage(customer.customerId ?? customer.driverInfo.email.toLowerCase(), customer.id)}>
            <MessageSquare className="size-4" /> Message customer
          </Button>
        )}
        <Button size="sm" variant="dark" disabled={!note.trim()} onClick={() => void run(() => backend.admin.setFollowUp(review.id, 'resolved', note.trim()), 'Follow-up resolved')}>
          Mark resolved
        </Button>
      </div>
      <ReplyBox
        initial={review.staffReply ?? ''}
        placeholder="Optional public reply — acknowledge the issue and what you changed."
        cta="Post public reply"
        onSave={(text) => void run(() => backend.admin.replyToReview(review.id, text), 'Reply published')}
      />
    </Card>
  );
};
