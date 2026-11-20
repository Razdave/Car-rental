import React, { useEffect, useState } from 'react';
import { Ban, MessageSquare, Search, ShieldCheck } from 'lucide-react';
import type { Booking, Customer } from '../../types/car';
import { backend } from '../../lib/backend';
import { formatDate } from '../../lib/dates';
import { formatNaira } from '../../utils/currency';
import { Button, cn } from '../ui/Button';
import { Card } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { Pill, StatusPill } from './AdminParts';
import { completedTrips, loyaltyFor } from '../../lib/loyalty';

interface Props {
  customers: Customer[];
  bookings: Booking[];
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onMessage: (customerId: string) => void;
}

const bookingsOf = (c: Customer, bookings: Booking[]) =>
  bookings.filter((b) => (b.customerId ? b.customerId === c.id : b.driverInfo.email.toLowerCase() === c.email.toLowerCase()));

export const CustomersPanel: React.FC<Props> = ({ customers, bookings, run, onMessage }) => {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  useEffect(() => setNotes(selected?.notes ?? ''), [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const list = customers
    .filter((c) => c.role === 'customer')
    .filter((c) => !q || [c.fullName, c.email, c.phone, c.licenseNumber].some((v) => v.toLowerCase().includes(q)));

  const history = selected ? bookingsOf(selected, bookings) : [];
  const spend = history.filter((b) => b.paymentStatus !== 'refunded').reduce((s, b) => s + b.totalAmount, 0);

  return (
    <div>
      <label className="relative block sm:w-80">
        <span className="sr-only">Search customers</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <input className="field pl-10" placeholder="Name, email, phone, licence" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <Card className="mt-4 divide-y divide-line overflow-hidden">
        {list.length === 0 && <p className="p-5 text-sm text-ink-soft">No customers found.</p>}
        {list.map((c) => {
          const count = bookingsOf(c, bookings).length;
          return (
            <button key={c.id} type="button" onClick={() => setSelectedId(c.id)} className="flex min-h-16 w-full items-center gap-3 p-4 text-left hover:bg-surface">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold">
                {c.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('') || '?'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold">{c.fullName || c.email}</span>
                  {c.licenseVerified && <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-label="Licence verified" />}
                  {c.blocked && <Pill className="bg-brand-soft text-brand">Blocked</Pill>}
                </span>
                <span className="block truncate text-sm text-ink-soft">{c.email} · {c.phone || 'no phone'}</span>
              </span>
              <span className="shrink-0 text-right text-sm text-ink-muted">
                {count} {count === 1 ? 'trip' : 'trips'}
                <span className="block text-xs font-bold">{loyaltyFor(completedTrips(bookingsOf(c, bookings))).tier.name}</span>
              </span>
            </button>
          );
        })}
      </Card>

      <Sheet open={selected !== null} onClose={() => setSelectedId(null)} title={selected?.fullName || selected?.email || ''} description={selected?.email} size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs font-bold uppercase text-ink-soft">Phone</p><p className="font-bold">{selected.phone || '—'}</p></div>
              <div><p className="text-xs font-bold uppercase text-ink-soft">Customer since</p><p className="font-bold">{new Date(selected.createdAt).toLocaleDateString('en-GB')}</p></div>
              <div><p className="text-xs font-bold uppercase text-ink-soft">Licence</p><p className="font-bold">{selected.licenseNumber || '—'}</p><p className="text-ink-soft">{selected.licenseExpiry && `Exp ${selected.licenseExpiry}`}</p></div>
              <div><p className="text-xs font-bold uppercase text-ink-soft">Lifetime spend</p><p className="font-bold">{formatNaira(spend)}</p></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={selected.licenseVerified ? 'secondary' : 'dark'}
                onClick={() => void run(() => backend.admin.updateCustomer(selected.id, { licenseVerified: !selected.licenseVerified }), selected.licenseVerified ? 'Verification removed' : 'Licence verified')}
              >
                <ShieldCheck className="size-4" /> {selected.licenseVerified ? 'Unverify licence' : 'Mark licence verified'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setSelectedId(null); onMessage(selected.id); }}>
                <MessageSquare className="size-4" /> Message
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void run(() => backend.admin.updateCustomer(selected.id, { blocked: !selected.blocked }), selected.blocked ? 'Customer unblocked' : 'Customer blocked from new bookings')}
              >
                <Ban className="size-4" /> {selected.blocked ? 'Unblock' : 'Block'}
              </Button>
            </div>

            <div>
              <label htmlFor="cust-notes" className="mb-1.5 block text-sm font-bold text-ink-muted">Internal notes</label>
              <textarea id="cust-notes" className="field min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only staff can see this" />
              <Button size="sm" variant="dark" className="mt-2" disabled={notes === selected.notes} onClick={() => void run(() => backend.admin.updateCustomer(selected.id, { notes }), 'Notes saved')}>
                Save notes
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold text-ink-muted">Bookings ({history.length})</p>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {history.length === 0 && <li className="p-3 text-sm text-ink-soft">No bookings yet.</li>}
                {history.map((b) => (
                  <li key={b.id} className={cn('flex items-center justify-between gap-3 p-3 text-sm')}>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{b.car.name}</span>
                      <span className="block text-ink-soft">{b.id} · {formatDate(b.pickupDate)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2"><StatusPill booking={b} /><span className="font-bold">{formatNaira(b.totalAmount)}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
