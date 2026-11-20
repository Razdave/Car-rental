import React from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { Booking } from '../../types/car';
import { managementStatusOf } from '../../lib/backend';
import { addDays, todayISO } from '../../lib/dates';
import { formatNaira } from '../../utils/currency';
import { Card, SectionLabel } from '../ui/Layout';
import { BookingRow } from './BookingsPanel';
import { Stat } from './AdminParts';
import type { AdminData } from './useAdminData';

interface Props {
  data: AdminData;
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onMessage: (customerId: string, bookingId: string) => void;
}

export const OverviewPanel: React.FC<Props> = ({ data, run, onMessage }) => {
  const today = todayISO();
  const soon = addDays(today, 2);
  const b = data.bookings;
  const open = b.filter((x) => ['pending', 'confirmed', 'active'].includes(managementStatusOf(x)));
  const pending = b.filter((x) => managementStatusOf(x) === 'pending');
  const pickups = b.filter((x) => x.pickupDate === today && ['confirmed', 'pending'].includes(managementStatusOf(x)));
  const returns = b.filter((x) => x.returnDate === today && managementStatusOf(x) === 'active');
  const active = b.filter((x) => managementStatusOf(x) === 'active');
  const month = today.slice(0, 7);
  const revenue = b
    .filter((x) => x.paymentStatus !== 'refunded' && x.paymentStatus !== 'unpaid' && x.paymentStatus !== 'failed' && x.createdAt.slice(0, 7) === month)
    .reduce((sum, x) => sum + x.totalAmount, 0);
  const inService = data.cars.filter((c) => c.isAvailable).length;

  // Things a human needs to do soon.
  const attention: Array<{ booking: Booking; reason: string }> = [];
  for (const x of open) {
    const s = managementStatusOf(x);
    if (s === 'pending') attention.push({ booking: x, reason: 'Waiting for confirmation' });
    else if (s === 'confirmed' && x.pickupDate <= soon && !x.agreement) attention.push({ booking: x, reason: 'Pick-up soon — agreement not signed' });
    else if (s === 'confirmed' && x.pickupDate <= soon && x.paymentStatus === 'unpaid') attention.push({ booking: x, reason: 'Pick-up soon — not paid' });
    else if (s === 'confirmed' && x.pickupDate <= soon && x.depositStatus === 'pending') attention.push({ booking: x, reason: 'Pick-up soon — deposit not held' });
    else if (s === 'active' && x.returnDate < today) attention.push({ booking: x, reason: 'Overdue return' });
  }
  for (const x of b) {
    if (x.depositStatus === 'held' && (managementStatusOf(x) === 'completed' || managementStatusOf(x) === 'cancelled')) {
      attention.push({ booking: x, reason: 'Trip over — inspect the car and release the deposit' });
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Needs confirming" value={pending.length} tone={pending.length ? 'text-amber-700' : undefined} />
        <Stat label="Pick-ups today" value={pickups.length} />
        <Stat label="Returns today" value={returns.length} />
        <Stat label="On the road" value={active.length} />
        <Stat label="Fleet in service" value={`${inService}/${data.cars.length}`} />
        <Stat label="Revenue this month" value={formatNaira(revenue)} hint="Paid bookings" />
      </div>

      <section>
        <SectionLabel>Needs attention</SectionLabel>
        {attention.length === 0 ? (
          <Card className="p-5 text-sm text-ink-soft">Nothing needs action right now.</Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {attention.map(({ booking, reason }) => (
              <div key={booking.id}>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-amber-800">
                  <AlertTriangle className="size-4" /> {reason}
                </p>
                <BookingRow booking={booking} run={run} onMessage={onMessage} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {[
          { title: 'Today’s pick-ups', list: pickups, icon: ArrowUpRight, time: (x: Booking) => x.pickupTime, place: (x: Booking) => x.pickupLocation },
          { title: 'Today’s returns', list: returns, icon: ArrowDownLeft, time: (x: Booking) => x.returnTime, place: (x: Booking) => x.returnLocation }
        ].map((col) => (
          <Card key={col.title} className="p-5">
            <p className="mb-3 flex items-center gap-2 font-extrabold">
              <col.icon className="size-5 text-brand" /> {col.title}
            </p>
            {col.list.length === 0 ? (
              <p className="text-sm text-ink-soft">None scheduled.</p>
            ) : (
              <ul className="divide-y divide-line">
                {col.list.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{x.driverInfo.fullName} · {x.car.name}</span>
                      <span className="block truncate text-ink-soft">{col.place(x)}</span>
                    </span>
                    <span className="shrink-0 font-bold">{col.time(x)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </section>
    </div>
  );
};
