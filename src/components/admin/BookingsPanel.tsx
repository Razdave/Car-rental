import React, { useMemo, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { CreditCard, MessageSquare, Search } from 'lucide-react';
import type { Booking, ManagementStatus } from '../../types/car';
import { backend, managementStatusOf } from '../../lib/backend';
import { formatDate } from '../../lib/dates';
import { bookingDurationLabel } from '../../lib/pricing';
import { formatNaira } from '../../utils/currency';
import { Button, cn } from '../ui/Button';
import { EmptyState } from '../ui/Layout';
import { AgreementPill, DepositPill, NEXT_ACTIONS, PaymentPill, StatusPill } from './AdminParts';

interface BookingRowProps {
  booking: Booking;
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onMessage: (customerId: string, bookingId: string) => void;
}

const DECLINE_REASONS = [
  'The car isn’t available for those dates',
  'We couldn’t verify the driver’s licence',
  'The driver doesn’t meet the age requirement',
  'The pick-up location or time isn’t possible',
  'Other'
];

export const BookingRow: React.FC<BookingRowProps> = ({ booking: b, run, onMessage }) => {
  const status = managementStatusOf(b);
  const [declining, setDeclining] = useState(false);
  const [settling, setSettling] = useState(false);
  const [kept, setKept] = useState(0);
  const [keptReason, setKeptReason] = useState('');
  const canSettle = b.depositStatus === 'held' && (status === 'completed' || status === 'cancelled');
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [note, setNote] = useState('');
  const customerId = b.customerId ?? b.driverInfo.email.toLowerCase();

  const decline = async () => {
    const text = [reason === 'Other' ? '' : reason, note.trim()].filter(Boolean).join('. ');
    const ok = await run(async () => {
      await backend.admin.setBookingStatus(b.id, 'cancelled');
      await backend.admin.replyMessage(
        customerId,
        `Sorry, we couldn’t accept booking ${b.id} (${b.car.name}). ${text || 'Please contact us for details.'} Any payment will be refunded in full. Reply here and we’ll help you find an alternative.`,
        b.id
      );
    }, `${b.id} declined — customer notified with the reason`);
    if (ok) setDeclining(false);
  };
  const unpaid = (b.paymentStatus ?? 'paid') === 'unpaid' && status !== 'cancelled';
  return (
    <article className="rounded-3xl border border-line bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <img src={b.car.imageUrl} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-ink-soft">{b.id}</span>
            <StatusPill booking={b} />
            <PaymentPill booking={b} />
            <AgreementPill booking={b} />
            <DepositPill booking={b} />
          </div>
          <p className="mt-1 truncate font-bold">
            {b.driverInfo.fullName} · {b.car.name}
          </p>
          <p className="text-sm text-ink-muted">
            {formatDate(b.pickupDate)} {b.pickupTime} → {formatDate(b.returnDate)} {b.returnTime} · {bookingDurationLabel(b)}
          </p>
          <p className="truncate text-sm text-ink-soft">
            {b.pickupLocation}
            {b.returnLocation !== b.pickupLocation ? ` → ${b.returnLocation}` : ''} · {b.driverInfo.phone}
          </p>
        </div>
        <p className="shrink-0 text-right font-extrabold">{formatNaira(b.totalAmount)}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {NEXT_ACTIONS[status].map((a) => (
          <Button
            key={a.to}
            size="sm"
            variant={a.tone === 'primary' ? 'dark' : a.tone === 'danger' ? 'danger' : 'secondary'}
            onClick={() =>
              status === 'pending' && a.to === 'cancelled'
                ? setDeclining(true)
                : void run(() => backend.admin.setBookingStatus(b.id, a.to as ManagementStatus), `${b.id} ${a.done} — customer notified`)
            }
          >
            {a.label}
          </Button>
        ))}
        {unpaid && (
          <Button size="sm" variant="secondary" onClick={() => void run(() => backend.admin.markPaid(b.id), `${b.id} marked as paid`)}>
            <CreditCard className="size-4" /> Mark paid
          </Button>
        )}
        {canSettle && (
          <Button size="sm" variant="secondary" onClick={() => { setKept(0); setKeptReason(''); setSettling(true); }}>
            Release deposit
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onMessage(customerId, b.id)}>
          <MessageSquare className="size-4" /> Message
        </Button>
      </div>

      <Sheet
        open={settling}
        onClose={() => setSettling(false)}
        size="sm"
        title={`Release deposit for ${b.id}`}
        description={`Held: ${formatNaira(b.depositAmount ?? 0)}. Inspect the car first.`}
        footer={
          <Button
            block
            size="lg"
            disabled={kept > 0 && keptReason.trim().length < 5}
            onClick={async () => {
              const ok = await run(
                () => backend.admin.settleDeposit(b.id, kept, keptReason),
                kept > 0 ? `Kept ${formatNaira(kept)}, refunded ${formatNaira((b.depositAmount ?? 0) - kept)}` : 'Deposit released in full'
              );
              if (ok) setSettling(false);
            }}
          >
            Refund {formatNaira(Math.max(0, (b.depositAmount ?? 0) - kept))}
          </Button>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-muted">Amount to keep (₦)</span>
          <input
            className="field"
            type="number"
            min={0}
            max={b.depositAmount ?? 0}
            step={5000}
            inputMode="numeric"
            value={kept || ''}
            placeholder="0 — release in full"
            onChange={(e) => setKept(Math.min(b.depositAmount ?? 0, Math.max(0, Number(e.target.value))))}
          />
        </label>
        {kept > 0 && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-bold text-ink-muted">Reason (the customer sees this)</span>
            <textarea className="field min-h-20" value={keptReason} onChange={(e) => setKeptReason(e.target.value)} placeholder="e.g. Fuel 1/4 below pick-up level (₦35,000) and interior cleaning (₦15,000)" />
          </label>
        )}
        <p className="mt-3 text-xs text-ink-soft">Refunds go back to the customer’s original payment method through Paystack.</p>
      </Sheet>

      <Sheet
        open={declining}
        onClose={() => setDeclining(false)}
        size="sm"
        title={`Decline ${b.id}?`}
        description="The customer is notified by email, SMS and in-app message."
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDeclining(false)}>Back</Button>
            <Button onClick={() => void decline()}>Decline booking</Button>
          </div>
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold text-ink-muted">Reason</legend>
          {DECLINE_REASONS.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="radio" name={`reason-${b.id}`} className="size-5 accent-brand" checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-bold text-ink-muted">Note to customer (optional)</span>
          <textarea className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The G63 is free from the 18th if that works?" />
        </label>
      </Sheet>
    </article>
  );
};

const FILTERS: Array<{ id: 'all' | ManagementStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

export const BookingsPanel: React.FC<{ bookings: Booking[] } & Omit<BookingRowProps, 'booking'>> = ({ bookings, run, onMessage }) => {
  const [filter, setFilter] = useState<'all' | ManagementStatus>('pending');
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length };
    bookings.forEach((b) => (c[managementStatusOf(b)] = (c[managementStatusOf(b)] ?? 0) + 1));
    return c;
  }, [bookings]);

  const q = query.trim().toLowerCase();
  const list = bookings
    .filter((b) => filter === 'all' || managementStatusOf(b) === filter)
    .filter((b) => !q || [b.id, b.driverInfo.fullName, b.driverInfo.email, b.driverInfo.phone, b.car.name].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn('min-h-11 shrink-0 rounded-xl px-3.5 text-sm font-bold', filter === f.id ? 'bg-ink text-white' : 'bg-white text-ink-muted border border-line')}
            >
              {f.label} <span className="opacity-60">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-72">
          <span className="sr-only">Search bookings</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input className="field pl-10" placeholder="Name, phone, ID, car" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {list.length === 0 ? (
          <div className="xl:col-span-2">
            <EmptyState icon={<Search className="size-7" />} title="No bookings here" description="Try another status or search." />
          </div>
        ) : (
          list.map((b) => <BookingRow key={b.id} booking={b} run={run} onMessage={onMessage} />)
        )}
      </div>
    </div>
  );
};
